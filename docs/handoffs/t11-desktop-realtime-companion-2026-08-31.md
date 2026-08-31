# T11 desktop realtime companion handoff

## Git baseline

- Branch: `codex/t11-desktop-realtime-companion`
- Base: `62f2829fedf3e7f9a9855747133d3a1bdba008d7`
- Final HEAD: fill from the pushed branch after commit.

## Delivered

- Single companion conversation lifecycle with generation/latest-wins filtering.
- Foreground ownership shared with existing text voice input/edit.
- Doubao binary realtime adapter and finite reconnect.
- Frozen EasyInput audio source/sink adapter boundary plus simulated test adapters.
- Compact live capsule, real start/stop entry, and honest readiness blockers.
- SQLite exactly-once final turn and recoverable outbox transaction.
- Companion expression priority over Codex/manual Agent events without stale replay.

## Verification

- `npm ci --include=dev`: passed.
- `npm test`: final count recorded in `flow/progress.md`.
- `npm run build:desktop`: final result recorded in `flow/progress.md`.
- `git diff --check`, tracked-path, secret, and build-artifact checks: recorded after final validation.

## Deferred user-present acceptance

- T10E EasyInput board audio adapter, sound quality, continuous capture, and speaker playback.
- Real Doubao credentials and network end-to-end dialogue.
- Codex full restart and real Hook lifecycle/OLED observation.
- Xiaozhi physical restart/Link stale-expression regression.
- Servo power, center, direction, limits, recenter, and emergency stop.

No device identification, Flash/NVS access, reset, OLED command, servo command, microphone capture, recording, or hardware operation was performed in this branch.
