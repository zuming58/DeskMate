# T08 Xiaozhi Link endpoint Phase B handoff

Status: `T08_PHASE_B_PROTOCOL_READY / DESKMATE_LINK_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / HARDWARE_PINOUT_BLOCKED / HARDWARE_NOT_AUTHORIZED`

## Baseline and contract ancestry

- Worktree: `F:\Codex\deskmate-t08-xiaozhi`.
- Branch: `codex/xiaozhi-t08-link-endpoint`.
- Required Phase B starting HEAD: `503315e96dc7fbb23a01a308c0164c5bfe767e25`.
- Frozen contract commit: `c8b8a344a72a849640c8b19575768d6daf4d6667`.
- Contract merge commit: `a6547c31027141fd35c49690ff39ec6d1cb5f0ac`.
- Phase B implementation commit: `915cd0a5c4aedc87a227564a4b09b3d478acf061`.
- `git merge-base --is-ancestor c8b8a344a72a849640c8b19575768d6daf4d6667 HEAD` returned `0`. The frozen `contracts/deskmate-link/v1.md` and shared `golden-vectors-v1.json` were consumed read-only and were not rewritten.
- Changes are limited to `firmware/xiaozhi-yuntai/` and T08 Xiaozhi provenance, task, progress and handoff documents. EasyInput firmware, desktop software, T07 UI, VoiceWorkflow and T09 were not modified.

## Delivered Phase B surface

- Exact `DMLK` frame encoding and streaming parsing, CRC16-CCITT-FALSE, 100 ms incomplete-candidate timeout, maximum 128-byte payload and 144-byte frame.
- Recovery across fragmentation, concatenated frames, startup noise, invalid framing fields, bad CRC, oversized length and UART RX overflow.
- `HELLO`, `GET_CAPABILITIES`, `GET_STATUS` and `SET_AGENT_STATE`, with one-byte semantic error responses.
- Last-eight exact request/response cache keyed by controller boot ID and sequence, byte-identical duplicate replay, conflicting sequence rejection, controller epoch invalidation and random non-zero Xiaozhi boot epoch.
- A pure C++ transport boundary, Host-only fake UART and one bounded UART owner. The ESP-IDF adapter is fixed to UART0, 115200 baud, 8N1, no flow control, a 512-byte RX driver buffer and one write site.
- `SET_AGENT_STATE` only changes RAM. T08 advertises only `LINK_CORE | AGENT_STATE`; DISPLAY, MOTION and AUDIO remain clear.

The project does not initialize or access OLED, servos, PWM/LEDC, microphone, amplifier, speaker or I2S. If the owner task cannot be created after a future authorized pinout unlock, the UART driver is immediately deleted so the startup path fails closed.

## UART pinout and console conclusion

- Read-only reference `F:\Codex\xiaozhi-yuntai` still has no `.git`; the exact reference commit remains `UNKNOWN`. Its root license is MIT and project version is `1.9.0`.
- The selected board source assigns OLED GPIO41/42, servos GPIO11/12, buttons GPIO0/40/39, microphone GPIO5/4/6, amplifier GPIO15/16/7 and LED GPIO48; it does not assign GPIO43/44.
- The reviewed board close-up visibly labels adjacent `GND`, `TX` and `RX` pads. ESP-IDF v5.5.3 defines ESP32-S3 UART0 default IOMUX TX GPIO43/RX GPIO44, but neither negative source occupancy nor the SoC default proves the PCB net from the labeled pads.
- No selected-board schematic, PCB net file or powered-off continuity record was found. `board_link_pinout.h` therefore remains `verified=false`, `tx_gpio=-1`, `rx_gpio=-1`; startup returns `HARDWARE_PINOUT_BLOCKED` before UART driver installation, GPIO configuration or owner task creation.
- Application console, secondary console, bootloader logs and application logs are disabled. No eFuse is written. Unavoidable ROM startup bytes are treated as noise and covered by parser resynchronization tests.

Detailed evidence and file hashes are in `docs/provenance/t08-xiaozhi-link-phase-b-pinout-audit.md`.

## Verification at the implementation commit

- Host CTest: `6/6` passed: endpoint model, fake UART, frozen protocol/golden vectors, endpoint semantics, bounded UART owner and production-source safety contract.
- Toolchain: `ESP-IDF v5.5.3@2c211b236707889e8400c4dc5644dd5c4ee071e0`, target `esp32s3`, clean single-thread build completed.
- Application image at `915cd0a5c4aedc87a227564a4b09b3d478acf061`: 150,432 bytes (`0x24BA0`).
- SHA-256: `F53334BF7AC7AE49D359C142D03F7236A25866B86FED8038E717F7265FAFA285`.
- Compile-only default factory partition: 1 MiB, `0xDB460` bytes (86%) free. It is not an approved final Flash/OTA/recovery layout and the image is not authorized for flashing.
- `git diff --check`, ownership, frozen-contract immutability, ASCII paths, mirrored AGENTS/CLAUDE rules, source/license, secret/privacy scan and ignored build-output checks passed.

## Hardware operations and remaining gates

This phase did not scan ports, identify devices, wire boards, read/write/erase Flash, flash firmware, start monitor, write eFuse, initialize OLED/audio or drive a servo. It did not perform T09 or two-board HIL.

`UNKNOWN` or blocked items remain: exact reference Git commit; selected PCB revision and pad-to-GPIO nets; USB data routing and recovery behavior; independent-power/common-ground/idle-voltage/no-short evidence; physical-header ROM noise; actual Flash/PSRAM devices and final Flash/OTA/recovery layout; servo supply, peak current, center, direction and mechanical limits.

Stop after pushing this handoff. The next action is evidence gathering for the exact Xiaozhi board pinout and a separately authorized electrical/recovery gate. Do not request wiring or flashing while `HARDWARE_PINOUT_BLOCKED` remains.
