# T14A desktop Agent adapter v1

Status: `T14A_DESKTOP_AGENT_ADAPTER_V1_FROZEN`

## Scope

T14A adds a privacy-safe Hermes lifecycle adapter to the existing Windows Agent state path. Codex remains backward compatible. WorkBuddy, Claude Code and custom providers remain manual until an exact product and an authoritative lifecycle surface are selected.

No firmware, HID report, DeskMate Link frame, VoiceWorkflow, companion controller, global hook configuration or hardware behavior changes in this slice.

## Ownership

- The user explicitly selects one active provider.
- Automatic sources are limited to `codex-hook-v1` and `hermes-plugin-hooks-v1`.
- Both sources publish through the existing `AgentStatePublisher`.
- VoiceWorkflow and an active companion conversation keep priority.
- Provider identity remains local to Windows; hardware receives only the frozen seven-state value.

## Hermes event mapping

| Official hook | DeskMate state |
| --- | --- |
| `on_session_start` | `idle` |
| `pre_llm_call` | `thinking` |
| `pre_tool_call`, `post_tool_call` | `working` |
| `pre_approval_request` | `waiting` |
| `post_approval_response` | `working` |
| `on_session_end(completed=true)` | `completed` |
| `on_session_end(failed=true)` | `error` |
| `on_session_end(interrupted=true)` | `idle` |
| `on_session_finalize` | `idle` |

Streaming output hooks are deliberately excluded because one model stream may be an intermediate iteration rather than the completed user turn.

## Local transport

- Windows pipe: `\\.\pipe\deskmate-hermes-status-v1`.
- One newline-terminated JSON object, maximum 512 UTF-8 bytes.
- Exact fields: `version`, `provider`, `event`, `toolName`, `outcome`.
- `version=1`, `provider=hermes`.
- Unknown fields, invalid enums, oversized input and invalid tool names fail closed.
- No acknowledgement, durable queue or replay exists.

The optional repository plugin uses a bounded in-memory queue. If DeskMate is absent or the queue is full, the event is dropped without affecting Hermes.

## Privacy

Forbidden on the pipe, renderer and diagnostics: prompts, replies, commands, approval descriptions, tool arguments/results, paths, IDs, model/provider routing, error code/message/body and user content.

The renderer receives only provider, source version, receiver state, mapped state, event name, bounded tool name, closed outcome, timestamp, delivery class and a generated summary.

## Acceptance

Automated gates cover every mapping, strict wire validation, unavailable receiver, provider selection, manual-only providers, voice/companion priority and Codex compatibility. Real Hermes evidence remains a user-controlled acceptance because enabling a Hermes plugin changes external user configuration.
