# EasyInput configuration contract v1

- Status: `CONFIG_V1_FROZEN`
- Frozen: 2026-08-27
- Scope: Windows DeskMate host ↔ EasyInput V2.0 USB Vendor HID configuration read/write, lossless merge and persistent recovery
- Depends on: `INPUT_V1_FROZEN`, `INPUT_LED_V1_FROZEN`, T04 locked firmware baseline

This slice freezes only configuration transport, pure-HID mappings and NVS recovery. Host Action, fixed text, BLE, Wi-Fi provisioning, audio, DeskMate Link and Xiaozhi remain out of scope.

## Compatibility and limits

- USB identity remains VID `0x303A`, PID `0x1006`; existing descriptors and Report IDs remain byte-for-byte compatible except for the newly interpreted messages below.
- The complete configuration is UTF-8 JSON with schema `ai_keyboard.v1`, length `1..2048` bytes and CRC16-CCITT initial value `0xFFFF`, polynomial `0x1021`.
- Report `0x10` Host→Board Feature remains Maker-compatible: magic `S3C`, version `1`, 11-byte payload header and at most 52 JSON bytes per chunk. A new chunk zero replaces any incomplete write in the same USB endpoint epoch.
- Report `0x13` Host→Board Feature keeps magic `S3R`, version `1`, non-zero little-endian request ID and zero reserved bytes. Legal flag values are exactly `0x00` cached status, `0x01` fresh status and `0x02` complete configuration. Flag combinations and unknown bits are rejected.
- Report `0x11` Board→Host Input retains existing kinds: `0x03` configuration acknowledgement, `0x04` status and `0x05` reserved Host Action. T05 adds kind `0x06` complete configuration and must not emit kind `0x05`.

## Complete configuration response

Each `0x11` kind `0x06` payload is exactly 63 bytes and zero padded:

| Payload byte | Size | Meaning |
| ---: | ---: | --- |
| 0 | 1 | kind `0x06` |
| 1 | 1 | zero-based chunk index |
| 2 | 1 | total chunks, `1..42` |
| 3 | 1 | declared length of bytes 4 onward, `10..59` |
| 4 | 1 | protocol version `1` |
| 5..8 | 4 | request ID, little-endian |
| 9..10 | 2 | total JSON byte length, little-endian |
| 11..12 | 2 | complete JSON CRC16, little-endian |
| 13 | 1 | configuration source |
| 14..62 | 0..49 | JSON bytes for this chunk |

Configuration source is `0` DeskMate NVS, `1` read-only legacy Maker NVS, `2` compiled safe default or `3` safe recovery after invalid persisted data. Other values are invalid.

- The board streams one response at a time. A valid request with a new request ID supersedes the old stream and restarts at chunk zero.
- USB endpoint epoch change, unmount or transfer ownership loss aborts the stream. Old chunks are never replayed after reconnect.
- The host accepts strictly increasing chunks. An identical duplicate of the last accepted chunk is ignored without advancing; a conflicting duplicate, older chunk, gap, metadata change, invalid padding, length mismatch or CRC mismatch aborts the request.
- Host read timeout is 3 seconds from the last valid progress. Configuration write/ack timeout remains 8 seconds. Retry always uses a new request ID.
- Status kind `0x04` advertises boolean capabilities `config_read_v1` and `config_write_v1`; absence or false means T05 is unsupported and the host must not write.

## Validation and active behavior

- Firmware retains the exact accepted JSON bytes for readback and preservation. It parses a separate projection for runtime behavior; parsing must follow the fixed Maker schema evidence and must not discard unknown JSON fields.
- T05 activates only pure-HID actions: voice input, voice edit, Enter, Backspace, Select All, Copy, Paste, Undo, a validated keyboard chord and Disabled. Encoder configuration includes scroll/cursor mode, vertical/horizontal axis, speed `1..5`, Windows reverse flags and a pure-HID press action.
- Voice input/edit keep the `INPUT_V1_FROZEN` held-source lifetime. Ordinary command keys keep T03 atomic press→exact-restore behavior. Configuration must update the existing router; it must not create a second scanner, debounce path, input state machine or USB owner.
- Fixed text, Host Action/open application, history, settings and profile commands are preserved in raw JSON but remain inactive in T05. The renderer labels them “T06 pending”; firmware must not emit a substitute action or success acknowledgement for them.
- Network, audio, secrets, extra profiles and unknown fields are preserved but not initialized or executed by T05.

