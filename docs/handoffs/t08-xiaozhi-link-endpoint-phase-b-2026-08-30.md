# T08 Xiaozhi Link endpoint Phase B handoff

Status: `T08_PHASE_B_PROTOCOL_READY / DESKMATE_LINK_V1_FROZEN / PARTITION_CONTRACT_RESTORED / HARDWARE_PINOUT_VERIFIED / TEST_CONFIRMED / BUILD_CONFIRMED / HARDWARE_NOT_AUTHORIZED`

## Baseline and contract ancestry

- Worktree: `F:\Codex\deskmate-t08-xiaozhi`.
- Branch: `codex/xiaozhi-t08-link-endpoint`.
- This blocker-closure package started exactly at `db52e883156b5a4a6e63c0954eb7e3073d3b8aae`.
- Frozen contract commit: `c8b8a344a72a849640c8b19575768d6daf4d6667`; it remains an ancestor and the frozen contract/golden vectors were not rewritten.
- Verified blocker-closure implementation commit: `7edf755b289b87e04c1b8a2cc78983b4ac4cf8e5`.
- Changes are limited to `firmware/xiaozhi-yuntai/` plus T08 Xiaozhi provenance, task, progress and handoff documents. EasyInput firmware, desktop software, T07 UI, VoiceWorkflow and T09 were not modified.

## Frozen protocol preservation

The audited Phase B implementation remains unchanged: strict `DMLK` encoding/stream parsing, CRC16-CCITT-FALSE, frozen framing/error semantics, `HELLO`, `GET_CAPABILITIES`, `GET_STATUS`, `SET_AGENT_STATE`, last-eight exact duplicate cache, conflicting-sequence rejection, boot epoch handling, bounded RX recovery and one UART owner. `SET_AGENT_STATE` still only changes RAM. DISPLAY, MOTION and AUDIO remain disabled; no OLED, servo, PWM/LEDC, microphone, amplifier, speaker or I2S initialization was added.

## Restored 16 MiB partition contract

- Source: read-only `F:\Codex\xiaozhi-yuntai\partitions\v1\16m.csv`, 329 bytes, SHA-256 `5F9FA5E46E092D5571D19DA7B8956F6F9BFD5B7F603799B24D8DFCE769E30C14`.
- Product copy: `firmware/xiaozhi-yuntai/partitions/v1/16m.csv`, byte-identical with the same SHA-256.
- Layout: NVS `0x9000/0x4000`, OTA data `0xD000/0x2000`, PHY `0xF000/0x1000`, model `0x10000/0xF0000`, OTA_0 `0x100000/0x600000`, OTA_1 `0x700000/0x600000`.
- `sdkconfig.defaults` selects the custom table, root CMake rejects a different table, and Host tests assert every row.
- The clean build's `app-flash_args` contains `0x100000 deskmate_xiaozhi_yuntai.bin`. The generated partition table binary is 3,072 bytes with SHA-256 `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0`.

Source, license and adoption details are in `docs/provenance/t08-xiaozhi-partition-contract-audit.md`. No build artifact was copied or committed.

## UART pinout and console conclusion

- The firmware reference still has no `.git`; exact reference commit remains `UNKNOWN`. Its root license is MIT and project version is `1.9.0`.
- The reference README identifies the public OSHWHub project. Its recommended Board1_2 revision has PCB connector H2 pad 1/2/3 on `GND/TX/RX`; the same revision's schematic connects `TX/RX` to module `TXD0/RXD0`.
- Espressif's ESP32-S3 definition maps U0TXD/U0RXD to GPIO43/GPIO44. This closes the board-level mapping as physical GND, TX GPIO43 and RX GPIO44.
- `board_link_pinout.h` now records `verified=true`, TX43 and RX44. A pure compile-time install plan rejects unverified, negative and same-pin configurations before any ESP-IDF driver call; Host tests prove both the blocked and verified paths.
- The only owner remains UART0 at 115200/8N1/no flow control with a 512-byte RX buffer and one write site. Application/secondary consoles, bootloader logs and application logs remain off. No eFuse is written; parser resynchronization still handles ROM startup bytes as noise.

Exact public-project IDs, response hashes and the board net table are in `docs/provenance/t08-xiaozhi-link-phase-b-pinout-audit.md`.

## Verification at implementation commit `7edf755b289b87e04c1b8a2cc78983b4ac4cf8e5`

- Host CTest: `7/7` passed: endpoint model, fake UART, frozen protocol/golden vectors, endpoint semantics, bounded UART owner, board pinout gate and production-source/partition safety contract.
- Toolchain: `ESP-IDF v5.5.3@2c211b236707889e8400c4dc5644dd5c4ee071e0`, target `esp32s3`, clean build in a newly absent build and SDKCONFIG path.
- Application address: `0x100000`.
- Application image: 171,424 bytes (`0x29DA0`), 2.72% of the 6 MiB OTA slot; 6,120,032 bytes (`0x5D6260`) remain.
- Application SHA-256: `C6FF9CCE3704EED980781C83FCE92B6BFDAC853935A59C07C8F042284856C6D9`.
- Partition table binary: 3,072 bytes (`0xC00`), SHA-256 `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0`.
- Config evidence: custom `partitions/v1/16m.csv`; bootloader log none; application log level none/max 0; primary and secondary console none.
- `git diff --check`, contract ancestry/immutability, ownership, mirrored AGENTS/CLAUDE, source/license, secret/privacy, ASCII paths and ignored build-output checks passed.

## Hardware operations and remaining gates

This package did not scan ports, identify devices, connect boards, perform continuity measurement, read/write/erase Flash, flash firmware, start monitor, write eFuse, initialize OLED/audio or drive a servo. It did not start T09 or two-board HIL.

The pinout and partition source blockers are closed in code, but hardware remains unauthorized. `UNKNOWN` or unverified items include the exact local reference Git commit, USB data/recovery behavior, actual Flash/PSRAM identity, independent-power/common-ground/idle-voltage/no-short evidence, physical-header ROM noise, and servo supply/peak current/center/direction/mechanical limits.

Stop after pushing this handoff. Any physical operation requires a new, explicit user authorization after a separate electrical/recovery review.
