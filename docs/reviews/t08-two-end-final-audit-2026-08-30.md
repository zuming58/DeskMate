# T08 two-end final code audit

Status: `CONTRACT_MATCHED / TEST_CONFIRMED / BUILD_CONFIRMED / HARDWARE_NOT_AUTHORIZED`

## Audited heads

- Frozen DeskMate Link v1: `c8b8a344a72a849640c8b19575768d6daf4d6667`.
- EasyInput controller input head: `0a0c3efce140b38e8fa1e7ed020b51c9f4eb7cfa`.
- EasyInput final hardening implementation: `defaea8361cbd4f63e52c281cd1fd7a7cca6f19d`.
- Xiaozhi endpoint final head: `132117e8cf8aeae07319cc647d2634326ec14637`.
- Xiaozhi verified firmware implementation: `7edf755b289b87e04c1b8a2cc78983b4ac4cf8e5`.

Both branches retain the frozen contract as an ancestor. `v1.md`, `README.md` and `golden-vectors-v1.json` are byte-identical across both worktrees and unchanged after the frozen commit.

## Findings and resolution

The Xiaozhi endpoint has one UART0 owner, TX GPIO43/RX GPIO44, 115200 8N1, a bounded 512-byte RX buffer, strict parser recovery, exact duplicate cache and boot-epoch handling. Its T08 capability and status model keeps DISPLAY, MOTION and AUDIO clear, and the production entry does not initialize OLED, servo, PWM/LEDC, microphone, speaker, amplifier or I2S.

The EasyInput controller originally required LINK_CORE and AGENT_STATE but did not reject peer DISPLAY/MOTION/AUDIO capability or ready bits. The frozen T08 contract explicitly requires those future slices to remain clear. `defaea8361cbd4f63e52c281cd1fd7a7cca6f19d` now fails those responses closed and adds Host regression vectors. A UART short write remains a bounded transport failure: it increments the drop counter and the same request is retried by the existing 250 ms / three-attempt lifecycle; partial bytes are covered by parser resynchronization and do not create an unbounded replay path.

## Verification

- EasyInput Host CTest: 8/8.
- EasyInput ESP-IDF v5.5.5 / esp32s3 / fixed 16 MB partition build: passed.
- EasyInput app: 316,672 bytes (`0x4D500`), SHA-256 `76669AEBF214434532D25743E5B2A6BE6C291AA596466CBFA304BF17CD294987`.
- Xiaozhi Host CTest: 7/7 independently rebuilt during audit.
- Xiaozhi existing clean ESP-IDF v5.5.3 evidence: app address `0x100000`, 171,424 bytes, SHA-256 `C6FF9CCE3704EED980781C83FCE92B6BFDAC853935A59C07C8F042284856C6D9`; partition SHA-256 `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0`.
- `git diff --check`, contract ancestry and worktree cleanliness checks passed before documentation updates.

## Remaining hardware gates

This audit performed no port scan, device identification, Flash/NVS access, flash, erase, monitor, eFuse write, wiring or peripheral action. Each board still needs its own exact identity/recovery/flash authorization. After both images start and their prior single-board functions regress successfully, the first connection uses independent USB power and only crossed TX/RX plus common GND; 3V3 remains disconnected. The first HIL is read-only HELLO, capabilities and status, with OLED, servo and Xiaozhi audio still disabled.
