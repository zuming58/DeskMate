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
- T10D manual control and T15 presets share one MotionCoordinator, which is the
  sole ServoAdapter writer and owns the common emergency-stop, fault, logical
  center and output state. Starting manual control cancels a preset. A preset
  can never run while the manual owner is active.
- Every normally completed preset and `STOP_AND_CENTER` finish at the accepted
  Stage 2 center. Emergency stop disables output immediately and latches.
  `CLEAR_ESTOP_AND_CENTER` clears only the stop latch and then recenters before
  returning ready.
- The fixed runtime envelope is a strict subset of the accepted Stage 2
  profile. The endpoint owns timing, interpolation, limit checks and output.
- Source never preempts an already running preset. A concurrent run returns
  `BUSY`; only manual control, recovery, fault, stop and emergency stop preempt.

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

Allowed sources are exact: RUN accepts UI, explicit voice, context or idle;
STOP_AND_CENTER accepts UI or explicit voice; EMERGENCY_STOP accepts UI or
explicit voice; CLEAR_ESTOP_AND_CENTER accepts UI only. Clear is the explicit
user-present recovery flow. Context, idle and ordinary voice can never clear a
latched stop. Clear never clears a fault.

The response is the 20-byte status record below. For `RUN`, result `ACCEPTED`
means only that the endpoint accepted and started the local preset. It does not
mean that a servo moved or that the preset finished.

## `0x23 GET_MOTION_STATUS`

The request is empty. The response uses the same 20-byte status record:

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 4 | current `session_id` |
| 4 | 4 | subject `action_id` |
| 8 | 4 | completed preset counter for this session |
| 12 | 1 | result |
| 13 | 1 | state |
| 14 | 1 | operation, `0..4` |
| 15 | 1 | active or last preset, `0..4` |
| 16 | 1 | requested repeats, `0..3` |
| 17 | 1 | completed repeats, `0..3` |
| 18 | 1 | source, `0..4` |
| 19 | 1 | flags |

Results: `ACCEPTED=0`, `DUPLICATE=1`, `COMPLETED=2`, `CANCELLED=3`,
`NOT_READY=4`, `BAD_PAYLOAD=5`, `WRONG_SESSION=6`, `STALE_ACTION=7`,
`BUSY=8`, `RECENTER_REQUIRED=9`, `EMERGENCY_STOPPED=10`, `FAULTED=11`,
`ADAPTER_UNAVAILABLE=12`, `ADAPTER_FAILURE=13`, `SEQUENCE_CONFLICT=14`.

States: `NOT_READY=0`, `RECENTERING=1`, `READY=2`, `RUNNING=3`,
`EMERGENCY_STOPPED=4`, `FAULTED=5`.

Flags: adapter available bit 0, logical center command accepted bit 1,
emergency stop latched bit 2, faulted bit 3, servo output enabled bit 4,
operation terminal bit 5, duplicate response bit 6. Bit 7 is zero.

`adapter available`, `logical center command accepted` and `servo output
enabled` describe only the
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

For a `0x22` reply, subject is always that request, including BUSY, STALE and
other rejections. A rejected request never overwrites the live snapshot that a
subsequent `0x23` returns. For `0x23`, subject is the current or last accepted
operation. RUN is complete only when the same controller and peer boot epochs
remain active, subject action matches, result is COMPLETED, state is READY,
repeat completed equals repeat total, completed preset counter advanced exactly
once, and operation terminal is set. STOP/CLEAR do not increment the preset
counter. EMERGENCY_STOP is a synchronous terminal latch.

Structural violations (length, enum, reserved bytes or impossible field
combination) return inherited Link `BAD_PAYLOAD`. A structurally valid request
rejected by motion policy returns the 20-byte semantic result. EasyInput Link
queue contention is a host transport error and is never converted to semantic
BUSY. `0x22 ACCEPTED` ends only its Link transaction; it does not complete the
multi-second action.

## Endpoint-owned first revision trajectories

The values below describe behavior for tests and product review. They are not
fields in either wire contract.

| Preset | Local trajectory | Default |
| --- | --- | ---: |
| attention | `(yaw 0, pitch -4) -> (0, 0)` | 1 repeat, about 1.2 s |
| nod | `(0, +6) -> (0, -2) -> (0, 0)` | 2 repeats, about 3.2 s |
| search | `(yaw -10, pitch 0) -> (+10, 0) -> (0, 0)` | 1 repeat, about 2.2 s |
| dance | `(-8, -3) -> (+8, +3) -> (-8, +3) -> (+8, -3) -> (0, 0)` | 2 repeats, about 7.2 s |

The endpoint may smooth waypoints but may not exceed the frozen amplitudes or
Stage 2 limits without a new contract and physical acceptance.
Every repeat ends at logical center before `repeat_completed` increments. A
preset watchdog is `repeat_count * {attention:1500, nod:1800, search:2500,
dance:4000} + 1000 ms`; therefore dance x3 has a hard 13 second deadline.
Expiry stops output, clears remaining waypoints and reports a terminal fault;
it cannot hold or continue indefinitely.

## Capability and readiness

The existing MOTION capability bit 3 is enabled only when the production
endpoint has this handler, the accepted Stage 2 profile and an available real
servo adapter. A missing/disabled adapter keeps the bit clear and both messages
return inherited `NOT_READY`. Capability presence is protocol evidence only.
The capability is stable for a peer boot. Busy, stop or a runtime fault changes
GET_STATUS motion-ready bit 2 and this status record, not the capability mask.
Audio bit 4 remains disabled. Agent state, display and T10D manual calibration
must continue operating when the optional MOTION bit is present.
