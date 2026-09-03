# DeskMate Link T15D choreography v1

Status: `T15D_CHOREOGRAPHY_LINK_V1_FROZEN`

This slice adds an endpoint-owned semantic beat program to the existing
`DESKMATE_LINK_V1_FROZEN` envelope. Framing, CRC, retry, sequence, UART and
error behavior do not change.

## `0x24 RUN_CHOREOGRAPHY`

The request payload is exactly 40 bytes, little-endian:

| Offset | Bytes | Field | Rule |
| ---: | ---: | --- | --- |
| 0 | 4 | `session_id` | current EasyInput HELLO boot ID |
| 4 | 4 | `action_id` | non-zero, monotonic within the session |
| 8 | 1 | source | UI/voice/context/idle = `1/2/3/4` |
| 9 | 1 | beat count | `2..8` |
| 10 | 1 | beat duration code | 400/600/800/1000 ms = `1/2/3/4` |
| 11 | 1 | repeat count | `1..3` |
| 12 | 1 | intensity | gentle/standard/vivid = `1/2/3` |
| 13 | 1 | tempo | relaxed/standard/quick = `1/2/3` |
| 14 | 2 | reserved | zero |
| 16 | 24 | eight beat slots | Yaw, Pitch, Expression; unused slots zero |

The beat enums match the host contract. An identical duplicate is idempotent;
different bytes with the same action ID conflict. A second action while any
manual, preset or choreography owner is active returns `BUSY` and is not queued.

## `0x25 GET_CHOREOGRAPHY_STATUS`

The request is empty. Both messages return this 24-byte status:

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 4 | current `session_id` |
| 4 | 4 | subject `action_id` |
| 8 | 4 | completed choreography counter |
| 12 | 1 | T15 motion result |
| 13 | 1 | T15 motion state |
| 14 | 1 | beat count `0..8` |
| 15 | 1 | current beat `0..7`, or `0xFF` when none |
| 16 | 1 | requested repeats `0..3` |
| 17 | 1 | completed repeats `0..3` |
| 18 | 1 | source `0..4` |
| 19 | 1 | flags |
| 20 | 1 | intensity `0..3` |
| 21 | 1 | tempo `0..3` |
| 22 | 2 | reserved zero |

Results and states reuse T15 (`ACCEPTED`, `DUPLICATE`, `COMPLETED`,
`CANCELLED`, `NOT_READY`, `BAD_PAYLOAD`, `WRONG_SESSION`, `STALE_ACTION`,
`BUSY`, `RECENTER_REQUIRED`, `EMERGENCY_STOPPED`, `FAULTED`,
`ADAPTER_UNAVAILABLE`, `ADAPTER_FAILURE`, `SEQUENCE_CONFLICT`; and
`NOT_READY`, `RECENTERING`, `READY`, `RUNNING`, `EMERGENCY_STOPPED`,
`FAULTED`). Flags are adapter available bit 0, logical center accepted bit 1,
emergency latch bit 2, fault bit 3, servo output enabled bit 4, terminal bit 5,
display lease bit 6, and duplicate response bit 7.

## Endpoint-owned profiles

The profiles below are fixed Xiaozhi implementation choices, not raw wire
targets and not measured angles:

| Setting | Yaw pose | Pitch up | Pitch down |
| --- | ---: | ---: | ---: |
| gentle | about 6 degrees | about 2 degrees | about 3 degrees |
| standard | about 8 degrees | about 3 degrees | about 5 degrees |
| vivid | about 10 degrees | about 4 degrees | about 6 degrees |

Tempo scales each editor beat hold: relaxed `1.5x`, standard `1.0x`, quick
`0.5x`. The servo adapter retains its own interpolation, electrical limits and
Stage 2 envelope. No profile may exceed that envelope.

Normal completion returns to center and restores the most recent external
display state. Stop, disconnect, reboot, fault and emergency stop discard the
remaining beats and never replay them. Emergency/fault, recovery, manual
control, explicit voice/UI, context and idle keep the existing priority order.

