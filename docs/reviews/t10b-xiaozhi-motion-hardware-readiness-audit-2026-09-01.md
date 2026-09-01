# T10B Xiaozhi motion hardware readiness audit

Date: 2026-09-01

Branch: `codex/xiaozhi-t10b-readiness-audit`

Base: `origin/codex/xiaozhi-oled-animation-polish@8d6af0cd38fb3fed85ceba03bcd99857dd1e552e`

Review state: `T10B_READINESS_REVIEWED / MOTION_HARDWARE_LOCKED / HIL_NOT_AUTHORIZED`

## Conclusion

No servo firmware code is safe to add in this package.

The fixed reference and product hardware baseline identify the logical control
signals as GPIO11 for horizontal/yaw and GPIO12 for vertical/pitch. They do not
establish the installed servos' supply voltage, available current, connector
polarity, real unloaded centers, direction, mechanical limits, recenter
behavior or emergency-stop behavior. The frozen T10 contract requires those
facts before output is allowed.

The current product source therefore remains in its fail-closed state:

- `MotionSafetyCore` is pure C++ and has no production instance;
- `app_main` starts only the OLED display owner and DeskMate Link UART owner;
- there is no PWM, LEDC, MCPWM, GPIO11/GPIO12 or servo adapter;
- no motion DeskMate Link message or framing change exists;
- OLED animation and DeskMate Link remain independent of the dormant motion
  model.

The next safe activity is a user-present, staged evidence collection using
[`t10b-xiaozhi-motion-hil-acceptance-card.md`](../testing/t10b-xiaozhi-motion-hil-acceptance-card.md).
Even that card does not authorize flashing or servo output. A later candidate
must first add a disabled-by-default adapter, pass review and build gates, and
receive a separate exact-image and exact-step authorization.

## Inputs reviewed

- `docs/contracts/t10-motion-safety-core-v1.md`, status
  `T10_MOTION_SAFETY_CORE_V1_FROZEN`.
- `flow/tasks/T10A-xiaozhi-motion-safety-core.md`.
- `flow/decisions.md` D013 and D018.
- `docs/architecture/deskmate-v1-hardware-baseline.md`.
- `docs/provenance/t10-xiaozhi-servo-reference-audit.md`.
- `docs/handoffs/t10a-xiaozhi-motion-safety-core-2026-08-31.md`.
- `docs/handoffs/xiaozhi-oled-animation-polish-2026-08-31.md`.
- Product source and Host source-contract tests at the exact base above.
- Read-only reference root `F:\Codex\xiaozhi-yuntai`.

## Fixed reference evidence

The read-only reference is not a Git worktree. Its identity is pinned by file
hashes and its MIT license; no reference source is copied by this audit.

| Reference file | SHA-256 | Evidence used |
| --- | --- | --- |
| `LICENSE` | `0A5A839033BFE18FE75D32B50D9D028912CF876F69EF59C2791AEB2971335D05` | MIT license boundary |
| `main/boards/esp32-s3n16r8-emoji/board_config.h` | `C654860BE8AABB0525B94D2E37C8D847F418662CA619F20AF944B9B9D762A573` | GPIO11 horizontal/yaw, GPIO12 vertical/pitch, 50 Hz reference behavior |
| `main/boards/esp32-s3n16r8-emoji/servo_controller.h` | `F87F857A7ED56B2805CDE207AE7400217F150C7EF8D711DC771A0FA93A0B741C` | reference controller API only |
| `main/boards/esp32-s3n16r8-emoji/servo_controller.cc` | `5D306809752C7F8594366897E5E17C5A9484F65B51B3CE1391992FC412A743C4` | bounded-step and recenter concepts; unsafe immediate initialization is not adopted |

The reference's nominal 90-degree centers, compile-time angle ranges, pulse
widths and direct LEDC initialization are behavior examples, not calibration
evidence for the user's assembled hardware.

## Coexistence audit

| Area | Evidence at base | Result |
| --- | --- | --- |
| T10A source integrity | Motion header, source and tests have no diff from `2e538d0c080aa9f908f6b374fce080b008ef11ae` | preserved |
| Production reachability | `firmware/xiaozhi-yuntai/main/main.cpp` has no `MotionSafetyCore` construction or call | locked |
| Hardware output | production search finds no LEDC/MCPWM/GPIO11/GPIO12/servo adapter | absent |
| OLED owner | GPIO41/GPIO42 display owner remains the only display writer | active and separate |
| Link owner | frozen UART owner and framing remain unchanged | active and separate |
| Failure isolation | display tests retain fail-soft Link behavior; motion model has no hardware failure path | preserved |
| Host regression | all Xiaozhi Host CTest targets pass together, 9/9 | confirmed |

