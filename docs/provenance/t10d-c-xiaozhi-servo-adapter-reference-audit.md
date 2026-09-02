# T10D-C Xiaozhi servo adapter reference audit

Date: 2026-09-02

Reference root: `F:\Codex\xiaozhi-yuntai` (read-only)

Reference Git commit: `UNKNOWN` because the supplied reference directory has no
Git metadata. Reference product version is `1.9.0`.

License: MIT. `LICENSE` SHA-256:
`0A5A839033BFE18FE75D32B50D9D028912CF876F69EF59C2791AEB2971335D05`.

## Fixed source evidence

| Reference file | SHA-256 | Evidence used |
| --- | --- | --- |
| `main/boards/esp32-s3n16r8-emoji/board_config.h` | `C654860BE8AABB0525B94D2E37C8D847F418662CA619F20AF944B9B9D762A573` | GPIO11 yaw, GPIO12 pitch and 50 Hz reference-board mapping |
| `main/boards/esp32-s3n16r8-emoji/servo_controller.h` | `F87F857A7ED56B2805CDE207AE7400217F150C7EF8D711DC771A0FA93A0B741C` | LEDC low-speed timer 0, channels 0/1 and 14-bit configuration vocabulary |
| `main/boards/esp32-s3n16r8-emoji/servo_controller.cc` | `5D306809752C7F8594366897E5E17C5A9484F65B51B3CE1391992FC412A743C4` | 20 ms period and bounded pulse conversion behavior |

No source file or binary was copied. The product adapter is an independent
implementation behind the existing T10C pure C++ abstraction.

## Adopted behavior

- ESP32-S3 GPIO11/GPIO12, LEDC low-speed timer 0, channels 0/1, 14-bit and
  50 Hz are retained as fixed reference-board evidence.
- 500..2500 us is used only as an outer electrical rejection envelope. It is
  not installed mechanical calibration.
- Backend calls check errors and disable configured outputs on failure.

## Rejected reference behavior

- The reference constructs and initializes its controller during board startup,
  configures both channels and immediately writes nominal 90-degree centers.
- Reference center values, direction, angle range, pulse scale and power
  assumptions are not accepted as installed-board truth.
- Direct arbitrary-angle control is not exposed. The frozen wire offers only
  provisional center, fixed one-degree direction step and recenter under a
  one-use ARM token.

## Product targets

- Pure logic and gates:
  `firmware/xiaozhi-yuntai/components/endpoint_core/include/servo_adapter.h`
  and matching `src/servo_adapter.cpp`.
- ESP-IDF backend and profile builder:
  `firmware/xiaozhi-yuntai/main/deskmate_servo_adapter.*` and
  `main/Kconfig.projbuild`.
- Production owner injection: `firmware/xiaozhi-yuntai/main/main.cpp`.
- Host evidence: `calibrated_servo_adapter_tests.cpp`,
  `manual_calibration_owner_tests.cpp`, `manual_calibration_link_tests.cpp` and
  `scaffold_source_contract_tests.cpp`.

## Remaining unknowns

The installed assembly's continuity mapping has not been measured in this
package. Servo supply voltage/current margin, common-ground implementation,
physical cutoff, both centers, both directions, conservative mechanical pulse
limits, pulse-per-degree and load/binding behavior remain `UNKNOWN`. The
committed build therefore keeps every verification flag false and emits no PWM.
