# T10D-C Xiaozhi real servo adapter handoff

Date: 2026-09-02

Branch: `codex/xiaozhi-t10d-c-real-servo-adapter`

Base: `a5a86b5e2ab816c2906d9f88a4ed4343dcd4db05`

Classification: `STAGE0_CODE_BUILD_COMPLETE / DEFAULT_LOCKED / STAGE1_PROFILE_BLOCKED / HIL_NOT_RUN`

## Why this package exists

The real three-end HIL reached the Xiaozhi board, but its manual-calibration
status response was `UNKNOWN_TYPE (1)`. That board is running the accepted
T09.1 app-only image from 2026-08-31; no T10C/T10D manual-calibration endpoint
has ever been flashed after it. The response is therefore an image-version
fact, not an EasyInput framing failure.

## Delivery

- Production now attaches the existing frozen T10C manual owner, so Stage 0
  recognizes messages `0x20/0x21` and reports `locked` with
  `adapter_available=false` instead of `UNKNOWN_TYPE`.
- Added a real ESP-IDF dual-servo backend from fixed reference-board evidence:
  GPIO11 yaw / LEDC channel 0, GPIO12 pitch / channel 1, low-speed timer 0,
  14-bit, 50 Hz.
- Added a strict Kconfig/profile gate. The committed configuration leaves the
  enable switch off, all calibration values zero and all evidence flags false.
- No LEDC or servo GPIO is initialized at construction, startup, status query,
  select-axis or ARM. The first possible hardware call is one explicitly armed
  provisional-center request in a later reviewed Stage 1 profile.
- The local adapter applies conservative pulse checks, fixed one-degree steps,
  per-output ARM consumption, recenter and fail-soft hardware errors. Normal
  `MOTION` capability remains disabled.
- Base DeskMate Link framing/IDs, UART pins, OLED, audio, Wi-Fi, partitions,
  Desktop and EasyInput are unchanged.

## Verification

- Xiaozhi Host CTest: `12/12` passed, including the default Stage 0 response,
  no-startup-output gate, lazy single-axis configure, direction/limit/recenter,
  ARM consumption and backend-failure behavior.
- Exact ESP-IDF source: v5.5.3 at
  `2c211b236707889e8400c4dc5644dd5c4ee071e0`; target `esp32s3`; Xtensa GCC
  14.2.0. Exact fixed 16 MiB partition build passed after one retry of the known
  ESP-IDF-owned `esp_lcd_panel_rgb.c` compiler IRA.
- The clean post-commit artifact identity is reported with the final task
  response because committing this handoff changes the embedded Git version.

## Evidence and stop gate

Reference/license evidence is in
`docs/provenance/t10d-c-xiaozhi-servo-adapter-reference-audit.md`. The mandatory
user-present electrical/mechanical checklist is in
`docs/testing/t10d-c-xiaozhi-servo-stage0-checklist.md`.

No application was launched, no port/device was enumerated, and no wiring,
Flash/NVS/eFuse read/write, erase, flash, monitor, OLED command, audio, PWM,
GPIO or servo operation occurred. This meets the code/build standard to request
separate authorization for a default-locked Stage 0 app-only image. It does not
meet the standard for an enabled Stage 1 calibration image or any physical
motion.
