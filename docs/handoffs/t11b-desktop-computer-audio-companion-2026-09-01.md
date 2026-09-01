# T11B desktop computer-audio companion handoff

Date: 2026-09-01

## Delivery identity

- Branch: `codex/t11b-desktop-computer-audio-companion`
- Base: `544fa54a482a8dca06674916644f042b069f446d`
- Implementation commit: `371f1189765aecebc198a655c9a6425b1469390a`
- Contract: `T11B_DESKTOP_COMPUTER_AUDIO_COMPANION_V1_FROZEN`
- Status: `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`

## Delivered behavior

- The existing continuous `CompanionConversationController` now uses a production computer microphone source and computer speaker sink without adding a second conversation or dictation workflow.
- The persisted concrete Windows input device is reused. A selected EasyInput LAN microphone may visibly fall back once before start; the actual source is then locked. Runtime failure never switches sources.
- Computer capture/playback is session- and generation-bound, rejects stale/oversized data, limits scheduled playback to three seconds and releases pending starts immediately when the renderer disappears.
- Manual and confirmed spoken interruption clear local playback and discard late response frames through `tts.end`; no undocumented provider cancellation frame is sent.
- Finite transport reconnect creates a fresh provider, restarts only the locked source and never replays old PCM, replies or Agent states.
- The companion page shows actual per-session input, computer output, service state and visible fallback. Sanitized diagnostics contain only enumerated state and bounded counters.
- EasyInput speaker remains explicitly `easyinput-speaker-contract-not-frozen`; no firmware or transport was added.

## Verification

- `npm ci --include=dev`: passed.
- `npm test`: `211/211` passed, zero failure/skip/todo.
- `npm run build:desktop -- --config.directories.output=release-t11b-verify`: passed, including native InputBridge Release publish, Vite production build and Windows Electron directory packaging.
- Package: `release-t11b-verify/win-unpacked/DeskMate.exe`, 202,690,560 bytes.
- Package SHA-256: `1B8E46983C677B4FC432C36B9344D7D063952C133497154B2A4FABB71DCA3DF6`.
- `git diff --check`, ASCII changed-path, differential secret, ignored-output and firmware-scope checks are required again immediately before push.

## Safety boundary

No application was started or controlled from this worktree. No port, device, network endpoint, microphone, speaker, Flash, NVS, eFuse, firmware, OLED or servo operation occurred. Generated dependencies, native output, `dist/` and `release-t11b-verify/` remain ignored.

## User-present acceptance still required

1. Configure real Doubao credentials and verify a live multi-turn session.
2. Verify default and concrete Windows microphones in the packaged app.
3. Verify computer-speaker playback, volume, latency, echo and both manual/spoken interruption.
4. Select EasyInput input, verify a real pre-start fallback and verify a runtime EasyInput failure ends instead of switching.
5. Confirm live companion Agent states reach the physical Xiaozhi OLED.

Do not call this full audio HIL complete until those observations are recorded. T11E EasyInput speaker work starts only after a separate downlink contract is frozen.

