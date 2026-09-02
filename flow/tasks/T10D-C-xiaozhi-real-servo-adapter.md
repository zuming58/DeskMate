# T10D-C Xiaozhi real servo adapter

Status: `STAGE0_CODE_BUILD_COMPLETE / DEFAULT_LOCKED / STAGE1_PROFILE_BLOCKED / HIL_NOT_RUN`

## Objective

Turn the already frozen T10C manual-calibration Link slice into a Xiaozhi
Stage 0 flash candidate that recognizes calibration requests, reports a
truthful locked status, and contains a real dual-axis ESP-IDF adapter behind an
explicit measured-profile gate.

This package does not enable normal motion and does not authorize servo power,
PWM, wiring or flashing.

## Implementation boundary

- Keep the frozen DeskMate Link framing, message IDs and T10C payloads
  unchanged.
- Attach one `ManualCalibrationOwner` to the production endpoint so a Stage 0
  image returns the frozen status payload instead of `UNKNOWN_TYPE`.
- Keep the committed product configuration locked. With the gate disabled,
  construction, startup, status, axis selection and ARM create no LEDC/GPIO
  activity.
- Provide one dual-axis LEDC backend using only the fixed reference-board
  evidence: yaw GPIO11, pitch GPIO12, 50 Hz, low-speed timer 0, channels 0/1,
  14-bit duty.
- Require installed mapping, independent servo power, common ground, emergency
  cutoff and both axes' measured center, direction, conservative limits and
  pulse-per-degree before the adapter becomes available.
- Configure only the selected axis on its first explicitly armed provisional
  center. Every center, fixed 1-degree step or recenter consumes its ARM token.
- Fail closed on range errors and fail soft on backend faults; DeskMate Link
  remains available.
- Keep normal `MOTION` capability bit 3 clear.

## Verification

- Xiaozhi Host CTest, including real-adapter pure logic and Stage 0 Link status.
- Exact ESP-IDF v5.5.3 / `esp32s3` fixed 16 MiB partition build.
- Source, scope, secret, ASCII path, license and build-output checks.

## Stop gate

Stop after code/build delivery. Before a Stage 1 profile can be produced, the
user-present checklist in
`docs/testing/t10d-c-xiaozhi-servo-stage0-checklist.md` must be completed with
measured evidence. Flashing and every hardware operation require separate
authorization.
