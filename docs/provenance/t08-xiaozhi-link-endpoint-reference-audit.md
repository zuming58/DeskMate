# T08 Xiaozhi Link endpoint reference audit

Status: `REFERENCE_FILESET_PINNED / REFERENCE_GIT_COMMIT_UNKNOWN / SOURCE_ONLY / HARDWARE_NOT_AUTHORIZED`

## Scope and identity

- Read-only reference root: `F:\Codex\xiaozhi-yuntai`.
- The reference root has no `.git` directory. A Git commit, branch and clean/dirty status therefore cannot be recovered and remain `UNKNOWN`; project version `1.9.0` is not a substitute for a commit.
- Root license: MIT, copyright 2025 Shenzhen Xinzhi Future Technology Co., Ltd. and Project Contributors.
- DeskMate Phase A copies no reference source, binary, model, sound, font or image. It uses the reference only as behavioral and board-evidence input, then implements an original transport interface and locked data model.
- Toolchain evidence: reference `dependencies.lock` requires ESP-IDF `5.5.3`; the selected target in `sdkconfig` is `esp32s3` and board type is `ESP32_S3N16R8_EMOJI`.

## Pinned reference files

Because the source export has no Git identity, this exact evidence set is pinned by SHA-256:

| Reference path | SHA-256 | Use |
| --- | --- | --- |
| `LICENSE` | `0A5A839033BFE18FE75D32B50D9D028912CF876F69EF59C2791AEB2971335D05` | Root MIT terms |
| `CMakeLists.txt` | `CDB2F67476491E9A0510A72C684AD13B8EC966AC4A79CDB029E202A8D72976C6` | Project version |
| `dependencies.lock` | `BBC7172115F96E59F455719E2367C4A80F2600A444DD986321EC94F58476F99C` | ESP-IDF version |
| `sdkconfig` | `079B0D12771F7303D407A1ABF80C2FB444BF6F5DF287E86BD4DE88FBFA4B4896` | Target, board and console selection |
| `main/CMakeLists.txt` | `13BF7DB4FC12573A4A3EC5A4F56CBE30DF86A765B1C99A7692946E1ABC6A18CE` | Selected board source inclusion |
| `main/boards/esp32-s3n16r8-emoji/board_config.h` | `C654860BE8AABB0525B94D2E37C8D847F418662CA619F20AF944B9B9D762A573` | Current board GPIO declarations |
| `main/boards/esp32-s3n16r8-emoji/emoji_board.cc` | `D5047F3FCF7CFAE086E4D65F03AACE2E2421D6687238BB33848986589C76737C` | Current board initialization behavior |
| `docs/xiaozhi-yuntai-baseline-report.md` | `E45672F7BDB0AF82E16FF4D2D34EF0E60BC925F4AF838C94373E08E67887593E` | Existing software build evidence |
| `docs/xiaozhi-yuntai-hardware-safety-map.md` | `89E30FFABE277C26DED0FF7B6212546B4A860FD36AAA291AD02FAB9598E0C791` | Hardware safety evidence |
| `docs/xiaozhi-yuntai-interface-inventory.md` | `02691E76C20F2BAF449E466DB65C01E1325C53E56F6C0E4A56AE9AB4BD991043` | Existing interface inventory |
| `docs/xiaozhi-yuntai-technical-map.md` | `C156A86705DB10CE15860C3C5CA7EF9C662D2A57F88E1957C1DBD519C9F4D290` | Startup and integration map |

## UART and console evidence

1. The reference `sdkconfig` selects UART0 as the primary console at 115200 and enables ESP32-S3 USB Serial/JTAG as the secondary console. No local DeskMate parser exists.
2. ESP-IDF `v5.5.3@2c211b236707889e8400c4dc5644dd5c4ee071e0` defines the ESP32-S3 default UART0 IOMUX as U0TXD on GPIO43 and U0RXD on GPIO44. The reference current-board GPIO declarations do not assign GPIO43/44 to OLED, servos, buttons, audio or LED.
3. This is chipset/default-console and negative source-occupancy evidence only. Without a PCB schematic or continuity measurement, the physical `TX/RX` pads-to-GPIO43/44 connection remains `UNKNOWN`. No alternate free GPIO is inferred.
4. The DeskMate Phase A scaffold moves application logging to USB Serial/JTAG only and disables a UART console. Physical USB routing and recovery remain unverified; ROM startup output may still appear on the default UART0 pins before the application runs.
5. The DeskMate Link UART controller, RX/TX pins, speed and all protocol behavior remain unconfigured until an exact `DESKMATE_LINK_V1_FROZEN` commit is supplied and the board evidence gate is closed.

## Safety state and unknowns

- Microphone, amplifier and speaker: disabled by DeskMate V1 and never initialized by the scaffold.
- OLED: present in the reference but `pending_validation`; not initialized.
- Motion: `locked`; no servo, LEDC or PWM initialization.
- Link transport: `locked`; no hardware UART driver, pins or protocol values.
- The Phase A build uses ESP-IDF's default 1 MiB factory partition as a compile-only scaffold. It is not a final or flash-authorized partition contract.
- `UNKNOWN`: reference Git commit; physical pad-to-GPIO continuity; PCB revision/schematic; USB data routing and recovery behavior; voltage/common-ground measurements; selected Link UART peripheral and pins; startup-byte behavior at the physical header; Flash/PSRAM device confirmation; final Flash/OTA/recovery layout; servo supply/current/center/direction/limits.
