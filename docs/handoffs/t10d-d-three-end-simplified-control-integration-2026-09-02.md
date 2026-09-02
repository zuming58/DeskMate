# T10D-D simplified manual-control three-end integration

Date: 2026-09-02

## Outcome

The complicated expert calibration console has been replaced in the integrated
Windows candidate by one environment confirmation/start action, four
press-and-hold direction buttons, return to center and an always-visible
emergency stop. EasyInput and DeskMate Link wire values are unchanged.

## Exact source

- Integration branch: `codex/t10d-d-simplified-manual-control`
- Tested implementation merge: `514ad6be7a5c54a8574174d26121ac07bdafabbe`
- Windows delivery: `codex/t10d-desktop-manual-control-ux@55e929bee6da65ddf2c78efc429834e986995572`
- Windows implementation: `76d33f44bb6211130c4b9ed97c17aaeb926d89fd`
- Stage 2 hardware preparation: `f18928f066af9a433a5a83ac5310b90c06a45bb3`

## Runtime boundary

Windows serially expands each semantic action over the frozen HID `0x16/0x17`
and DeskMate Link `0x20/0x21` operations. Start establishes both centers. A
held direction produces no more than one terminal-gated one-degree request per
250 ms. Release, cancellation, focus loss, hidden/page exit, connection loss
and inactivity suppress later output; there is no queued catch-up or replay.

EasyInput firmware is unchanged and does not need another flash. The Xiaozhi
Stage 2 overlay restores the fixed-reference range already exercised by this
assembled unit while keeping normal `MOTION`, presets, dancing and expression
linking disabled.

## Verification

- Desktop: `npm ci --include=dev`; full tests `310/310`; packaged native bridge
  protocol self-test; isolated Windows directory package; `git diff --check`.
- EasyInput Host CTest: `13/13`.
- Xiaozhi Host CTest: `12/12`.
- Xiaozhi firmware: exact ESP-IDF v5.5.3, target `esp32s3`, separate generated
  config with yaw `1055..1944 us`, pitch `1277..1722 us`, centers `1500 us`
  and fixed steps `11 us`.

Windows package:

- `release-t10d-d-integrated/win-unpacked/DeskMate.exe`: `202690560` bytes,
  SHA-256 `AF1F1BE1AD08367B9D2BE424D49A053880748EBBD7D2E8CE5D1B487BBD9BD842`.
- bundled `DeskMate.InputBridge.exe`: `153512841` bytes, SHA-256
  `A73314555755CFEF472538CCD04352DFAF3E98FCD8B046BEF15AD90B8CC8F46F`.
- `resources/app.asar`: `112808866` bytes, SHA-256
  `F57067E1B1F1020161F5780E15F97FED8AD776CB5B1B31491199CD711046F0F3`.

Xiaozhi Stage 2 candidate:

- `build-stage2-reference-manual-control-integrated/deskmate_xiaozhi_yuntai.bin`
- app address `0x100000`
- size `212720` bytes
- SHA-256 `C47B6037C3424E4902D64B1AC732B8A8B4749B772632CE6C8F965B7EEBAF7AA2`
- generated `app-flash_args`: `0x100000 deskmate_xiaozhi_yuntai.bin`
- partition table is unchanged (`3072` bytes, SHA-256
  `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0`)
  and is not authorized for writing.

## Remaining user-present acceptance

The currently installed Xiaozhi image is Stage 1 and cannot exercise the full
hold range. A new exact app-only authorization is required before writing the
Stage 2 candidate. After that write and verification, launch only the integrated
Windows package and perform this short matrix:

1. Start manual control and observe the two-axis center establishment.
2. Briefly hold left, right, up and down separately; release after each and
   confirm no delayed movement occurs.
3. Press return to center.
4. Press emergency stop and confirm later holds remain disabled until a new
   explicit start.

Protocol completion is not physical direction or limit evidence. Stop the test
immediately on jump, stall, collision, reset, unexpected direction or Link loss.

## Safety record

This integration and verification did not launch DeskMate, enumerate or access
a device/port, write Flash/NVS/eFuse, erase, monitor, command OLED/audio, emit
PWM or move a servo.
