# T02 source and provenance

All implementation files in this package are a clean-room reimplementation. No source file, generated file, binary, or build output was copied from an external project.

| Product file | Reference source | Fixed commit / license | Adoption |
| --- | --- | --- | --- |
| `components/input_core/include/board_pins.h` | T02 frozen board facts; Maker `main/platform/board_pins.h` read-only | Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`, PolyForm Noncommercial upstream | GPIO values independently transcribed from the task contract; GPIO0/GPIO8 are intentionally absent |
| `components/input_core/src/input_core.cpp` | Maker `components/keyboard` debounce/encoder behavior and host-test expectations | Same commit/license; no code copied | Independent platform-neutral state machine |
| `components/input_core/include/hid_report.h`, `src/hid_report.cpp` | Maker HID report contract and USB boot keyboard convention | Same commit/license; no code copied | Neutral internal action and 8-byte report boundary |
| `main/main.cpp` | ESP-IDF GPIO API; board facts from T02 | ESP-IDF 5.5.5 Apache-2.0; no external source copied | Minimal GPIO adapter only |
| `host_test/input_core_tests.cpp` | T02 required behavior; Maker host-test patterns | Same commit/license; no code copied | Deterministic independent tests |

The external Maker checkout remains read-only and is not a product dependency.
