# DeskMate Link T15D choreography v2

Status: `T15D_CHOREOGRAPHY_LINK_V2_FROZEN`

V2 carries independently bounded Yaw/Pitch amplitude and speed semantics while
retaining the V1 frame, retry, sequence, UART, busy, disconnect and emergency
behavior. EasyInput never generates trajectories; Xiaozhi remains the sole
trajectory and servo owner.

## `0x26 RUN_CHOREOGRAPHY_V2`

The request payload is exactly 40 bytes:

| Offset | Bytes | Field | Rule |
| ---: | ---: | --- | --- |
| 0 | 4 | session ID | current EasyInput boot ID |
| 4 | 4 | action ID | non-zero and monotonic |
| 8 | 1 | source | UI/voice/context/idle `1..4` |
| 9 | 1 | beat count | `2..8` |
| 10 | 1 | beat duration code | `1..4` for 400/600/800/1000 ms |
| 11 | 1 | repeat | `1..3` |
| 12 | 1 | Yaw amplitude | `4..40` logical degrees |
| 13 | 1 | Pitch amplitude | `4..20` logical degrees |
| 14 | 1 | Yaw speed cap | `20..100` logical degrees/second |
| 15 | 1 | Pitch speed cap | `20..100` logical degrees/second |
| 16 | 24 | beat slots | V1 semantic Yaw/Pitch/Expression enums |

## `0x27 GET_CHOREOGRAPHY_STATUS_V2`

The request is empty. Both V2 messages return the existing 24-byte status with
Yaw amplitude, Pitch amplitude, Yaw speed and Pitch speed at bytes `20..23`.
The other fields and flags remain identical to V1.

Xiaozhi rejects values outside the frozen ranges before scheduling. It then
maps each direction token to a center-relative logical target, applies the
axis-specific speed cap, and finally clamps through the accepted Stage 2 servo
adapter. Normal completion and stop return to center; disconnect, reboot,
fault and emergency stop discard the remainder without replay.

For rollback, `0x24/0x25` V1 remains accepted and maps its profiles to fixed
numeric values. New Windows builds emit only V2.

Golden vectors: [`golden-vectors-t15d-choreography-v2.json`](golden-vectors-t15d-choreography-v2.json).

