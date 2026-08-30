# T09 EasyInput agent-state reference audit

- Reference repository: `F:\Codex\easyinput-wzm\easy-input-maker`
- Fixed commit: `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- License: PolyForm Noncommercial 1.0.0; reference only, with product-side
  implementation and tests maintained in this repository.
- Relevant files:
  - `components/keyboard/include/keyboard/agent_status.h`
  - `host_test/agent_status_tests.cpp`
  - `main/platform/usb_hid.cpp`
  - `main/app_main.cpp`

Adopted behavior: report `0x12`, exact 16-byte v1 payload, little-endian fields,
idle TTL zero, bounded TTL, latest pending command and exact-repeat suppression.

DeskMate differences: adds strict reserved/flag validation, a v2 seven-state
mapping, short non-idle TTL, privacy-safe diagnostics, USB/Link epoch gates and
no-replay forwarding to the already frozen DeskMate Link `SET_AGENT_STATE`.
Maker LED rendering, BLE arbitration, audio and power behavior are not copied.
