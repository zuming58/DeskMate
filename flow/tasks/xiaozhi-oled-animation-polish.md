# Xiaozhi OLED animation polish

## Objective

Polish the standalone Xiaozhi OLED state renderer without changing DeskMate
Link, enabling motion hardware, or touching the desktop and EasyInput products.

## Frozen input

- Base: `origin/codex/t10a-motion-safety-core@2e538d0c080aa9f908f6b374fce080b008ef11ae`.
- Agent-state display contract:
  `docs/contracts/t09-agent-state-display-v1.md`.
- Motion safety contract:
  `docs/contracts/t10-motion-safety-core-v1.md`.
- Product partition: `firmware/xiaozhi-yuntai/partitions/v1/16m.csv`.

## Required behavior

- idle uses two large eyes with a bounded, low-frequency natural blink;
- waiting is visually distinct from idle;
- listening, thinking, working, completed and error retain their frozen scenes;
- a single latest-wins display mailbox suppresses obsolete and repeated frames;
- EasyInput TTL expiry remains a new live idle transition, after which idle
  blinking resumes;
- display initialization or render failure disables DISPLAY without breaking
  DeskMate Link;
- T10A remains pure C++ and unreachable from production startup.

## Verification and stop

- run every Xiaozhi Host CTest target;
- build with exact ESP-IDF v5.5.3, target `esp32s3` and the fixed 16 MiB
  partition;
- audit source/license, secrets, ASCII paths, generated artifacts and local
  rules;
- do not scan ports, identify devices, read/write Flash, flash, monitor, drive
  OLED hardware, initialize audio, or start servo HIL;
- push `codex/xiaozhi-oled-animation-polish` and stop for cross-audit.
