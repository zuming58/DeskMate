# T06 EasyInput host actions implementation provenance

## Fixed reference and license

- Reference repository: `F:\Codex\easyinput-wzm\easy-input-maker` (read-only).
- Fixed commit: `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`.
- License: PolyForm Noncommercial License 1.0.0. Required notice: Copyright 2026 深圳物启万相人工智能有限公司; original author CY-CHENYUE; EasyInput Maker is a WaytoAGI community project.
- Method: source was read only with `git show <commit>:<path>`. No dirty reference files, build output, binaries, credentials, or Xiaozhi files were copied or used. DeskMate code below is a product-side reimplementation of the frozen wire behavior.

## Product file record

| DeskMate target path | Fixed reference path(s) | Adopted behavior | Modification and destination |
| --- | --- | --- | --- |
| `contracts/deskmate-host/easyinput-host-action-v1.md` | Maker host-action and fixed-text protocol headers; USB endpoint arbiter | Report `0x11`, kinds `0x01/0x05`, 36-byte lowercase UUID, 59-byte chunks, 960-byte UTF-8 limit, single endpoint ownership | Froze only the DeskMate V1 contract; added Windows privacy, epoch, timeout, fail-closed and exclusion rules. |
| `firmware/easyinput-controller/components/input_core/include/host_action_core.h` | `components/keyboard/include/keyboard/host_action_protocol.h`, `fixed_text_protocol.h` | Canonical UUID and fixed-text limits; bounded stream state | New platform-neutral declarations; no Maker source copied. |
| `firmware/easyinput-controller/components/input_core/src/host_action_core.cpp` | `components/keyboard/src/host_action_protocol.cpp` and fixed-text validation | Lowercase UUID validation, strict UTF-8/control filtering, bounded chunk serialization, busy/epoch cancellation | Clean C++17 reimplementation integrated with the locked input owner. |
| `firmware/easyinput-controller/components/input_core/include/input_runtime.h` | Maker key-binding and endpoint-owner tests | Host-command routing alongside existing held/tap input sources | Extended the existing T03/T05 runtime; no second input state machine. |
| `firmware/easyinput-controller/components/input_core/src/input_runtime.cpp` | Maker key-binding and USB arbiter tests | One command per confirmed press, configured encoder press/cursor behavior, release safety | Added bounded host-command projection and preserved T03/T04 release and LED priority. |
| `firmware/easyinput-controller/main/main.cpp` | `main/platform/usb_hid.cpp`, `usb_hid.h`, endpoint arbiter | One TinyUSB IN owner, transfer-complete advancement, USB epoch cancellation, bounded command queue | Integrated Host Action/fixed-text reports into the existing owner task; no BLE/audio/Link behavior. |
| `firmware/easyinput-controller/host_test/host_action_core_tests.cpp` | Maker `host_action_protocol_tests.cpp`, fixed-text stream tests | UUID and fixed-text golden vectors, boundaries, padding, duplicate and invalid input rejection | Product-side stderr/non-zero host tests. |
| `firmware/easyinput-controller/host_test/input_runtime_tests.cpp` | Maker `host_action_key_bindings_tests.cpp`, endpoint arbiter tests | Press-only dispatch, busy overflow, disconnect/epoch cancellation, encoder and release regression | Added deterministic tests around the existing runtime. |
| `electron/input-bridge-protocol.cjs` | Maker status/Host Action transport behavior | Sanitized Host Action/fixed-text metadata events and capability fields | Main-process parser strips text, paths, titles and device identity before renderer delivery. |
| `electron/input-bridge.cjs` | Maker USB transport lifecycle | Single-flight fixed-text request, bounded timeout, bridge exit/disconnect cancellation | Reimplemented manager lifecycle with fail-closed promises and no raw payload exposure. |
| `native/DeskMate.InputBridge/Program.cs` | Maker `usb_hid.cpp` receive/dispatch and fixed-text stream tests | Raw Input envelope validation, 59-byte assembly, UTF-8/padding/order/timeout checks, one-shot injection command | Added a bounded native bridge; fixed text remains private until authorized by Electron main. |
| `native/DeskMate.InputBridge/VendorReportProtocol.cs` | Maker status and fixed-text protocol tests | Report ID/kind/chunk/length/padding validation and duplicate-last handling | Independent C# validator and self-test; no device path or payload logging. |
| `electron/app-actions.cjs` | Maker Host Action UUID mapping behavior | Local UUID-to-application mapping and safe execution | Main-process-only whitelist for local `.exe`/`.lnk`; rejects UNC, URL, arguments and elevation. |
| `electron/main.cjs` | Maker dispatch lifecycle and DeskMate privacy contract | Fixed-text foreground injection, UUID action execution, capability gates, serial execution | Added time-limited main-process boundary; renderer receives only result metadata. |
| `src/App.jsx`, `src/pages.jsx`, `src/domain/keymap.js` | Maker keymap/config UI behavior | Fixed-text editing, application selection, approved action mapping | Renderer exposes labels and sanitized diffs only; UTF-8 text is bounded to 960 bytes. |
| `tests/phase3-input-bridge.test.mjs`, `tests/native-input-bridge-protocol.test.mjs`, `tests/easyinput-config.test.mjs` | Maker Host tests and frozen contracts | Metadata privacy, capability gates, fixed-text busy/timeout/exit, UTF-8 boundaries and T02-T05 regressions | Product-side Node tests; no hardware dependency. |
| `.gitignore` | DeskMate build hygiene | Keep generated output outside Git | Added `release-*/` and retained firmware/native/build artifact exclusions. |

## Verification boundary

Host and desktop tests and the ESP-IDF build are development evidence only. No port scan, device identification, Flash/NVS read or write, erase, flash, monitor, eFuse operation, HIL, Xiaozhi modification, or external-reference modification was performed.
