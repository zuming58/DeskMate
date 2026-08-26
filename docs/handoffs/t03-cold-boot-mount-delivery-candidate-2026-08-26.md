# T03 cold-boot mount delivery candidate

Date: 2026-08-26
Branch: `codex/easyinput-t03-cold-boot-reconnect`
Base: `23aca91e69f5df252106c84e8299f1815afe7fa9`
Status: `TEST_CONFIRMED / BUILD_CONFIRMED / T03_COLD_BOOT_MOUNT_DELIVERY_PENDING_HIL`

## Change

The production TinyUSB `tud_mount_cb` now always creates and publishes a new
`UsbLifecycleEventKind::Mount` epoch. A one-shot GPIO40 physical-presence sample
cannot discard a real TinyUSB mount callback. GPIO40 remains a read-only,
active-low SEN_VIN gate for debounced physical disconnect confirmation and old
endpoint invalidation. No second input state machine or custom diagnostic
protocol was added.

## Evidence

- Host CMake/build/CTest: 3/3 passed.
- Exact environment: `ESP-IDF v5.5.5`, target `esp32s3`.
- Firmware build: `build-codex-v5.5.5/deskmate_easyinput_controller.bin`,
  224,928 bytes (`0x36EA0`), SHA-256
  `365F472744592116A10827403EA2474F7A7A819668A5750A9E99471FB84D6FC8`.
- App-only candidate range: `0x010000..0x046E9F` inclusive.
- Static checks: `git diff --check`, scope, ASCII paths, source/secret/build
  artifact checks, and byte-identical `AGENTS.md`/`CLAUDE.md` passed.

## Hardware boundary

No port scan, device identification, Flash read/write, flash, erase, monitor,
or HIL assertion was performed. A fresh explicit authorization is required
before writing this new app image to hardware.
