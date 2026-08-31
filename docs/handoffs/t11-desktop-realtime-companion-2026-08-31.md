# T11 desktop realtime companion handoff

## Git baseline

- Branch: `codex/t11-desktop-realtime-companion`
- Base: `62f2829fedf3e7f9a9855747133d3a1bdba008d7`
- Implementation commit: `1558ee5efaf76563fe632ccf3120e0754d435d43`

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
- `npm test`: 148/148 passed.
- `npm run build:desktop`: passed, including native input bridge publish and Electron Windows unpacked package.
- `git diff --check`, tracked-path, secret, and build-artifact checks: passed; generated `dist/`, `release/`, native publish output, and dependencies remain ignored.

## Deferred user-present acceptance

- T10E EasyInput board audio adapter, sound quality, continuous capture, and speaker playback.
- Real Doubao credentials and network end-to-end dialogue.
- Codex full restart and real Hook lifecycle/OLED observation.
- Xiaozhi physical restart/Link stale-expression regression.
- Servo power, center, direction, limits, recenter, and emergency stop.

No device identification, Flash/NVS access, reset, OLED command, servo command, microphone capture, recording, or hardware operation was performed in this branch.
