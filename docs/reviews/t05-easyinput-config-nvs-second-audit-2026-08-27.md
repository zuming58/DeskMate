# T05 EasyInput configuration/NVS second independent audit

## Verdict

- Candidate: `origin/codex/easyinput-t05-config-nvs@c6c6c64d7c595375eb74f3651b50df2950801aff`
- Frozen base: `a2adc9818da07119e59a6f14d125fc23576696c9`
- Status: `REVIEW_CHANGES_REQUIRED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED / T06_BLOCKED`
- Decision: do not merge, do not flash, do not write NVS, and do not start T06.

The second candidate fixes several first-audit defects: `config-snapshot` now reaches the Electron manager, the old direct-sync IPC fails closed, preview re-reads the device, configuration work has a separate owner task, numeric request IDs are carried through the native bridge, and the existing test/build suites pass. Those improvements are real, but the frozen safety contract is still not implemented at several executable boundaries.

## Blocking findings

### P0 - Feature Report length can overflow a fixed buffer

`firmware/easyinput-controller/main/main.cpp:529-539` accepts report `0x13` whenever `length >= 16`, then copies `length` bytes into a 63-byte `std::array`. A host-supplied oversized Feature Report can therefore write beyond the destination. The callback must accept the exact report length defined by the HID descriptor, reject every other length before copying, and have a direct boundary test around the copy helper.

### P0 - the new JSON projection parser is not fail-closed

`firmware/easyinput-controller/components/input_core/src/config_core.cpp:8-20` introduces an ad-hoc compact/value parser and calls `std::stoi` without an exception boundary. Malformed values such as a string, boolean or oversized integer can terminate the configuration task or boot path; partially numeric values can be accepted. The parser also does not prove strict root structure, UTF-8, escape/surrogate, duplicate/nested field, or trailing-data behavior.

This is precisely where the fixed Maker reference must be used before product-side implementation. Maker commit `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` already contains bounded, non-throwing configuration parsing and extensive negative vectors in:

- `components/keyboard/src/config_payload.cpp`
- `host_test/config_payload_tests.cpp`
- `host_test/config_state_tests.cpp`

DeskMate still needs its own implementation and contract, but it must first port the applicable behavior and failure vectors with provenance. A second hand-written parser is not an acceptable substitute.

### P0 - runtime projection does not fully take effect and can leave host state held

- `firmware/easyinput-controller/components/input_core/src/input_runtime.cpp:211-223` never assigns `projection.encoder_cursor` to `encoder_cursor_`, although the event path reads that member. A saved cursor-mode configuration therefore continues to scroll.
- `InputActionRouter::set_configuration()` clears only its internal state. `UsbInputRuntime::set_configuration()` does not enqueue a host-visible all-zero keyboard report before replacing the projection. Changing configuration while PTT or another modifier is held can leave Windows with the old key-down state.

Both behaviors need Host tests before the implementation is changed.

### P0 - native full-config reads still have races and stale state

`native/DeskMate.InputBridge/Program.cs` has multiple lifecycle gaps:

- The Feature Report is sent before `BeginRead()` installs pending request state (`Program.cs:130-137`), so a fast first response can be lost.
- `BeginRead()` (`Program.cs:307`) does not clear a previous partial chunk stream before replacing the request.
- pending state is shared across the command and window threads without synchronization.
- device disconnect does not cancel/reset the pending configuration read (`Program.cs:506-512`).
- the Electron timeout in `electron/input-bridge.cjs:84-96` is a fixed request timer rather than three seconds from the last valid progress, and timing out does not cancel the native pending state.
- duplicate-last handling occurs before metadata equality is checked (`Program.cs:466-471`), so an identical data payload with conflicting total length, CRC or source can be accepted.
- zero padding and all request reserved bytes are not fully validated.

These are one state-machine problem and should be fixed together, not as independent timer/callback patches.

### P0 - configuration transactions are not bound to the USB epoch

