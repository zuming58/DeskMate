# T10B Xiaozhi motion readiness handoff

Date: 2026-09-01

Role: code-side readiness auditor without hardware authorization

Branch: `codex/xiaozhi-t10b-readiness-audit`

Base: `origin/codex/xiaozhi-oled-animation-polish@8d6af0cd38fb3fed85ceba03bcd99857dd1e552e`

Scope: documentation and read-only source/reference audit only

## Result

State: `T10B_READINESS_REVIEWED / MOTION_HARDWARE_LOCKED / HIL_NOT_AUTHORIZED`.

There is no safe firmware code increment until a human beside the hardware
closes the real power/current/common-ground and per-axis calibration gates.
GPIO11 horizontal/yaw and GPIO12 vertical/pitch are fixed source/board-map
evidence, but nominal centers, ranges and direct LEDC behavior from the
reference are not accepted as real-board calibration.

## Changed paths

- `docs/reviews/t10b-xiaozhi-motion-hardware-readiness-audit-2026-09-01.md`
- `docs/testing/t10b-xiaozhi-motion-hil-acceptance-card.md`
- `docs/handoffs/t10b-xiaozhi-motion-readiness-2026-09-01.md`
- `flow/progress.md`

No firmware, contract, EasyInput or desktop path changed.

## Verification

- exact base and T10A ancestry confirmed;
- T10A motion header/source/tests have no diff from
  `2e538d0c080aa9f908f6b374fce080b008ef11ae`;
- production `app_main` has no `MotionSafetyCore` call site;
- no production PWM/LEDC/MCPWM/GPIO11/GPIO12/servo adapter exists;
- fixed reference MIT license and relevant file hashes rechecked;
- Xiaozhi Host CTest 9/9 passed on the combined T10A + OLED-polish base;
- documentation diff, path, secret and artifact gates are run before handoff.

## Hardware operations

None. No port was scanned, no device was identified, no Flash/NVS/eFuse was
read or written, and no flash, erase, monitor, wiring, OLED hardware, audio,
PWM, GPIO or servo operation occurred.

## Open risks

- servo rail voltage, polarity, source and peak/continuous current capacity;
- common ground, backfeed and installed connector mapping;
- unloaded centers and direction for both axes;
- safe mechanical limits and rate for the final assembly;
- recenter, session reset, Link loss and no-stale-replay behavior;
- software and physical emergency stop plus adapter-failure isolation.

## Next action

The hardware host must first review the audit and acceptance card with the user
present. Do not flash this documentation branch. Before any servo HIL, develop
a separate disabled-by-default adapter candidate, pass Host/build/independent
review gates, show its exact image and write range, and obtain a new explicit
authorization. Then execute the acceptance card one stage at a time, stopping
at the first ambiguity or fault.
