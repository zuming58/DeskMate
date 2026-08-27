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
