# T14A Hermes hooks source audit

Date: 2026-09-02

## Fixed references

- Hermes Agent official Event Hooks documentation: <https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks/>
- Hermes Agent official Plugins documentation: <https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins>

The official site identifies Hermes Agent as MIT licensed. No Hermes source code or binary was copied into DeskMate. The checked-in plugin is a new DeskMate integration derived only from the documented public callback names and plugin layout.

## Evidence used

- Plugin hooks operate in CLI and Gateway surfaces.
- `on_session_end` is the canonical per-turn finalization hook and provides closed `completed`, `failed` and `interrupted` outcome booleans without a message body.
- `pre_llm_call`, tool-call hooks and approval hooks provide authoritative lifecycle boundaries.
- `on_session_finalize` is teardown, not normal per-turn completion.
- `on_stream_end` may finish or error for one streaming response and exposes full response/error text, so T14A does not register it.
- User plugins use `plugin.yaml` plus `__init__.py` and require explicit enablement. Project-local plugins are disabled by default unless the user opts in.

## Difference from the fixed reference

DeskMate uses only observer hooks and ignores all content-bearing callback arguments. Its plugin emits a new five-field, content-free local protocol. It does not add a Hermes tool, alter a tool call, block an approval, read a session identifier or modify Hermes configuration.

## WorkBuddy boundary

The name `WorkBuddy` is used by multiple unrelated products. No exact executable, repository, version or official lifecycle contract has been selected for the user's desktop application. T14A therefore preserves manual control and does not inspect processes, windows, logs or network traffic to infer its state.
