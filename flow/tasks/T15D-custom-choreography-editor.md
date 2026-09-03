# T15D custom choreography editor

Status: `V2_THREE_END_CODE_BUILD_CONFIRMED / DUAL_FIRMWARE_FLASH_AUTHORIZATION_PENDING / HIL_PENDING`

## Goal

Turn the motion page into a playful, truthful beat editor: two simultaneous
motion rows plus one synchronized expression row, backed by a bounded Xiaozhi
local program instead of Windows timing or manual calibration replay.

## Work split

- Windows: editor, local persistence, explicit active-dance selection, bounded
  per-axis angle/speed settings, strict HID codec, real status-first execution,
  software preview, tests and package.
- EasyInput: strict `0x1A/0x1B` host validation and one-request `0x24/0x25`
  forwarding. It never creates trajectories.
- Xiaozhi: local beat scheduler, independent amplitude/speed mapping, display lease,
  shared motion coordinator, center, disconnect and emergency boundaries.

## Gates

- The fixed T15 presets have completed user-present physical acceptance. The
  additive T15D Host and Link slices are now frozen and implemented.
- Do not present software preview as Xiaozhi execution.
- Do not flash either board without a new exact-image audit and explicit per-board
  authorization.

## Current delivery

- Host: `EASYINPUT_CHOREOGRAPHY_HOST_V2_FROZEN`, Feature/Input `0x1A/0x1B` on
  `FF00:0009`; the same IDs now carry four bounded numeric settings.
- Link: `T15D_CHOREOGRAPHY_LINK_V2_FROZEN`, run/status `0x26/0x27`.
- Windows quick actions and explicit voice actions use the same choreography
  transport. If a saved action is marked as the default dance, “跳舞” runs it;
  otherwise the built-in dance is used.
- Settings exposes Yaw amplitude `4..40°`, Pitch amplitude `4..20°` and separate
  Yaw/Pitch speed caps `20..100°/s`. Xiaozhi clamps them again to the original
  board range and accepted Stage 2 pulse envelope. PWM, pulse width and GPIO
  stay unavailable.
- The selector always includes the visible built-in dance. A saved action is not
  used by quick/voice “跳舞” until the user explicitly activates it; its saved
  repeat count then replaces the quick-action repeat selector.
- V2 desktop, both Host suites and exact ESP-IDF rebuilds pass; both app-only
  images and fixed partition hashes are audited. Per-board flash authorization
  and physical acceptance remain open.

Detailed product design: `docs/design/t15d-adjustable-motion-v2.md`.
