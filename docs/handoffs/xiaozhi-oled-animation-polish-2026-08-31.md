# Xiaozhi OLED animation polish handoff

Date: 2026-08-31

Branch: `codex/xiaozhi-oled-animation-polish`

Base: `2e538d0c080aa9f908f6b374fce080b008ef11ae`

## Delivered

- Natural idle blink with a 3.6–6.4 second bounded pseudo-random interval and
  120 ms closed-eye frame.
- A waiting scene with tall attention eyes and a three-dot waiting marker.
- A one-entry latest-wins display mailbox. Repeated states ACK without a new
  frame; a new state preempts an in-progress idle blink.
- EasyInput still owns TTL and sends a new live idle transition. Xiaozhi does
  not add a TTL field or alter frozen Link framing.
- OLED failure disables DISPLAY while HELLO, capabilities and status remain
  usable on DeskMate Link.
- T10A motion safety source remains unchanged, has no production call site and
  has no PWM, GPIO11/GPIO12, LEDC or servo adapter.

## Verification

- Xiaozhi Host CTest: 9/9 passed.
- Exact ESP-IDF v5.5.3 at
  `2c211b236707889e8400c4dc5644dd5c4ee071e0`, target `esp32s3`, fixed 16 MiB
  partition build passed.
- Pre-handoff code-gate app: 203,296 bytes (`0x31A20`) at `0x100000`, SHA-256
  `B4E0F76B962BCE511EE64C1E5DFF046AE22D9D76C514EFA9370902038AB65FF8`.
- Generated partition table: 3,072 bytes, SHA-256
  `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0`.
- The receiving window must rebuild the pushed final HEAD because the embedded
  Git version changes when this handoff is committed.

## Safety and next action

No port was scanned, no device was identified, and no Flash/NVS/eFuse was read
or written. No flash, erase, monitor, real OLED operation, audio initialization,
PWM, GPIO11/GPIO12, servo driver or mechanical action occurred. Stop for the
main window's code and build audit; do not start servo HIL.
