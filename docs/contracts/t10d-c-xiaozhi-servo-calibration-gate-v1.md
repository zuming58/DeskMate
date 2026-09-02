# T10D-C Xiaozhi servo calibration gate v1

Status: `T10D_C_SERVO_CALIBRATION_GATE_V1_IMPLEMENTED / LOCAL_FIRMWARE_ONLY / WIRE_UNCHANGED`

Date: 2026-09-02

This is a Xiaozhi implementation safety boundary. It does not add or alter a
DeskMate host or DeskMate Link message. The authoritative wire behavior remains
`T10C_MANUAL_CALIBRATION_LINK_V1_FROZEN`.

## Committed Stage 0 state

- The production endpoint owns one manual-calibration owner and therefore
  recognizes `MANUAL_CALIBRATION_COMMAND (0x20)` and
  `GET_MANUAL_CALIBRATION_STATUS (0x21)`.
- `CONFIG_DESKMATE_T10DC_SERVO_CALIBRATION_ENABLE` is disabled.
- Every measurement field is zero and every verification flag is false.
- Status is returned as `locked` with `adapter_available=false`; it is not an
  unknown message and is not motion ready.
- Startup, status, select-axis and ARM do not configure LEDC, claim a servo GPIO
  or emit a pulse.
- Normal `MOTION` capability remains disabled.

## Adapter availability gate

The adapter is available only when all conditions below are simultaneously
true in one reviewed calibration profile:

1. The dedicated calibration build gate is enabled.
2. The installed-board yaw/pitch mapping is physically verified as GPIO11 and
   GPIO12 respectively.
3. Independent servo power, a common ground and an immediate physical power
   cutoff are verified.
4. Both axes have measured provisional center pulse, direction, conservative
   minimum/maximum pulses and pulse delta for one degree.
5. Every per-axis verification flag is true, each direction is exactly `-1` or
   `+1`, and the profile stays inside the reference controller's 500..2500 us
   electrical envelope.

No reference nominal 90-degree center, direction, mechanical range or power
assumption satisfies this gate.

## Output boundary

- Physical backend: ESP-IDF LEDC low-speed mode, timer 0, 14-bit, 50 Hz; yaw
  channel 0 / GPIO11 and pitch channel 1 / GPIO12.
- The backend is lazy: only a selected axis receiving an accepted, explicitly
  armed provisional-center command is configured.
- The wire carries no duty, pulse or arbitrary angle. A relative command is
  fixed to exactly `-1` or `+1` degree and is converted with the reviewed local
  profile.
- Every possible output consumes the short one-use ARM token before the backend
  call, including rejected out-of-range or unavailable attempts.
- Provisional center is mandatory before step or recenter. Soft pulse limits
  reject without output.
- E-stop, disconnect, peer restart and local restart disable outputs, clear the
  volatile session/ARM and require a new center path. A latched e-stop is not
  silently cleared by reconnect or reboot semantics.
- Backend configuration/write failure disables all configured axes and marks
  manual motion faulted without stopping DeskMate Link.

## Ownership

Only `EspIdfServoPwmBackend` calls LEDC/GPIO APIs. The Link endpoint, codec,
manual owner and Windows/EasyInput layers operate only on frozen high-level
state and commands. Audio, OLED ownership, Wi-Fi, partitions and UART framing
are unchanged by this gate.
