# T04 EasyInput input LED feedback provenance

All T04 product code is a clean reimplementation against the frozen DeskMate
contract. No source file, generated dependency, binary or build output was
copied from either external reference checkout.

- Fixed Maker reference: `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- Maker license: PolyForm Noncommercial 1.0.0
- ESP-IDF v5.5.5 GPIO/RMT APIs: Apache-2.0

| Product target | Fixed source reviewed | Adoption, change and destination |
| --- | --- | --- |
| `components/input_core/include/board_pins.h` | Maker `components/keyboard/include/keyboard/board_pins.h` | Adopted only the V2 board facts GPIO8 shared power, GPIO12 WS2812 data, five pixels, shared command GPIO9/10/12/13/14/15 and floating GPIO11. Existing T03 input/USB pins are unchanged. |
| `components/input_core/include/led_feedback.h`, `components/input_core/src/led_feedback.cpp` | Maker `components/keyboard/include/keyboard/input_feedback.h`, `components/keyboard/src/input_feedback.cpp` | Clean platform-independent representation of the frozen eight colors, 140/35 ms ripple, 160/40 ms directional flow, 300/60 ms confirm pulse, GRB serialization, latest-event mailbox and saturating diagnostics. Maker application, Boot, BLE, Agent, configuration and audio states are excluded. |
| `main/peripheral_power.h`, `main/peripheral_power.cpp`, `components/input_core/include/peripheral_power_lease.h`, `components/input_core/src/peripheral_power_lease.cpp` | Maker `main/platform/peripheral_power.h/.cpp`, `components/keyboard/include/keyboard/peripheral_power_lease.h`, `components/keyboard/src/peripheral_power_lease.cpp` | Reimplemented the T04-only Awake subset and the fixed-reference four-owner lease behavior: one GPIO8 physical writer, inactive latch preload, safe-low output commands, GPIO11 disabled/floating, high rail and minimum 50 ms scheduler-blocked settle. `DeviceAwake` and `Led` are the only acquired owners; microphone and speaker remain uninitialized. |
| `main/led_strip.h`, `main/led_strip.cpp` | Maker `main/platform/led_strip_status.h/.cpp`; ESP-IDF v5.5.5 RMT TX API | Reimplemented only fixed-capacity five-pixel GRB transport: 20 MHz, `6/18` and `16/12` data symbols, a reset symbol with two 6000-tick low halves (600 us total), one-item RMT queue, bounded completion wait and channel disable after every frame. No Maker status runtime was copied. |
| `main/main.cpp`, `main/CMakeLists.txt` | Maker `main/app_main.cpp`, `main/platform/led_strip_status.cpp`; existing locked DeskMate T03 owner | Added an independent low-priority LED task. Confirmed T03 semantic events are accepted by the existing USB runtime before non-blocking LED publication. ISR, debounce, encoder, HID queue and USB lifecycle code remain the sole existing implementations. |
| `host_test/led_feedback_tests.cpp`, `host_test/firmware_source_contract_tests.cpp`, `host_test/CMakeLists.txt` | Maker `host_test/input_feedback_tests.cpp`, `host_test/peripheral_power_lease_tests.cpp`; frozen T04 verification matrix | Rebuilt stderr/non-zero golden vectors and source-boundary checks for colors, timing, release silence, replacement, wraparound, GRB, fail-soft isolation, GPIO8 ownership/order, GPIO11, RMT constants and fixed partitions. |
| `sdkconfig.defaults`, `tools/write-release-manifest.ps1` | ESP-IDF v5.5.5 reproducible build option and DeskMate T03 reproducibility lesson | Enables reproducible application metadata and generates a path-free manifest only when the clean HEAD, project path, build directory and embedded app version all match, recording exact version, target, app hash/size/range and partition hash. Generated manifests and images remain ignored build artifacts. |

The Maker checkout remains read-only and is not a build dependency. No Xiaozhi
source was used. Hardware acceptance completed on the original computer on
2026-08-27; see `docs/testing/t04-input-led-feedback-acceptance-2026-08-27.md`.
