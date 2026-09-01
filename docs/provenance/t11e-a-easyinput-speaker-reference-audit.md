# T11E-A EasyInput speaker reference audit

## Fixed source and license

- External tree: `F:\Codex\easyinput-wzm\easy-input-maker`
- Fixed commit: `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- License: PolyForm Noncommercial License 1.0.0
- Notices retained for provenance: Copyright 2026
  深圳物启万相人工智能有限公司; original author CY-CHENYUE; EasyInput Maker
  is a WaytoAGI community project.

The fixed tree was inspected with `git show` and `git grep` at the commit above.
Its dirty working tree, build output, `.eiad` asset, sound-bank content, model,
recording and binary were not read into or copied into DeskMate. T11E-A is a
clean product-side implementation based on observed behavior and constants.
Because the reference uses a noncommercial license, any future commercial
distribution must keep this provenance and receive an independent derivation
and license review; this audit does not grant additional rights.

## Audited source map

| Reference path | Facts used by T11E-A |
| --- | --- |
| `components/keyboard/include/keyboard/board_pins.h` | GPIO8 is the active-high shared rail; microphone pins are GPIO9/10/11; speaker BCLK/WS/DOUT are GPIO14/13/15. |
| `components/keyboard/include/keyboard/speaker_audio_contract.h` | 48 kHz, 10 ms / 480-sample frames, four DMA descriptors, one zero preload, two zero tail frames, six normal drain frames and 30 ms first-PCM upper bound. |
| `main/platform/speaker_output.cpp` | I2S1 master TX, Philips, signed 16-bit mono-left, TX auto-clear, 60 ms bounded writes, exact preload, partial-write loop, microphone cancellation and cleanup ordering. |
| `components/keyboard/include/keyboard/audio_io_arbiter.h` and `components/keyboard/src/audio_io_arbiter.cpp` | Generation-scoped ownership, microphone priority and exact-generation release. Deep-sleep ownership is outside T11E-A. |
| `host_test/speaker_audio_contract_tests.cpp` | Contract constant and DMA/drain regression vectors. |
| `host_test/speaker_playback_tests.cpp` | Capacity-one admission, terminal-result and cleanup-failure vectors. |
| `host_test/audio_io_arbiter_tests.cpp` | Stale-generation, microphone-priority and ownership-release vectors. |
| `host_test/speaker_probe_status_tests.cpp` | Sanitized probe state and failure-counter vectors. |

The reference power handshake timeout is 200 ms. DeskMate does not copy that
handshake: its existing `PeripheralPowerController` keeps the board awake and
is already the sole GPIO8 writer. T11E-A adds only a logical `Speaker` lease.

## Frozen local output behavior

| Behavior | Fixed Maker reference | DeskMate T11E-A |
| --- | --- | --- |
| Speaker bus | I2S1, GPIO14/13/15 | Same verified board mapping. |
| PCM clock | 48 kHz, signed 16-bit mono-left, Philips | Same hardware-valid format. |
| DMA safety | Four descriptors, one zero preload, six-frame normal drain, TX auto-clear | Same bounded behavior, cleanly reimplemented. |
| Shared power | Single GPIO8 controller with Speaker lease | Reuses the existing controller and lease; no new writer. |
| Arbitration | Microphone cancels speaker and waits for exact release | Minimal generation arbiter; microphone remains absolute priority. |
| Producer | Local resource/probe paths | One low-volume synthesized two-pulse startup probe only. |
| Diagnostics | State and bounded counters | Capability, state and numeric counters only. |

Completion and microphone cancellation are valid only after I2S1 deletion,
the `Speaker` lease and the exact speaker generation are all released. Any
unproven cleanup enters `faulted` and keeps audio ownership fail-closed; it must
not increment completed or microphone-cancelled counters. Microphone I2S setup
failure must likewise release its exact generation so later audio can recover.

## No real-time speaker wire exists in the fixed source

The fixed Maker source contains no desktop-to-EasyInput real-time PCM or TTS
speaker downlink. `components/keyboard/include/keyboard/audio_packet_wire.h`
defines `EIAU` for microphone PCM uplink, not speaker playback. The fields
`audio_host` and `audio_port` in DeskMate remain T10E microphone control/uplink
configuration and must not be reinterpreted as speaker destinations.

Therefore T11E-A freezes no network, USB HID or DeskMate Link playback opcode.
No session, keepalive, sequence, timeout, discovery, source-locking or packet
format is guessed. A future real-time downlink requires its own reference
review, threat model, frozen wire contract, desktop owner and failure tests.

## Sound-bank path audited but excluded

The following fixed Maker facts are recorded only to prevent accidental mixing
with T11E-A. They are not implemented or accessed by this package.

- `features/speaker_assets/include/speaker_assets/sound_asset_store.h`:
  each bank is `0x90000`; staging, manifest, journal, payload and commit offsets
  are `0x0000`, `0x1000`, `0x2000`, `0x3000` and `0x8F000`; maximum payload is
  `0x80000`.
- `features/speaker_assets/include/speaker_assets/esp_sound_bank_storage.h`:
  bank A is at `0x310000` / subtype `0x00`; bank B is at `0x3A0000` / subtype
  `0x01`.
- `features/speaker_assets/include/speaker_assets/sound_asset_reader.h` and
  its implementation: EIAD v1, 48 kHz mono, 480 decoded samples per frame,
  IMA ADPCM codec `1`, encoded frame no larger than 256 bytes, and an exact
  bank/generation/digest read lease.
- `features/speaker_assets/include/speaker_assets/speaker_assets_protocol.h`:
  EIA v1, 24-byte header, 63-byte USB report with 39-byte body, Wi-Fi body up
  to 101 bytes, 640-byte plan, and capability/begin/resume/data/query/commit/
  abort/recover/current-active operations.
- `features/speaker_assets/include/speaker_assets/speaker_assets_session.h`:
  eight replay entries and one route/session/action owner.
- `features/speaker_assets/include/speaker_assets/speaker_assets_runtime.h`:
  5000 ms partial-session inactivity timeout.
- `features/speaker_assets/include/speaker_assets/speaker_assets_wifi_wire.h`:
  authenticated TCP port 17334, 32-byte key, 16-byte identity/tag, 80-byte
  discovery, 40-byte auth, 32-byte ready and 32-byte record header.
- `features/speaker_assets/assets/README.md`: the project-owned
  `waytoagi.eiad` asset is not copied.

Bank read/decode, active-bank selection, synchronization, authentication,
erase, write, recovery and resource licensing are independent later gates.

## Required failure vectors

The T11E-A Host gate must cover:

1. capacity one and zero-generation rejection;
2. speaker admission denied while microphone is requested;
3. a microphone request cancelling an active speaker generation;
4. exact-generation ready/finish and stale-generation rejection;
5. duplicate and out-of-order microphone generation rejection;
6. one exact zero preload, bounded partial writes and six-frame normal drain;
7. allocation, init, enable, zero/partial write, disable, delete and power
   release failures;
8. cleanup failure overriding otherwise successful or cancelled playback;
9. microphone setup failure releasing its lease and generation for recovery;
10. queue busy behavior, non-repeating startup admission and saturating
    sanitized counters;
11. no GPIO8 writer, network socket, sound-bank access or external audio
    producer in the speaker service;
12. regression of the fixed 16 MiB partition table and T03-T10E Host suites.

Only tests that do not require ESP-IDF drivers are executable as pure Host
tests. Driver failure injection and audible output remain part of a later,
separately authorized HIL gate; code/build evidence must not be labeled HIL.
