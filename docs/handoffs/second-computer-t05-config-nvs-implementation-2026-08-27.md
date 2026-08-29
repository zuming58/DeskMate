# T05 implementation handoff

- Branch: `codex/easyinput-t05-config-nvs`
- Base: `a2adc9818da07119e59a6f14d125fc23576696c9`
- Scope: `CONFIG_V1_FROZEN` complete configuration transport, lossless main-process merge, pure HID projection and dual-slot NVS core.
- Reference: EasyInput Maker commit `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`, PolyForm Noncommercial 1.0.0. Behavior was reimplemented from the audited config payload/receiver/state/status/NVS files; no external source files or build outputs were copied.
- Product paths: `firmware/easyinput-controller/components/input_core/*config_core*`, `firmware/easyinput-controller/main/config_store.*`, `firmware/easyinput-controller/main/main.cpp`, `electron/config-merge.cjs`, `electron/easyinput-config.cjs`, `electron/input-bridge*.cjs`, `native/DeskMate.InputBridge/Program.cs`, and focused tests.
- Validation: Host CMake/CTest 6/6 passed; exact ESP-IDF v5.5.5 `esp32s3` isolated build passed; desktop config tests passed during implementation.
- Hardware: no port scan, device identification, Flash/NVS read or write, erase, flash, monitor or HIL was performed.
- Remaining audit focus: expand desktop/full T05 malformed transport and NVS fault-injection coverage on the original computer before any hardware authorization.

## Second rework handoff

- Branch remains `codex/easyinput-t05-config-nvs`; no `main` merge/rebase and no T06 work.
- Closed in this pass: snapshot control-event propagation; fail-closed legacy sync IPC; preview-before-read and commit-before-read; native request/numeric ID binding, strict chunk accumulation and no truncation; dedicated config owner task; configured encoder press/cursor routing.
- Added regression: desktop snapshot parser/filter propagation. Desktop suite is 71/71; firmware Host CTest is 6/6; ESP-IDF v5.5.5 `esp32s3` build passes with app image `0x49210` bytes.
- Explicit residual review risk: full malformed JSON/UTF-8/schema matrix and NVS power-loss/failure-injection matrix are not yet exhaustive; original-computer audit must verify them before T05 lock or any hardware authorization.
- Hardware operations: none. No port scan, device identification, Flash/NVS read/write, erase, flash, monitor or HIL.
