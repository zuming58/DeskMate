# T09 agent state display contract

Status: `T09_AGENT_STATE_DISPLAY_V1_FROZEN`

This slice carries a privacy-safe high-level agent state from Windows through
EasyInput to Xiaozhi. It reuses the existing HID Feature report `0x12` and the
frozen DeskMate Link v1 `SET_AGENT_STATE` message. It does not add a second
board-to-board protocol.

## Host to EasyInput

Report `0x12` has exactly 16 payload bytes. TinyUSB may provide the report ID
separately or as byte zero of a 17-byte buffer; both forms are accepted and all
other lengths or IDs fail closed.

| Byte | Meaning |
| --- | --- |
| 0 | protocol version |
| 1 | state |
| 2 | flags; must be zero in T09 |
| 3 | reserved; must be zero |
| 4..7 | transition ID, little-endian, non-zero |
| 8..11 | TTL milliseconds, little-endian |
| 12..15 | opaque source hash; never logged or exposed |

Version 1 preserves the fixed Maker mapping: idle `0`, running `1`,
waiting-user `2`, completed-unread `3`, failed `4`. EasyInput maps those values
to Link idle, working, waiting, completed and error. Idle forces TTL zero; other
TTL values are clamped to 12 hours.

Version 2 exposes the frozen seven Link states directly: idle `0`, listening
`1`, thinking `2`, working `3`, waiting `4`, completed `5`, error `6`. Idle
requires TTL zero. Non-idle requires a TTL from 1 through 600000 ms.

The USB callback only copies a validated-size command into a bounded mailbox.
One owner decodes and applies it. An exact duplicate may be suppressed, but
transition IDs are not treated as globally monotonic because the desktop
process may restart.

## EasyInput to Xiaozhi

- EasyInput forwards the normalized state with the existing Link v1
  `SET_AGENT_STATE` request and the host transition ID.
- It forwards only while Link is connected and peer capabilities include
  `AGENT_STATE` and `DISPLAY`.
- The mailbox is latest-wins. Disconnect, peer restart, USB epoch change or TTL
  expiry clears stale work. No state is replayed after reconnect.
- TTL expiry settles the local desired state to idle. Idle may be sent only as
  a new live transition while the same connection is still valid.
- Link failure never blocks keyboard, encoder, LED, configuration or Host
  Action owners.

## Xiaozhi display ownership

Xiaozhi advertises `DISPLAY` as implemented and enabled only after its display
owner initializes successfully. It acknowledges `SET_AGENT_STATE` only after
the state is accepted into that owner model. Display failure removes the
enabled capability but does not break the Link endpoint.

| Agent state | T09 display scene |
| --- | --- |
| idle | neutral/default |
| listening | listening |
| thinking | thinking |
| working | focused, with neutral fallback |
| waiting | attention |
| completed | happy |
| error | sad/error |

The existing angry scene is not selected automatically. T09 must not initialize
audio, move a servo, write PWM, or add idle motion.

## Diagnostics and acceptance

Only counters and coarse states may be reported: accepted, malformed,
duplicate, expired, dropped-disconnected, forwarded and acknowledged. Payload,
source hash, window title, text, device path and user data are forbidden.

Code-only acceptance requires golden vectors for both HID versions, both
TinyUSB delivery shapes, malformed inputs, duplicate/restart behavior, TTL,
disconnect/reconnect/no-replay, capability gating, OLED init failure and all
T02-T08 regressions. Hardware acceptance remains a separate user-authorized
step after the unfinished T08 signal-disconnect and combined regression checks.
