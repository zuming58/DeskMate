# T08 Xiaozhi Link Phase B pinout audit

Status: `SOURCE_AND_PHOTO_REVIEWED / HARDWARE_PINOUT_BLOCKED / HARDWARE_NOT_AUTHORIZED`

## Reviewed evidence

- Frozen contract ancestor: `c8b8a344a72a849640c8b19575768d6daf4d6667`.
- Read-only reference root: `F:\Codex\xiaozhi-yuntai`; it still has no `.git`, so its exact Git commit remains `UNKNOWN`.
- Selected board source: `main/boards/esp32-s3n16r8-emoji/board_config.h`, SHA-256 `C654860BE8AABB0525B94D2E37C8D847F418662CA619F20AF944B9B9D762A573`.
- Board close-up: `docs/assets/xiaozhi-yuntai-materials/hardware-mainboard-closeup.png`, 2,934,768 bytes, SHA-256 `2534FD593E9748D902FB1B899890728E93EA043EDE0B7C6ABFD1E43250C5491A`.
- ESP-IDF source: `v5.5.3@2c211b236707889e8400c4dc5644dd5c4ee071e0`.

The close-up visibly labels three adjacent board pads `GND`, `TX` and `RX`. The selected application source assigns OLED to GPIO41/42, servos to GPIO11/12, buttons to GPIO0/40/39, microphone I2S to GPIO5/4/6, amplifier I2S to GPIO15/16/7 and LED to GPIO48; it does not assign GPIO43/44. ESP-IDF defines the ESP32-S3 default UART0 IOMUX as TX GPIO43 and RX GPIO44.

These facts establish a UART pad candidate and negative application occupancy. They do not establish the PCB net between the labeled pads and GPIO43/44. The bounded reference review found no selected-board schematic, KiCad/PCB net file, or powered-off continuity record. A generic ESP32-S3 default mapping cannot replace board-level evidence.

## Implementation consequence

- `firmware/xiaozhi-yuntai/main/board_link_pinout.h` stores `verified=false`, `tx_gpio=-1`, `rx_gpio=-1`.
- The only ESP-IDF UART owner contains the frozen 115200, 8N1, no-flow-control configuration and a 512-byte RX buffer, but `StartDeskMateLinkUart()` returns `kHardwarePinoutBlocked` before driver installation, pin configuration or task creation.
- Application console, secondary console, application logs and bootloader logs are disabled. No eFuse is written. ROM startup bytes remain possible and are covered by parser resynchronization tests.
- No GPIO43/44 production pin constant is asserted for Xiaozhi. No alternate GPIO or UART is inferred.

## Evidence required to unblock

One of the following must identify the exact board revision and prove both signal nets:

1. a trustworthy board schematic/PCB net showing labeled `TX` and `RX` pads to ESP32-S3 GPIOs; or
2. a documented powered-off continuity measurement from each labeled pad to a known module/dev-board GPIO point.

Before any wiring, the separate electrical gate still requires independent power, common-ground, idle voltage, no-short and recovery checks plus new user authorization. This audit performs no port scan, device identification, wiring, Flash access, flash, erase, monitor, OLED/audio initialization or servo movement.
