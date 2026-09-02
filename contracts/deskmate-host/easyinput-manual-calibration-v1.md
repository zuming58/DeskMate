# EasyInput manual calibration host transport v1

Status: `EASYINPUT_MANUAL_CALIBRATION_HOST_V1_FROZEN`

This slice freezes the missing Windows-to-EasyInput transport for the existing
[`T10C_MANUAL_CALIBRATION_LINK_V1_FROZEN`](../deskmate-link/t10c-manual-calibration-v1.md)
contract. It is an additive USB HID transport only. It does not authorize a
flash, install a servo adapter, enable the `MOTION` capability, or prove that a
servo moved.

## USB reports

- USB identity remains VID `0x303A`, PID `0x1006`.
- Host to EasyInput uses Feature Report `0x16`, 63 payload bytes. A Windows
  `HidD_SetFeature` buffer is therefore 64 bytes including the report ID.
- EasyInput to Host uses Input Report `0x17`, 63 payload bytes.
- Both reports are isolated from Raw Input keyboard handling. Unknown lengths,
  non-zero padding, bad CRC, reserved bits or semantic violations fail closed.
- All multi-byte integers are little-endian. CRC is CRC16-CCITT-FALSE with
  polynomial `0x1021`, initial value `0xFFFF`, no reflection and no final XOR.

### Feature `0x16` request payload

The payload is exactly 63 bytes:

| Offset | Bytes | Field | Rule |
| ---: | ---: | --- | --- |
| 0 | 4 | magic | ASCII `DMCR` |
| 4 | 1 | version | `1` |
| 5 | 1 | kind | command `1`, status query `2` |
| 6 | 1 | flags | command exactly `0x01` user-confirmed; status `0` |
| 7 | 1 | reserved | zero |
| 8 | 4 | request ID | non-zero, monotonic in the USB mount epoch |
| 12 | 4 | confirmation ID | command non-zero; status zero |
| 16 | 19 | exact T10C payload slot | command payload; status all zero |
| 35 | 2 | CRC16 | over payload bytes `0..34` |
| 37 | 26 | padding | all zero |

The command slot is forwarded byte-for-byte as DeskMate Link message `0x20`.
It contains only session, action ID, volatile arm token, operation, axis,
direction, arm lease and the four safety attestations. EasyInput rejects any
absolute angle, arbitrary step, PWM duty, pulse width or GPIO because no such
field exists. Status kind forwards an empty DeskMate Link `0x21` request.

The confirmation ID is Windows intent evidence. It proves only that the UI
created a distinct confirmed action. For ARM, the embedded safety flags must
also be exactly `0x0F`; neither field proves the physical setup is safe.

### Input `0x17` response payload

The payload is exactly 63 bytes:

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 4 | ASCII magic `DMCS` |
| 4 | 1 | version `1` |
| 5 | 1 | stage: accepted `1`, terminal `2` |
| 6 | 1 | echoed request kind |
| 7 | 1 | transport result |
| 8 | 4 | echoed request ID |
| 12 | 4 | echoed confirmation ID |
| 16 | 4 | DeskMate Link sequence, or zero before transmission |
| 20 | 1 | DeskMate Link message type `0x20` or `0x21` |
| 21 | 1 | terminal Link flag `0`, response `0x02`, or error `0x04` |
| 22 | 1 | inherited Link error, otherwise zero |
| 23 | 1 | endpoint payload length: `0`, `18`, or `19` |
| 24 | 19 | endpoint payload, zero padded |
| 43 | 4 | accepted counter for this boot |
| 47 | 4 | terminal counter for this boot |
| 51 | 4 | EasyInput controller boot ID |
| 55 | 4 | Xiaozhi peer boot ID, or zero while unknown |
| 59 | 2 | CRC16 over payload bytes `0..58` |
| 61 | 2 | reserved zero |

Transport results: completed/accepted `0`, malformed `1`, busy `2`, stale
request `3`, request conflict `4`, link not ready `5`, link queue busy `6`,
timeout `7`, inherited Link error `8`, peer disconnected/restarted `9`, invalid
Link response `10`, internal failure `11`.

An accepted-stage report proves only that EasyInput stored the exact request in
its one-request forwarding slot. A terminal report with Link response `0x02`
contains the byte-exact Xiaozhi response and its completed-output counter. A
terminal Link error or transport failure is never converted to success.

## Ordering, replay and lifecycle

- At most one host request and one DeskMate Link request are in flight.
- An identical duplicate request ID while pending re-emits accepted without a
  second forward. After completion it replays the cached terminal report.
- Reusing a request ID with different bytes is conflict; an older request ID is
  stale; a different newer request while one is pending is busy.
- DeskMate Link keeps its frozen 250 ms timeout, two identical retries and
  sequence matching. EasyInput exposes the actual terminal sequence.
- USB unmount clears the host slot and cache. Link disconnect, EasyInput reboot
  or Xiaozhi peer restart terminates pending work, clears volatile state and
  never replays an action into the new session.
- A status query must succeed before the UI enables command controls. Its
  18-byte endpoint payload supplies the current manual-calibration session,
  state, selected axis and safety flags.

## Product gate

T10D-A may implement the strict codec, one-slot bridge, DeskMate Link
translator, fake endpoint tests and firmware build only. Production Xiaozhi
still has no manual owner or real servo adapter, so a real `0x21` request is
expected to return `NOT_READY`. Windows UI is T10D-B. Physical calibration and
any servo movement remain T10D-C and require a separate user-present hardware
authorization after electrical and mechanical Stage 0 evidence.
