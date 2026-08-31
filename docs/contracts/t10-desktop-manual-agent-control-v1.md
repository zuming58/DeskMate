# T10 Desktop manual Agent control v1

Status: `T10_DESKTOP_MANUAL_AGENT_CONTROL_V1_FROZEN`

## Purpose

DeskMate can manually select which coding Agent is currently represented and send one of the seven already-frozen Agent states through the real Desktop -> EasyInput -> Xiaozhi OLED path. This slice does not claim automatic provider detection.

## Agent identity

- Built-in choices: Codex, Workbody, Hermes and Claude Code.
- A bounded custom Agent name may be stored locally.
- Agent identity and custom names never enter HID or DeskMate Link. Hardware receives only the frozen coarse state, transition identifier, TTL and an opaque manual-source hash.
- Selecting an Agent does not inspect its process, account, window title, transcript, prompt or network activity.

## Manual state model

| Desktop choice | Frozen transport state | Xiaozhi meaning |
| --- | --- | --- |
| 待命 | `idle` | 默认大眼睛 |
| 倾听 | `listening` | 倾听表情 |
| 思考 | `thinking` | 思考表情 |
| 工作 | `working` | 专注表情 |
| 等你回复 | `waiting` | 注意/等待表情 |
| 已完成 | `completed` | 开心表情，10 秒后回待命 |
| 遇到问题 | `error` | 错误/难过表情，10 秒后回待命 |

The transport continues to use HID Feature Report `0x12` v2 and DeskMate Link v1 `SET_AGENT_STATE`. No firmware or framing change is introduced.

## Ownership and priority

- Electron main owns report encoding and publication; the React renderer can only request a validated Agent ID and state through the minimal preload API.
- An active VoiceWorkflow (`recording`, `transcribing`, `organizing` or `outputting`) has priority. Manual publication is rejected with `voice-workflow-active` while that workflow is active.
- A later real VoiceWorkflow transition supersedes a previous manual state. A manual publication clears voice duplicate suppression so a new real workflow always emits a fresh transition.
- Manual selections persist locally. They are never automatically replayed after a transport disconnect or application restart.

## Current hardware behavior

- Xiaozhi OLED is the visible Agent-state endpoint.
- EasyInput's five WS2812 LEDs remain physical key/encoder feedback. This slice does not reinterpret them as Agent-state lamps.
- Servo and Xiaozhi audio remain outside this control path.

## Deferred automatic adapters

Automatic Codex, Workbody, Hermes or other provider detection is not part of v1. A future provider adapter must prove a privacy-safe, versioned state source and still normalize to these seven states. Concurrent providers require an explicit ownership policy rather than guessing from the foreground window.

## Acceptance

- UI exposes built-in and custom Agent choices plus all seven states.
- A successful manual request reaches the existing native bridge and returns a hardware acknowledgement.
- Invalid source, Agent ID or state fails closed.
- Active voice work blocks manual override.
- Tests lock the state/TTL/source vector and prove that mock/simulator sources cannot emit a hardware report.
