# T21B recognized-speech barge-in and local wake repair v1

Status: `T21B_RECOGNIZED_BARGE_IN_AND_LOCAL_WAKE_REPAIR_V1_FROZEN`

This is a Windows-software-only slice. It changes neither firmware image, HID or
DeskMate Link reports, motion behavior nor the physical audio wiring.

## Recognized-speech barge-in

- Automatic barge-in is available only in the T21 three-stage companion. Legacy
  end-to-end dialogue sessions retain strict half duplex.
- While DeskMate is audibly speaking, microphone PCM continues only to the
  existing Bailian streaming ASR adapter. It is not sent to Doubao TTS or a
  second recognizer.
- Sound level, a VAD edge or one ASR partial alone never owns cancellation. A
  partial must contain a bounded meaningful phrase and must not match the
  assistant text currently being spoken. Fillers such as `嗯`, `啊`, `呃` and
  one-character noise hypotheses are rejected.
- A qualified partial immediately cancels the active model/TTS generation and
  the local playback queue. The later final transcript opens exactly one normal
  replacement turn through the existing deterministic intent and model gates;
  the user does not repeat the sentence.
- A final that arrives before a usable partial applies the same meaningful-text
  and assistant-echo checks, then performs the same cancellation and replacement.
- Diagnostics expose content-free candidate, accepted, weak-rejection and
  echo-rejection counts. They never expose either side's text or PCM.

## Local wake repair

- Background wake remains explicit opt-in, local-only and subordinate to the
  single foreground microphone owner. It does not display the voice capsule.
- The previous live `SetInputToAudioStream` wrapper is forbidden: a real Windows
  smoke proved that it could report ready without consuming any supplied PCM.
- DeskMate now sends one-second PCM16 hops to the child. The child evaluates a
  bounded two-to-three-second rolling window from memory with the installed
  Windows `zh-CN` recognizer. No temporary recording is created and no wake audio
  leaves the computer.
- The recognizer keeps the bounded exact grammar and may additionally load a
  local dictation grammar. Dictation text never leaves the child; only a
  normalized match containing one of the locally configured phrases can emit
  `wake`. All other results emit only content-free `heard` or `rejected` facts.
- Microphone readiness and recognizer readiness are separate. The UI may claim
  `listening` only after both are true, and displays content-free counts for
  processed windows, detected speech, rejected results and successful wakes.
- Wake confidence has a bounded floor of `0.42` and defaults to `0.45`. Duplicate
  matches remain debounced for three seconds.

## Acceptance

Automated:

- legacy half-duplex still rejects playback ASR;
- T21 speaking keeps ASR uplink open;
- weak/filler and assistant-echo hypotheses do not interrupt;
- recognized speech interrupts local playback synchronously and one final starts
  one replacement turn;
- listener state cannot claim ready from microphone readiness alone;
- diagnostics contain only bounded state and counts;
- full desktop tests and package build pass.

Local smoke:

- the installed `zh-CN` recognizer consumes a generated 16 kHz PCM phrase through
  the same stdin-window path and emits one debounced wake without persisting the
  fixture in the repository.

User-present:

- from idle, say the currently displayed wake phrase and verify one companion
  session starts;
- during a long spoken reply, make one non-speech sound and verify playback
  continues;
- then say a new sentence such as `等一下，我想换个问题` and verify speech stops
  promptly and that sentence receives the next answer.