This proves code-level coexistence. It does not prove any electrical or
mechanical behavior.

## Evidence still requiring an on-site human

Every item below remains `UNKNOWN` until recorded against the actual assembled
unit. A reference constant, photo alone or successful OLED/Link test cannot
close it.

### Independent servo power and current

- identify the servo rail source, nominal voltage, polarity, connector pinout
  and return path;
- confirm the rail is independent of EasyInput J4 `3V3` and is not an
  improvised cross-board supply;
- record current-limit/fuse protection and the supply's continuous and peak
  capability;
- measure idle, one-axis small-step and later two-axis peak current, including
  voltage sag and ESP32 reset/brownout observations;
- prove no backfeed into either USB or logic rail while alternate supplies are
  removed.

### Common ground and signal path

- with all sources disconnected and both boards unpowered, verify common-ground
  continuity and absence of shorts from GPIO11/GPIO12 to power or ground;
- verify the installed harness maps GPIO11 to the physical yaw servo signal and
  GPIO12 to the physical pitch servo signal;
- verify connector orientation and signal voltage before attaching either
  servo;
- retain the already frozen DeskMate Link GND/TX/RX wiring and keep all power
  pins out of that three-wire cable.

### Unloaded center and direction

- mechanically unload or detach the driven linkage before first PWM output;
- find and record a non-binding electrical center for yaw and pitch separately;
- record which commanded sign moves the head left/right and up/down;
- do not infer either axis from the reference's 90-degree value or source-side
  naming.

### Mechanical limits and rate

- start from center and expand one axis at a time using the smallest reviewed
  step;
- record safe minimum and maximum before any contact, binding, cable tension or
  abnormal current rise;
- reserve a margin inside the observed physical boundary and record the maximum
  safe per-tick step/rate;
- repeat after the final bracket, cable routing and enclosure are installed,
  because assembly changes the safe range.

### Recenter and emergency stop

- demonstrate center recovery from a small offset on each axis and then from a
  safe two-axis offset;
- demonstrate that session reset, Link loss and restart do not replay old
  motion and require a new recenter;
- provide a reachable physical way to remove servo power before motion begins;
- measure software emergency-stop latency, confirm output suppression is
  latched, and confirm clearing it in the same session still requires a new
  recenter;
- inject an adapter failure and confirm motion locks while DeskMate Link and
  OLED remain usable.

## Explicit stop conditions

Stop immediately, remove servo power where safe, preserve logs/counters without
private data, and do not continue to the next row of the acceptance card if any
of these occur:

- the user is not physically present or cannot reach the servo power cutoff;
- supply voltage, polarity, current limit, connector order or ground path is
  uncertain;
- any backfeed, short, unexpected continuity or signal above the verified logic
  level is observed;
- the firmware/image/branch, board identity, partition layout or intended write
  range is not exact;
- motion begins before an explicit one-step authorization;
- the wrong axis moves, direction is opposite the recorded expectation, or
  either axis moves by more than the authorized increment;
- binding, hard-stop contact, cable tension, chatter, grinding, abnormal noise,
  heat, smell, current rise, voltage sag, brownout or reset occurs;
- OLED or DeskMate Link becomes unavailable because of a motion fault;
- emergency stop does not suppress further targets, is not latched, clears
  across a session boundary, or permits movement without a new recenter;
- a result cannot be recorded unambiguously. Ambiguous evidence remains
  `UNKNOWN`; it is never rounded up to pass.

## Verification performed by this audit

- exact base and ancestry checks passed;
- T10A motion files are byte-for-byte unchanged from the T10A handoff base;
- production source and source-contract tests confirm no motion call site or
  hardware adapter;
- Xiaozhi Host CTest: 9/9 passed on the combined OLED-polish base;
- fixed reference license and file hashes rechecked;
- no port scan, device identification, Flash/NVS/eFuse access, flash, erase,
  monitor, OLED hardware operation, PWM, servo, audio or wiring action occurred.
