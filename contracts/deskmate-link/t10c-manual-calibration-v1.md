# DeskMate Link T10C manual calibration v1

Status: `T10C_MANUAL_CALIBRATION_LINK_V1_FROZEN`

This slice extends the frozen `DESKMATE_LINK_V1_FROZEN` envelope without
changing its magic, version, flags, CRC, retry, sequence, timeout, UART or
error rules. It freezes a manual-calibration-only control plane. It does not
enable normal motion, prove a servo power path, or authorize hardware use.

## Safety boundary

- The Xiaozhi endpoint remains motion-blocked after startup, reconnect, either
  peer's boot change and emergency-stop clear. With no pre-existing latched
  stop/fault it returns to locked; a controller restart or disconnect cannot
  clear an existing stop/fault latch. Those transitions emit no servo output.
- Every possible output requires an axis selection followed by a one-time,
  volatile arm token. An output consumes the token. The lease is 1000..5000 ms.
- Arm requires all four user attestations: user present, linkage unloaded,
  independent current-limited servo supply, and reachable power cutoff.
- `SINGLE_STEP` carries direction only (`-1` or `+1`). Xiaozhi fixes the
  candidate step at 10 tenths of a degree. Windows and EasyInput must never send
  PWM duty, pulse width, GPIO, an absolute angle or an arbitrary step size.
- `PROVISIONAL_CENTER` carries no angle. A future hardware adapter may execute
  it only from a separately staged, local, board-specific provisional center.
  The T10C candidate has no such real adapter and therefore emits no PWM.
- Emergency stop has highest priority, disables outputs, clears the arm token
  and unexecuted work, and latches. It is idempotent even when its action ID is
  older than the last normal action. Clear returns to locked state and discards
  provisional center evidence; select, arm and recenter are required again.
- Disconnect, controller reboot or Xiaozhi reboot disarms, clears unexecuted
  work and provisional state, and never replays an action.
- Adapter failure latches a motion fault and disables outputs. DeskMate Link and
  OLED remain available. `MOTION` capability bit 3 remains clear in both
  implemented and enabled masks until the real adapter and Stages 0..3 pass.

## Messages

All integers use little-endian encoding. Axis is yaw `0`, pitch `1`, or none
`255`. `arm_token` is volatile and non-zero. `action_id` is non-zero and
monotonically increasing within `session_id`; a duplicate with identical fields
is idempotent, a duplicate with different fields is a conflict, and an older
normal action is rejected. The controller boot ID negotiated by HELLO is the
session ID.

### `0x20 MANUAL_CALIBRATION_COMMAND`

Request payload, exactly 19 bytes:

| Offset | Bytes | Field | Rule |
| ---: | ---: | --- | --- |
| 0 | 4 | `session_id` u32 | current HELLO controller boot ID |
| 4 | 4 | `action_id` u32 | non-zero, monotonic |
| 8 | 4 | `arm_token` u32 | only ARM/output operations use it |
| 12 | 1 | `operation` u8 | enum below |
| 13 | 1 | `axis` u8 | yaw/pitch, or none for stop/clear |
| 14 | 1 | `direction` i8 | only SINGLE_STEP: `-1` or `+1` |
| 15 | 1 | reserved | zero |
| 16 | 2 | `arm_ttl_ms` u16 | only ARM, 1000..5000 |
| 18 | 1 | `safety_flags` u8 | only ARM, exactly `0x0F` |

Operations: ARM `0`, SELECT_AXIS `1`, PROVISIONAL_CENTER `2`, SINGLE_STEP `3`,
RECENTER `4`, EMERGENCY_STOP `5`, CLEAR_EMERGENCY_STOP `6`.

Unused fields must be zero. SELECT_AXIS uses no arm token. ARM uses a non-zero
token, the selected axis, zero direction, a lease, and all safety flags.
PROVISIONAL_CENTER and RECENTER use the current token/axis and zero direction.
SINGLE_STEP uses the current token/axis and direction only. Stop and clear use
axis none and no token. Structural violations return the inherited
`BAD_PAYLOAD` Link error and cannot reach the owner.

Response payload, exactly 19 bytes:

| Offset | Bytes | Field |
| ---: | ---: | --- |
| 0 | 4 | echoed `session_id` |
| 4 | 4 | echoed `action_id` |
| 8 | 4 | session `completed_output_count` |
| 12 | 1 | terminal `result` |
| 13 | 1 | owner `state` |
| 14 | 1 | selected axis |
| 15 | 1 | flags |
| 16 | 1 | last terminal error/result |
| 17 | 1 | fixed step in tenths degree, `10` |
| 18 | 1 | reserved zero |

Results: completed `0`, duplicate `1`, not ready `2`, bad payload `3`, wrong
session `4`, stale action `5`, arm required `6`, arm expired `7`, wrong axis
`8`, step out of range `9`, center required `10`, emergency stopped `11`,
faulted `12`, adapter unavailable `13`, adapter failure `14`, action conflict
`15`, safety not confirmed `16`.

Owner states: locked `0`, axis selected `1`, armed `2`, provisional center `3`,
emergency stopped `4`, faulted `5`.

Flags: armed bit 0, selected-axis provisional center bit 1, recenter required
bit 2, emergency stop latched bit 3, faulted bit 4, adapter available bit 5.
Bits 6..7 are zero; in particular they do not assert normal-motion readiness.

The response is terminal for this synchronous single-command candidate:
`completed_output_count` increments only after the sole adapter accepts one
output command. Rejection and duplicate responses do not increment it.

### `0x21 GET_MANUAL_CALIBRATION_STATUS`

The request is empty. The response is 18 bytes:

`session_id:u32`, `last_action_id:u32`, `completed_output_count:u32`,
`state:u8`, `selected_axis:u8`, `flags:u8`, `last_error:u8`,
`fixed_step_tenths_degree:u8`, `reserved:u8`.

This is independent of the last command response and remains queryable after a
motion fault. If no manual owner was injected, both new messages return the
inherited `NOT_READY` error.

## Three-layer evidence contract

The future Windows/EasyInput slice must expose three distinct, correlated facts:

1. Windows records the user's explicit click/confirmation and request ID. This
   is intent evidence only, never proof of forwarding or motion.
2. EasyInput records that the exact T10C request was accepted into its single
   forwarding slot and later matched to a Xiaozhi response/error. This is
   forwarding evidence only, never proof of physical movement.
3. Xiaozhi returns the terminal result and completed output count above. This is
   endpoint execution/rejection evidence, not proof of a mechanically safe or
   measured angle.

The Desktop-to-EasyInput transport fields are `REQUIRED_NOT_FROZEN`. The future
slice must carry operation, axis, direction, session, action ID, volatile arm
token, arm lease, attestations and explicit confirmation. EasyInput must forward
the exact DMLK payload, preserve inherited timeout/retry, allow one request in
flight, never synthesize success, and clear pending work on disconnect/reboot.
It must not add pulse, duty, GPIO or angle fields. No Desktop or EasyInput source
implements this contract in T10C.

## T10C implementation gate

The only permitted implementation is a pure C++ owner, disabled adapter, fake
adapter, codec, golden-vector endpoint tests and a production endpoint whose
manual-owner pointer is null. There is no LEDC/PWM/GPIO driver and no production
motion call point. Stages 0..3 remain `NOT_RUN`; this package must never be
described as HIL-ready or as a flash candidate.
