# T03 EasyInput USB input runtime provenance

All T03 implementation files are clean-room reimplementations. No source file, generated file, binary, or build output was copied from an external project.

| Product file | Fixed reference and license | Adoption and target |
| --- | --- | --- |
| input_core include and source files | EasyInput Maker 7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01, PolyForm Noncommercial 1.0.0; ESP-IDF v5.5.5 Apache-2.0 | Debounce and Gray-code behavior independently reimplemented from the frozen contract; split key/phase/press entry points, bounded event ring, overflow accounting, explicit pending-sequence discard after a drop, and encoder resync. |
| hid_report include and source files | Maker fixed commit above; PolyForm Noncommercial 1.0.0; HID boot convention | Independent held-key state with modifier + apple_fn + six usages, fail-closed rollover and complete release. |
| input_runtime include and source files | Frozen INPUT_V1_FROZEN contract; Maker main/platform/usb_hid.cpp and keyboard queue/lifetime tests read with git show at fixed commit | Clean reimplementation of default action ownership, encoder axis routing, 16-item HID queue, mount epochs, disconnect/overflow anti-stuck-key behavior, diagnostics, shared USB descriptor golden vectors, and keyboard/mouse serialization. No Maker code copied. |
| main/main.cpp | ESP-IDF v5.5.5 GPIO, FreeRTOS, esp_timer and esp_tinyusb APIs, Apache-2.0; Maker fixed commit used only for lifecycle review | Independent ESP32-S3 adapter with GPIO any-edge ISR, static 64-item raw-edge queue, owner task, incomplete input-sequence discard before recovery, ordered bounded TinyUSB lifecycle event queue with epoch-gated completion/failure, callbacks limited to publication/notification, and shared descriptor transport. GPIO0, GPIO8, audio and J4 UART absent. |
| main metadata, dependencies.lock and sdkconfig.defaults | ESP-IDF v5.5.5 Component Manager metadata; esp_tinyusb 1.7.6~2 and tinyusb 0.21.0~1 | Explicit managed dependency and reproducible lock metadata; no managed_components or generated sdkconfig committed. |
| host_test files | Frozen task matrix; Maker host-test structure reviewed at fixed commit | Independent stderr/non-zero tests for vectors, ownership, ordered lifecycle callback delivery (including duplicate/stale completion cases), queues, complete byte-for-byte device/configuration/language/string/report descriptor vectors plus semantic report parsing, default serialization bytes, event-ring overflow recovery, wheel coalescing/boundaries/no-replay, vendor fail-closed, diagnostics, and source boundaries. |

The external Maker checkout remains read-only and is not a product dependency. No Xiaozhi source was used.
