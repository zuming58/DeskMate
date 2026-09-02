# T10D Windows explicit emergency-stop recovery

Date: 2026-09-02

## Exact delivery

- Branch: `codex/t10d-desktop-emergency-stop-recovery`
- Base: `20a241be3dce5ee4f5b592f4849d33b548e19df5`
- Implementation commit: `3c3a9243e90021a03720c239fb7e1a788c413581`
- Final documentation commit: the branch HEAD containing this handoff
- Scope: DeskMate Windows software only
- Classification: `WINDOWS_EXPLICIT_ESTOP_RECOVERY_COMPLETE / CODE_BUILD_CONFIRMED / HIL_PENDING`

## Accepted evidence and root cause

User-present HIL on the exact Pitch-fixed package established:

- manual control and all four physical directions work;
- `立即停止` reaches and latches Xiaozhi as `emergency-stopped`;
- a later start is rejected as `急停已锁定`.

The stop path was correct. The simplified Windows coordinator had retained the frozen `emergencyStop` operation but removed the expert UI that could explicitly invoke the already-frozen `clearEmergencyStop`. Neither firmware nor the Link route required a new operation.

## Exact recovery transaction

The panel performs the existing read-only status query when mounted so a latch can be shown after DeskMate restarts. This query has no clear side effect.

When the effective endpoint context is `emergency-stopped`, the inactive primary button becomes:

`解除急停并重新开始（会先回中）`

After the operator checks the existing single environment confirmation and clicks once, Electron main serially performs:

1. a fresh status query;
2. exactly one `clearEmergencyStop` only if that status is still latched;
3. a correlated clear terminal whose endpoint must report `state=locked` and `emergencyStopped=false`;
4. the unchanged normal session begin;
5. Yaw select → fresh ARM → provisional center;
6. Pitch select → fresh ARM → provisional center.

The direction pad is not rendered before both centers are ready. A normal start against a non-latched endpoint never sends clear. Startup, reconnect and status polling never send clear. A failed clear, a completed-but-still-latched terminal or either center failure leaves controls unavailable without a step request.

No second IPC or motion state machine was created. The existing `startManualControl` call carries only a bounded recovery intent, and `ManualControlCoordinator` remains the sole owner.

## Unchanged boundaries

- Windows HID reports `0x16/0x17` and DeskMate Link messages `0x20/0x21`;
- EasyInput and Xiaozhi firmware;
- emergency-stop dispatch and priority;
- persistent request IDs and bounded stale recovery;
- left/right/up/down semantics;
- center, recenter, limits and fixed one-degree step;
- one request in flight, 250 ms minimum interval and no replay;
- fresh ARM, release cancellation and lifecycle locks.

## Verification

- Focused calibration/manual-control/request-ID suite: `36/36` passed.
- Tests prove normal start never clears, explicit recovery clears once then establishes both centers, endpoint failure and a still-latched terminal create no step, and center failure keeps controls hidden.
- UI/IPC tests prove the recovery label, explicit flag, read-only discovery and center-ready direction-pad gate.
- `npm ci --include=dev`: passed.
- Final full `npm test`: `325/325` passed.
- Packaged native bridge `--protocol-self-test`: passed.
- `npm run build:desktop -- --config.directories.output=release-t10d-emergency-stop-recovery`: passed.
- `git diff --check`: passed.
- EasyInput and Xiaozhi firmware diffs from the exact base: empty.

Package root: `release-t10d-emergency-stop-recovery/win-unpacked`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `DeskMate.exe` | 202690560 | `17CE968209DA9B10F7FAD3000E9C1049EA75D129C83DC35BC615A8E77481C706` |
| `resources/input-bridge/DeskMate.InputBridge.exe` | 153512841 | `BB76F6C312C7FD41951715BB0C8F4B2BED5492F2D8974ECDE48B4C0E330BFBA4` |
| `resources/app.asar` | 112817751 | `2B69A1AD04F98D49CF93FF0E39CA1BB2B007C942FABA12316EA3E2B7413289FE` |

Build outputs are ignored and are not committed.

## Remaining user-present HIL

The integration owner should audit and launch the exact package while the Xiaozhi endpoint remains latched from the accepted stop test. Acceptance requires:

1. the panel discovers and displays `已紧急停止` without clearing it;
2. the primary action reads `解除急停并重新开始（会先回中）`;
3. checking/retaining the environment confirmation and clicking once returns the direction controls only after clear plus both center terminals;
4. a second normal start after a non-emergency exit does not send another clear;
5. immediate stop remains available and latches again.

No application was launched, no device/port was enumerated or accessed, and no firmware, Flash/NVS/eFuse, erase, OLED, audio, PWM or servo operation occurred in this repair.
