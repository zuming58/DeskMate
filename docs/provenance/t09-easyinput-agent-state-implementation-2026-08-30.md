# T09 EasyInput agent-state implementation provenance

- Product implementation commit after two-end cross-audit:
  `9c97edd557c9b2ad54b7b6338acc70793ce37522`.
- Frozen contract commit: `5e2541fa082c1014948731fd91897d71ac509d5f`.
- Reference: `F:\Codex\easyinput-wzm\easy-input-maker` at
  `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`.
- Reference license: PolyForm Noncommercial 1.0.0; no reference source file was
  copied into the product implementation.

The implementation recreates the documented report `0x12` behavior as a pure
C++ codec and state bridge. DeskMate additions are strict v2 validation,
capability and epoch gates, a single-slot latest-state mailbox, bounded TTL,
disconnect/restart no-replay semantics and privacy-safe counters. It reuses the
already frozen DeskMate Link frame and `SET_AGENT_STATE`; it does not change
framing, GPIO ownership, partitions, desktop UI, Xiaozhi firmware, OLED, servo,
audio, BLE, Wi-Fi or NVS behavior.

The final cross-audit aligns dynamic DISPLAY degradation with the Xiaozhi
endpoint: CORE+AGENT_STATE keep Link established, while actual state delivery
continues to require DISPLAY. No shared contract or wire byte was changed.

Verification at the implementation commit:

- EasyInput Host CTest: 9/9 passed.
- ESP-IDF v5.5.5, target `esp32s3`, fixed 16 MB layout: passed.
- App: 318,576 bytes (`0x4DC70`).
- App SHA-256: `DB152B01152C1D646B5F2B4D22CD827A0340ACC8CF7D3397A23118F57F831C5A`.
- Partition table SHA-256:
  `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`.
- Desktop tests: 115/115 passed; native bridge Release and desktop directory
  package passed.

No port scan, device identification, Flash/NVS read or write, erase, flash,
monitor, eFuse, wiring, OLED, servo or audio operation was performed.
