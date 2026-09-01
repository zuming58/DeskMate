# T10C Xiaozhi manual calibration candidate handoff

Date: 2026-09-01

Branch: `codex/xiaozhi-t10c-manual-calibration`

Baseline: `8d6af0cd38fb3fed85ceba03bcd99857dd1e552e`

Implementation commit: `b1d43901a6b4ddc3009889cd1aa3c3b9669f8736`

Core implementation commit: `ef7f6732485411e932c0bd1cf2a8c361e9c9ac62`

## Delivered

- Frozen additive contract `T10C_MANUAL_CALIBRATION_LINK_V1_FROZEN` plus
  byte-exact DMLK golden vectors. Base framing, CRC, version, UART and existing
  message IDs are unchanged.
- Unique pure C++ manual owner around the T10A normal-motion safety core.
- `SELECT_AXIS`, volatile one-use `ARM`, adapter-local
  `PROVISIONAL_CENTER`, fixed 1.0-degree `SINGLE_STEP`, `RECENTER`, idempotent
  highest-priority emergency stop and explicit clear.
- Independent terminal command response and status snapshot with session,
  action ID and completed-output count for three-layer evidence correlation.
- Disconnect/controller restart/lease expiry disarm and clear pending state;
  no old command replay.
- Disabled production adapter and Host-only fake adapter. Production
  `app_main` uses the existing null-owner constructor; both MOTION capability
  masks remain clear.

## Verification

- Xiaozhi Host CTest: 11/11 passed at the final implementation commit,
  including `/W4 /WX` owner tests and stop-latch restart coverage.
- Exact ESP-IDF v5.5.3 source
  `2c211b236707889e8400c4dc5644dd5c4ee071e0`, target `esp32s3`, clean fixed
  16 MiB partition build passed.
- Code-gate Build ID: `ef7f673`.
- App: 206,432 bytes (`0x32660`) at `0x100000`, below the 6 MiB `ota_0`
  partition; SHA-256
  `C2C22098A754D0FC1C1AAE1096C3FE6C964C0798E4100DD84D59796651BFED7E`.
- Generated 3 KiB partition table SHA-256:
  `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036FDBFD1C762E0`.
- Source/contract boundary proves no project LEDC/PWM/GPIO servo driver or
  production calibration owner, and `git diff --check` passed.

The exact app hash is core-implementation code-gate evidence. The stop-latch
audit changes only Host/contract behavior, and the final documentation HEAD
must still be rebuilt and identified separately in the handoff report. None of
these images is a flash candidate.

## Explicitly not delivered

- No Desktop or EasyInput transport implementation. Their exact forwarding
  fields and UI are `REQUIRED_NOT_FROZEN` and need a separately owned slice.
- No real servo adapter, PWM, GPIO11/GPIO12 production call, arbitrary angle,
  arbitrary step, normal motion or MOTION capability enablement.
- No proof of physical movement. The three layers mean requested, forwarded,
  and endpoint completed/rejected; none alone proves a safe measured angle.

## Hardware state and stop gate

GPIO11/GPIO12/50 Hz is fixed-reference board-map evidence only. The installed
mapping, servo power/current/common ground, unloaded center, direction,
mechanical limits and physical cutoff remain `UNKNOWN`. No port scan, device
identity, Flash/NVS/eFuse read/write, flash, erase, monitor, OLED command, audio
operation, PWM, GPIO or servo action occurred. T10B Stages 0..3 remain
`NOT_RUN`; cross-audit this code package and stop before any HIL request.
