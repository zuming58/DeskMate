# T09 Xiaozhi agent display

Status: `CROSS_AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED`

## Baseline and ownership

- Branch: `codex/xiaozhi-t09-agent-display`
- Base: `132117e8cf8ae07319cc647d2634326ec14637`.
- Owner: Xiaozhi window only.
- Consume, do not rewrite: `docs/contracts/t09-agent-state-display-v1.md`.

## Scope

1. First audit the fixed Xiaozhi OLED/emoji reference, its board map and tests;
   record the exact source commit, license and adopted behavior.
2. Add a pure scene model mapping the seven frozen states to the scenes in the
   contract.
3. Add one display owner; the Link endpoint only enqueues state.
4. Advertise `DISPLAY` only after successful display initialization. If display
   initialization or rendering fails, disable that capability while Link stays
   operational.
5. Acknowledge `SET_AGENT_STATE` only after the owner accepts the state.
6. Cover duplicates, TTL-driven idle, restart, disconnect and queue overflow
   without stale replay.

Do not modify EasyInput or desktop code. Do not drive servos, initialize audio,
add motion, change Link framing, guess GPIO, access hardware or start T10.

## Verification

- Scene/model/owner Host tests including init and render failure.
- Existing Xiaozhi Link Host tests.
- ESP-IDF v5.5.3 exact `esp32s3` clean build.
- `git diff --check`, provenance, license, privacy, ASCII-path and artifact
  checks.

Push the branch and stop before port scan, Flash/NVS access, erase, flash,
monitor, OLED HIL or servo/audio operation.
