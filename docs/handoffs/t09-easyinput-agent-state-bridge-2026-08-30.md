# T09 EasyInput agent-state bridge handoff

## Exact state

- Branch: `codex/easyinput-t09-agent-state-bridge`.
- Contract commit: `5e2541fa082c1014948731fd91897d71ac509d5f`.
- Implementation commit: `e50bc75e974695c1a79cd887e88836222296565e`.
- Status: `CODE_REVIEW_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED`.

## Delivered

- Strict HID Feature `0x12` v1/v2 decoding for both TinyUSB callback shapes.
- One-slot latest-state mailbox outside the USB callback.
- Seven-state normalization, exact duplicate suppression and bounded TTL.
- USB epoch, Link disconnect and peer-restart clearing with no replay.
- Forwarding through the existing Link v1 `SET_AGENT_STATE` only when CORE,
  AGENT_STATE and DISPLAY are enabled and MOTION/AUDIO remain disabled.
- Privacy-safe capability and diagnostic counters in the existing status
  response.

## Verification

- EasyInput Host CTest 9/9.
- ESP-IDF v5.5.5 / ESP32-S3 / fixed 16 MB partition build passed.
- App 318,576 bytes; SHA-256
  `013A7697AF498C4072DB4996AF095F7412F6C4778AD73C627BA96261E778954D`.
- `npm ci --include=dev`, desktop tests 115/115 and
  `npm run build:desktop` passed.
- `git diff --check`, reference/license, privacy, ASCII path and ignored build
  artifact checks passed.

## Remaining gates

1. Do not flash this candidate until the Xiaozhi T09 display branch is reviewed
   against the same contract and the user gives a new exact app-only authority.
2. Complete the two pending T08 manual checks: disconnect TX and RX separately,
   then run the T03-T06 combined regression.
3. Add the separate desktop main-process sender for report `0x12`; this EasyInput
   package intentionally did not modify the frozen T07 desktop baseline.
4. Only after both T09 apps and the desktop sender pass code gates may hardware
   acceptance exercise OLED state changes. Servo and audio remain forbidden.

No hardware access occurred in this package.
