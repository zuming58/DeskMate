# T05 startup-stack rework handoff

## Scope

- Branch: codex/easyinput-t05-config-nvs.
- Feature scope remains CONFIG_V1_FROZEN; T06 is blocked and main was not merged or rebased.
- Fixed Maker reference remains F:/Codex/easyinput-wzm/easy-input-maker at 7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01, PolyForm Noncommercial 1.0.0. Both reference trees remained read-only.

## Root cause

Image 1cf3a4e rebooted during first NVS load. The backtrace reached nvs_get_u8 -> ConfigNvsStore::load() -> app_main(). Compiled stack frames exceeded the fixed task budgets: load about 10.4 KiB, save_config_transaction about 4.2 KiB, config_owner_task about 6.3 KiB and input_owner_task about 6.7 KiB; the main task is about 3.5 KiB and owner tasks are 4 KiB.

## Rework

- Moved bounded NVS records, load result, legacy JSON and transaction workspace to the sole ConfigNvsStore static storage.
- Changed load and slot selection to write through stable references, avoiding large return temporaries.
- Reused static owner buffers for configuration command/result/document state and removed implicit large aggregate temporaries.
- Kept T03 input/USB recovery, T04 LED/shared-power ownership, USB contracts, dual-slot NVS semantics and fail-soft behavior unchanged.

## Verification

- Host CTest: 6/6 under Visual Studio 2022/MSVC 19.44.
- Desktop: npm test 73/73; npm run build:desktop passed.
- Clean code HEAD 1da73b2: exact ESP-IDF v5.5.5, esp32s3, MINIMAL_BUILD, fixed 16 MB partitions; app 325296 bytes. ELF stack frames: app_main 224, ConfigNvsStore::load 112, save_config_transaction 96, config_owner_task 96, input_owner_task 432 bytes.
- This handoff update changes the embedded app version. Rebuild from the resulting final clean HEAD, then report its app SHA-256 and exact app-only end address outside Git so the release image is not invalidated by another metadata commit.

## Safety and next step

The old image and old burn authorization are invalid. Do not burn an earlier candidate. After pushing the final clean HEAD and rebuilding it, present the new full commit hash, app SHA-256, size and 0x010000..end range for a fresh explicit authorization. No port scan, device identification, Flash/NVS read or write, erase, flash, monitor or HIL has been performed.
