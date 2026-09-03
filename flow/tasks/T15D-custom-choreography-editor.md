# T15D custom choreography editor

Status: `THREE_END_CODE_BUILD_CONFIRMED / DUAL_FIRMWARE_FLASH_AUTHORIZATION_PENDING / HIL_PENDING`

## Goal

Turn the motion page into a playful, truthful beat editor: two simultaneous
motion rows plus one synchronized expression row, backed by a bounded Xiaozhi
local program instead of Windows timing or manual calibration replay.

## Work split

- Windows: editor, local persistence, default-dance selection, global bounded
  strength/tempo profiles, strict HID codec, real status-first execution,
  software preview, tests and package.
- EasyInput: strict `0x1A/0x1B` host validation and one-request `0x24/0x25`
  forwarding. It never creates trajectories.
- Xiaozhi: local beat scheduler, strength/tempo profile mapping, display lease,
  shared motion coordinator, center, disconnect and emergency boundaries.

## Gates

- The fixed T15 presets have completed user-present physical acceptance. The
  additive T15D Host and Link slices are now frozen and implemented.
- Do not present software preview as Xiaozhi execution.
- Do not flash either board without a new exact-image audit and explicit per-board
  authorization.

## Current delivery

- Host: `EASYINPUT_CHOREOGRAPHY_HOST_V1_FROZEN`, Feature/Input `0x1A/0x1B` on
  `FF00:0009`.
- Link: `T15D_CHOREOGRAPHY_LINK_V1_FROZEN`, run/status `0x24/0x25`.
- Windows quick actions and explicit voice actions use the same choreography
  transport. If a saved action is marked as the default dance, “跳舞” runs it;
  otherwise the built-in dance is used.
- Settings exposes only `柔和/标准/明显` and `舒缓/标准/利落`. Raw angle,
  arbitrary speed, PWM, pulse width and GPIO stay unavailable.
- Code, host tests and exact ESP-IDF builds pass. No image from this slice has
  been flashed; physical choreography and setting-profile acceptance remain open.

Detailed product design: `docs/design/t15d-choreography-editor-v1.md`.
