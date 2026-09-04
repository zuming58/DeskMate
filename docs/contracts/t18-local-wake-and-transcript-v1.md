# T18 local wake and transcript contract v1

Status: `T18_LOCAL_WAKE_AND_TRANSCRIPT_V1_FROZEN`

## Scope

This is a Windows-software-only addition. It changes no EasyInput or Xiaozhi
firmware, HID report, DeskMate Link frame, servo behavior or audio wire format.

## Local wake

- Wake is disabled by default and starts only after the user enables and saves it.
- The adapter uses an installed Windows `System.Speech` `zh-CN` recognizer and an
  exact bounded grammar containing at most eight locally configured phrases.
- Wake audio stays inside the Windows recognizer. The child process emits only
  `ready` and `wake`; it emits no recognized phrase, confidence value or audio.
- The existing foreground-audio owner remains authoritative. Wake listening pauses
  before dictation, voice edit, realtime companion or microphone test and resumes
  only after the owner releases the microphone.
- A wake event starts the existing versioned realtime companion state machine. It
  does not create a second conversation implementation.

## Transcript terminology

- Batch Qwen ASR receives the configured hotword list as bounded system context.
- Realtime and batch text pass through one deterministic local normalizer before
  intent routing, turn storage and user display.
- Explicit replacement rules run first. Built-in technical aliases such as spoken
  `Code S` map to `Codex` only when that canonical hotword is in the user's list.
- The normalizer cannot add an unconfigured technical product name or execute an
  action. The normalized text still passes the existing trusted-intent gates.

## Latency and recovery

- Recording-blob persistence runs concurrently with transcription.
- A completed realtime Qwen transcript may satisfy the ordinary dictation pipeline;
  otherwise the existing batch request remains the fallback.
- When provider audio for a trusted status/motion reply becomes quiet but the
  provider omits `tts.end`, DeskMate drains playback and reconnects after a bounded
  quiet window instead of leaving the capsule in processing.

## Acceptance

- Automated: local-wake process lifecycle, unsupported-platform boundary,
  microphone pause/release, hotword/rule normalization, ASR glossary request,
  missing-`tts.end` recovery, real raw-turn listing and diagnostic privacy.
- Local smoke: probe an installed `zh-CN` recognizer, listen for two seconds, then
  release the microphone without persisting audio.
- User-present: enable wake, call the configured phrase from idle, verify action
  replies return promptly to listening, verify `Codex` subtitles, inspect both raw
  memory sources and exercise ordinary voice input into an unchanged Codex window.
