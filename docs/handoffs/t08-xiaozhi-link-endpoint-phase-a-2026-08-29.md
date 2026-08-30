# T08 Xiaozhi Link endpoint Phase A handoff

Status: `PHASE_A_COMPLETE / DESKMATE_LINK_V1_NOT_FROZEN / HARDWARE_NOT_AUTHORIZED`

## Baseline and ownership

- Worktree: `F:\Codex\deskmate-t08-xiaozhi`.
- Branch: `codex/xiaozhi-t08-link-endpoint`.
- Starting HEAD: `93a5f9c6f72c9eb5a02917d062bfff38da0c4258`.
- Phase A implementation commit: `bfa1f46554a97636241d3a5f15c4d23e9391e05f`.
- Formal main baseline observed before work: `origin/main@3e2a046f49260ead422da4c295c3321de13dca5d`.
- Changes are limited to `firmware/xiaozhi-yuntai/`, this task's provenance/handoff documents and the root progress pointer. EasyInput firmware, desktop software and Link contracts were not modified.

## Delivered Phase A surface

- Exact toolchain contract: ESP-IDF `v5.5.3`, target `esp32s3`.
- Pure C++ transport abstraction with a host-only fake UART.
- Read-only capability/status model with Link and motion locked, display pending validation, and local microphone/amplifier/speaker disabled by product.
- Application logs routed to USB Serial/JTAG only; hardware UART console and secondary console are disabled in the scaffold.
- No real UART controller, pins, speed, framing, magic, version, message ID, CRC, timeout, retry or error semantics.
- No OLED, audio, servo, LEDC or PWM initialization.

## Reference and console conclusion

- Read-only reference: `F:\Codex\xiaozhi-yuntai`.
- The reference export has no `.git`, so its Git commit is `UNKNOWN`; its root license is MIT and project version is `1.9.0`.
- The reference uses UART0 as its 115200 primary console and USB Serial/JTAG as its secondary console.
- ESP-IDF v5.5.3 defines ESP32-S3 default UART0 IOMUX as TX GPIO43 and RX GPIO44, and the selected board source does not assign those GPIOs elsewhere. This does not prove physical header continuity.
- Phase A moves application logging away from UART0, but ROM startup output at UART0 and physical USB routing/recovery remain unverified.

## Verification

- Host tests: `3/3` passed (`endpoint_model_tests`, `fake_uart_tests`, `scaffold_source_contract_tests`).
- ESP-IDF build: `530/530` Ninja steps passed with `ESP-IDF v5.5.3`, target `esp32s3`.
- Application image: `firmware/xiaozhi-yuntai/build/deskmate_xiaozhi_yuntai.bin`.
- Image size: `160,768` bytes (`0x27400`).
- Image SHA-256: `E553C1B18D37320B3B5606F3552B1637835F46B39D598EA0D686DA4A5187EAE1`.
- Compile-only default factory partition: 1 MiB, approximately 85% free. It is not a final or flash-authorized layout.
- `git diff --check`, ownership, ASCII-path and mirrored module-instruction checks passed.

No device was identified; no port was scanned; no Flash was read, written or erased; no firmware was flashed; no monitor was opened; no wiring or peripheral initialization was performed.

## Remaining UNKNOWN and stop gate

- Exact reference Git commit.
- PCB revision/schematic and header-to-GPIO43/44 continuity.
- USB data routing and recovery behavior.
- Voltage/common-ground measurements.
- Selected Link UART peripheral, RX/TX pins and startup bytes at the physical header.
- Flash/PSRAM device confirmation and final Flash/OTA/recovery layout.
- Servo supply, peak current, center, direction and mechanical limits.

Stop after this handoff. Phase B may begin only after the EasyInput owner supplies the exact commit that explicitly marks `DESKMATE_LINK_V1_FROZEN`; consume that contract without modifying it.
