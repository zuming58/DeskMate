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

## Stage 1 reference-baseline micro-trial addendum

After Stage 0 protocol HIL passed, the operator supplied the relevant installed
hardware fact: this exact Xiaozhi assembly previously completed nod and rotation
normally with the fixed reference firmware. The reference source was re-read and
establishes yaw GPIO11/channel 0, pitch GPIO12/channel 1, 50 Hz, a 1500 us
90-degree center and an 11 us 90-to-91-degree delta.

Branch `codex/xiaozhi-t10d-c-reference-baseline-trial` adds a separate reviewed
overlay at
`firmware/xiaozhi-yuntai/profiles/stage1-reference-trial.defaults`. It sets both
centers to 1500 us but restricts both axes to 1489..1511 us with one fixed 11 us
step. The default build stays Stage 0 locked. Normal `MOTION`, presets, dancing
and expression-linked movement remain disabled.

The first physical procedure remains one selected axis, four runtime
attestations, one-use ARM, provisional center, at most one one-degree excursion,
recenter and emergency stop. Startup, status, selection and ARM emit no PWM. Host
CTest passes `12/12`, and an independent generated-config ESP-IDF v5.5.3
fixed-layout build passes. A first build that reused the source-tree Stage 0
`sdkconfig` was detected and rejected before device access. Exact committed
source is `4a0eeccf8d077ae8899602354ec1f6f26280a48d`. The app-only image is
`212720` bytes with SHA-256
`752ABFAB73E431084913AD5F85E429E9AE5816C79D0571DD6A2C470B6F2E3EC2` and
`app-flash_args` contains only `0x100000 deskmate_xiaozhi_yuntai.bin`. The
unchanged `3072`-byte partition table has SHA-256
`4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0` and is
not part of the app-only write.

Classification:
`STAGE1_REFERENCE_BASELINE_CODE_BUILD_CONFIRMED / FLASH_NOT_AUTHORIZED / SERVO_MOTION_NOT_RUN`.
No port/device, Flash/NVS/eFuse, erase, flash, monitor, OLED, audio, PWM, GPIO or
servo operation occurred while preparing this addendum.
