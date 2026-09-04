# T20 background wake and foreground session contract v1

Status: `T20_BACKGROUND_WAKE_SESSION_V1_FROZEN`

## Background wake

- Wake remains an explicit user setting and uses the installed Windows `System.Speech` `zh-CN` recognizer with the existing exact local grammar.
- While DeskMate is idle, the local listener may own the computer microphone but does not open the floating capsule or a Doubao session.
- It emits only `ready` and debounced `wake`; no transcript, confidence value or audio leaves the local listener.
- A matched phrase starts the one existing companion conversation. Dictation, voice edit, microphone test and an active companion session continue to preempt the background listener.

## Foreground conversation

- Default end-of-utterance silence is 4000 ms. This value is sent to the provider as the current custom VAD window and is independent from session lifetime.
- Default listening-only idle lifetime is 10000 ms. It is armed only while the active conversation is listening and resets on a new listening turn.
- When that timer expires, DeskMate closes the provider and foreground audio owner, hides the capsule and resumes the enabled local wake listener.
- Background wake status, idle-timer evidence and intent-status bookkeeping never show the capsule. Only visible conversation states and transcript/reply events may update it.

## Motion audio

- Every frozen semantic preset has one locally synthesized, copyright-free computer-speaker cue.
- Dance uses the selected enabled local track when available; otherwise it uses the built-in electronic beat. Custom choreography uses the same dance rule.
- Generic “播放音乐” uses the selected local track when present and otherwise the built-in dance beat.
- Normal completion, stop-and-center, superseding playback and emergency stop end the current audio generation.

## Boundary

- Windows software only. No firmware, HID, DeskMate Link, GPIO, PWM, servo or board-audio contract changes.
- Real wake-phrase recognition quality and acoustic false positives remain user-present HIL gates.
