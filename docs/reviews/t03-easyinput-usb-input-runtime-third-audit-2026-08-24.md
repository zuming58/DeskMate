# T03 EasyInput USB input runtime — third independent audit

- Candidate branch: `codex/easyinput-usb-input-runtime`
- Candidate reviewed: `dbf621fc2ba3dcaf64ab2794708186f5ad8150a0`
- Local corrective commit: `aac2ec9`
- Result: `CODE_REVIEW_CONFIRMED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED`
- Hardware result: `HIL_NOT_RUN`

## Audit outcome

The candidate correctly replaced coalescing booleans with ordered lifecycle events and added complete byte-for-byte golden vectors for the USB device, configuration, language/string and HID report descriptors. The prior two audit findings are closed.

The third audit found two local defects and fixed them directly because both were bounded to USB lifecycle bookkeeping and could be protected by Host tests:

1. A duplicate mount callback advanced the callback epoch even though the owner correctly ignored the duplicate mount. Transfer completion then carried a different epoch from the queued report and could leave the report permanently in flight.
2. The queue declared a capacity of 16 but used a sentinel-slot ring with only 15 usable entries. Callback publication ignored a full result, allowing mount, unmount or transfer lifecycle facts to disappear silently.

The final implementation uses one Host-testable callback lifecycle state. Duplicate mount events retain the same epoch; only a real unmount/remount advances it. Queue storage includes the sentinel in addition to 16 usable slots. Overflow is saturating-counted; the owner discards the untrustworthy sequence, cancels the in-flight report, reconciles against the callback mount snapshot and waits for observed physical keys to release.

Tests invoke the same production lifecycle processor and callback state rather than a copied test-only state machine. They cover duplicate mount, real remount epoch advance, 16-slot capacity, the rejected 17th event, overflow diagnostics and fail-safe reconciliation. Full descriptor vectors and all earlier input, wheel, disconnect and fail-closed tests remain active.

## Reproduced evidence

- Host: CMake 3.30.2 / MSVC; CTest 3/3 passed.
- Firmware: ESP-IDF v5.5.5, `esp32s3`, Minimal build ON; build passed.
- Application image: `0x36610`; smallest app partition free `0xc99f0` (79%).
- Dependencies: esp_tinyusb `1.7.6~2`, tinyusb `0.21.0~1`, ESP-IDF `5.5.5`.
- Board scan: 1 PASS / 1 WARN / 0 FAIL. The WARN is the known scanner limitation for C++ `constexpr`; manual pins match the board contract.
- Scope, provenance, secret scan, ASCII paths, AGENTS/CLAUDE byte identity, ignored artifacts and `git diff --check` passed.

No device was connected or identified. No port was scanned. Flash/NVS was not read or written, and flash/erase/monitor/HIL commands were not run.

## Next gate

Do not start T04. Use the separate first-flash authorization card. Because no independently verified Maker recovery image exists, preserve the current device before writing: identify only the intended EasyInput, back up the recoverable Flash/NVS ranges, hash and verify the backup, then request or confirm the write authorization before flashing and executing the T03 HIL matrix.
