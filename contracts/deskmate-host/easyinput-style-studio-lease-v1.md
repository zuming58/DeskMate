# EasyInput Style Studio input lease v1

Status: `STYLE_STUDIO_INPUT_LEASE_V1_FROZEN`

This additive host contract lets the focused DeskMate `#/style-studio` page
temporarily own the physical encoder press without changing the persisted
keyboard configuration. It does not write NVS, Flash, partitions, GPIO
configuration, or the user's normal encoder mapping.

## HID transport

- Existing device identity remains VID/PID `0x303A/0x1006`.
- Feature Report `0x1C` is added to the existing `FF00:0009` runtime-control
  top-level collection. The full Windows report is 64 bytes: report ID plus a
  63-byte payload.
- The device capability document adds
  `capabilities.style_studio_input_lease_v1: true`. A host must observe this
  bit before sending `0x1C`; missing or false fails closed.
- The existing Input Report `0x11`, kind `0x05` Host Action path carries the
  encoder confirmation. No keyboard usage is emitted.

## Feature Report `0x1C`

All multibyte integers are unsigned little-endian.

| Full report bytes | Size | Meaning |
| --- | ---: | --- |
| `0` | 1 | report ID `0x1C` |
| `1..4` | 4 | ASCII `DMSL` |
| `5` | 1 | version `1` |
| `6` | 1 | operation: `1` acquire/renew, `2` release |
| `7` | 1 | mode: `1` Style Studio |
| `8` | 1 | flags, must be zero |
| `9..12` | 4 | nonzero lease token |
| `13..16` | 4 | TTL ms; acquire `1000..5000`, release `0` |
| `17..18` | 2 | CRC16-CCITT over full report bytes `1..16` |
| `19..63` | 45 | zero padding |

The firmware accepts both TinyUSB callback shapes: a separate report ID with
63 payload bytes, or an inline ID with 64 bytes. Nonzero transport padding,
bad magic/version/mode/CRC, a zero token, or an out-of-range TTL is rejected.

## Lease lifecycle

- Acquire and renew are RAM-only. A new valid token replaces the previous
  token; release succeeds only when its token matches the active token.
- The host uses a 2500 ms TTL and renews every 1000 ms while the trusted main
  window is focused on `#/style-studio`.
- Route leave, blur, renderer loss, window close, or application quit sends a
  matching release when possible. USB epoch change and TTL expiry always clear
  ownership without host cooperation.
- A failed or missing renewal restores the persisted encoder mapping within
  the advertised TTL. No lease is replayed from disk or after reconnect.

## Encoder semantics

- While the lease is active, encoder rotation remains the normal mouse-wheel
  report used by Style Studio.
- One debounced encoder press emits exactly one existing Host Action with the
  reserved UUID `4c82a3a0-ff30-49a8-a76f-1bb3dcdbcd01`. It never toggles the
  scroll axis and never emits a keyboard key.
- Encoder release only rearms that press, including when the lease expires
  while the knob is held. It must not run the persisted action on release.
- Outside the lease, the stored encoder action is unchanged; the current safe
  default remains `scroll_axis_toggle`.
- The Electron main process consumes the reserved UUID only while its matching
  focused-page lease is active and publishes Style Studio `confirm`. It must
  never register this UUID as a user application action. If received outside
  that lease it is discarded.

## Verification boundary

Host tests must cover exact golden reports, CRC/padding rejection, renew,
replacement, token-matched release, TTL/USB-epoch expiry, press/release across
expiry, one Host Action per press, and normal axis toggle after release. Native
and Electron tests must cover capability gating, report privacy, heartbeat and
route-scoped reserved-action consumption. Source/build evidence does not equal
a device write or physical acceptance; flashing and HIL require a separate
explicit user authorization.
