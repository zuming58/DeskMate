# T10C Xiaozhi manual calibration provenance

Date: 2026-09-01

Product implementation: `b1d43901a6b4ddc3009889cd1aa3c3b9669f8736`

Reference root: `F:\Codex\xiaozhi-yuntai` (read-only; no Git metadata present)

Reference commit: `UNKNOWN`

License: MIT; reference `LICENSE` SHA-256
`0A5A839033BFE18FE75D32B50D9D028912CF876F69EF59C2791AEB2971335D05`.

## Fixed source evidence

| Reference file | SHA-256 | Evidence used |
| --- | --- | --- |
| `main/boards/esp32-s3n16r8-emoji/board_config.h` | `C654860BE8AABB0525B94D2E37C8D847F418662CA619F20AF944B9B9D762A573` | Reference-board yaw GPIO11, pitch GPIO12 and 50 Hz mapping |
| `main/boards/esp32-s3n16r8-emoji/servo_controller.h` | `F87F857A7ED56B2805CDE207AE7400217F150C7EF8D711DC771A0FA93A0B741C` | Per-axis center/step/recenter behavior vocabulary only |
| `main/boards/esp32-s3n16r8-emoji/servo_controller.cc` | `5D306809752C7F8594366897E5E17C5A9484F65B51B3CE1391992FC412A743C4` | Bounded incremental-motion behavior only |

No reference source was copied. The product code is an independent pure C++
owner, codec and adapter abstraction. Core delivery was
`ef7f6732485411e932c0bd1cf2a8c361e9c9ac62`; the final implementation commit
adds the audited rule and test that a controller restart cannot clear a latched
emergency stop.

## Product differences

| Reference behavior | T10C product behavior |
| --- | --- |
| LEDC initializes and writes nominal center during board startup | No LEDC/PWM/GPIO driver exists; production `app_main` injects no manual owner and emits no servo output |
| Compile-time 90-degree centers, direction and software limits are treated as usable | All installed-board center, direction and limits remain `UNKNOWN`; provisional center is a high-level adapter operation with no wire angle |
| Direct commands can carry arbitrary target angles | Wire `SINGLE_STEP` carries only direction; the Xiaozhi owner fixes one step to 1.0 degree |
| Hardware writes have no volatile lease | Each possible output consumes a non-zero ARM token with a 1000..5000 ms lease |
| No boot/session action correlation | Session/action IDs, exact duplicate handling, conflict/stale rejection, disconnect clearing and no replay are mandatory |
| Stop is not a separately correlated terminal result | Emergency stop is highest-priority and idempotent; action response and independent status expose terminal result/output count |

## Target files

- `contracts/deskmate-link/t10c-manual-calibration-v1.md`
- `contracts/deskmate-link/golden-vectors-t10c-manual-calibration-v1.json`
- `firmware/xiaozhi-yuntai/components/endpoint_core/include/manual_calibration_owner.h`
- `firmware/xiaozhi-yuntai/components/endpoint_core/include/manual_calibration_protocol.h`
- `firmware/xiaozhi-yuntai/components/endpoint_core/include/servo_adapter.h`
- matching `src/` implementations and Host tests

## Evidence boundary and unknowns

GPIO11/GPIO12/50 Hz is documented reference-board mapping only. It is not an
installed-assembly continuity test or a calibration result. The real servo
supply topology/current capacity, common ground, installed yaw/pitch mapping,
unloaded center, direction, mechanical limits and physical power-cutoff path
remain `UNKNOWN`. T10B Stages 0..3 were not run. No port/device/Flash/OLED/
audio/PWM/GPIO/servo operation occurred.
