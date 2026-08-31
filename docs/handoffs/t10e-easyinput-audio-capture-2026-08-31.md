# T10E EasyInput audio capture handoff

## Exact baseline and branch

- Base: `381cef3114c0219d2f760b112db0afdefe721d8d`
- Branch: `codex/t10e-easyinput-audio-capture`
- Implementation commit: `9134931b0c1504c02452d20c0c6483f267dff85d`
- Frozen contract: `EASYINPUT_AUDIO_CAPTURE_V1_FROZEN`
- Fixed Maker reference: `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`

## Delivered behavior

- Maker-compatible `EIHB`, `EICC`, `EICA` and `EIAU` protocol core with
  golden wire vectors, strict source/session/sequence handling, a 15-second
  control lease and a 300-second hard session limit.
- Complete-config projection for only `wifi_ssid`, `wifi_password`,
  `audio_host` and `audio_port`; incomplete or malformed configuration never
  scans, broadcasts or guesses a destination.
- EasyInput onboard microphone capture on I2S0, 32-bit MSB mono right slot,
  GPIO9/GPIO10/GPIO11, converted to PCM S16LE at 16 kHz in 20 ms frames.
- Separate control, capture and sender tasks with a 64-frame PSRAM queue.
  Overflow drops the oldest audio without blocking T03-T09 behavior.
- GPIO8 remains owned by `PeripheralPowerController`; audio only acquires the
  existing `KeyboardMic` lease. S1/S3 may prepare Wi-Fi but cannot start I2S.
- Sanitized capability/state/counters only. Credentials, host/port, network
  identity, audio and user content never enter diagnostics.

## Verification

- EasyInput Host CTest: 10/10 passed.
- ESP-IDF: exact v5.5.5, target `esp32s3`, 16 MiB Flash and the repository
  partition table passed.
- Candidate app: 854,432 bytes (`0xD09A0`).
- Candidate app SHA-256:
  `B9198F6A6CEE66F38C6957669D12699B3E9EE81565F0F37C0F4CAC5E84EFF807`.
- Factory app partition free: `0x22F660` bytes (73%); `sound_a` and `sound_b`
  remain unchanged in the partition contract.
- Desktop regression: `npm test` 127/127 passed; `npm run build:desktop`
  passed.
- `git diff --check`, ASCII paths, source/license provenance, high-risk secret
  patterns, build artifacts, scope boundary and AGENTS/CLAUDE identity passed.

## Safety and next gate

No port was scanned, no device was identified, no Flash/NVS was read or
written, and no flash, erase or monitor command ran. No desktop source,
Windows bridge or Xiaozhi firmware was modified.

This image is a code/build candidate, not an authorized flash image. A later
hardware turn must independently verify the final clean HEAD and image, then
request app-only authorization. HIL must prove non-zero microphone level,
20 start/stop cycles, Wi-Fi interruption recovery, concurrent key/encoder/LED
and Xiaozhi Link operation, and privacy-safe diagnostics before T10E is locked.

T11E speaker playback, T12E USB/BLE ownership and T13E power/sleep remain
separate packages.
