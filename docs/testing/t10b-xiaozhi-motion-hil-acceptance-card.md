# T10B Xiaozhi motion HIL acceptance card

Status: `PLANNING_ONLY / MOTION_HARDWARE_LOCKED / NOT_A_FLASH_AUTHORIZATION`

Use this card only with the user physically present. Checkboxes record evidence;
they do not authorize the next stage automatically. Each stage needs an explicit
go/no-go decision, and any stop condition ends the run.

## Run identity

- Date/time: ____________________
- Operator and observer: ____________________
- DeskMate branch and exact HEAD: ____________________
- Candidate app size and SHA-256: ____________________
- Partition-table SHA-256: ____________________
- Xiaozhi board identity category: ____________________
- Recovery backup path and verified hash: ____________________
- Servo model/markings, yaw: ____________________
- Servo model/markings, pitch: ____________________

## Stage 0 - hard preconditions, no output

- [ ] User is beside the hardware and can remove servo power immediately.
- [ ] Exact candidate has passed Host tests, ESP-IDF v5.5.3 `esp32s3` build,
      source/license/secrets/ASCII/build-artifact checks and independent review.
- [ ] Candidate contains one disabled-by-default servo adapter, one motion owner
      and no direct output path outside that owner.
- [ ] Candidate preserves the frozen DeskMate Link and OLED behavior.
- [ ] Exact app-only write range, sector range and recovery plan have been shown
      and separately authorized.
- [ ] A current-limited, correctly rated independent servo supply and a physical
      cutoff are available.
- [ ] Link power pins remain disconnected; EasyInput J4 `3V3` is insulated.

Decision: [ ] GO  [ ] STOP

If any box is unchecked, stop. The current
`codex/xiaozhi-t10b-readiness-audit` branch intentionally cannot pass this
stage because it contains no servo adapter and is not a flash candidate.

## Stage 1 - powered-off wiring evidence

Keep USB, batteries and servo supply disconnected.

- [ ] Record connector photos showing orientation and strain relief.
- [ ] Confirm common-ground continuity only where designed.
- [ ] Confirm no short from servo power to ground.
- [ ] Confirm no short from GPIO11 or GPIO12 to servo power or ground.
- [ ] Confirm GPIO11 reaches the installed yaw signal conductor.
- [ ] Confirm GPIO12 reaches the installed pitch signal conductor.
- [ ] Confirm servo power and ground conductor order independently of wire
      color.
- [ ] Keep the driven linkages unloaded/detached for first output.

Measured evidence and instrument: ________________________________

Decision: [ ] GO  [ ] STOP

## Stage 2 - independent power path, signal disconnected

Do not attach GPIO11/GPIO12 signal conductors yet.

- [ ] Set and record the supply voltage: __________ V.
- [ ] Set and record the current limit/fuse: __________ A.
- [ ] Record supply continuous/peak rating: ____________________.
- [ ] Power only the servo rail and record idle current: __________ A.
- [ ] Record rail voltage at the connector: __________ V.
- [ ] Verify no voltage appears on an unpowered ESP32 or EasyInput rail.
- [ ] Verify no USB, ESP32 or EasyInput reset/brownout occurs.
- [ ] Power off and verify the rail decays before wiring changes.

Decision: [ ] GO  [ ] STOP

## Stage 3 - candidate installation and inert boot

This stage requires a later reviewed candidate and a separate exact-image flash
authorization. It is not executable with the readiness-doc branch.

- [ ] Re-identify the Xiaozhi board immediately before writing.
- [ ] Re-verify recovery backup and fixed 16 MiB partition table.
- [ ] Write only the authorized app range; do not write NVS, otadata,
      bootloader, partition table or eFuse.
- [ ] Read back and verify the exact app SHA-256.
- [ ] Boot with servo signals still disconnected and adapter disabled.
- [ ] Confirm OLED idle animation and DeskMate Link still work.
- [ ] Confirm motion reports calibration required and emits no target.

Decision: [ ] GO  [ ] STOP

## Stage 4 - yaw unloaded center and direction

Pitch signal remains disconnected. Yaw linkage remains unloaded. Set the
physical cutoff within reach.

