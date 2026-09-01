# T12A companion pause, identity and call handoff

## Identity

- Repository: `F:\Codex\deskmate`
- Branch: `codex/t12a-companion-pause-identity-call`
- Exact base: `eb8fff8ac801eb0960e52282c22ac60b6efd9bc4`
- Implementation commit: `ce00dd4caeea6bfa7c300afb65badfe55c8884a0`
- Build ID: `t12a-companion-pause-identity-call-v1`
- Final documentation HEAD: report the pushed branch tip; a commit cannot contain its own hash.

## Inherited accepted gate

T11D.6 is the accepted conversation baseline for this slice. Its single controller, synchronous half-duplex turn ownership, bounded playback drain, explicit-only interruption and cancellation diagnostics remain unchanged. T12A adds only companion preferences, idle policy, identity and the reserved call action around that accepted core.

## Delivered

- Companion-only provider pause presets `2 / 3 / 5` seconds, persisted with a recommended/default value of 5 seconds and sent as `asr.extra.end_smooth_window_ms` only when a companion session starts.
- Independent listening-only idle auto-stop presets `30 / 60 / 120 / off`, defaulting to 60 seconds. Accepted speech and the companion call action reset the timer; thinking, speaking, draining and stopping do not consume it.
- Configurable companion display name and future wake phrase, defaulting to `小言` and `你好，小言`. A versioned wake-word adapter reports unavailable/disabled and never opens a microphone or network connection.
- Reserved `host_action_v1` action `f11135b4-7471-47f1-808a-629ae99eb63b` for `AI 陪伴呼唤`, available on S1-S8 through the existing configuration preview/confirm/write/readback path. It is not an application action and unknown UUIDs still fail closed.
- Repeated call behavior uses the one existing controller: start from inactive/completed/error; reset while listening; explicitly interrupt thinking/speaking/draining back to listening; return busy while connecting/stopping; never toggle the session off.
- Software settings and `测试此动作` expose the new behavior without changing normal dictation, VoiceWorkflow, firmware, HID payloads or hardware.
- Sanitized diagnostics include only bounded numeric endpointing choices; identity, wake phrase, credentials, text and audio are excluded.

## Verification

- `npm ci --include=dev`: passed, 398 packages installed.
- Focused T12A tests: `7/7` passed.
- Full `npm test`: `260/260` passed.
- `npm run build:desktop`: passed.
- Packaged build ID inspection: `t12a-companion-pause-identity-call-v1`.
- `DeskMate.exe`: `202690560` bytes; SHA-256 `E20EA5FCD56A7633169C6996120D6DB952E9C873CB558EEB42B90816E7F5AC6D`.
- `app.asar`: `112668935` bytes; SHA-256 `F5FB40705FF148BDB3628AA8C6F96D3E325AEE517CF49DE37158B60EFB228743`.
- `git diff --check`, tracked firmware/native boundary and changed-path checks passed.

## Safety

No application launch/control, credential read, transcript, reply, PCM, provider payload, port/device access, firmware, Flash, NVS, OLED, servo or audio hardware operation occurred. The wake-word boundary is deliberately non-operational.

## Minimal user-present HIL

1. Manually launch the exact packaged build and verify the companion defaults to a 5-second pause window and 60-second idle timeout.
2. Speak one sentence with an intentional pause shorter than five seconds and confirm it remains one turn; repeat with the 2-second preset to confirm the behavior difference.
3. Leave the controller in listening with no accepted speech and confirm the configured idle timeout ends safely with `长时间未说话，已结束`.
4. Map one EasyInput S key to `AI 陪伴呼唤`, complete the normal preview/confirm/write/readback flow, then verify start, listening reset, explicit response interruption and connecting/stopping busy behavior.
5. Confirm normal dictation endpointing and T11D.6 long-answer/second-turn behavior did not regress.
6. Confirm the UI says voice wake is unavailable and that no background microphone or network activity is created by the wake adapter.
