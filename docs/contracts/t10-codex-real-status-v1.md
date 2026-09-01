# T10 Codex real status adapter v1

Status: `CODEX_REAL_STATUS_V1_FROZEN`

Source version: `codex-hook-v1`

## Purpose

When the user explicitly selects Codex in DeskMate, stable Codex lifecycle hooks drive the existing seven-state Desktop -> EasyInput -> Xiaozhi path. This adapter reports real lifecycle events; it does not infer activity from a process, foreground window, title, transcript or timer.

## Frozen mapping

| Official Codex hook | DeskMate state | Meaning |
| --- | --- | --- |
| `SessionStart` | `idle` | Codex session is available, no active turn is implied |
| `UserPromptSubmit` | `thinking` | A new user turn began |
| `PreToolUse` | `working` | Codex is executing a supported local tool |
| `PreToolUse(request_user_input)` | `waiting` | Codex is opening a structured user-input request |
| `PermissionRequest` | `waiting` | Codex is waiting for user authorization |
| `PostToolUse` | `working` | Tool execution returned and Codex continues the turn |
| `Stop` | `completed` | The root turn ended; the existing 10-second TTL returns the display to idle |
| `SessionEnd` | `idle` | The Codex session ended |

The official hook set has no general turn-failure event. `error` therefore remains manual in this slice. A final free-form question that does not use `request_user_input` is not classified as waiting because doing so would require reading response text. `listening` remains owned by the real VoiceWorkflow rather than Codex.

The release behavior reference is the official [Codex Hooks documentation](https://developers.openai.com/codex/hooks/). The adapter may only add another automatic state when that page defines a stable event and a privacy-safe metadata field that proves the transition. It must not inspect `prompt`, `last_assistant_message`, `tool_input`, `tool_response`, window titles or process text to manufacture a state.

## Privacy and transport

- The hook helper receives Codex's event object but neither stores nor forwards it.
- Only `version`, fixed provider `codex`, `hook_event_name` and a bounded canonical `tool_name` cross the local named pipe.
- Prompt text, assistant output, `last_assistant_message`, tool input/output, session and turn identifiers, transcript path, working directory, model, permission mode and device data never enter DeskMate.
- The Electron main process owns `\\.\pipe\deskmate-codex-status-v1`. Messages are one bounded JSON line, exact-key validated and fail closed.
- If DeskMate is absent, the helper exits successfully within 150 ms. It produces no model-visible output and never blocks or approves a Codex action.
- Status hooks run synchronously so lifecycle events preserve provider order. The bounded local connection is the only work on Codex's hook path; background hooks are intentionally avoided because their completion order is not guaranteed.

The named pipe trusts local same-user processes only for a low-impact display state. It grants no filesystem, network, credential, shell, device-configuration or firmware capability.

## Ownership and priority

- The desktop selector is authoritative. Codex events update hardware only while `codex` is selected; other selected Agents remain unaffected.
- The user may explicitly disable Codex automatic status while leaving Codex selected. Disabled events remain diagnostic-only and are never replayed when automation is re-enabled.
- An active DeskMate VoiceWorkflow has higher priority. Codex events observed during voice work are visible as blocked and are not replayed later.
- Switching back to Codex does not replay the last event. Only a new lifecycle event may change hardware.
- Repeated identical Codex states are suppressed until another source interrupts the stream.
- Provider identity stays local. Hardware receives only the existing state code, transition, TTL and opaque Codex-hook source hash.

## Hook activation

Repository hooks are merged into `.codex/hooks.json` without replacing the existing Project Flow `Stop` hook. Codex requires the user to trust newly discovered non-managed hooks. The active Codex session may need to be reopened before the new hook set is loaded.

This repository-local slice observes Codex tasks opened in this repository. A future global installer requires separate user authorization and must merge rather than overwrite `~/.codex/hooks.json`.

## Acceptance

- Unit tests lock every mapping and prove private input fields are absent from the pipe message.
- Extra keys, malformed JSON, oversized data and unsupported events are rejected.
- Sender absence is fail-soft and bounded.
- Renderer receives only the sanitized status and never receives raw hook input.
- Renderer diagnostics identify the source as `codex-hook-v1` and expose whether automatic ownership is selected.
- Voice priority, explicit provider ownership, explicit disable, duplicate suppression, no replay and existing manual fallback remain intact.
