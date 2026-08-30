# T09 Xiaozhi agent display reference audit

Date: 2026-08-30

## Reference identity and license

- Read-only reference root: `F:\Codex\xiaozhi-yuntai`.
- The reference directory does not contain Git metadata. Its exact Git commit is
  therefore `UNKNOWN`; this record does not infer a commit from build output or
  another checkout.
- The reference top-level CMake project declares version `1.9.0`.
- License: MIT, copyright 2025 Shenzhen Xinzhi Future Technology Co., Ltd. and
  project contributors.
- License SHA-256:
  `0A5A839033BFE18FE75D32B50D9D028912CF876F69EF59C2791AEB2971335D05`.

Pinned reference files:

| Reference path | SHA-256 |
| --- | --- |
| `CMakeLists.txt` | `CDB2F67476491E9A0510A72C684AD13B8EC966AC4A79CDB029E202A8D72976C6` |
| `dependencies.lock` | `BBC7172115F96E59F455719E2367C4A80F2600A444DD986321EC94F58476F99C` |
| `sdkconfig` | `079B0D12771F7303D407A1ABF80C2FB444BF6F5DF287E86BD4DE88FBFA4B4896` |
| `main/boards/esp32-s3n16r8-emoji/board_config.h` | `C654860BE8AABB0525B94D2E37C8D847F418662CA619F20AF944B9B9D762A573` |
| `main/boards/esp32-s3n16r8-emoji/emoji_board.cc` | `D5047F3FCF7CFAE086E4D65F03AACE2E2421D6687238BB33848986589C76737C` |
| `main/boards/esp32-s3n16r8-emoji/emoji_controller.h` | `49A71D9E17FB50F3BA7DDDF1EA915470C5D04C48DCBB05D62DB7709C9B3F629D` |
| `main/boards/esp32-s3n16r8-emoji/emoji_controller.cc` | `3E347439A56BE060929116AC857ADF75CC99ECC832F40ABD850E2FD8B472AA41` |
| `main/boards/esp32-s3n16r8-emoji/emotion_response_controller.h` | `97B191B76FB5ED45187A96DC42678EC820F079AC1129E77DC9FB581AADED402F` |
| `main/boards/esp32-s3n16r8-emoji/emotion_response_controller.cc` | `862901B13AA68694B69E2BDC87A74BF72E2408A2EC8C2EAD8F9CD00A74B5F22A` |
| `main/display/oled_display.h` | `F8EFEC3CEA79A4CFD9BFF501BCCA6CA286DD75DC4FE35F3018B6FDB63F7C3F45` |
| `main/display/oled_display.cc` | `CA90F199F135A8987EB469B1C02A49400F7C660D834136A1B8BB939757A8D6AA` |

## Adopted evidence and behavior

- Board mapping: SSD1306, 128 x 64, I2C controller 0, SDA GPIO41, SCL
  GPIO42, address `0x3c`, 400 kHz, internal pull-ups, and X/Y mirroring.
- Visual proportions: two 40 x 40 reference eyes separated by 10 pixels.
- Behavioral concepts: a single queued display executor, neutral/listening/
  thinking/focused/attention/happy/sad shapes, and serialized display access.
- The reference contains no OLED/emoji Host test suite. Its build artifacts and
  unrelated component tests are not accepted as DeskMate verification.

## Product-side differences

- No reference source file, binary, image, font, model, sound, or build artifact
  is copied into DeskMate. T09 uses new procedural one-bit drawing code.
- DeskMate does not import LVGL, the reference animation engine, cloud response
  parsing, buttons, audio, servos, random idle animation, or motion coupling.
- Frozen DeskMate state mapping is deterministic. `angry` can be rendered only
  as an explicit internal scene and is never selected by the seven-state map.
- `working` uses `focused`; renderers without that scene explicitly fall back to
  `neutral`.
- The Link task only submits bounded commands. A single display owner initializes
  and writes the OLED. Initialization or render failure removes DISPLAY from the
  enabled capability mask without disabling DeskMate Link.

## DeskMate target files

- `firmware/xiaozhi-yuntai/components/endpoint_core/include/display_owner.h`
- `firmware/xiaozhi-yuntai/components/endpoint_core/src/display_owner.cpp`
- `firmware/xiaozhi-yuntai/main/deskmate_oled.h`
- `firmware/xiaozhi-yuntai/main/deskmate_oled.cpp`
- `firmware/xiaozhi-yuntai/host_test/display_owner_tests.cpp`
