# Espressif MCP troubleshooting guide

## Purpose

The project-scoped `.codex/config.toml` registers three optional Espressif services:

- `espressif-documentation`: search official Espressif documentation for version-specific API and behavior.
- `esp-component-registry`: check component releases, dependencies, examples, and compatibility.
- `espressif-engineering`: ask for an engineering troubleshooting path after DeskMate has a reproducible, sanitized failure.

These services are advisory. They do not replace the frozen DeskMate contracts, the pinned Maker reference, source review, Host tests, an ESP-IDF v5.5.5 build, or authorized HIL evidence. A server answer must be checked against the exact project version and production code before it changes the implementation.

Codex project-scoped MCP configuration is documented at <https://developers.openai.com/codex/mcp/>. The repository must be trusted by the local Codex host before `.codex/config.toml` is loaded. After cloning on another computer, verify from the repository root with `codex mcp list` and start a new Codex task so the tool inventory is initialized from the project configuration. A listed server is configured, not proof that its remote endpoint or authentication currently works; verify the first real read-only query before relying on it.

## Privacy and hardware boundary

Never send an MCP server API keys, Wi-Fi credentials, raw configuration JSON, recordings, transcripts, IP or MAC addresses, device serial numbers, COM ports, full device paths, window titles, user file paths, or unredacted logs. Reduce evidence to the chip family, exact ESP-IDF/component versions, sanitized error class, bounded state sequence, and the smallest relevant source excerpt.

MCP access never authorizes port scanning, device identification, Flash/NVS reads or writes, flashing, erase, monitor, eFuse operations, or hardware actions. Those operations continue to require the project hardware gates and explicit user approval.

## Routing a question

1. Ask `espressif-documentation` when the uncertainty is an ESP-IDF/TinyUSB/NVS API contract, callback lifecycle, error code, task/heap behavior, or version-specific platform rule.
2. Ask `esp-component-registry` when the uncertainty is a managed component version, dependency, release note, example, or compatibility range.
3. Ask `espressif-engineering` only after the failure is reproducible and the question includes the exact version, expected behavior, observed behavior, minimal sequence, tests already run, and sanitized evidence.
4. Compare the answer with ESP-IDF v5.5.5 source/docs, DeskMate frozen contracts, and pinned Maker commit. Record adopted advice and the confirming test; do not copy an answer directly into production code.

Example engineering question:

```text
ESP32-S3, ESP-IDF v5.5.5, esp_tinyusb 1.7.6~2. A bounded 2 KB JSON configuration is persisted in an NVS A/B transaction. After adding one UUID action, the old implementation stopped processing input after save and repeated the failure on reboot. Host tests pass. The implementation used recursive dynamic DOM construction under -fno-exceptions; a streaming path projection removes the failure in simulation. What target-side heap, stack, NVS and reset evidence should be collected to confirm or reject this root cause without erasing NVS?
```

## Manual T06 save-recovery test

Before each run, confirm the board has started, key input and LED feedback work, and DeskMate shows `键盘系统 已读取`. Do not run a serial monitor or change NVS outside the visible DeskMate configuration flow.

1. Record the current KEY8 label. Select a known local application and save KEY8 through the guarded preview/confirm flow.
2. After the success result, confirm the configuration page still reads successfully, all keys still respond, LED feedback still runs, and the encoder still scrolls.
3. Press KEY8 once and confirm only the selected application opens. Repeated presses inside the suppression window must not launch duplicates.
4. Perform a normal full power-off and restart. Confirm configuration readback, all keys/LEDs/encoder, then press KEY8 again.
5. Repeat the save and restart sequence five times. Alternate only between two known safe local applications; do not edit unrelated configuration paths.
6. Run T03/T04 regression: voice key, one atomic shortcut, copy/paste, vertical and horizontal encoder behavior, LED direction/press feedback, and one USB disconnect/reconnect cycle without a held modifier.

For each run, record only `run number`, `save result`, `configuration read result`, `keys`, `LED`, `encoder`, `Host Action`, and `restart readback`. Do not record application paths or device identity.

If any save causes input or LEDs to stop, do not save again, erase NVS, or reflash the same image. Record the last successful step, visible DeskMate error code, whether USB HID remains connected, whether a complete power restart recovers, and which subsystem first stopped. Then use the routing rules above to form a sanitized question and add a failing automated regression before changing code.
