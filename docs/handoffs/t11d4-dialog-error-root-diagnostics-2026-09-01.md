# T11D.4 dialog-error root diagnostics handoff

## Identity

- Branch: `codex/t11d4-dialog-error-root`
- Exact base: `codex/t11d3-post-tts-dialog-recovery@e637b73fa59e29f7ac6799002c9c68f986c0fc76`
- Build identity: `t11d4-dialog-error-root-diagnostics-v1`
- Implementation and verification commit: `9055b00215e8846c578267ea20ce4686dffcf9dd`

## Result

T11D.3's post-TTS reconnect is removed. Provider event `359` now drains the current answer and returns directly to listening on the same provider/session. Event `599` remains a real terminal `DialogCommonError`: it fails closed and cannot create a new connection, replay greeting audio or masquerade as successful recovery.

The adapter retains only an allowlisted status class. Diagnostics add the bounded adjacent-error count, class and adjacency enum; raw provider code/message/payload, text, PCM, timestamps and identifiers remain excluded. The upstream reason for the real event `599` remains unknown until one exact-package run supplies this new sanitized classification.

## Verification

- `npm ci --include=dev`: passed.
- Targeted controller/terminal/stop/computer-audio tests: `49/49` passed.
- Full `npm test`: `246/246` passed.
- Windows package: `F:\Codex\deskmate-t11d4-dialog-error-root\release-t11d4-dialog-error-root-verify\win-unpacked\DeskMate.exe`, `202690560` bytes, SHA-256 `59E6E167AF10695F4F042A6EA5B9D3023F9B5A1E530F8FAD072CD15A5603D537`.
- Packaged `app.asar`: `F:\Codex\deskmate-t11d4-dialog-error-root\release-t11d4-dialog-error-root-verify\win-unpacked\resources\app.asar`, `112642631` bytes, SHA-256 `6506FEB7458CAEB6A7F4D1B9B13A363D1DA529BE5A86DFCC394FB2D7CECA8B28`.
- Read-only package inspection confirmed build identity `t11d4-dialog-error-root-diagnostics-v1`.
- `git diff --check`, firmware boundary, ASCII-path and ignored-output checks passed. The diagnostic allowlist and tests confirm raw provider code/message/payload/identifiers remain excluded.
- No application launch/control, user diagnostic, credential, audio/text, device, port, Flash, firmware or hardware access occurred.

## Minimal user-present acceptance

1. Confirm build ID `t11d4-dialog-error-root-diagnostics-v1`.
2. Start one companion session and request an answer longer than ten seconds.
3. After the audible answer, confirm it returns directly to listening without `connecting` or replaying the welcome.
4. Speak a second turn and confirm it uses the same uninterrupted session.
5. If the session shows `doubao-service-error`, export sanitized diagnostics once. Use only `lastDialogErrorStatusClass`, `lastDialogErrorAdjacency`, `lastTerminalPhase` and bounded counters to select a later repair.
6. Stop explicitly and confirm idle. Do not infer success from a new welcome or a second connection.

All physical hardware and firmware acceptance remains outside this Windows-only package.
