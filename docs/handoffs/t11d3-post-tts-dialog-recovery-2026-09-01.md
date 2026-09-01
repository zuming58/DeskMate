# T11D.3 post-TTS dialog recovery handoff

## Identity

- Branch: `codex/t11d3-post-tts-dialog-recovery`
- Exact base: `codex/t11d2-doubao-terminal-diagnostics@c28a54e30f2d1afbe44c1b64e0b72af543eeeebd`
- Build identity: `t11d3-post-tts-dialog-recovery-v1`
- Final HEAD: recorded after verification

## Evidence and behavior

The T11D.2 HIL selected one precise vector: three complete speaker drains, then a sequence-adjacent `dialog-error`, with no transport close, error frame, drain timeout, queue drop or reflected ASR. T11D.3 consumes only that exact current-session/current-provider evidence and uses the existing bounded reconnect path to start a fresh provider session.

All other provider errors remain fail-closed. Recovery is single-use per successful drain, limited without a new user-final turn, cancelled by stop or stale ownership, and never replays old audio or text. Diagnostics expose only counts and a fixed recovery-result enum.

The duplicate long React live bar was removed. The standalone Electron compact overlay remains the sole floating capsule; the companion page keeps its own state and start/stop controls.

## Verification

- `npm ci --include=dev`: passed.
- Targeted controller/terminal/UI tests: passed.
- `npm test`: `250/250` passed.
- Windows package: `F:\Codex\deskmate-t11d3-post-tts-dialog-recovery\release-t11d3-post-tts-dialog-recovery-verify\win-unpacked\DeskMate.exe`, `202690560` bytes, SHA-256 `F1837C3D1DC5507D2EC227709472F6CB21939FA2DBB4B5A51BD04C7C8ADAC5A1`.
- Packaged `app.asar`: `F:\Codex\deskmate-t11d3-post-tts-dialog-recovery\release-t11d3-post-tts-dialog-recovery-verify\win-unpacked\resources\app.asar`, `112643656` bytes, SHA-256 `B1376358FD45DC787ECDD7BC44F63DD522EC328B0C0B29BC5690019693568642`.
- Read-only package inspection found build identity `t11d3-post-tts-dialog-recovery-v1`.
- No application launch/control, credential, user diagnostic, audio/text, device, port, Flash or firmware access occurred.

## Minimal HIL

1. Confirm diagnostics build ID `t11d3-post-tts-dialog-recovery-v1`.
2. Start a computer-microphone/computer-speaker companion session and complete three normal turns, including one answer longer than ten seconds.
3. After every audible answer, confirm the page returns through connecting to listening instead of stopping with `doubao-service-error`.
4. Stop once during listening and once during an answer; both must end at idle.
5. Export sanitized diagnostics and confirm recovery counters/result, zero queue drops and no raw content or identifiers.
6. Confirm only the independent compact desktop capsule floats; the main DeskMate window has no second bottom live bar.

Seven-state Desktop/Xiaozhi face synchronization remains the next independent Windows package and is not implemented here.
