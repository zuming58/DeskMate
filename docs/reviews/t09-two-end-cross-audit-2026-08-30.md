# T09 EasyInput and Xiaozhi cross-audit

Date: 2026-08-30

Status: `CROSS_AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED`

## Exact candidates

- EasyInput branch: `codex/easyinput-t09-agent-state-bridge`.
- EasyInput implementation commit after cross-audit fix:
  `9c97edd557c9b2ad54b7b6338acc70793ce37522`.
- Xiaozhi branch: `codex/xiaozhi-t09-agent-display`.
- Xiaozhi final reviewed HEAD:
  `d014af453dd95fab9ad6af24b25d54b6c3c8561e`.
- Both candidates consume the unchanged
  `T09_AGENT_STATE_DISPLAY_V1_FROZEN` contract and the unchanged DeskMate Link
  v1 framing/golden vectors.

## Cross-end finding and direct fix

The Xiaozhi implementation correctly keeps Link operational when OLED
initialization or rendering fails: DISPLAY is removed from the enabled
capability mask and status bit 1/bit 7 reports display enabled/fault.

The first EasyInput candidate incorrectly required DISPLAY during the Link
capability handshake and accepted only the earlier T08 status bits. That would
have disconnected the whole Link after a valid OLED failure and rejected a
healthy Xiaozhi status with the display-enabled bit set.

Commit `9c97edd557c9b2ad54b7b6338acc70793ce37522` fixes this without changing the
frozen protocol:

- Link establishment continues to require only CORE and AGENT_STATE.
- T09 status validation accepts the frozen display-enabled bit.
- Forwarding `SET_AGENT_STATE` still requires CORE, AGENT_STATE and DISPLAY.
- A display fault keeps Link connected but blocks new display state delivery.
- MOTION and AUDIO remain forbidden.

A Host regression covers implemented capabilities `0x07`, enabled capabilities
`0x03`, display fault status `0x81`, retained Link connectivity and blocked
state forwarding.

## Independent verification

EasyInput:

- Host CTest: 9/9 passed.
- ESP-IDF v5.5.5, target `esp32s3`, fixed 16 MiB layout: passed.
- App: 318,576 bytes (`0x4DC70`).
- App SHA-256:
  `DB152B01152C1D646B5F2B4D22CD827A0340ACC8CF7D3397A23118F57F831C5A`.
- Partition table SHA-256:
  `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`.

Xiaozhi, rebuilt in the detached audit worktree at its final pushed HEAD:

- Host CTest: 8/8 passed.
- ESP-IDF v5.5.3, target `esp32s3`, sourced 16 MiB layout: passed.
- App: 202,816 bytes (`0x31840`), application offset `0x100000`.
- App SHA-256:
  `214793123280D53650C40633B46F65A0037EB23BDD16A3A5E50829030DB21D9A`.
- Partition table SHA-256:
  `4D122CA60C7321C2C4CB393D3B612908263C2C860E92FDD43036EDBFD1C762E0`.

The frozen T09 contract, DeskMate Link v1 contract and golden-vector blobs are
byte-identical across both branches. Xiaozhi keeps one OLED owner, advertises
DISPLAY dynamically, ACKs only accepted/duplicate commands, clears stale work
on disconnect or controller boot-epoch changes, and does not initialize servo,
audio, I2S, LEDC or PWM.

## Remaining gates

- No port scan, device identification, Flash/NVS access, erase, flash, monitor,
  OLED HIL, servo or audio operation was performed during this audit.
- T08 still needs the two manual single-wire disconnect checks and the T03-T06
  combined regression.
- T09 still needs a separate desktop main-process sender for HID report `0x12`.
- After that sender passes code gates, both exact app candidates require new,
  separate app-only flash authorizations before OLED hardware acceptance.
