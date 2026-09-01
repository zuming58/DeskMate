# T11 realtime dialogue software gap audit

Date: 2026-09-01

## Baseline reviewed

- Branch base: `544fa54a482a8dca06674916644f042b069f446d`
- T11 controller, Doubao binary adapter, foreground arbiter and SQLite persistence
- T11A EasyInput LAN microphone and persisted computer/EasyInput microphone selection
- T11A companion/Agent status closure
- Fixed reference `F:\Codex\suligent` was read only; no source, credentials or assets were copied.

## Gaps closed by T11B

- Added a real computer microphone source and computer speaker sink around the one existing companion controller.
- Reused the persisted Windows microphone device and EasyInput preference; no second selector or `VoiceWorkflow` was created.
- Added session/generation-bound renderer audio IPC, bounded chunks, playback backlog control, stale-event rejection and immediate renderer-loss cleanup.
- Added visible one-time pre-start fallback from EasyInput input to computer input. Runtime failure remains fail-closed without switching.
- Added continuous turn playback, manual interruption, spoken interruption, late-response discard, finite transport reconnect and no-replay behavior.
- Added sanitized UI and diagnostic evidence for actual input, output, fallback and bounded counters.
- Preserved provider credentials in Electron main and excluded PCM, transcripts, replies, IP, device IDs and paths from diagnostics and persistence surfaces other than the explicitly committed final conversation text.

## Deliberately open

- Real credential and live Doubao network acceptance.
- Packaged computer microphone permission and selected-device behavior.
- Real computer-speaker playback, echo, latency and natural barge-in quality.
- EasyInput microphone fallback and mid-session disconnect in a real companion session.
- T11E EasyInput speaker framing, firmware implementation and a later Windows sink.
- Physical OLED/Agent-state confirmation during live conversation.

These are `HIL_NOT_RUN`, not missing software claims. No hardware or network endpoint was accessed during this audit.

