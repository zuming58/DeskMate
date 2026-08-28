# T05 implementation provenance

- Fixed reference: `F:/Codex/easyinput-wzm/easy-input-maker` at commit `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`.
- License: PolyForm Noncommercial 1.0.0 for the Maker project; DeskMate files are a clean product-side reimplementation and do not copy reference source or generated output.

| Product path | Reference evidence | Adoption |
| --- | --- | --- |
| `firmware/easyinput-controller/components/input_core/include/config_core.h` | Maker `config_payload.h`, `config_receiver.h`, `config_state.h`, `status_hid_protocol.h` | New bounded, platform-neutral declarations for CRC, 0x10/0x13 transport, projection and record validation. |
| `firmware/easyinput-controller/components/input_core/src/config_core.cpp` | Same files and fixed Host tests | Reimplemented chunk ordering, epoch binding, CRC, UTF-8/schema/action projection and read stream; preserves raw JSON bytes. |
| `firmware/easyinput-controller/main/config_store.*` | Maker `main/platform/nvs_store.*` | New dual-slot `deskmate` transaction with marker, readback and read-only legacy import; no erase or automatic migration. |
| `firmware/easyinput-controller/main/main.cpp` | Maker configuration HID handling | Integrated a static callback command queue and owner-task storage/response lifecycle into the locked T03/T04 runtime. |
| `electron/easyinput-config.cjs` | Maker config payload/status behavior | Host codec for 52-byte writes, 49-byte reads, CRC and strict snapshot validation. |
| `electron/config-merge.cjs`, `electron/main.cjs`, `electron/preload.cjs` | Maker schema/action behavior plus frozen DeskMate privacy contract | Main-process-only raw configuration, stable fingerprint, approved pure-HID patch paths and sanitized renderer APIs. |
| `electron/input-bridge*.cjs`, `native/DeskMate.InputBridge/Program.cs` | Maker HID transport/status behavior | Read/write bridge framing, bounded protocol lines and complete snapshot assembly; no device path leaves the native/main boundary. |
| `firmware/easyinput-controller/host_test/config_core_tests.cpp`, `tests/easyinput-config.test.mjs` | Maker Host tests | Product-side transport, projection, storage and privacy regression coverage. |

No files were modified, copied from, or built in either external reference directory. No port scan, device identification, Flash/NVS read or write, erase, flash, monitor or HIL was performed.

## Local continuation after copied worktree

- `electron/config-merge.cjs`, `src/pages.jsx`: sparse `KEY1`..`KEY8` patches are now accepted alongside the legacy full eight-item form. The renderer tracks only edited key/encoder fields and sends only those approved paths, preserving untouched bindings and all non-HID JSON.
- `electron/input-bridge-protocol.cjs`, `electron/input-bridge.cjs`, `native/DeskMate.InputBridge/Program.cs`: added validated, redacted per-chunk `config-progress` events. Matching reads refresh the three-second deadline from the last valid chunk; invalid or stale progress is ignored.
- `firmware/easyinput-controller/components/input_core/src/config_core.cpp`, `host_test/config_core_tests.cpp`: integer parsing now checks overflow before multiplication and rejects arbitrarily large numeric tokens without exceptions; a regression vector covers the boundary.

Local continuation verification: Host CTest `6/6`; desktop `npm test` `73/73`; native bridge Release build `0` warnings / `0` errors; exact ESP-IDF `v5.5.5` / `esp32s3` build passed with app image size `0x4A280` (303,744 bytes). Hardware access remains unauthorized and unperformed.

## Third rework delta

- `firmware/easyinput-controller/components/input_core/src/config_core.cpp`: replaced the compact string search and throwing integer conversion with a bounded recursive JSON parser. It rejects duplicate/nested ambiguity, malformed JSON, invalid UTF-8, invalid escape/surrogate sequences, non-integer or out-of-range speeds, trailing data, non-zero padding, and invalid request flags without exceptions; read/write assembly remains CRC- and epoch-bound.
- `firmware/easyinput-controller/main/main.cpp`, `main/config_store.cpp`: Feature Reports are copied only at the exact 63-byte payload boundary; config save results carry the originating USB epoch; stale results are discarded; legacy import remains read-only when the new namespace is unavailable; persisted-but-invalid state reports `Recovery` rather than `Default`.
- `firmware/easyinput-controller/components/input_core/src/input_runtime.cpp`, `host_test/input_runtime_tests.cpp`: encoder cursor projection is applied and configuration replacement queues a host-visible all-zero keyboard report before activating the new projection.
- `native/DeskMate.InputBridge/Program.cs`: registers reads before sending the HID request, resets pending state on device disconnect, validates complete 64-byte reports, reserved zero padding, metadata before duplicate-last handling, and rejects stale/partial streams.
- `electron/config-merge.cjs`, `electron/main.cjs`, `src/pages.jsx`: desktop capabilities advertise the frozen config read/write gates; preview returns sanitized JSON Pointer diffs and the UI displays those paths before confirmation.

Third-rework verification: Host CTest `6/6`; desktop `npm ci --include=dev`, `npm test` `71/71`, and `npm run build:desktop` passed. Exact isolated ESP-IDF `v5.5.5` / `esp32s3` build passed with the final app size and SHA-256 recorded in the delivery report; partition table SHA-256 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`. No hardware operation was performed.

## Second rework delta

- `electron/input-bridge-protocol.cjs`: `config-snapshot` remains a control event so the complete read chain can resolve.
- `electron/main.cjs`, `electron/preload.cjs`, `src/pages.jsx`, `src/adapters/voiceAdapters.js`: legacy direct sync IPC is fail-closed and no longer renderer-exposed; preview re-reads the device and commit re-reads before write.
- `native/DeskMate.InputBridge/Program.cs`: binds textual and numeric request IDs, rejects stale/conflicting chunks, allows only identical last-chunk duplicates, and never truncates excess payload bytes.
- `firmware/easyinput-controller/main/main.cpp`: configuration persistence is queued to a dedicated `config_owner` task; input/USB/LED owner remains responsive while storage work runs.
- `firmware/easyinput-controller/components/input_core/*`: configured encoder press, cursor-mode HID arrows, and the encoder source tap state are routed through the existing input router.
- Added desktop regression: `config-snapshot` parser/filter control-event propagation. Full desktop suite: 71/71.
- Verification remains development-only: Host CTest 6/6, ESP-IDF v5.5.5/esp32s3 build passed (`0x49210` app image). Strict JSON parser rewrite was not retained after compatibility regression; malformed-schema and NVS fault-injection expansion remains an explicit second-audit item.
