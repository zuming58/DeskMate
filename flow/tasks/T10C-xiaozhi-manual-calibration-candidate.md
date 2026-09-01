# T10C Xiaozhi manual calibration candidate

Status: `COMPLETE / CODE_ONLY / MOTION_HARDWARE_LOCKED / HIL_NOT_RUN`

## Objective

Freeze and implement the Xiaozhi-side manual-calibration control candidate
without installing a real servo adapter or enabling motion.

## Deliverables

- `T10C_MANUAL_CALIBRATION_LINK_V1_FROZEN` additive Link slice and golden vectors.
- One manual calibration owner around the existing T10A safety core.
- A disabled adapter plus fake adapter; no LEDC/PWM/GPIO driver.
- Host coverage for startup silence, arm lease, fixed one-step output,
  idempotency/conflict/stale action, range/axis/calibration rejection, recenter,
  e-stop, disconnect/reboot no replay and fail-soft adapter faults.
- Exact ESP-IDF v5.5.3 `esp32s3` build and static/source boundary checks.

## Stop gate

Do not scan ports, identify devices, read/write Flash, flash, erase, monitor,
operate hardware, initialize audio, or modify Desktop/EasyInput. Stop after the
code package is pushed. Hardware Stages 0..3 remain not run.
