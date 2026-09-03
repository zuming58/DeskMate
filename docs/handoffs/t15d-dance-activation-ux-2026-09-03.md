# T15D dance activation responsive UX handoff

Date: 2026-09-03

## Exact delivery

- Role: Windows-only DeskMate software UX closure.
- Branch: `codex/t15d-dance-activation-ux`.
- Base: `codex/t15-t16-integration@10e771dfa3c4dba5a743659595262b9471fbae53`.
- Implementation commit: `a709103569912408445d6cf002374befa284c48e`.
- Final branch HEAD: the documentation commit containing this handoff.

## Scope and behavior

- `src/ChoreographyEditor.jsx` now renders one stable selection bar containing the dance selector, current active dance and explicit activation control.
- `src/styles.css` keeps that control visible at 1440×1024 and smaller widths, with secondary new/copy/delete actions on a separate compact row.
- A new unsaved draft cannot activate and says `保存后可激活`. A saved custom dance uses `激活为跳舞动作`. An active item says `当前已激活`; selecting the built-in item while a custom dance is active offers an explicit built-in restore.
- Selection, editing, saving, copying, software preview and entity execution do not change the active dance. Only the existing `setDefaultDance` handler changes it.
- No preload, IPC, native bridge, Host HID, DeskMate Link, motion service or firmware behavior changed.

## Verification

- `npm ci --include=dev`: passed.
- Focused `node --test tests/t15d-desktop-choreography-editor.test.mjs`: `8/8` passed.
- Full `npm test`: `375/375` passed.
- `npm run build:desktop`: passed.
- Packaged `DeskMate.InputBridge.exe --protocol-self-test`: exit `0`.
- `git diff --check`: passed.
- Tracked non-ASCII path scan: no matches.
- Firmware diff from the exact base: empty for both firmware trees.
- Visual QA: passed at the product viewport and a smaller window; details are in `docs/reviews/t15d-dance-activation-design-qa-2026-09-03.md`.

Package evidence:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `release/win-unpacked/DeskMate.exe` | 202690560 | `16435B97546779FEB4C2AD3364AF6A9BBE48D6AE82897B5DA62DF43798C68C27` |
| `release/win-unpacked/resources/input-bridge/DeskMate.InputBridge.exe` | 153521033 | `990C3F618FF2FD8C7B0004369A6458506CE1CF4450BBBCEF1E29F60FFDA42759` |
| `release/win-unpacked/resources/app.asar` | 113003716 | `1A98E7A10F2DD7659653FE6097378D13474E74E05624DAA2915C8C4F01FD0F94` |

## Hardware and remaining gate

- Hardware operations: none. No port or device was inspected; no HID command, motion, Flash/NVS/eFuse, OLED, servo or audio operation occurred.
- The Windows UX fix itself requires no firmware change.
- The user's physical `快速动作` and `实体执行` currently remain unchanged because the two boards still require separate explicit authorization to flash the already-audited T15D V2 candidates from the integration baseline. Only after both app-only writes and user-present HIL may adjustable speed, amplitude and custom choreography be claimed as physically accepted.

## Next action

The main Agent should review and cherry-pick this Windows-only branch, rebuild the exact package, then ask for separate per-board flash authorization for the unchanged T15D V2 candidates. Activation UI can be checked without hardware; physical motion must wait for the dual-firmware gate.
