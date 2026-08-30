# T09 EasyInput agent-state bridge handoff

## Exact state

- Branch: `codex/easyinput-t09-agent-state-bridge`.
- Contract commit: `5e2541fa082c1014948731fd91897d71ac509d5f`.
- Implementation commit after two-end cross-audit:
  `9c97edd557c9b2ad54b7b6338acc70793ce37522`.
- Xiaozhi reviewed HEAD: `d014af453dd95fab9ad6af24b25d54b6c3c8561e`.
- Status: `CROSS_AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED`.

## Delivered

- Strict HID Feature `0x12` v1/v2 decoding for both TinyUSB callback shapes.
- One-slot latest-state mailbox outside the USB callback.
- Seven-state normalization, exact duplicate suppression and bounded TTL.
- USB epoch, Link disconnect and peer-restart clearing with no replay.
- Forwarding through the existing Link v1 `SET_AGENT_STATE` only when CORE,
  AGENT_STATE and DISPLAY are enabled and MOTION/AUDIO remain disabled.
- Link remains connected when Xiaozhi reports a valid DISPLAY init/render
  failure; state forwarding remains blocked until DISPLAY is enabled again.
- Privacy-safe capability and diagnostic counters in the existing status
  response.

## Verification

- EasyInput Host CTest 9/9.
- ESP-IDF v5.5.5 / ESP32-S3 / fixed 16 MB partition build passed.
- App 318,576 bytes; SHA-256
  `DB152B01152C1D646B5F2B4D22CD827A0340ACC8CF7D3397A23118F57F831C5A`.
- Independent Xiaozhi final-HEAD verification: Host CTest 8/8; ESP-IDF
  v5.5.3 build passed; app 202,816 bytes, SHA-256
  `214793123280D53650C40633B46F65A0037EB23BDD16A3A5E50829030DB21D9A`.
- `npm ci --include=dev`, desktop tests 115/115 and
  `npm run build:desktop` passed.
- `git diff --check`, reference/license, privacy, ASCII path and ignored build
  artifact checks passed.

## Remaining gates

1. The two firmware candidates have passed cross-audit. Do not flash either
   candidate until the user gives a new exact app-only authority for that board.
2. Complete the two pending T08 manual checks: disconnect TX and RX separately,
   then run the T03-T06 combined regression.
3. Add the separate desktop main-process sender for report `0x12`; this EasyInput
   package intentionally did not modify the frozen T07 desktop baseline.
4. Only after both T09 apps and the desktop sender pass code gates may hardware
   acceptance exercise OLED state changes. Servo and audio remain forbidden.

No hardware access occurred in this package.
