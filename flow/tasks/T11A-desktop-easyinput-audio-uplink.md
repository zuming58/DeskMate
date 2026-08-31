# T11A desktop EasyInput audio uplink

Status: `TEST_CONFIRMED / BUILD_CONFIRMED / MICROPHONE_SOURCE_SELECTION_IMPLEMENTED / HIL_NOT_RUN`

## Objective

Implement the Windows production `EasyInputLanAudioSource`, safe configuration window and 30-second no-recording microphone diagnostic on top of `EASYINPUT_AUDIO_CAPTURE_V1_FROZEN`.

## Included

- Strict UDP codecs, single-source session lifecycle, finite control retry, keepalive and bounded PCM queue.
- T05-compatible four-field preview/confirmation/write/readback transaction.
- Separate sandboxed credential window and sanitized main-renderer status.
- Microphone level/counter diagnostic without persistence or Doubao.
- Persistent computer/EasyInput selection for the existing text `VoiceWorkflow`, one-source-per-recording locking, explicit pre-start fallback and completed-WAV handoff.
- Board-scoped Raw Input voice/voice-edit triggers with ordinary global keyboard shortcuts disabled by default.

## Excluded

Firmware changes/review, hardware operations, LAN scanning, speaker playback, Xiaozhi audio, servo and full realtime HIL. Computer fallback is permitted only for text dictation before a board recording starts; it is forbidden for companion dialogue and during an active board recording.

## Exit gate

All desktop tests and package build pass; privacy/static checks pass; exact branch/HEAD is recorded. Hardware and full conversation remain open until T10E and a later speaker-downlink package pass their independent gates.
