# T10A Xiaozhi motion safety core

## Objective

Implement and verify the internal single-owner motion arbiter without connecting it to PWM, board pins, DeskMate Link motion messages, or the production startup path.

## Frozen input

- Contract: `docs/contracts/t10-motion-safety-core-v1.md`
- Stable decision: `flow/decisions.md` D013
- Reference audit: `docs/provenance/t10-xiaozhi-servo-reference-audit.md`
- Baseline: T09 HIL evidence commit `381cef3114c0219d2f760b112db0afdefe721d8d`

## Required behavior

- fail-closed calibration and explicit recenter gate;
- one bounded coalescing slot for recovery, dialogue, face tracking, and idle sources;
- fixed priority and deterministic per-axis rate limiting;
- strict session/sequence/expiry checks and no replay after session reset;
- latched emergency stop and fault behavior;
- read-only snapshot and privacy-safe counters;
- Host tests plus a source-contract test proving no hardware adapter or production call site exists.

## Verification

- configure/build/run all Xiaozhi Host CTest targets;
- build the fixed ESP-IDF 5.5.3 `esp32s3` product target and partition layout;
- run `git diff --check`, source/license, secret, ASCII path, generated artifact, and local-rules checks;
- do not scan ports, identify devices, reset, monitor, flash, erase, drive a servo, or initialize Xiaozhi audio.

## Stop condition

Commit and push the code-only package, then stop at `T10A_TEST_CONFIRMED / BUILD_CONFIRMED / MOTION_HARDWARE_LOCKED`. Do not start T10B hardware calibration while the user is away.