The command/result path in `firmware/easyinput-controller/main/main.cpp:190-209` and `:318-342` does not carry an endpoint epoch or request identity. Multiple complete writes can be queued while a save is active, and a save result produced after unmount can update runtime state or emit an acknowledgement after a later mount. The frozen contract permits one configuration transaction per endpoint epoch; stale results must be discarded and concurrent read/write/save attempts must fail closed.

### P1 - frozen status capabilities and legal status flags are missing

No firmware implementation exposes `config_read_v1` or `config_write_v1`. `decode_config_read_request()` accepts only flag `0x02`, while the frozen T05 slice keeps `0x00` cache status and `0x01` refresh status legal. The desktop side consequently cannot gate configuration writes on positively advertised capability. Status flags, capability reporting, reserved-byte validation and desktop gating need golden vectors.

### P1 - NVS recovery and fault coverage are incomplete

`firmware/easyinput-controller/main/config_store.cpp:8-16` skips legacy read-only import if opening the new DeskMate namespace fails, and falls back to `ConfigSource::Default` rather than the required `ConfigSource::Recovery` when persisted data exists but is invalid. Existing tests cover a normal save and limited corruption only; they do not cover every dual-slot interruption point, bad active marker, initialization/capacity/commit/readback failures, invalid legacy data, or recovery-source reporting.

### P1 - the UI does not show the user the approved path-level diff

`src/pages.jsx:585-596` calls preview and then shows a generic `window.confirm`, rather than rendering the sanitized JSON-pointer differences returned for the exact user-selected paths. The page also sends all eight locally cached bindings plus encoder settings, which can overwrite pure-HID paths the user did not edit. The UI message still says synchronization is blocked even though the new path is active. T05 must load the board projection, preview only selected changes, display the sanitized diff, and commit only the matching token.

### P1 - the reported release artifact was not independently reproduced

The development laptop reported app size `299536` bytes and SHA-256 `FFD1C4E5491D8CF0E3AC4219007359652D509C976F4FC2FC16C6116F17CE3E13`. A clean audit build using ESP-IDF v5.5.5, target `esp32s3`, an isolated absolute `SDKCONFIG`, and the fixed partition table produced `299456` bytes with SHA-256 `C9C7625EB4142668879BAA15FB2CD38E1BE4E93800B2D5103E4271AF55374993`. The fixed partition-table SHA-256 remains `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`.

This does not invalidate compilation, but it prevents treating the laptop hash as a reproducible release candidate. The next handoff must record the exact clean build inputs and reproduce the final image before any burn authorization card is prepared.

## Independent evidence

- `npm ci --include=dev`: passed.
- `npm test`: 71/71 passed.
- `npm run build:desktop`: passed, including the native bridge Release build.
- Firmware Host CTest: 6/6 passed under the ESP-IDF v5.5.5 environment.
- Clean ESP-IDF v5.5.5 / `esp32s3` build: passed with the fixed 16 MB NVS/PHY/3 MiB factory/two-sound-bank partition layout.
- `git diff --check`: passed.
- tracked ASCII paths and build-artifact checks: passed.
- secret review found only expected secure-storage field names and synthetic test values; no committed credential was found.
- board declaration scan: 1 PASS, 1 known constexpr-scanner warning, 0 FAIL.
- No port scan, device identification, Flash/NVS read or write, erase, monitor, flash or HIL was performed.

## Required rework gate

Before changing production code, the next development turn must add failing tests for every blocking item above and must build a Maker-to-DeskMate behavior/test-vector table for parsing, status, chunk reception and NVS recovery. Reuse applicable reference behavior and tests with provenance; do not copy Maker runtime wholesale and do not invent another parallel configuration/input state machine.

After rework, push the same `codex/easyinput-t05-config-nvs` branch and stop. The original computer performs a third independent audit. Only a clean code gate can lead to a separate T05 app/NVS authorization card; only T05 HIL can unlock T06.
