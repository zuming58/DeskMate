# T15D adjustable motion reference audit — 2026-09-03

## Reference snapshot

The local reference directory `F:\Codex\xiaozhi-yuntai` is not a Git checkout,
so this audit identifies the inspected files by content hash:

| File | SHA-256 |
| --- | --- |
| `main/boards/esp32-s3n16r8-emoji/board_config.h` | `C654860BE8AABB0525B94D2E37C8D847F418662CA619F20AF944B9B9D762A573` |
| `main/boards/esp32-s3n16r8-emoji/servo_controller.h` | `F87F857A7ED56B2805CDE207AE7400217F150C7EF8D711DC771A0FA93A0B741C` |

No source was copied. The files were read only to recover the fixed board
limits and compare behavior.

## Behavior difference

| Concern | Original reference | DeskMate product behavior |
| --- | --- | --- |
| Yaw range | center 90°, min 50°, max 130°: ±40° | user setting 4°..40° from center, then endpoint and Stage 2 adapter clamp |
| Pitch range | center 90°, min 70°, max 110°: ±20° | user setting 4°..20° from center, then endpoint and Stage 2 adapter clamp |
| Speed | fixed 1° step with nominal 10 ms delay | independent Yaw/Pitch caps 20°/s..100°/s; 20 ms scheduler uses 0.4°..2.0° maximum steps |
| API | board-local angle/offset methods | Windows sends only bounded semantic amplitude/speed plus direction beats; no PWM/GPIO/pulse field |
| Ownership | direct board controller | one Xiaozhi motion coordinator arbitrates manual, preset, choreography, center and emergency state |
| Recovery | reference-local behavior | disconnect/reboot/fault/emergency discards pending beats; no replay; recovery returns to center |

The previously accepted Stage 2 pulse envelope is compatible with the original
limits: center 1500 us at 11 us/degree gives about 1060..1940 us for Yaw ±40°
and 1280..1720 us for Pitch ±20°, inside its calibrated 1055..1944 and
1277..1722 us bounds. This arithmetic is a configuration consistency check, not
new physical calibration evidence.

