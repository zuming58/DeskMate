# T10E EasyInput audio capture reference audit

## Fixed reference

- Repository: `F:\Codex\easyinput-wzm\easy-input-maker`
- Commit: `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- License at the fixed commit: PolyForm Noncommercial 1.0.0
- Access method: read-only `git show <commit>:<path>`; the dirty reference
  worktree was not read or copied.

Reviewed paths:

- `components/keyboard/include/keyboard/audio_control_wire.h`
- `components/keyboard/src/audio_control_wire.cpp`
- `components/keyboard/include/keyboard/audio_packet_wire.h`
- `components/keyboard/include/keyboard/audio_session.h`
- `components/keyboard/src/audio_session.cpp`
- `main/platform/keyboard_audio.h`
- `main/platform/keyboard_audio.cpp`
- corresponding `host_test/audio_*_tests.cpp`
- `docs/security/audio-control-v1.md`

## Behavior retained

- Existing `EIHB`, `EICC`, `EICA` and `EIAU` wire layouts.
- PCM S16LE, 16 kHz, mono, 20 ms / 320-sample frames.
- I2S0 and GPIO9/10/11 right-slot microphone wiring.
- Separate capture and sender execution with a 64-frame PSRAM queue and
  drop-oldest overflow behavior.
- Source-address restriction, bounded control lease, bounded session duration
  and recovery instead of blocking input.
- GPIO8 power arbitration through the shared microphone lease.

## DeskMate-specific implementation

- Code is a clean product-side implementation under DeskMate naming and
  module boundaries; no reference source file was copied into this repository.
- Audio configuration is projected from the T05 complete JSON and never leaks
  into renderer or diagnostics.
- The single DeskMate input owner only requests Wi-Fi preparation on S1/S3;
  session start remains owned by authenticated-format `EICC` control.
- Status is carried by the existing sanitized T05/T08 status stream.
- Speaker playback, BLE, audio persistence and all Xiaozhi audio are excluded.

The reference remains external and is not part of DeskMate deliverables.