- [ ] Enable only the yaw adapter for one reviewed center command.
- [ ] Record idle and center-command current and rail voltage.
- [ ] Confirm motion is small, smooth and free of binding.
- [ ] Record the non-binding center in calibrated units: __________.
- [ ] From center, authorize one smallest positive step only.
- [ ] Record physical direction: ____________________.
- [ ] Return to center and verify no repeated target is emitted while holding.
- [ ] Authorize one smallest negative step only, record direction, and return
      to center.
- [ ] Mark yaw `center_verified` and `direction_verified` only if every
      observation is unambiguous.

Decision: [ ] GO  [ ] STOP

## Stage 5 - yaw soft limits and rate

- [ ] Expand from center one reviewed increment at a time.
- [ ] Record the first sign of cable tension, current rise, noise or mechanical
      boundary without contacting a hard stop.
- [ ] Set the safe minimum inside that boundary: __________.
- [ ] Repeat in the opposite direction and set safe maximum: __________.
- [ ] Record the accepted maximum step per service tick: __________.
- [ ] Recenter and repeat the safe excursion once.
- [ ] Confirm `minimum < center < maximum` and all points remain inside the
      reserved mechanical margin.

Decision: [ ] GO  [ ] STOP

## Stage 6 - pitch unloaded center, direction, limits and rate

Disable/disconnect yaw signal while first validating pitch. Repeat Stages 4 and
5 for pitch.

- [ ] Pitch center: __________.
- [ ] Positive command physical direction: ____________________.
- [ ] Negative command physical direction: ____________________.
- [ ] Safe minimum: __________.
- [ ] Safe maximum: __________.
- [ ] Maximum step per service tick: __________.
- [ ] Peak observed current and minimum rail voltage: __________.
- [ ] Recenter repeated successfully without binding.

Decision: [ ] GO  [ ] STOP

## Stage 7 - two-axis recenter and session safety

- [ ] Install the final linkage/cable routing and recheck both axes' clearance.
- [ ] From a small safe two-axis offset, issue only recenter.
- [ ] Confirm deterministic bounded return to both recorded centers.
- [ ] Disconnect Link while safely offset; confirm no old intent is replayed.
- [ ] Reconnect and confirm the new session still requires explicit recenter.
- [ ] Restart the endpoint and confirm it starts locked and does not move.
- [ ] Confirm OLED animation and Link status remain available throughout.

Decision: [ ] GO  [ ] STOP

## Stage 8 - emergency stop and fail-soft isolation

Use only a small motion well inside both accepted limits.

- [ ] Trigger software emergency stop during motion and record latency:
      __________ ms.
- [ ] Confirm pending intents clear and no new target is emitted.
- [ ] Confirm stop remains latched until explicitly cleared in the same live
      session.
- [ ] Confirm clear requires a new recenter before any normal movement.
- [ ] Reset the session while stopped; confirm old clear/motion commands do not
      carry across.
- [ ] Inject one reviewed adapter failure; confirm motion faults and stays
      locked.
- [ ] Confirm DeskMate Link and OLED remain usable after the motion fault.
- [ ] Demonstrate the physical servo-power cutoff.

Decision: [ ] GO  [ ] STOP

## Stage 9 - acceptance and lock

- [ ] All measured values are attached to the exact board and assembly.
- [ ] No reference angle or nominal range was substituted for a measurement.
- [ ] Final calibration preserves the T10 frozen fail-closed and recenter gates.
- [ ] Full Host, ESP-IDF and three-end regression was rerun after final values.
- [ ] No motion path bypasses the one owner or the latched fault/stop behavior.
- [ ] A handoff records exact branch, HEAD, image hash, hardware operations,
      observations, open risks and next action.

Final state: [ ] ACCEPTED FOR THE MEASURED UNIT  [ ] REMAINS LOCKED

## Universal stop card

At every stage stop immediately for any uncertainty, wrong-axis movement,
unexpected direction or step size, hard-stop contact, binding, cable tension,
chatter, grinding, heat, smell, current spike, voltage sag, brownout, reset,
backfeed, loss of OLED/Link, emergency-stop failure or ambiguous measurement.
Do not widen limits, raise current limits, repeat a failed motion, swap wires
while powered or continue by relying on reference constants.
