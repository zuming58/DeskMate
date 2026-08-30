# T09 agent state display contract

Status: `T09_AGENT_STATE_DISPLAY_V1_FROZEN`

This slice carries a privacy-safe high-level agent state from Windows through
EasyInput to Xiaozhi. It reuses the existing HID Feature report `0x12` and the
frozen DeskMate Link v1 `SET_AGENT_STATE` message. It does not add a second
board-to-board protocol.

## Host to EasyInput

Report `0x12` has exactly 16 semantic payload bytes. Windows
`HidD_SetFeature` requires the caller buffer to match the top-level
collection's `FeatureReportByteLength`; this collection is 64 bytes because
another Feature report is larger. The Windows bridge therefore sends report ID
`0x12`, the 16 semantic bytes and 47 trailing zero bytes.

TinyUSB may deliver the report ID separately or inline. The receiver accepts
only four shapes: 16 bytes with a separate ID, 17 bytes with an inline ID, 63
bytes with a separate ID and zero padding, or 64 bytes with an inline ID and
zero padding. Padding is transport-only and is never part of the business
payload. A wrong ID, any other length or any non-zero padding fails closed.

Platform basis:

- [Microsoft `HidD_SetFeature`](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/hidsdi/nf-hidsdi-hidd_setfeature)
- [Microsoft `HIDP_CAPS.FeatureReportByteLength`](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/hidpi/ns-hidpi-_hidp_caps)

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

Code-only acceptance requires golden vectors for both HID versions, all four
TinyUSB/Windows delivery shapes, non-zero padding, malformed inputs,
duplicate/restart behavior, TTL,
disconnect/reconnect/no-replay, capability gating, OLED init failure and all
T02-T08 regressions. Hardware acceptance remains a separate user-authorized
step after the unfinished T08 signal-disconnect and combined regression checks.
