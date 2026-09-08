# T21G dedicated local keyword wake v1

Status: `T21G_DEDICATED_LOCAL_KEYWORD_WAKE_V1_FROZEN`

This is a Windows-software-only replacement for T21F background wake. It
changes no firmware, Host HID, DeskMate Link, motion program or physical board
audio endpoint.

## Input ownership

- While DeskMate is idle and wake is explicitly enabled, the existing renderer
  audio adapter captures the exact Windows computer microphone selected in
  DeskMate and supplies mono PCM16 at 16 kHz to the local keyword engine.
- `system-default` means the current Windows default recording endpoint. An
  explicitly selected device remains that exact device. The wake engine never
  substitutes EasyInput or Xiaozhi audio.
- Dictation, voice editing, companion conversation and microphone tests pause
  the background capture. Releasing the foreground owner resumes it. Hiding
  the window does not stop wake; quitting DeskMate does.

## Keyword engine

- Background wake uses the bundled
  `sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01` streaming keyword
  model through `sherpa-onnx-node`.
- Each configured Chinese wake phrase is converted locally into the model's
  initial/final pinyin tokens. Unsupported, empty or non-Chinese phrases fail
  closed and are visible as a bounded status reason.
- Only a decoded keyword result may open the companion. Audio amplitude,
  microphone activity and generic speech detection are diagnostic evidence
  only and can never trigger wake.
- The keyword list is written to a private temporary file only for native
  engine construction and is deleted immediately afterward. It is not included
  in diagnostics.

## Privacy and recovery

- PCM, transcript, wake phrase, pinyin tokens and decoded keyword text are not
  retained, logged or exported.
- Diagnostics expose only model/lifecycle classifications and bounded counters
  for PCM chunks, signal-bearing chunks, keyword candidates and accepted wakes.
- Native-engine, model and microphone failures fail closed. Unexpected engine
  failure uses the existing bounded three-attempt background restart and never
  replays audio.
- Model and runtime provenance, license and pinned hashes are recorded in
  [`t21g-sherpa-local-keyword-model-2026-09-08.md`](../provenance/t21g-sherpa-local-keyword-model-2026-09-08.md).

## Acceptance

Automated:

- Chinese phrase-to-token conversion is bounded and checked against the bundled
  token vocabulary;
- a model instance consumes selected-microphone PCM, wakes only on a decoded
  keyword and removes its temporary keyword file;
- unsupported phrases and native failures fail closed;
- the packaged application contains the pinned model and native Windows runtime;
- an upstream speech fixture produces a real keyword hit with the bundled model.

User-present:

1. Leave DeskMate idle with wake enabled. Without pressing a key, say the
   displayed repeated-name phrase at a normal pace.
2. Exactly one companion session opens and accepts a normal first question.
3. After the session closes, background wake resumes and a second deliberate
   phrase opens one new session.
4. Ordinary room sound for five minutes does not open a session.

