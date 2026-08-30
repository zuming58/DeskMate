# T10A Xiaozhi motion safety core handoff

Date: 2026-08-31

Branch: `codex/t10a-motion-safety-core`

Implementation HEAD: `848d2019ca8492723503f43c39e40fb1ee781a10`

Baseline: `381cef3114c0219d2f760b112db0afdefe721d8d` (`T09_VISIBLE_STATE_HIL_CONFIRMED`)

## Delivered

- Frozen internal contract `T10_MOTION_SAFETY_CORE_V1_FROZEN`.
- Fixed-reference servo behavior/license/hash audit before implementation.
- Pure C++ `MotionSafetyCore` with explicit electrical/mechanical calibration gates.
- One coalescing slot per recovery, dialogue, face-tracking and idle source.
- Priority `fault/estop > recovery > dialogue > face tracking > idle`.
- Strict session, sequence, expiry, range and duplicate handling.
- Independent per-axis rate limiting, explicit recenter, no stale-session replay, latched emergency stop and fault.
- Read-only snapshot and bounded privacy-safe diagnostics.
- Host and source-contract tests proving no LEDC, MCPWM, GPIO, servo adapter or `app_main` call site exists.

## Verification

- Xiaozhi Host CTest: 9/9 passed.
- Motion test target: MSVC `/W4 /WX` passed.
- ESP-IDF: exact v5.5.3, target `esp32s3`, fixed 16 MiB partition build passed.
- Code-gate app: 202,880 bytes (`0x31880`), SHA-256 `C1A6DF830B18589D737B09BC3365F63A31F535A9D61E4EF29F4097AAF8F9C7ED`.
- Generated partition table SHA-256: `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0`.
- Desktop regression: 127/127 passed.
- `git diff --check` and ASCII tracked-path check passed.
- The existing local ESP-IDF installation still reports the optional GDB ROM-symbol warning because `ESP_ROM_ELF_DIR` is absent; app, partition, bootloader size and link targets all complete successfully. No tool installation or upgrade was performed.

The app hash is code-gate evidence only. T10A is deliberately unreachable from production startup, so it is not a flash candidate and flashing it would provide no motion evidence.

## Hardware and safety state

No port was scanned, no device was identified or reset, and no Flash/NVS/otadata/eFuse was read or written. No OLED command, audio operation, PWM, GPIO, servo initialization or mechanical action occurred. The user's connected and powered T09 hardware was left untouched.

Current state: `T10A_TEST_CONFIRMED / BUILD_CONFIRMED / MOTION_HARDWARE_LOCKED`.

## Next gate when the user is present

T10B must first record the real servo power path and current capacity, common ground, safe unloaded center, axis direction and small-step mechanical limits. Only then may a disabled-by-default hardware adapter be designed and separately authorized for one-axis center/small-step HIL. DeskMate Link motion messages, combined nod/shake actions and face tracking remain out of scope until that calibration is accepted.
