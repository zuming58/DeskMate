# T16A Codex live task monitor v1

Status: `T16A_CODEX_LIVE_TASK_MONITOR_V1_FROZEN`

Source versions: `codex-hook-v2`, `codex-app-server-catalog-v1`, `codex-task-brief-v1`

## Purpose

DeskMate reports the user's real Codex tasks without asking Doubao or the text
model to guess. This Windows-software-only slice changes no firmware, HID,
DeskMate Link, servo, display, microphone or speaker contract.

## Evidence ownership

- Codex lifecycle hooks own live state. The hook forwards only a one-way opaque
  task key, a bounded fallback project label, the event name and canonical tool
  name. Prompt text, assistant output, tool input/output, raw session/turn ids,
  transcript path and full working directory never cross the named pipe.
- A read-only Codex App Server process may enrich an opaque task key with the
  user-visible thread name. It requests `thread/list` without turns and discards
  preview text, raw ids, paths and all other fields immediately after mapping.
- `codex-task-brief-v1` remains an optional explicit reporter and may supply a
  bounded milestone. A model is never a source of task state or percentage.
- When evidence is absent, stale or ambiguous, DeskMate says so. It never
  invents progress, percentages, files, tools or completion.

## Frozen live mapping

| Codex event | Per-task state | Spoken milestone |
| --- | --- | --- |
| `UserPromptSubmit` | `thinking` | 开始处理新任务 |
| `PreToolUse(request_user_input)` | `waiting` | 需要你输入 |
| `PermissionRequest` | `waiting` | 需要你确认 |
| other `PreToolUse` | `working` | bounded category such as 正在修改文件 or 正在执行检查 |
| `PostToolUse` | `working` | 继续处理任务 |
| `Stop` | `completed` | 本轮已结束，等待下一步 |
| `SessionEnd` | `completed` only for a known task | 任务会话已关闭 |

`SessionStart` registers identity but does not claim that work started. The
official hook set currently has no general root-turn failure event. A failed
tool is not equivalent to a failed task, so automatic task failure speech is
reserved until Codex supplies explicit terminal failure evidence. The optional
task reporter may still submit `error` explicitly.

## Multi-task answers

- “Codex 现在什么情况”, “有几个任务在运行” and equivalent aggregate
  questions return the count of active tasks and a short deterministic line for
  each, capped at eight recent tasks and 500 visible characters.
- A unique spoken task name returns that task's current state and milestone.
- Similar names remain ambiguous and DeskMate asks for the complete name.
- Follow-ups such as “什么任务” and “哪个任务” reuse only the bounded recent
  Codex selection context; they never fall through to free chat while trusted
  task evidence exists.

## Realtime voice ownership

Once a final ASR utterance is classified as a trusted control/status turn,
DeskMate closes that provider generation and opens a fresh Doubao generation
before speaking the deterministic answer. Late text and audio from the old
generation are stale and discarded. This keeps the configured Doubao voice
while preventing free-chat audio from being mixed with the trusted answer.
Recognition of a closed Codex-status or motion phrase synchronously claims the
turn before any asynchronous lookup begins. If the provider omits the trusted
speech `tts.end`, a bounded watchdog abandons that provider generation,
reconnects without replay and returns the existing companion session to
listening. Absence or failure of trusted task evidence may produce only an
explicit unavailable answer; it never releases the same utterance to free chat.

## Proactive speech and motion

- The existing user switch controls proactive Codex speech. Querying state
  remains available while it is off.
- `waiting`, `completed` and explicit `error` reports announce immediately;
  ordinary progress is throttled to at most once per 15 seconds.
- With automatic context motion enabled: companion start uses `attention`, a
  completed spoken answer uses one light `nod`, sustained thinking uses one
  `search`, Codex waiting/error uses one `search`, and Codex completion uses one
  `nod`. Existing priority and busy gates remain authoritative.
- Explicit “跳舞” uses the activated default choreography. Music playback is a
  separate future local-media allowlist slice; T16A does not choose, download or
  bundle music and does not claim synchronized music is active.

## Installation and compatibility

DeskMate may refresh the standalone helper only when an existing user-level
DeskMate hook registration is already present. It does not silently add or
replace unrelated global hooks. `codex-hook-v1` messages remain accepted for
coarse status compatibility but cannot populate a per-task list.
Installed user-level hooks do not execute until Codex marks the exact handler
hash as trusted. Installation and helper version are therefore insufficient
runtime evidence: acceptance must also verify the seven DeskMate handlers are
trusted and then observe a fresh lifecycle event in DeskMate. Unrelated hook
handlers are outside this authorization and remain unchanged.

## Acceptance

- Unit tests cover v1 compatibility, v2 privacy, multiple tasks, aggregate and
  named queries, stale reports, proactive throttling, trusted-audio exclusion,
  fallback provider replacement and motion mapping.
- A local App Server smoke test proves title-only catalog hydration without
  consuming turns or previews.
- User-present acceptance runs two simultaneous Codex tasks: one reaches an
  approval/input wait and one completes. DeskMate must announce both with their
  correct titles and answer aggregate plus named follow-up questions without a
  percentage or free-chat answer.
