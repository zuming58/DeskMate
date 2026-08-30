# T10 Xiaozhi servo reference audit

Date: 2026-08-31

Reference root: `F:\Codex\xiaozhi-yuntai` (read-only, not a Git worktree)

License: MIT; copyright Shenzhen Xinzhi Future Technology Co., Ltd. and contributors

Reference `LICENSE` SHA-256: `0A5A839033BFE18FE75D32B50D9D028912CF876F69EF59C2791AEB2971335D05`.

## Fixed reference files

| File | SHA-256 |
| --- | --- |
| `main/boards/esp32-s3n16r8-emoji/board_config.h` | `C654860BE8AABB0525B94D2E37C8D847F418662CA619F20AF944B9B9D762A573` |
| `main/boards/esp32-s3n16r8-emoji/servo_controller.h` | `F87F857A7ED56B2805CDE207AE7400217F150C7EF8D711DC771A0FA93A0B741C` |
| `main/boards/esp32-s3n16r8-emoji/servo_controller.cc` | `5D306809752C7F8594366897E5E17C5A9484F65B51B3CE1391992FC412A743C4` |
| `main/boards/esp32-s3n16r8-emoji/emotion_response_controller.h` | `97B191B76FB5ED45187A96DC42678EC820F079AC1129E77DC9FB581AADED402F` |
| `main/boards/esp32-s3n16r8-emoji/emotion_response_controller.cc` | `862901B13AA68694B69E2BDC87A74BF72E2408A2EC8C2EAD8F9CD00A74B5F22A` |

The external hardware safety map is tracked by `docs/provenance/reference-baselines-2026-08-24.md`. It records source-side GPIO11/GPIO12, 50 Hz, nominal 90-degree centers, and software ranges, but keeps the real power path, direction, center, and mechanical limits `UNKNOWN`.

## Behavior reused as design evidence

- constrain every target to a per-axis range;
- advance toward a target in small bounded steps;
- provide a recenter concept;
- keep high-level actions separate from low-level angle output.

No reference source code is copied into the product implementation. T10A is an independent pure C++ safety model.

## Product differences required for safety

| Reference behavior | DeskMate T10A behavior |
| --- | --- |
| `Initialize()` immediately configures LEDC and writes both nominal centers | Starts locked, has no driver, and emits nothing until all calibration evidence and an explicit recenter intent exist |
| Compile-time angles and direction are treated as usable hardware truth | Real-board center, direction, limits, power path, and common ground remain explicit runtime validation gates |
| Several composite actions call blocking delays and direct servo writes | All sources enter one deterministic non-blocking arbiter with fixed priority |
| Direct `ESP_ERROR_CHECK` hardware failures can abort | Hardware is absent in T10A; later adapter failures must latch a motion fault without breaking Link, OLED, or input |
| No session epoch or stale-action rule | Session reset clears all pending motion and requires recenter; old actions never replay |
| No latched emergency-stop state | Emergency stop clears the queue, suppresses output, and requires explicit same-session recovery plus recenter |

## Deferred evidence

No servo supply, current, center, direction, or mechanical-limit claim is upgraded by this audit. T10B remains blocked on user-present electrical and mechanical calibration. No device access or mechanical action occurred during this reference review.
