# T05 EasyInput configuration/NVS third independent audit

## Verdict

- Candidate: codex/easyinput-t05-config-nvs at 2c1cf8d6a9d4f3c79f0adb44bbbaad8318a02122
- Frozen base: a2adc9818da07119e59a6f14d125fc23576696c9
- Status: REVIEW_CHANGES_REQUIRED / CONFIG_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED / T06_BLOCKED
- Decision: do not flash this candidate, write NVS, merge main, or start T06.

The candidate closes several second-audit defects: Feature Reports use exact bounded lengths, the JSON parser is bounded and non-throwing, encoder cursor mode is projected, configuration replacement queues a host-visible release, save results carry a USB epoch, UI patches are sparse, and read progress refreshes the Electron timeout. Host, desktop, native bridge and ESP-IDF build evidence is real. The remaining defects are in production state and capability paths, so passing suites do not make the image eligible for hardware use.

## Blocking findings

### P0 - native read state is still shared unsafely

Program.cs correctly registers a read before sending, but RawInputWindow.BeginRead only replaces the textual and numeric request IDs. It does not clear the instance chunk list, metadata, last chunk or next index. The command reader calls it from a task-pool thread while the window thread reads and mutates the same request and assembly state without synchronization.

A replacement request can inherit partial assembly; callbacks can observe mixed request identity; and a failed feature send leaves the request registered. Move the complete assembler behind one synchronized owner or marshal begin/cancel onto the window thread. A new request must atomically clear the previous stream. Send failure, timeout, stop and disconnect must cancel the exact request. Add executable native tests for synchronous first response, replacement after partial data, cancellation, disconnect, send failure and concurrent ordering.

### P0 - status flags and capabilities do not implement the frozen contract

decode_config_read_request validates flags 0x00 through 0x02 but discards the flag. main.cpp then queues status and starts a complete JSON stream for all three values. The contract requires 0x00 cached status, 0x01 fresh status and only 0x02 complete configuration.

The firmware status path has no tested config_read_v1/config_write_v1 contract, while Electron hard-codes both capabilities true. Preserve the request flag, route each value separately, add golden status vectors, parse board capabilities, and keep write unavailable until the connected board positively advertises support.

### P0 - NVS initialization failure aborts the app

ConfigNvsStore::begin returns the nvs_flash_init error and app_main wraps it with ESP_ERROR_CHECK. The frozen contract requires safe defaults and unavailable writes while input, USB and T04 LEDs continue. Return a degraded store state, load safe defaults with the correct source, expose only a sanitized failure category, and never erase NVS.

### P0 - one transaction per USB epoch is not enforced

The save queue accepts two commands and no busy state rejects another complete write while persistence is running. Both can use the same active slot and generation. Add one bounded configuration owner state per epoch. Overlapping writes and conflicting reads must fail closed. Cover duplicate writes, read/write overlap, unmount during each save stage, stale results, queue overflow and ACK identity.

### P1 - NVS recovery evidence is incomplete

config_core_tests proves one successful save and limited corruption fallback only. It does not cover every interruption point, marker loss/corruption, both-slot generation selection, init/open/capacity/commit/readback/marker failures, invalid legacy data, or Default versus Recovery. It also uses raw assert, which may open a modal dialog in Windows Debug. Add an injectable fake store and use the repository non-modal CHECK test style.

### P1 - renderer editing is not board-first

The main process re-reads before preview and commit, and sparse patches preserve untouched fields. KeymapPage still starts from locally persisted React state and does not initialize the editable projection with readKeyboardConfig. Load the sanitized board projection on page entry or connection, show source/fingerprint without raw JSON, and track edits relative to it. Unsupported Host Actions remain T06 pending.

## Independent evidence

- Worktree and remote candidate matched 2c1cf8d6a9d4f3c79f0adb44bbbaad8318a02122 before documentation edits.
- Desktop npm test: 73/73 passed.
- Native bridge Release build: 0 warnings, 0 errors.
- Desktop package build: passed.
- Fresh firmware Host configure/build/CTest: 6/6 passed.
- Exact environment: ESP-IDF v5.5.5, target esp32s3.
- Previous clean candidate app: 303744 bytes (0x4A280), SHA-256 F7CCF2F44A67034AC0081B5823A7FCBEFB47AFFC7AC93FCC53FCCDCD468FB737.
- Fixed partition SHA-256: 7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278.
- git diff --check, ASCII paths, artifact check and AGENTS/CLAUDE equality passed.
- No port scan, device identification, Flash/NVS access, flash, erase, monitor or HIL was performed.

The recorded image hash is audit evidence only. It is not a burn image and becomes obsolete after rework.

## Required stop gate

Continue the same branch, add failing regressions for every item above, implement the minimum fixes, and rerun the complete gates. Push and stop for another independent audit. Only a clean audit may produce a new HEAD/SHA-256/app-only authorization card. T06 and hardware access remain blocked.
