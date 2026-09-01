# T12B.1 provider endpointing repair handoff

## Identity

- Repository: `F:\Codex\deskmate`
- Isolated worktree: `F:\Codex\deskmate-t12b-companion-layout-timing-settings`
- Branch: `codex/t12b1-provider-endpointing-repair`
- Exact base: `bb0d29b4ce2ad7952fbac3bc6188593655107ab3`
- Implementation commit: `8f9220fc7db05c20abd1853af83ce59652b6ab3e`
- Build ID: `t12b1-provider-endpointing-repair-v1`
- Final HEAD: report the pushed branch tip; a commit cannot contain its own hash.

## Delivered

- Used the user's sanitized diagnostic to exclude preference persistence and new-session revision freeze.
- Reduced the Doubao StartSession ASR object to the documented endpointing field only.
- Added an exact 8000 ms outbound request regression.
- Preserved D053 keep-alive, strict half-duplex, continuous-session behavior, microphone selection, local idle timeout and the EasyInput companion-call Host Action.
- Clarified that the setting is sent to the provider on a new session and is not a local artificial delay or provider-acceptance claim.
- Kept spoken wake word explicitly unavailable.

## Verification

- `npm ci --include=dev`: passed, 398 packages.
- Focused endpointing/controller/runtime suite: `60/60` passed.
- Full `npm test`: `270/270` passed.
- Isolated Windows packaging: passed.
- `DeskMate.exe`: 202690560 bytes; SHA-256 `169C290A0C43375634338353C3FCAC1CC607B13F286291A78E6A88DF6783F32C`.
- `app.asar`: 112680073 bytes; SHA-256 `71E3AAC9E708AB97815591A3D4D7E278DA3B5830C835D84FFEC0F0FC0F8F0012`.
- Packaged build ID, `git diff --check`, ignored output and ASCII tracked paths: passed.

## User-present acceptance

1. Fully exit the older DeskMate process and start the exact T12B.1 package.
2. Confirm diagnostics build ID is `t12b1-provider-endpointing-repair-v1`.
3. Save `8` seconds, end any old conversation and create one new conversation.
4. Say one sentence with a clearly timed pause longer than three seconds and shorter than eight seconds, then continue the same sentence.
5. Pass only if the provider does not start its reply during that pause.
6. If it still replies early, stop and export one new sanitized diagnostic. Do not add another guessed provider switch and do not simulate success with a local response delay.

## Safety

No application was launched or controlled. No credential, text, PCM, port/device, firmware, Flash/NVS, OLED, servo or hardware operation occurred. Build output is ignored and remains outside Git.
