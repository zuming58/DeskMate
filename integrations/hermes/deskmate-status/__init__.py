"""Optional Hermes lifecycle adapter for DeskMate.

This plugin sends only event names, a bounded tool name, and the final outcome.
It never sends prompts, replies, commands, tool arguments, paths, IDs, or errors.
"""

from __future__ import annotations

import json
import os
import queue
import re
import threading

_PIPE_PATH = r"\\.\pipe\deskmate-hermes-status-v1"
_EVENTS = {
    "on_session_start",
    "pre_llm_call",
    "pre_tool_call",
    "post_tool_call",
    "pre_approval_request",
    "post_approval_response",
    "on_session_end",
    "on_session_finalize",
}
_OUTCOMES = {"", "completed", "failed", "interrupted"}
_TOOL_NAME = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
_QUEUE: queue.Queue[dict[str, object]] = queue.Queue(maxsize=64)
_WORKER_STARTED = False
_WORKER_LOCK = threading.Lock()


def _safe_tool_name(value: object) -> str:
    text = value if isinstance(value, str) else ""
    return text if _TOOL_NAME.fullmatch(text) else ""


def _send(payload: dict[str, object]) -> None:
    if os.name != "nt":
        return
    message = (json.dumps(payload, separators=(",", ":"), ensure_ascii=True) + "\n").encode("ascii")
    try:
        with open(_PIPE_PATH, "wb", buffering=0) as pipe:
            pipe.write(message)
    except OSError:
        pass


def _worker() -> None:
    while True:
        _send(_QUEUE.get())
        _QUEUE.task_done()


def _start_worker() -> None:
    global _WORKER_STARTED
    with _WORKER_LOCK:
        if _WORKER_STARTED:
            return
        threading.Thread(target=_worker, name="deskmate-hermes-status", daemon=True).start()
        _WORKER_STARTED = True


def _emit(event: str, *, tool_name: object = "", outcome: str = "") -> None:
    if event not in _EVENTS or outcome not in _OUTCOMES:
        return
    _start_worker()
    payload = {
        "version": 1,
        "provider": "hermes",
        "event": event,
        "toolName": _safe_tool_name(tool_name),
        "outcome": outcome,
    }
    try:
        _QUEUE.put_nowait(payload)
    except queue.Full:
        pass


def _on_session_end(*_args: object, completed: bool = False, failed: bool = False, interrupted: bool = False, **_kwargs: object) -> None:
    outcome = "failed" if failed else "completed" if completed else "interrupted" if interrupted else ""
    _emit("on_session_end", outcome=outcome)


def _on_tool_event(event: str, tool_name: object = "", *_args: object, **_kwargs: object) -> None:
    _emit(event, tool_name=tool_name)


def register(ctx: object) -> None:
    ctx.register_hook("on_session_start", lambda *_args, **_kwargs: _emit("on_session_start"))
    ctx.register_hook("pre_llm_call", lambda *_args, **_kwargs: _emit("pre_llm_call"))
    ctx.register_hook("pre_tool_call", lambda tool_name="", *_args, **_kwargs: _on_tool_event("pre_tool_call", tool_name))
    ctx.register_hook("post_tool_call", lambda tool_name="", *_args, **_kwargs: _on_tool_event("post_tool_call", tool_name))
    ctx.register_hook("pre_approval_request", lambda *_args, **_kwargs: _emit("pre_approval_request"))
    ctx.register_hook("post_approval_response", lambda *_args, **_kwargs: _emit("post_approval_response"))
    ctx.register_hook("on_session_end", _on_session_end)
    ctx.register_hook("on_session_finalize", lambda *_args, **_kwargs: _emit("on_session_finalize"))
