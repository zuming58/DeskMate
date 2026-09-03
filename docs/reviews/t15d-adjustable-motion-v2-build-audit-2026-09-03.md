# T15D adjustable motion V2 build audit — 2026-09-03

## Scope

This audit covers implementation commit
`d6ffb595dd4ea20decdfe6f114c5ffe56838e83c` on
`codex/t15-t16-integration`. It records code/build evidence only. No application,
port, device, Flash, NVS, eFuse, OLED, PWM or servo command was used.

## Verification

- Desktop: full `npm test` passed `375/375`; `npm run build:desktop` passed;
  packaged native `DeskMate.InputBridge.exe --protocol-self-test` exited `0`.
- EasyInput: Host CTest passed `15/15`; exact ESP-IDF v5.5.5 build passed with
  embedded app version `d6ffb59` and the fixed 16 MiB partition layout.
- Xiaozhi: Host CTest passed `16/16`; exact ESP-IDF v5.5.3 build passed with
  embedded app version `d6ffb59` and the fixed app partition layout.
- Protocol golden vectors, malformed input, V1 rollback compatibility, per-axis
  bounds, speed stepping, center, stop, disconnect and emergency behavior are
  included in those suites.

## Desktop package

Package directory:
`release-t15d-adjustable-motion-v2-final/win-unpacked`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `DeskMate.exe` | 202690560 | `1A20305F55A3F17BAF80B0C5282B0A763CFB7EF1CCF9665911C154A24EC2377C` |
| `resources/app.asar` | 113001720 | `DB9211003E76DAC9F85AA27087038744A3538420470D4B14365E608949866094` |
| `resources/input-bridge/DeskMate.InputBridge.exe` | 153521033 | `4C57F86F8597AB219BF6398318AC98F9BA3B9C6289D58BCA47F62D9A73FC4027` |

## EasyInput app-only candidate

- Build directory: `build-t15d-adjustable-motion-v2-final`.
- Image: `deskmate_easyinput_controller.bin`.
- Address: `0x010000`.
- Size: 876528 bytes (`0xD5FF0`).
- Inclusive image range: `0x010000..0x0E5FEF`.
- Touched erase-sector range: `0x010000..0x0E5FFF`.
- Image SHA-256:
  `AC31B817AC3E2553D9D62A15FE3910ADE6FC3FCDB3C1E170301B90D4D9656097`.
- Partition SHA-256:
  `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`.
- `app-flash_args` contains only
  `0x10000 deskmate_easyinput_controller.bin`.
- The generated release manifest identifies clean implementation HEAD
  `d6ffb595dd4ea20decdfe6f114c5ffe56838e83c` and ESP-IDF v5.5.5.

## Xiaozhi app-only candidate

- Build directory: `build-t15d-adjustable-motion-v2-xiaozhi-candidate`.
- Image: `deskmate_xiaozhi_yuntai.bin`.
- Address: `0x100000`.
- Size: 223568 bytes (`0x36950`).
- Inclusive image range: `0x100000..0x13694F`.
- Touched erase-sector range: `0x100000..0x136FFF`.
- Image SHA-256:
  `61193549A98B988C0B9E026A3E7D7F329312C9C4EAE9FD8190171CE0FBF8EF43`.
- Partition SHA-256:
  `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0`.
- `app-flash_args` contains only
  `0x100000 deskmate_xiaozhi_yuntai.bin`.

A separate clean build directory reached the unmodified ESP-IDF `esp_lcd`
component but GCC 14.2.0 repeatedly ended in an internal compiler error. The
recorded candidate instead uses the already completed identical-source build
directory; at clean implementation HEAD it was reconfigured with
`PROJECT_VER=d6ffb59`, rebuilt the application descriptor, relinked, regenerated
the image and passed ESP-IDF size checks. The compiler crash is not presented as
a product-source diagnostic or as a passed clean-directory build.

## Remaining gate

Both images require fresh, separate, exact-image authorization before app-only
write. After both writes, physical acceptance compares Yaw/Pitch minimum and
maximum angles, independent minimum/maximum speeds, the built-in dance, an
explicitly activated saved dance, stop/center and emergency-stop recovery.
