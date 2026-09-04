# Product roadmap

## Delivered and user-accepted foundation

- Windows Electron application and self-contained Raw Input bridge.
- EasyInput voice-key trigger, computer microphone, live caption, Qwen ASR and text output.
- Raw/smart/custom organization, history schema v5, vocabulary and deterministic replacements.
- Tray operation, overlay, diagnostics, icon assets and Windows desktop packaging.
- UI surfaces for workbench, voice, history, vocabulary, keys, device, agents, expressions, environment and settings.
- Three-end DeskMate Link, real Xiaozhi state display, bounded manual servo control, four physical presets, independent Yaw/Pitch angle and speed settings, and activated custom choreography.
- EasyInput board microphone capture, with explicit Windows fallback and source evidence.

## Current Windows software closure

- T19: make explicitly voice-enabled application opening discoverable and deterministic. “打开网易云音乐” must resolve only to the local registered application name and must not depend on a language model guess.
- T19: let the user choose one local audio file for dance accompaniment. Windows plays it through the computer speaker while the accepted semantic dance runs; normal completion, stop and emergency stop end playback.
- T16: finish real acceptance of deterministic Codex status and the bounded repository task-brief reporter.
- T17: finish real dual-source companion/dictation memory acceptance, review-first daily summaries, local index and managed Markdown projection.
- T15C/T12/T18: finish contextual-motion, companion-setting, wake, latency, history and internal-Beta regression without changing either firmware.
- Automatic update distribution, code signing and public-release hardening remain later Windows software work. The internal NSIS Beta installer remains deliberately unsigned.

## Removed from the product roadmap

- Hardware expansion, new sensors and face tracking.
- Speaker identification, per-person voice profiles and automatic person dossiers.
- Hermes, Claude Code, WorkBuddy and other Agent adapters; only Codex remains in active scope.
- A new EasyInput speaker-downlink firmware project. Current music and companion output use the computer speaker.

These items are intentionally cancelled rather than merely deferred. Reopening any one of them requires a new explicit product decision and a separate contract; they must not quietly reappear in routine software fixes.
