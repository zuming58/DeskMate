# DeskMate Link T15 motion presets v1

Status: `T15_MOTION_PRESETS_LINK_V1_FROZEN`

This slice adds four semantic, endpoint-owned motion presets to the existing
`DESKMATE_LINK_V1_FROZEN` envelope. It does not change framing, CRC, retry,
sequence, UART or error rules. Windows and EasyInput never send PWM, GPIO,
pulse width, duty cycle, an absolute angle, a waypoint or a velocity.

## Fixed boundary

- Message `0x22` carries one high-level operation. Message `0x23` reads the
  current endpoint-owned motion state.
- Presets are `attention=1`, `nod=2`, `search=3`, `dance=4`.
- Repeat count is `1..3`. Defaults are attention/search `1` and nod/dance `2`.
  The endpoint repeats the complete preset, not individual waypoints.
- Only one preset may run. A second run while active returns `BUSY`; there is
  no unbounded queue and no delayed replay.
- A run request is acknowledged synchronously. Motion completion is observed
  with `0x23`; the 250 ms Link request timeout is never stretched to cover a
  multi-second motion.
- Stop, disconnect, peer reboot, controller reboot, fault and emergency stop
  clear unexecuted waypoints. Nothing is replayed after a new session.
- Every normally completed preset and `STOP_AND_CENTER` finish at the accepted
  Stage 2 center. Emergency stop disables output immediately and latches.
  `CLEAR_ESTOP_AND_CENTER` clears only the stop latch and then recenters before
  returning ready.
- The fixed runtime envelope is a strict subset of the accepted Stage 2
  profile. The endpoint owns timing, interpolation, limit checks and output.

## `0x22 RUN_MOTION_PRESET`

Request payload is exactly 16 bytes, little-endian:

| Offset | Bytes | Field | Rule |
| ---: | ---: | --- | --- |
| 0 | 4 | `session_id` u32 | current HELLO controller boot ID |
| 4 | 4 | `action_id` u32 | non-zero, monotonic within session |
| 8 | 1 | `operation` u8 | enum below |
| 9 | 1 | `preset` u8 | run only: `1..4`; otherwise `0` |
| 10 | 1 | `repeat_count` u8 | run only: `1..3`; otherwise `0` |
| 11 | 1 | `source` u8 | UI `1`, explicit voice `2`, context `3`, idle `4` |
| 12 | 4 | reserved | zero |

Operations are `RUN=1`, `STOP_AND_CENTER=2`, `EMERGENCY_STOP=3`, and
`CLEAR_ESTOP_AND_CENTER=4`.

`action_id` is idempotent. An identical duplicate returns `DUPLICATE` without
restarting a preset. Reuse with different bytes is a sequence conflict; an
older normal action is stale. Emergency stop remains idempotent and highest
priority even when its action ID is older than the last normal action.

The response is the 20-byte status record below. For `RUN`, result `ACCEPTED`
means only that the endpoint accepted and started the local preset. It does not
mean that a servo moved or that the preset finished.

## `0x23 GET_MOTION_STATUS`

The request is empty. The response uses the same 20-byte status record:

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 4 | current `session_id` |
| 4 | 4 | last accepted/terminal `action_id` |
| 8 | 4 | completed preset counter for this session |
| 12 | 1 | result |
| 13 | 1 | state |
| 14 | 1 | active or last preset, `0..4` |
| 15 | 1 | requested repeats, `0..3` |
| 16 | 1 | completed repeats, `0..3` |
| 17 | 1 | source, `0..4` |
| 18 | 1 | flags |
| 19 | 1 | last terminal result/detail |

Results: `ACCEPTED=0`, `DUPLICATE=1`, `COMPLETED=2`, `CANCELLED=3`,
`NOT_READY=4`, `BAD_PAYLOAD=5`, `WRONG_SESSION=6`, `STALE_ACTION=7`,
`BUSY=8`, `RECENTER_REQUIRED=9`, `EMERGENCY_STOPPED=10`, `FAULTED=11`,
`ADAPTER_UNAVAILABLE=12`, `ADAPTER_FAILURE=13`, `SEQUENCE_CONFLICT=14`.

States: `NOT_READY=0`, `RECENTERING=1`, `READY=2`, `RUNNING=3`,
`EMERGENCY_STOPPED=4`, `FAULTED=5`.

Flags: adapter available bit 0, centered bit 1, emergency stop latched bit 2,
faulted bit 3 and physical output active bit 4. Bits 5..7 are zero.

`adapter available`, `centered` and `physical output active` describe only the
endpoint's configured adapter and accepted command state. There is no position
sensor, so none of these bits proves measured shaft angle, mechanical arrival,
load safety or physical acceptance.

Source is semantic scheduling metadata only. UI and explicit voice share the
highest normal runtime priority, then context, then idle. It does not grant a
new capability and never overrides manual control, recovery, fault or stop.

`completed preset counter` increments once only after every requested repeat
has completed and the final center has been accepted by the servo adapter.
Rejected, stopped, duplicate and partially completed actions do not increment
it. `completed repeats` may advance while running and is diagnostic evidence,
not measured mechanical movement.

## Endpoint-owned first revision trajectories

The values below describe behavior for tests and product review. They are not
fields in either wire contract.

| Preset | Local trajectory | Default |
| --- | --- | ---: |
| attention | pitch up about 4 degrees, hold, center | 1 repeat, about 1.2 s |
| nod | pitch down about 6 degrees, slight lift, center | 2 repeats, about 3.2 s |
| search | yaw left about 10 degrees, right about 10 degrees, center | 1 repeat, about 2.2 s |
| dance | yaw sway plus small pitch motion, center | 2 repeats, about 7.2 s |

The endpoint may smooth waypoints but may not exceed the frozen amplitudes or
Stage 2 limits without a new contract and physical acceptance.

## Capability and readiness

The existing MOTION capability bit 3 is enabled only when the production
endpoint has this handler, the accepted Stage 2 profile and an available real
servo adapter. A missing/disabled adapter keeps the bit clear and both messages
return inherited `NOT_READY`. Capability presence is protocol evidence only.
