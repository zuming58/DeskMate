# T10D Windows manual-control request ID restart recovery

Date: 2026-09-02

## Exact delivery

- Branch: `codex/t10d-desktop-request-id-recovery`
- Base: `b5673e203adc482cff658d84cab343f96b366b0b`
- Implementation commit: `d587626c1fb8c60b03eb64da72df640ee8382876`
- Final documentation commit: the branch HEAD containing this handoff
- Scope: DeskMate Windows software only
- Classification: `WINDOWS_ROOT_CAUSE_FIXED / CODE_BUILD_CONFIRMED / HIL_RERUN_PENDING`

## Reproduced failure and root cause

The real three-end setup reported all of the following at the same time:

- EasyInput HID connected;
- both frozen vendor HID collections writable;
- downstream DeskMate Link connected;
- manual-control status request ID `8` rejected as `stale`.

The transport was not unavailable. `ManualCalibrationController` restarted its in-memory counter whenever DeskMate restarted, while EasyInput retained its `max_request_id_` for the still-active USB mount epoch. The endpoint therefore correctly rejected the reused lower request ID.

## Windows repair

`electron/manual-calibration-request-ids.cjs` now owns the production sequence:

- It stores a versioned, SHA-256-checksummed high-water in primary and backup journals under Electron `userData`.
- It reserves 4096 IDs and persists the reservation to backup and primary before returning the first ID.
- A later DeskMate process resumes after the persisted reservation, so even unused IDs are skipped safely.
- One corrupt journal may recover from the other. If both existing journals are invalid, if persistence fails or if the sequence reaches `0xffffffff`, the controller fails closed before sending.
- The first persistent deployment starts at `0x40000000` so it does not reuse the legacy low counter range.

For an EasyInput that was already mounted before this upgrade, a read-only status request rejected as `stale` may advance through a finite set of predefined higher floors. One user start action can therefore recover without unplugging the board. This retry is limited to status; ARM, center, step, recenter and emergency-stop commands are never automatically replayed. If every recovery floor is stale, the sequence reports exhaustion and remains locked.

`ManualCalibrationController` continues to use the old injected in-memory fallback in isolated legacy unit tests, but production Electron always injects the persistent store. The existing single-instance lock prevents two DeskMate processes from racing the journal.

No HID report ID, payload, DeskMate Link message, endpoint deduplication rule or firmware source changed.

## Verification

- Focused request-ID and manual-control suite: `27/27` passed.
- `npm ci --include=dev`: passed.
- Full `npm test`: `316/316` passed.
- Packaged native bridge `--protocol-self-test`: passed.
- `npm run build:desktop -- --config.directories.output=release-t10d-request-id-recovery`: passed.
- `git diff --check`: passed.
- EasyInput and Xiaozhi firmware diffs from the exact base: empty.

Package root: `release-t10d-request-id-recovery/win-unpacked`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `DeskMate.exe` | 202690560 | `B70ECB55106BAE84C257BB02DCF6298F2EDEB96FF8DB5935860A00F092D39A2D` |
| `resources/input-bridge/DeskMate.InputBridge.exe` | 153512841 | `3B0C0936D3A81CBFBAD400E1B635A51C09435872A8FCEBFB88293780E1B7B014` |
| `resources/app.asar` | 112816342 | `06FE4D2FBAC62AD59139435B64A89AD1562AA2F222FE2277F7471152C0E23BD0` |

Build outputs are ignored and are not committed.

## Pending user-present acceptance

The integration owner should launch the exact package above while keeping the current EasyInput USB mount unchanged. The user then presses “开始手动控制” once.

Acceptance requires a fresh status terminal rather than `stale`. This first rerun proves only request-ID recovery and status routing. It does not prove servo direction, center, limits, movement or stop behavior; those remain under the existing user-present mechanical acceptance gate.

No application was launched, no device/port was enumerated or accessed, and no firmware, Flash/NVS/eFuse, erase, OLED, audio, PWM or servo operation occurred in this repair.
