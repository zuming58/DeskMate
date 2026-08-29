# T02-T06 combined self-audit (2026-08-29)

## Verdict

No blocking defect was found by the source review or automated verification after restoring the last HIL-proven voice target path. The branch is suitable for handoff and independent review, but T06 remains `HIL_PENDING`: fixed text, UUID application launch, the restored voice path, and the combined physical regression matrix were not exercised while the user was away.

This is a self-audit of `codex/easyinput-t06-host-actions`, not an independent review and not permission to flash.

## Findings closed in this audit

1. **Voice target regression introduced after `9e214d1`.** Commits `c6ead2a` and `8462e59` moved capture/paste to the resident bridge and added stabilization, but user HIL continued to fail. The candidate was rejected. `electron/main.cjs` and `electron/active-window-output.cjs` now restore the known PowerShell boundary: capture the foreground HWND when recording starts, then perform exact HWND comparison and Ctrl+V in one PowerShell process. The configuration UI, T06 actions, firmware, and compact 320 px overlay are not reverted. Tests lock this call boundary and fail-closed behavior.
2. **T05 task status drift.** The task header still claimed `T06_BLOCKED` although the 2026-08-28 progress evidence records successful configuration read, core edit, single-key mapping and voice-trigger HIL followed by user acceptance to enter T06. The header now reflects those facts without inventing recovery/pressure-test evidence.
3. **Invalid local build metadata.** An initial audit build passed `$sdkconfig` literally and created one untracked file with that name. That single file was removed explicitly. A fresh build directory with an absolute SDKCONFIG path produced the valid evidence below; no build directory was bulk-deleted.

## T02-T06 boundary review

- **T02 input foundation:** GPIO contract remains S1-S8 `2/47/38/41/1/6/7/48`, encoder `17/16/18`; GPIO0 is not treated as S5. Host tests still cover debounce, Gray-code handling, held-key state and overflow behavior.
- **T03 USB runtime:** held PTT, atomic taps, ordered mount/unmount epochs, release barriers, input-ring discard on overflow, reconnect suppression and stale-wheel dropping remain in the single production runtime. T06 host commands share the existing TinyUSB owner and cannot replace keyboard release recovery.
- **T04 LED and power:** GPIO12 remains the five-pixel GRB output. GPIO8 has one shared-power owner and stays outside per-key effects. LED work remains asynchronous/fail-soft; Host Action success does not drive LED state.
- **T05 configuration/NVS:** the renderer receives sanitized projections and diffs, not raw JSON, device paths or network/audio secrets. Patch/commit stays capability-gated and read-modify-write. Firmware retains raw unknown fields, validates bounded UTF-8/JSON, saves through the config owner and dual-slot store, and applies a runtime projection only after release safety.
- **T06 Host Action:** UUIDs are canonical lowercase values; fixed text is strict UTF-8 and bounded to 960 bytes. Firmware streams one command per confirmed press with USB-epoch cancellation. The native bridge exposes metadata only. Application paths remain in the Electron main-process store and are limited to local absolute `.exe`/verified argument-free `.lnk` targets. Missing capability, mapping, target, epoch or transfer fails closed.
- **Desktop architecture/privacy:** Electron retains `nodeIntegration: false` and `contextIsolation: true`; VoiceWorkflow remains a single application-level workflow. Diagnostics and renderer events exclude keys, transcripts, window titles, device paths and hardware identity.

## Verification

- Desktop tests: `npm test` passed 101/101, including configuration ACK/readback reconciliation, single-key localization, Host Action capability/path gates, fixed-text privacy/bounds, native bridge lifecycle, voice target fail-closed behavior and T02-T05 regression tests.
- Desktop package: `npm run build:desktop` exited 0; Vite, the self-contained input bridge and Electron `win-unpacked` package completed.
- Firmware Host tests: Visual Studio 2022 Build Tools / MSVC 19.44, CTest 7/7. Suites cover Host Action, input core, input runtime, LED feedback, shared-power leases, configuration/NVS and firmware source contracts.
- Firmware build: exact `ESP-IDF v5.5.5`, Python 3.11.15, target `esp32s3`, Minimal Build, absolute isolated SDKCONFIG. The fixed table is NVS 24 KiB at `0x9000`, PHY 4 KiB at `0xf000`, factory 3 MiB at `0x10000`, and two 576 KiB sound banks at `0x310000`/`0x3a0000`. Dirty audit app size was 327,952 bytes (`0x50110`), SHA-256 `8C2259C809046B4D9688A62B882173FAA2E576EDF28F2A6C07F16B27911C0D4A`; final clean-HEAD evidence is reported after commit and is not embedded recursively in Git.
- Static checks: `git diff --check` passed; firmware `AGENTS.md` and `CLAUDE.md` are byte-identical; tracked ASCII paths, generated-artifact exclusions, source/license records and bounded secret/privacy scans passed.

## Residual risk and stop gate

- The restored PowerShell voice path is the last known HIL-proven implementation, but this exact final package still needs one same-window writeback and one intentional target-change fallback test.
- T06 fixed-text injection, UUID application launch, configuration reboot readback and the T03/T04 physical regression matrix remain manual `HIL_PENDING`.
- No device discovery, port scan, Flash/NVS read or write, flash, erase, monitor, eFuse action, Xiaozhi change or external-reference modification occurred in this audit. Do not start T07 or flash from this report.
