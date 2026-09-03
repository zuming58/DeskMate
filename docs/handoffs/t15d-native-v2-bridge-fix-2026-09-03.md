# T15D native V2 bridge repair handoff

Date: 2026-09-03

## Exact delivery

- Role: Windows-only native input-bridge and diagnostics repair.
- Branch: `codex/t15d-native-v2-bridge-fix`.
- Base: `origin/codex/t15-t16-integration@bce207d379b249e3d094901ad425ac10a09616c7`.
- Implementation commit: `0bf131dacb73c0dd6c8d420b4620de1ae3ffe110`.
- Final branch HEAD: the documentation commit containing this handoff; the exact remote HEAD is reported to the main Agent after push.

## Root cause and repair

- Electron and both flashed firmware applications already use the frozen T15D Host V2 choreography format, but `DeskMate.InputBridge` still accepted only V1 request/response offsets, CRC coverage, Link message IDs and profile fields. The native process rejected every V2 request before it reached EasyInput.
- Quick actions then entered the old V1 preset fallback, so they moved with the old fixed amplitude and speed. Custom choreography is intentionally fail-closed and therefore did not move at all.
- The native validator now accepts V1 rollback traffic and V2 traffic using separate exact layouts. It validates version-specific CRC and padding, V1 profiles or V2 numeric angle/speed bounds, and the correct V1 `0x24/0x25` or V2 `0x26/0x27` Link and endpoint fields.
- The native self-test now feeds the frozen V1 and V2 golden vectors through the real validator. It also rejects wrong version, CRC, Link ID, numeric range and padding mutations.
- Electron correlates choreography responses by protocol version. Diagnostics now export a bounded choreography snapshot and classify the last outcome as `v2-success`, `native-rejected`, `v2-failed` or `legacy-fallback` without raw device identity or user data.
- A quick-action legacy fallback is now explicitly reported as compatibility behavior whose V2 angle/speed settings did not apply. Direct custom choreography remains fail-closed and never synthesizes a legacy substitute.

## Verification

- `npm ci --include=dev`: passed, 398 packages installed.
- Focused T15D tests: `11/11` passed.
- Full `npm test`: `378/378` passed.
- `npm run build:desktop`: passed.
- Direct native `--protocol-self-test`: exit `0`.
- Packaged `DeskMate.InputBridge.exe --protocol-self-test`: exit `0`.
- `git diff --check`: passed.
- Tracked non-ASCII path scan: no matches.
- Firmware diff from the exact base: empty.

Package evidence:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `release/win-unpacked/DeskMate.exe` | 202690560 | `1C7289B956FE9532FD2F1C25A750AEF3445E6BD9E8325C62724DEEAFA16558D0` |
| `release/win-unpacked/resources/app.asar` | 113010318 | `BCDA46DD4205C66ED71F679DB18A76E205F775A27080575630D3529E76306908` |
| `release/win-unpacked/resources/input-bridge/DeskMate.InputBridge.exe` | 153525129 | `8FDF816E16FC57A7B0CC35CD82D044F75DBDCB611676DF60FD1EA1840E35E7F5` |

## Hardware boundary and next gate

- No port or device was inspected. No HID command, motion, Flash/NVS/eFuse, OLED, servo or audio operation occurred. Neither firmware tree changed.
- This repair requires a new Windows package only. The already verified EasyInput and Xiaozhi T15D V2 firmware applications do not need to be reflashed.
- Human HIL remains pending: launch the exact integrated Windows package, set maximum Pitch amplitude and speed, run quick nod, then run one activated custom dance. The sanitized diagnostic must report `v2-success`; `legacy-fallback` is not acceptance evidence.
