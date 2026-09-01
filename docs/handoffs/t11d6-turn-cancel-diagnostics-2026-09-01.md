# T11D.6 strict turn ownership and cancellation diagnostics handoff

## Identity

- Repository: `F:\Codex\deskmate`
- Branch: `codex/t11d6-turn-cancel-diagnostics`
- Exact base: `2169c2575a79921f7286d48283db144b71a9c3c5`
- Implementation commit: `52537bf2e9dc8981f9b21e569e0e1b45e9464542`
- Build ID: `t11d6-turn-cancel-diagnostics-v1`
- Final documentation HEAD: reported with the pushed branch because a commit cannot contain its own hash.

## Delivered

- Replaced handler-lag-dependent ASR classification with a synchronous closed half-duplex arrival gate.
- Limited microphone upload and ASR acceptance to `listening` only.
- Kept `thinking`, `speaking` and local playback draining closed to uplink and delayed/reflected ASR.
- Removed unconditional sink/provider interruption from normal ASR-final handling.
- Kept explicit manual response interruption, bounded stop/Escape, keep-alive, same-session event `359` and fail-closed event `599`.
- Added content-free TTS completion/abandonment, ASR-arrival-phase, chat-final/TTS-end and sink-cancellation-cause diagnostics.

## Verification

- `npm ci --include=dev`: passed.
- Focused controller/audio/terminal/privacy regression: `72/72` passed.
- Full `npm test`: `253/253` passed.
- `npm run build:desktop`: passed; the isolated Windows directory package contains the expected build ID.
- `DeskMate.exe`: `202690560` bytes; SHA-256 `B8A8CC0D27365354CF595C9B193E7B77C30D668FCD12C96EF9CB9614D6D941C2`.
- `app.asar`: `112651386` bytes; SHA-256 `6401471B58C8D4B143A73B5EB214C5E2399523215E4479016203EF387AA5DFE9`.
- `git diff --check`: passed before implementation and documentation commits; rerun at final closure.

## Safety

No application launch/control, user credential, transcript, reply, PCM, provider payload, port/device access, firmware, Flash, NVS, OLED, servo or audio hardware operation belongs to this package.

## Minimal user-present HIL

1. Run the exact packaged build and start one continuous companion session.
2. Ask for one answer long enough to contain several sentences; do not press interrupt.
3. Wait until it audibly finishes, then ask a second question without restarting the session.
4. Once during a separate long answer, press the explicit interruption control and confirm it returns to listening.
5. Stop once through the normal control or Escape and export one sanitized diagnostic.
6. Confirm: one connection/no welcome replay, no automatic stop, non-manual turns are completed rather than abandoned, delayed ASR is suppressed during thinking/speaking/draining, and cancelled blocks (if any) have a closed cause.
