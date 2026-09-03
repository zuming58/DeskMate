# EasyInput choreography host transport v1

Status: `EASYINPUT_CHOREOGRAPHY_HOST_V1_FROZEN`

This additive USB HID slice carries one bounded semantic choreography between
Windows and EasyInput. EasyInput validates and forwards the whole program; it
does not generate servo trajectories or stream individual beats.

## USB reports

- Host to EasyInput: Feature Report `0x1A`, 63 payload bytes (64 bytes including
  the report ID used by Windows `HidD_SetFeature`).
- EasyInput to Host: Input Report `0x1B`, 63 payload bytes.
- Both reports use the existing runtime-motion top-level collection
  `UsagePage FF00 / Usage 0009`.
- Multi-byte integers are little-endian. CRC is CRC16-CCITT-FALSE, polynomial
  `0x1021`, initial `0xFFFF`, no reflection and no final XOR.
- Unknown lengths, versions, enums, non-zero reserved bytes or padding, a
  choreography with no changes, and a bad CRC fail closed.

### Feature `0x1A` request payload

| Offset | Bytes | Field | Rule |
| ---: | ---: | --- | --- |
| 0 | 4 | magic | ASCII `DMCQ` |
| 4 | 1 | version | `1` |
| 5 | 1 | kind | run command `1`, status query `2` |
| 6 | 1 | source | command: UI `1`, explicit voice `2`, context `3`, idle `4`; status `0` |
| 7 | 1 | reserved | zero |
| 8 | 4 | request ID | non-zero and monotonic in the USB mount epoch |
| 12 | 1 | beat count | command `2..8`; status `0` |
| 13 | 1 | beat duration code | command: 400/600/800/1000 ms = `1/2/3/4`; status `0` |
| 14 | 1 | repeat count | command `1..3`; status `0` |
| 15 | 1 | intensity | gentle/standard/vivid = `1/2/3`; status `0` |
| 16 | 1 | tempo | relaxed/standard/quick = `1/2/3`; status `0` |
| 17 | 24 | eight three-byte beat slots | Yaw, Pitch, Expression; unused slots zero |
| 41 | 2 | CRC16 | over payload bytes `0..40` |
| 43 | 20 | padding | zero |

Beat enums are Yaw `hold/left/center/right = 0/1/2/3`, Pitch
`hold/up/center/down = 0/1/2/3`, and Expression
`hold/completed/thinking/working = 0/1/2/3`. At least one used beat must contain
a non-hold token. Values in one beat begin together; beats run sequentially.

EasyInput maps a command to Link `0x24` and a status query to Link `0x25`.
There is no angle, PWM, pulse-width, duty-cycle, GPIO or arbitrary velocity
field. Intensity and tempo are closed profiles interpreted only by Xiaozhi.

### Input `0x1B` response payload

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 4 | ASCII magic `DMCS` |
| 4 | 1 | version `1` |
| 5 | 1 | stage: EasyInput accepted `1`, endpoint acknowledgement `2` |
| 6 | 1 | echoed kind |
| 7 | 1 | transport result |
| 8 | 4 | echoed request ID |
| 12 | 4 | Link sequence, or zero before transmission |
| 16 | 1 | Link message type `0x24` or `0x25` |
| 17 | 1 | terminal Link flag `0`, response `0x02`, or error `0x04` |
| 18 | 1 | inherited Link error, otherwise zero |
| 19 | 1 | endpoint payload length: `0` or `24` |
| 20 | 24 | endpoint status payload, zero padded |
| 44 | 4 | EasyInput controller boot ID |
| 48 | 4 | Xiaozhi peer boot ID |
| 52 | 1 | echoed source |
| 53 | 1 | echoed beat count |
| 54 | 1 | echoed beat duration code |
| 55 | 1 | echoed repeat count |
| 56 | 1 | echoed intensity |
| 57 | 1 | echoed tempo |
| 58 | 2 | CRC16 over payload bytes `0..57` |
| 60 | 3 | padding | zero |

Transport results reuse the T15 host transport enumeration: completed `0`,
malformed `1`, busy `2`, stale `3`, conflict `4`, link not ready `5`, link
queue busy `6`, timeout `7`, inherited Link error `8`, peer disconnected or
restarted `9`, invalid Link response `10`, and internal failure `11`.

Accepted stage proves only that EasyInput stored the exact request. Endpoint
stage proves only that a correlated Xiaozhi response returned. Completion
requires the same controller and peer boot IDs, matching action ID, terminal
`COMPLETED`, `READY`, all repeats complete, the completion counter advanced,
and logical center accepted. Physical direction and movement remain
user-observed HIL evidence.

## Lifecycle

- Manual control, fixed presets and custom choreography are mutually exclusive.
- At most one host request and one Link request are in flight; there is no
  backlog and no action replay.
- USB unmount, Link loss, either reboot, fault or emergency stop clears pending
  work. A new session starts with a status query and center preparation.
- Stop/center, emergency stop and explicit recovery reuse the already frozen T15
  runtime-motion operations. Choreography adds no second safety control path.

