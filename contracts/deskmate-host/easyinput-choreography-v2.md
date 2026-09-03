# EasyInput choreography host transport v2

Status: `EASYINPUT_CHOREOGRAPHY_HOST_V2_FROZEN`

V2 keeps the V1 HID collection and report IDs, but replaces the shared
strength/tempo profiles with four bounded numeric semantics. Windows still
cannot send PWM, pulse width, duty cycle, GPIO or an absolute servo target.

## USB reports

- Host to EasyInput: Feature Report `0x1A`, 63 payload bytes.
- EasyInput to Host: Input Report `0x1B`, 63 payload bytes.
- Collection: `UsagePage FF00 / Usage 0009`.
- Multi-byte values are little-endian. CRC is CRC16-CCITT-FALSE.
- Windows emits V2. EasyInput accepts V1 and V2 for rollback compatibility,
  and forwards each version with its matching DeskMate Link message IDs.

## Feature `0x1A` payload

| Offset | Bytes | Field | Rule |
| ---: | ---: | --- | --- |
| 0 | 4 | magic | ASCII `DMCQ` |
| 4 | 1 | version | `2` |
| 5 | 1 | kind | run `1`, status `2` |
| 6 | 1 | source | run UI/voice/context/idle `1..4`; status `0` |
| 7 | 1 | reserved | zero |
| 8 | 4 | request ID | non-zero, monotonic in USB mount epoch |
| 12 | 1 | beat count | run `2..8`; status `0` |
| 13 | 1 | beat duration | 400/600/800/1000 ms = `1/2/3/4` |
| 14 | 1 | repeat | `1..3` |
| 15 | 1 | Yaw amplitude | `4..40` logical degrees from center |
| 16 | 1 | Pitch amplitude | `4..20` logical degrees from center |
| 17 | 1 | Yaw speed cap | `20..100` logical degrees/second |
| 18 | 1 | Pitch speed cap | `20..100` logical degrees/second |
| 19 | 24 | eight beat slots | Yaw, Pitch, Expression; unused slots zero |
| 43 | 2 | CRC16 | over bytes `0..42` |
| 45 | 18 | padding | zero |

Beat enums remain Yaw `hold/left/center/right = 0/1/2/3`, Pitch
`hold/up/center/down = 0/1/2/3`, and Expression
`hold/completed/thinking/working = 0/1/2/3`. At least one used beat changes.

EasyInput validates these exact ranges and forwards run/status as Link
`0x26/0x27`. It does not convert degrees to electrical values and does not
generate or time a trajectory.

## Input `0x1B` payload

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 4 | ASCII `DMCS` |
| 4 | 1 | version `2` |
| 5 | 1 | stage: accepted `1`, endpoint `2` |
| 6 | 1 | echoed kind |
| 7 | 1 | transport result |
| 8 | 4 | request ID |
| 12 | 4 | Link sequence |
| 16 | 1 | Link type `0x26` or `0x27` |
| 17 | 1 | terminal Link flag |
| 18 | 1 | Link error |
| 19 | 1 | endpoint length `0` or `24` |
| 20 | 24 | endpoint status |
| 44 | 4 | controller boot ID |
| 48 | 4 | peer boot ID |
| 52 | 1 | source |
| 53 | 1 | beat count |
| 54 | 1 | beat duration code |
| 55 | 1 | repeat |
| 56 | 1 | Yaw amplitude |
| 57 | 1 | Pitch amplitude |
| 58 | 1 | Yaw speed cap |
| 59 | 1 | Pitch speed cap |
| 60 | 2 | CRC16 over bytes `0..59` |
| 62 | 1 | padding zero |

The 24-byte endpoint status uses the V1 identity/state/flag fields and stores
the four numeric settings at bytes `20..23`. Completion requires correlated
boot IDs and action ID, terminal `COMPLETED`, all loops complete and logical
center accepted. It remains protocol evidence, not measured physical angle.

Golden vectors: [`golden-vectors-easyinput-choreography-v2.json`](golden-vectors-easyinput-choreography-v2.json).

