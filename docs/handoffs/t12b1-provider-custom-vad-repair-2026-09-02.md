# T12B.1 provider custom-VAD repair handoff

## Identity

- Repository: `F:\Codex\deskmate`
- Isolated worktree: `F:\Codex\deskmate-t12b-companion-layout-timing-settings`
- Branch: `codex/t12b1-provider-endpointing-repair`
- Exact base: `bb0d29b4ce2ad7952fbac3bc6188593655107ab3`
- Rejected first repair tip: `672c91e8443ff3cc1578478a5210d733487bd43c`
- Custom-VAD implementation commit: `5977ad531e7e3f0c89b29cc79f968dde1b08c9c1`
- Build ID: `t12b1-provider-custom-vad-v2`
- Final documentation/push HEAD: report the pushed branch tip; a commit cannot contain its own hash.

## Delivered

- Re-audited the current official API table and downloadable PDF after the user's first eight-second HIL still finalized at roughly two seconds.
- Identified the missing default-false `enable_custom_vad` activation gate.
- Send the validated pause duration and `enable_custom_vad=true` together in every new Doubao realtime companion session.
- Keep the accepted half-duplex `keep_alive` mode and all existing microphone, conversation, idle-timeout and companion-call behavior.
- Keep unrelated two-pass ASR, ASR audio descriptors, local VAD, push-to-talk and EndASR disabled.

## Verification

- `npm ci --include=dev`: passed, 398 packages.
- Focused endpointing/controller/runtime suite: `60/60` passed.
- Full `npm test`: `270/270` passed.
- `npm run build:desktop`: passed.
- `git diff --check`: passed.
- `DeskMate.exe`: 202690560 bytes; SHA-256 `239B569DB4F956CDEB9BFB6284F83B9A942758E3B00E109DAA494E72853A99F8`.
- `app.asar`: 112680179 bytes; SHA-256 `81D2C4FD1600A285A40D74ACB309AD0E6F2C30C1D45D6E065079456F316A3C54`.

## User-present acceptance

1. Fully exit the older DeskMate process and start the package whose diagnostics build ID is `t12b1-provider-custom-vad-v2`.
2. Save `8` seconds, end any old companion conversation and start one new conversation.
3. Speak the first part of one sentence, pause for a clearly timed 3-7 seconds, then continue the same sentence.
4. Pass only if Doubao does not start replying during the pause and treats the continued speech as the same turn.
5. Repeat once with a normal short completed sentence to ensure the provider eventually closes the turn after the requested silence.
6. If the provider still finalizes before three seconds, export one sanitized diagnostic and stop. Do not silently switch to local VAD or push-to-talk.

## Safety

No application was launched or controlled. No credential, transcript, PCM, port/device, firmware, Flash/NVS, OLED, servo or hardware operation occurred. Build output is ignored and remains outside Git.
