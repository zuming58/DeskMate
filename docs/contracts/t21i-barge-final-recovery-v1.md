# T21I barge-final recovery v1

Status: `T21I_BARGE_FINAL_RECOVERY_V1_FROZEN`

This is a Windows-software-only liveness repair for the T21 three-stage
companion. It changes no firmware, HID, DeskMate Link, motion or physical audio
endpoint.

## Problem boundary

- Qwen ASR server VAD normally emits `speech_started`, `speech_stopped` and a
  final transcription for one provider item. The final is the authoritative
  normal turn boundary.
- During public-speaker barge-in, DeskMate may accept a sufficiently stable
  recognized partial and cancel audible playback before the provider emits the
  final. A real run proved that the matching final can be absent even though the
  connection remains healthy.
- This state is not ordinary listening-idle time. The accepted utterance must
  either become one bounded turn or explicitly recover to listening.

## Recovery

- An accepted partial retains only its bounded visible text and provider item
  identifier in memory while waiting for the normal final.
- The normal final always wins when it arrives within the configured utterance
  endpoint plus one second, clamped to 2–6 seconds.
- If the final is still missing, a meaningful partial of at least five normalized
  characters is promoted exactly once to the final turn. The model and TTS then
  proceed through the existing single-turn state machine.
- A short stop-only partial is not sent to the model. It returns to listening and
  restarts the ordinary idle timer instead of leaving the capsule stuck.
- A late final or partial for an already promoted provider item is discarded. A
  new provider item supersedes the old pending item and remains valid.
- Manual interruption, provider failure, close and a completed normal turn clear
  all pending recovery timers. No audio or turn is replayed.

## Diagnostics and privacy

- Sanitized diagnostics add only `bargeFinalTimeouts`,
  `bargeFinalRecoveries` and `lateBargeFinalDrops` counters.
- Pending text and provider item identity are never persisted, logged or
  exported. A promoted turn follows the normal user-turn memory policy because
  it is the accepted recognized utterance.

## Acceptance

Automated:

- an accepted meaningful partial with no provider final becomes exactly one
  model turn after the bounded recovery timer;
- a late final for the recovered item cannot start a duplicate turn;
- normal provider finals, public-speaker echo quarantine, noise rejection and
  recognized human interruption remain unchanged;
- focused companion tests, full desktop tests and package build pass.

User-present:

1. Ask for a response long enough to interrupt.
2. During playback, speak one complete replacement sentence once.
3. Playback stops and the replacement sentence receives an answer; the capsule
   must not remain processing and then exit silently.
4. Repeat several times, including one interruption near the end of playback.
