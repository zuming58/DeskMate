# T08 Xiaozhi Link Phase B pinout audit

Status: `SCHEMATIC_AND_PCB_NET_VERIFIED / HARDWARE_PINOUT_VERIFIED / HARDWARE_NOT_AUTHORIZED`

## Evidence identity

- Frozen contract ancestor: `c8b8a344a72a849640c8b19575768d6daf4d6667`.
- Read-only firmware reference: `F:\Codex\xiaozhi-yuntai`; it has no `.git`, so its exact Git commit remains `UNKNOWN`. Its root license is MIT, license SHA-256 is `0A5A839033BFE18FE75D32B50D9D028912CF876F69EF59C2791AEB2971335D05`, and `PROJECT_VER` is `1.9.0`.
- The reference README identifies the public OSHWHub project `https://oshwhub.com/jorellee/xiao-zhi-ai-ji-qi-ren-deskemoji-da-ban` as the PCB source.
- Public project UUID: `a130cd350d2f49dfb70fdaee95bb357e`; project metadata API response SHA-256: `1AC983A85F7E9D5BC928E0949143EA3BCD2F5F7E4AC17AEC72EA4AA4369183DD`; published project license: GPL 3.0.
- Public branch UUID: `aba9000cd1e74c1f8f874e45d6df331e`; structure API response SHA-256: `526BCBF767B1BD9410584FA2714A6C059FF378085ADCB0DDD972785BC269D723`.
- Reviewed revision: `Board1_2`, which the public project page recommends after its 2026-06-01 update. Structure IDs: board `9478d5f95b739fe6`, schematic `f9d195c1e8ac2c6c`, schematic sheet `32876101338001a7`, PCB `70785c26ec82a7ad`.
- ESP-IDF evidence: `v5.5.3@2c211b236707889e8400c4dc5644dd5c4ee071e0`; Espressif's ESP32-S3 schematic checklist identifies U0TXD as GPIO43 and U0RXD as GPIO44.

The public EDA data was inspected read-only. No schematic, PCB, encrypted history, generated archive or other third-party design file was copied into the DeskMate repository.

## Board-level net conclusion

The Board1_2 PCB object identifies connector `H2` with three pads:

| Physical pad | PCB net | Schematic endpoint | ESP32-S3 GPIO |
| --- | --- | --- | ---: |
| H2 pad 1 | `GND` | board ground | GND |
| H2 pad 2 | `TX` | module `TXD0` / U0TXD | 43 |
| H2 pad 3 | `RX` | module `RXD0` / U0RXD | 44 |

This is board-level schematic and PCB network evidence for the exact `Board1_2` revision, not an inference from unused pins. It closes `HARDWARE_PINOUT_BLOCKED` for the production pin constants.

## Implementation consequence

- `firmware/xiaozhi-yuntai/main/board_link_pinout.h` stores `verified=true`, `tx_gpio=43`, `rx_gpio=44`.
- `PlanBoardLinkUartInstall()` fails closed for an unverified, negative or same-pin configuration. The ESP-IDF owner consumes only the returned verified plan.
- Host tests prove an unverified configuration cannot install UART even when 43/44 are supplied, and that the verified product configuration exposes exactly TX43/RX44.
- The only UART owner remains fixed at 115200, 8N1, no flow control and a 512-byte bounded RX buffer. Application console, secondary console, application logs and bootloader logs remain disabled; no eFuse is written. ROM startup bytes remain possible and are covered by parser resynchronization tests.

## Gates that remain closed

Pin identity is not electrical or recovery acceptance. Before any connection or flash operation, the exact physical unit still requires separately authorized evidence for independent power, common ground, idle voltage, absence of shorts and recovery behavior. USB data routing, actual Flash/PSRAM identity, physical-header ROM noise, servo supply/peak current/center/direction/limits and two-board HIL remain `UNKNOWN` or unverified.

This audit performed no port scan, device identification, wiring, continuity measurement, Flash read/write/erase, flash, monitor, OLED/audio initialization or servo movement.
