# T03 atomic-tap candidate handoff · 2026-08-27

Status: `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_PENDING`

## Confirmed failure mechanism

The rejected reconnect candidates tried to clear Ctrl after a new USB HID lifetime appeared. Read-only Windows diagnostics repeatedly showed the old EasyInput lifetime sending Ctrl+C, disappearing, and no effective Ctrl-up before the computer keyboard's `A`; the new endpoint's all-zero reports and TinyUSB transfer-complete did not reliably clear the old lifetime. GPIO40-driven DCD disconnect/connect also failed HIL. Therefore `cf9fdf8` must not be flashed or retested.

The pinned Maker baseline `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` uses stateful down/up for its default S6 too, so copying that default path would preserve the same risk. Maker's separate synthetic `HidTap` path does provide a useful bounded design: compose a temporary chord with the current held snapshot, queue press and exact restore together, and never admit only the press.

## Contract and implementation

The user confirmed the 2026-08-27 `INPUT_V1_FROZEN` amendment:

- S1 and S3 remain physical-source-owned held PTT chords.
- S2, S4 and S5 through S8 are one-shot taps on stable Press.
- A tap atomically consumes two slots in the existing 16-item USB report FIFO: temporary press, then exact restore of the S1/S3 held snapshot.
- Physical Release only rearms that source. Duplicate Press/Release is idempotent.
- Fewer than two free slots rejects the whole pair, increments two report drops and enters all-release recovery.

No second input state machine, USB owner or transport was added. VID/PID, descriptors, Report IDs, GPIO, encoder behavior, diagnostics, GPIO40 lifecycle, partition layout and Vendor fail-closed behavior are unchanged.

## Local verification

From the repository root, with the exact v5.5.5 PowerShell environment loaded in each process:

```powershell
cmake -S firmware/easyinput-controller/host_test -B firmware/easyinput-controller/host_test/build -DCMAKE_BUILD_TYPE=Debug
cmake --build firmware/easyinput-controller/host_test/build --config Debug
ctest --test-dir firmware/easyinput-controller/host_test/build -C Debug --output-on-failure
```

Result: 3/3 passed (`input_core_tests`, `input_runtime_tests`, `firmware_source_contract_tests`). New coverage proves tap release before physical key-up, duplicate/rearm behavior, concurrent S1 restore, two-slot admission, delayed endpoint readiness, transfer failure recovery and all-released as the old endpoint's final completed report before disconnect.

`idf.py --version` reported exact `ESP-IDF v5.5.5`. An isolated esp32s3 build with a new sdkconfig passed in Minimal build mode. Dirty-tree app size was `0x37310` (226,064 bytes), leaving 93% of the 3 MiB factory partition. The generated table remained NVS 24 KiB, PHY 4 KiB, factory 3 MiB and two 576 KiB sound banks.

Board/source scan found the frozen S1-S8 GPIOs `2,47,38,41,1,6,7,48`, encoder `17/16/18`, USB `19/20` and active-low SEN_VIN `40`; no forbidden GPIO0/GPIO8/GPIO12/J4 UART, audio, Wi-Fi, BLE or NVS initialization was introduced. Scope, provenance, secret, ASCII path, tracked artifact, AGENTS/CLAUDE identity and `git diff --check` checks passed.

## Hardware gate

This document is not flash authorization and does not claim HIL. After commit/push, rebuild from the clean final HEAD and publish its exact app SHA-256 and inclusive app-only range. Obtain a fresh confirmation for that exact image, identify the already-selected EasyInput again after USB re-enumeration, and write only the factory app at `0x010000`. Do not erase or write the bootloader, partition table, NVS, PHY, sound banks or eFuse.

After normal power recovery, start read-only monitoring before asking the user to run the five reconnect repetitions. Stop on the first failure. Do not start T04/T05 until T03 passes.
