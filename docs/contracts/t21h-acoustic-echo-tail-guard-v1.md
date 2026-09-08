# T21H acoustic echo-tail guard v1

Status: `T21H_ACOUSTIC_ECHO_TAIL_GUARD_V1_FROZEN`

This is a Windows-software-only correction for full-duplex companion use with
the computer loudspeaker. It changes no firmware, HID, DeskMate Link, motion or
physical audio endpoint.

## Audio ownership

- During an interactive companion answer, the selected Windows microphone stays
  open so recognized human speech can interrupt playback.
- Renderer capture keeps WebRTC echo cancellation, noise suppression, automatic
  gain control and mono input enabled. These processing hints are the first
  acoustic-echo layer, but are not sufficient evidence on their own.
- Raw sound level, a microphone frame and a provider VAD edge never interrupt or
  open a user turn. Existing recognized-speech evidence remains mandatory.

## Post-playback echo quarantine

- The cloud ASR service may finish an item after the local computer speaker has
  drained. DeskMate therefore preserves the bounded assistant-text reference and
  the unresolved ASR item identifier when playback drain is acknowledged.
- A partial or final carrying that same item identifier is playback-contaminated
  and is discarded even when the cloud recognizer paraphrases the loudspeaker
  tail. It cannot reach the model, memory, trusted intent router or UI.
- If the provider omits an item identifier, only a close semantic match to the
  bounded assistant reference is discarded. A distinct utterance is accepted;
  the quarantine does not become a fixed post-playback mute window.
- A new provider item that begins after drain is a normal user utterance and may
  reach the model immediately. Human interruption while playback is still
  audible continues to use the frozen T21B/T21D evidence gate.
- The quarantine expires after the configured utterance endpoint plus two
  seconds, clamped to 3–12 seconds. A matching final, interruption, provider
  failure, session close or timeout clears it. Nothing is queued or replayed.

## Privacy and diagnostics

- The tail reference and item identifier are memory-only and bounded to the
  active provider generation. They are never persisted, logged or exported.
- Sanitized diagnostics add only `postPlaybackEchoDrops`, a non-negative count.
  No transcript, assistant text, audio, item identifier or confidence is added.

## Acceptance

Automated:

- an ASR item opened during loudspeaker playback cannot become a user turn when
  its partial/final arrives after local drain;
- a distinct new utterance after drain still starts exactly one model turn;
- existing recognized human interruption, noise rejection, speaker drain and
  full desktop regressions remain green;
- the desktop package exposes the T21H build identity.

User-present:

1. Use the computer loudspeaker and start a normal multi-turn conversation.
2. Let one answer finish without speaking; DeskMate must not repeat or answer a
   sentence derived from its own loudspeaker output.
3. During a later answer, say a distinct complete sentence; playback must stop
   and that sentence must receive the next answer.
4. After another answer finishes, speak a new sentence promptly; it must be
   accepted without waiting for the quarantine timeout.
