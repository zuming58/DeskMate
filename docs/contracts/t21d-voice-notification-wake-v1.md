# T21D voice notification, interruption and wake repair v1

Status: `T21D_VOICE_NOTIFICATION_WAKE_V1_FROZEN`

T21E supersedes only the selected-microphone exact-grammar confidence rule and
the use of generated Codex thread titles. See
[`t21e-stable-project-wake-v1.md`](./t21e-stable-project-wake-v1.md). All other
T21D notification, presentation, interruption and privacy rules remain frozen.

This is a Windows-software-only repair. It changes no firmware, HID report,
DeskMate Link frame, motion trajectory or physical audio wiring.

## Proactive Codex notification

- An automatic announcement exists only for a real transition into `waiting`,
  `completed` or `error`. Repeated reports in the same terminal state are
  silent.
- A hook `Stop` or `SessionEnd` that has no earlier active state in the current
  bounded task store may update status, but cannot speak. This prevents a late
  or replayed terminal event from impersonating a newly finished task.
- Automatic copy is one sentence containing only the visible task name and its
  state: needs a reply, ended, or encountered a problem. Milestones remain
  available for an explicit status query but are not appended to the automatic
  announcement.
- When no interactive companion session exists, the notification starts a
  one-shot Doubao-voice session. Microphone audio is not forwarded, and the
  session closes immediately after local playback drains or after bounded
  speech recovery. Background wake is then resumed.
- If the user is already in an interactive companion session, a notification
  may use that session at the configured lower notification volume, then restore
  the normal conversation volume and listening state. It never closes a
  user-owned conversation.

## Spoken conversation presentation

- The DeskMate CompanionModel receives an explicit voice-channel instruction:
  the user's microphone speech has reached it. It must not claim that it lacks
  a microphone, that it can only read text, or expose ASR/TTS/transcription
  plumbing in its conversational answer.
- The assistant's generated reply remains eligible for TTS and final-turn
  memory storage, but reply text is removed from renderer event payloads and is
  not placed in the floating capsule. The capsule shows only state and the
  user's live/final transcript.

## Human barge-in

- Raw amplitude, one VAD edge and one fast ASR hallucination cannot cancel
  playback.
- Explicit stop phrases remain prompt after a matching provider speech item.
- An ordinary partial needs meaningful linguistic evidence and at least 500 ms
  of observed current-item lifetime. A final without an accepted partial needs
  at least five meaningful characters and 650 ms of provider-measured speech.
- Common non-speech labels such as applause, clapping, coughing, noise and
  background music are rejected. Existing filler and assistant-echo rejection
  remains in force.

## Local wake

- Background wake remains opt-in, local-only and subordinate to the single
  foreground microphone owner.
- The selected-microphone PCM path uses only the bounded exact grammar, avoiding
  competition from unrestricted dictation on the same finite audio window. The
  system-default compatibility path may retain a local dictation fallback.
- Both joined and naturally spaced cadence variants are generated for the saved
  name, such as `小来小来` and `小来 小来`, in addition to the explicit saved
  wake phrase and `你好 + 名称` forms.
- The bounded exact-grammar confidence defaults to `0.32` with a floor of
  `0.25`; any dictation fallback retains the stricter `0.42` floor. Recognition
  text, confidence and PCM never leave the child process.
- Diagnostic export reads a fresh main-process wake snapshot instead of relying
  only on a potentially stale renderer event. It exports only availability,
  state and counters.

## Acceptance

Automated:

- repeated or terminal-without-active task reports do not announce;
- a real terminal edge yields exactly one bounded sentence;
- a one-shot notification forwards no microphone PCM and returns to idle;
- an in-conversation notification restores volume and listening;
- assistant reply text is absent from renderer and capsule payloads;
- short clap-like evidence does not interrupt, while sustained recognized human
  speech does;
- the local wake child reaches ready and consumes bounded PCM windows;
- diagnostics remain content-free.

User-present:

1. From idle, speak the displayed wake phrase twice at a normal pace and verify
   that exactly one companion session opens.
2. Ask for a story, clap once, and verify speech continues. Then speak a full
   different sentence and verify it interrupts and becomes the next turn.
3. Trigger one real Codex waiting/completed event. Verify one short sentence is
   spoken, no reply text is displayed, the capsule closes and background wake
   resumes. A repeated terminal event must remain silent.
