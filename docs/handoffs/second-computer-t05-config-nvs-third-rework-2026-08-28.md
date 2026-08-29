# T05 third-rework handoff

## Starting point

- Repository: F:/Codex/deskmate
- Continue branch: codex/easyinput-t05-config-nvs
- Audited code candidate: 2c1cf8d6a9d4f3c79f0adb44bbbaad8318a02122
- Frozen base: a2adc9818da07119e59a6f14d125fc23576696c9
- State: REVIEW_CHANGES_REQUIRED / CONFIG_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED / T06_BLOCKED

Read AGENTS.md, flow/charter.md, flow/plan.md, the newest flow/progress.md entry, firmware/easyinput-controller/AGENTS.md, the T05 task and frozen contract, then docs/reviews/t05-easyinput-config-nvs-third-audit-2026-08-28.md. Do not merge or rebase main.

## What T05 already contains

- Complete configuration transport using Maker-compatible 0x10 writes and DeskMate 0x13/0x11 kind 0x06 reads, chunking and CRC16.
- Strict bounded JSON and UTF-8 projection parsing while retaining exact raw JSON bytes.
- Electron main-process lossless sparse merge, sanitized diff, confirmation token, reread-before-preview/commit and readback confirmation.
- Dedicated firmware configuration task, USB epoch on save results, host-visible release before projection replacement, configured key and encoder pure-HID behavior.
- Dual-slot NVS skeleton using deskmate/cfg_a, cfg_b and cfg_active, read-only legacy import and safe defaults.
- T03 input/reconnect and T04 LED/shared-power behavior remain present.

## Mandatory rework

Add failing tests first, then close every third-audit finding:

1. Put native full-config assembly under one synchronized owner. New requests atomically discard old partial state; cancel the exact request on send failure, timeout, stop and disconnect.
2. Preserve and route 0x13 flags: 0x00 cached status, 0x01 fresh status, and 0x02 complete configuration only.
3. Implement and parse real config_read_v1 and config_write_v1 board capabilities. Electron must not hard-code them true.
4. Degrade safely on NVS initialization/open/capacity/commit/readback failures. Input, USB and T04 LEDs must continue; never erase NVS.
5. Enforce exactly one configuration transaction per USB epoch and reject overlaps and queue overflow fail-closed.
6. Complete the dual-slot interruption, corruption and failure matrix, including Default versus Recovery.
7. Replace raw Host-test assert calls with non-modal stderr failures.
8. Initialize the renderer editable projection from a sanitized board read and submit only user-selected paths.

The Maker reference remains read-only at F:/Codex/easyinput-wzm/easy-input-maker, fixed commit 7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01. Do not use its dirty worktree or build output. Xiaozhi remains read-only and out of scope.

## Verification and stop gate

Run firmware Host tests, exact ESP-IDF v5.5.5 esp32s3 clean build with isolated SDKCONFIG and fixed partitions, npm ci --include=dev, npm test, npm run build:desktop, git diff --check, provenance/license, privacy/secret, ASCII path, tracked-artifact and AGENTS/CLAUDE equality checks.

Do not scan ports, identify the device, access Flash/NVS, flash, erase, monitor or run HIL. Do not start T06 or merge main. Push the same branch after rework and stop for another independent audit. The previous app hash is not authorized for burning; a future burn requires a new clean HEAD, SHA-256, exact app-only range, device identity and fresh authorization.