## Lossless host merge and confirmation

- Raw configuration bytes may exist only in the native bridge transport and Electron main-process memory. They must not enter React state, logs, diagnostics, crash metadata, clipboard, export files or Git.
- Native bridge command `read-config` produces one `config-snapshot` event containing request ID, byte length, CRC16, source and Base64 JSON. Bridge protocol lines have a hard 4096-character limit; oversized or malformed lines fail closed.
- Renderer-facing APIs are:
  - `readKeyboardConfig()` → sanitized editable projection, source and non-secret fingerprint;
  - `previewKeyboardConfigPatch(patch)` → sanitized JSON-pointer diff and a single-use 60-second confirmation token;
  - `commitKeyboardConfig(token)` → final result only.
- Before preview and again before commit, main process re-reads the device. Device disconnect, app restart, token expiry, request/fingerprint change or another pending transaction invalidates the token.
- Main process applies only approved pure-HID JSON paths. Deep comparison after merge must prove every unapproved JSON value, array item and unknown field unchanged; object key order is not semantically significant.
- The host writes the merged complete JSON through `0x10`, waits for matching bytes/CRC/saved acknowledgement, then re-reads. Success requires the readback bytes/CRC to match the submitted document and the semantic preservation check to pass.

## NVS transaction and boot recovery

- Existing 24 KiB NVS partition and all other fixed partitions remain unchanged.
- DeskMate uses namespace `deskmate`: blobs `cfg_a` and `cfg_b`, plus `cfg_active`. Each blob contains magic, record version, monotonic generation, JSON length, CRC16 and exact JSON bytes.
- Save order is fixed: validate candidate → write inactive slot and commit → read back and validate that slot → write active-slot marker and commit → update runtime projection → send existing `0x11` kind `0x03` saved acknowledgement.
- Power loss before the active marker commit leaves the prior marked slot active. If the marker is missing or invalid, boot selects the valid slot with the highest generation and reports recovery. If the marker points to a valid slot, that slot wins even if the other slot has a higher generation from an interrupted transaction.
- If no valid DeskMate slot exists, firmware reads `ai_keyboard/config_v2` read-only. A valid legacy document becomes the active in-memory source without modifying legacy NVS; it is migrated into DeskMate slots only after an explicit confirmed save.
- If neither DeskMate nor legacy configuration is valid, firmware uses the compiled safe defaults. Invalid persisted data selects source `3`, reports a sanitized recovery warning and is not overwritten automatically.
- `nvs_flash_erase` is forbidden. NVS initialization, capacity or commit failures leave the safe mapping active and configuration writes unavailable; no other namespace is erased or rewritten.

## Concurrency, privacy and diagnostics

- TinyUSB callbacks only copy validated-length Feature reports plus current endpoint epoch into a static bounded queue and wake the single configuration owner. JSON parsing, NVS and response streaming never run in callbacks or input ISR paths.
- Keyboard and mouse reports have priority over configuration response chunks. Configuration overflow, timeout or storage failure cannot clear, replay or delay input, USB release recovery, LED feedback or GPIO8 ownership.
- One read or write transaction may be active per device epoch. Diagnostics are counters/categories only: read/write rejects, chunk drops, CRC errors, transaction recovery and NVS failure. They contain no JSON, keys, SSID, IP, MAC, serial number, device path or user text.

## Acceptance gate

Implementation requires complete golden-vector, malformed transport, lossless merge, dual-slot power-loss, legacy import, desktop privacy and T02–T04 regression tests. Development-laptop evidence is code/Host/desktop/build only. App and NVS access require separate original-computer audit, backup, identity and user authorization.
