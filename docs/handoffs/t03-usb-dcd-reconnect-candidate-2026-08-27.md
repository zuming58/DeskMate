# T03 USB DCD reconnect candidate

Date: 2026-08-27
Branch: `codex/easyinput-t03-cold-boot-reconnect`
Base: `16bad4f306570578924b260ea0bb03c63bb19e49`
Status: `TEST_CONFIRMED / BUILD_CONFIRMED / T03_USB_DCD_RECONNECT_PENDING_HIL`

## Diagnosis

The monitored failures showed an EasyInput Ctrl+C down before removal, a real
Windows PnP disconnect/re-enumeration, and no host-visible Ctrl-up afterward.
Four application-level mount/epoch/release candidates still failed on the
second repetition. The board remains powered by its battery when USB is
removed, so invalidating only the application runtime does not reset the
TinyUSB device-controller connection state.

The fixed Maker commit uses GPIO40 as an active-low SEN_VIN application signal
but leaves esp_tinyusb configured as bus-powered with no PHY VBUS input. The
ESP-IDF self-powered B-valid input is active-high, so GPIO40 cannot be passed to
`vbus_monitor_io` without inverted semantics. This candidate keeps the verified
active-low board signal and explicitly synchronizes it to TinyUSB's DCD soft
connection from the single owner task.

## Change

- GPIO40 any-edge ISR only wakes the owner task.
- A raw loss edge immediately arms fail-closed keyboard release recovery.
- The existing 25 ms monitor remains authoritative for stable physical loss.
- Stable loss invokes `tud_disconnect()`; stable recovery invokes
  `tud_connect()`. Duplicate states are idempotent and failed calls retry.
- Real TinyUSB mount callbacks remain authoritative and create fresh epochs.
- Mount/recovery/held-release zero reports are reasserted every 25 ms for a
  bounded 500 ms window after the first zero report actually completes.
- Delayed HID readiness cannot age out the window, held input remains
  suppressed, and old wheel movement is never replayed.

No second input state machine, synthetic Ctrl chord, configuration/NVS, BLE,
Wi-Fi, audio, GPIO8, partition, desktop, Xiaozhi or DeskMate Link work was
added.

## Evidence

- Host CMake configure/build/CTest: 3/3 passed.
- Exact environment: `ESP-IDF v5.5.5`, target `esp32s3`.
- Fresh dirty-tree firmware build: app `0x371E0` (225,760 bytes), 93% of the
  3 MiB factory partition free.
- Locked partitions: NVS 24 KiB, PHY 4 KiB, factory 3 MiB, sound A/B 576 KiB
  each.
- Fixed external reference and per-file adoption are recorded in
  `docs/provenance/t03-easyinput-usb-input-runtime.md`.

The final clean HEAD, app SHA-256 and exact app-only range must be calculated
after commit and reported before any hardware authorization.

## Hardware boundary

No port scan, device identification, Flash read/write, flash, erase, monitor or
HIL assertion was performed for this candidate. Prior image authorization does
not apply. T03 remains open and T04/T05 remain closed until five consecutive
disconnect tests and the existing input regression pass on the new image.
