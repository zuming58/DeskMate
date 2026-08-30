# T09 three-end integration handoff

Status: `T09_THREE_END_INTEGRATED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED`

## Integrated baseline

- Integration branch: `codex/t09-three-end-integration`.
- T08 HIL baseline: `b38c8c21afa2b5b8164c084953faa28996b5ea65`.
- Xiaozhi OLED implementation: `d014af453dd95fab9ad6af24b25d54b6c3c8561e`.
- Integration merge: `86ca15c763351c7141d2337dad39f246ab41e21a`.
- Frozen contract: `docs/contracts/t09-agent-state-display-v1.md`.

The integration preserves the audited Desktop HID Feature `0x12` sender, the
EasyInput Agent-state bridge, the T08 DeskMate Link lifecycle and the Xiaozhi
OLED owner. Only documentation and progress conflicts were resolved; the
frozen HID and Link wire contracts were not rewritten.

## Code-gate evidence

- Desktop Node tests: `126/126` passed.
- EasyInput Host CTest: `9/9` passed.
- Xiaozhi Host CTest: `8/8` passed.
- Desktop native bridge, Vite production build and Windows unpacked package
  passed. A first packaging invocation overlapped a timed-out parent process;
  a clean independent output at `release/verify` completed successfully.
- EasyInput: ESP-IDF `v5.5.5`, target `esp32s3`, fixed 16 MiB partition build
  passed.
- Xiaozhi: ESP-IDF `v5.5.3`, target `esp32s3`, fixed product partition build
  passed. The local tools root is `C:\Espressif\tools`; no tool was installed
  or upgraded.

Build directories and binaries are ignored local evidence and are not product
source. Final app hashes and write ranges must be recalculated after the final
documentation commit because ESP-IDF embeds the Git project version.

## Runtime boundary

- Xiaozhi cold boot initializes the SSD1306 display and renders neutral idle
  eyes before DeskMate state traffic is required.
- The seven frozen states map to neutral, listening, thinking, focused,
  attention, happy and sad/error scenes.
- Duplicate states do not enqueue another render. Session reset clears pending
  state and returns to idle; stale state is not replayed.
- Display init or render failure disables only DISPLAY. CORE, AGENT_STATE and
  the UART Link remain available.
- No servo, PWM, LEDC, audio, I2S, Wi-Fi or cloud-dialog behavior is enabled by
  this package.

## Physical gate

No port scan, device identification, Flash/NVS read or write, erase, monitor,
eFuse, wiring change, OLED HIL, servo or audio operation was performed during
integration. Before flashing, both signal wires must be temporarily removed;
each board requires its own identity, recovery evidence, final app hash, exact
address and separately confirmed app-only authorization.

After both apps boot normally, reconnect GND and crossed TX/RX while leaving
3V3 open. Acceptance starts with Xiaozhi cold-boot idle eyes, then exercises
the seven real DeskMate states, latest-wins, Link restart/no-replay and the
deferred T03-T06 combined regression. T10 servo work remains closed until T09
is visibly accepted.
