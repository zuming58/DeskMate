# T11D.5 half-duplex keep-alive and UI handoff

## Identity

- Branch: `codex/t11d5-dialog-error-root-ui`
- Exact base: `codex/t11d4-dialog-error-root@3a62bf123e19fcaaf48ded9db0b9e41144f523bc`
- Implementation commit: `9d7e9e873ef4ea43c67f0ec127b03361e2489a13`
- Build identity: `t11d5-half-duplex-keepalive-ui-v1`
- Contract: `T11D5_HALF_DUPLEX_KEEPALIVE_V1_FROZEN`

## Result

The realtime StartSession now uses official `dialog.extra.input_mod = "keep_alive"`, matching DeskMate's intentional microphone silence during strict half-duplex playback. Event `359` still drains to listening on the same provider. Event `599` still fails closed, and official status `52000042` is exposed only as `audio-idle-timeout`.

The companion controls are now one normal-flow vertical stack. The restart/start button, stop warning, three source/service evidence cards and notices have stable spacing; small windows switch actions and evidence to one column. There is no absolute positioning or negative-margin workaround.

## Verification

- `npm ci --include=dev`: passed.
- Targeted protocol/controller/diagnostic/UI tests: `44/44` passed.
- Full `npm test`: `248/248` passed.
- `npm run build:desktop -- --config.directories.output=release-t11d5-half-duplex-keepalive-ui-verify`: passed.
- `DeskMate.exe`: `202690560` bytes; SHA-256 `7ADEA1A62B75B9D5936D33AD3AD60D0B903DFC3D7629AE98EBBD547533B998EF`.
- `app.asar`: `112643359` bytes; SHA-256 `75B15AD60882857031C3FBDFA2571CAA190C39497830C99BDE8AD09E16F94CF4`.
- Read-only package inspection confirmed build identity `t11d5-half-duplex-keepalive-ui-v1`.
- `git diff --check`, firmware boundary and ignored-output checks passed.

Package:

`F:\Codex\deskmate-t11d5-dialog-error-root-ui\release-t11d5-half-duplex-keepalive-ui-verify\win-unpacked\DeskMate.exe`

## User-present gate

1. Confirm the Build ID is `t11d5-half-duplex-keepalive-ui-v1`.
2. Start one companion session and request an answer longer than ten seconds.
3. Confirm the full answer plays and the page returns to listening without `doubao-service-error`, `connecting` or a repeated welcome.
4. Speak a second turn in the same session and confirm another complete response.
5. Confirm the restart/start button never overlaps the input, output or service evidence cards at the normal window and a narrow window.
6. Stop explicitly and confirm idle.

Status: `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. No application was launched or controlled, and no device, port, audio, credential, firmware, Flash or hardware operation occurred.
