# EasyInput motion presets host transport v1

Status: `EASYINPUT_MOTION_PRESETS_HOST_V1_FROZEN`

This additive USB HID slice carries the frozen
[`T15_MOTION_PRESETS_LINK_V1_FROZEN`](../deskmate-link/t15-motion-presets-v1.md)
operations between Windows and EasyInput. It is isolated from Raw Input and
does not authorize a flash or prove physical motion.

## USB reports

- Host to EasyInput: Feature Report `0x18`, 63 payload bytes (64 bytes with the
  report ID in a Windows `HidD_SetFeature` buffer).
- EasyInput to Host: Input Report `0x19`, 63 payload bytes.
- Multi-byte integers are little-endian. CRC is CRC16-CCITT-FALSE, polynomial
  `0x1021`, initial `0xFFFF`, no reflection and no final XOR.
- Unknown length/version/kind/origin/operation/preset/repeat, non-zero reserved
  bytes or padding, and bad CRC fail closed.

### Feature `0x18` request payload

| Offset | Bytes | Field | Rule |
| ---: | ---: | --- | --- |
| 0 | 4 | magic | ASCII `DMRQ` |
| 4 | 1 | version | `1` |
| 5 | 1 | kind | command `1`, status query `2` |
| 6 | 1 | source | command: UI `1`, explicit voice `2`, context `3`, idle `4`; status `0` |
| 7 | 1 | operation | command `1..4`; status `0` |
| 8 | 4 | request ID | non-zero, monotonic in the USB mount epoch |
| 12 | 1 | preset | run `1..4`; other operations/status `0` |
| 13 | 1 | repeat count | run `1..3`; other operations/status `0` |
| 14 | 2 | reserved | zero |
| 16 | 2 | CRC16 | over payload bytes `0..15` |
| 18 | 45 | padding | zero |

EasyInput constructs the 16-byte Link `0x22` payload using its current HELLO
controller boot ID as `session_id` and the host request ID as `action_id`.
A status query emits an empty Link `0x23`. There is no angle, PWM, pulse, GPIO,
waypoint or velocity field.

Source is copied into the Link request so Xiaozhi can apply the frozen runtime
priority. Automatic context and idle actions may use only the four presets and
are additionally gated by the Windows global automatic-motion switch.

### Input `0x19` response payload

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 4 | ASCII magic `DMRS` |
| 4 | 1 | version `1` |
| 5 | 1 | stage: accepted `1`, endpoint acknowledgement `2` |
| 6 | 1 | echoed kind |
| 7 | 1 | transport result |
| 8 | 4 | echoed request ID |
| 12 | 4 | Link sequence, or zero before transmission |
| 16 | 1 | Link message type `0x22` or `0x23` |
| 17 | 1 | terminal Link flag `0`, response `0x02`, or error `0x04` |
| 18 | 1 | inherited Link error, otherwise zero |
| 19 | 1 | endpoint payload length: `0` or `20` |
| 20 | 20 | endpoint status payload, zero padded |
| 40 | 4 | accepted counter for this EasyInput boot |
| 44 | 4 | terminal counter for this EasyInput boot |
| 48 | 4 | EasyInput controller boot ID |
| 52 | 4 | Xiaozhi peer boot ID, or zero while unknown |
| 56 | 1 | echoed source |
| 57 | 1 | echoed operation |
| 58 | 1 | echoed preset |
| 59 | 1 | echoed repeat count |
| 60 | 2 | CRC16 over payload bytes `0..59` |
| 62 | 1 | reserved zero |

Transport results are completed/accepted `0`, malformed `1`, busy `2`, stale
request `3`, request conflict `4`, link not ready `5`, link queue busy `6`,
timeout `7`, inherited Link error `8`, peer disconnected/restarted `9`, invalid
Link response `10`, and internal failure `11`.

Accepted stage proves only that EasyInput stored the exact request. Stage 2
proves only the matched Xiaozhi acknowledgement/status was returned. Windows
must poll `0x23` and match `session_id`, `action_id`, state and completed counter
before labelling it `Xiaozhi endpoint reported complete`. With no position
sensor, software must never label this as measured angle, mechanical arrival or
physical acceptance; those remain user-observed HIL evidence.

## Single request and lifecycle

- At most one T15 host request and one Link request are in flight. T10D manual
  control and T15 runtime motion are mutually exclusive at the endpoint.
- Identical pending duplicates re-emit accepted. Completed duplicates replay
  the cached response. Different bytes with the same ID conflict; older IDs are
  stale; a newer request while pending is busy.
- Link uses its frozen 250 ms timeout and two identical retries. Long motion is
  never held in the transport slot; status polling observes its lifecycle.
- USB unmount, Link disconnect, either reboot or peer boot change clears
  pending/cached volatile state and never replays an action.
- The first run in a Windows session performs a status query and, when needed,
  `STOP_AND_CENTER` before `RUN`. This preparation is orchestration, not a new
  hidden permission dialog.
