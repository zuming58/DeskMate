# T10D Windows pitch direction semantics recovery

Date: 2026-09-02

## Exact delivery

- Branch: `codex/t10d-desktop-pitch-direction-recovery`
- Base: `95d9c954ab9e1af2cca5a8b480b9be0a89131ace`
- Implementation commit: `c1af67e8e6e14c3ce3a90e7ef135b056a5555d61`
- Final documentation commit: the branch HEAD containing this handoff
- Scope: DeskMate Windows software only
- Classification: `WINDOWS_SEMANTIC_FIX_COMPLETE / CODE_BUILD_CONFIRMED / PHYSICAL_DIRECTION_RERUN_PENDING`

## Accepted evidence

The integration owner reported fresh user-present HIL after the request-ID restart repair:

- manual control entered successfully;
- left and right followed their labels;
- pressing `上` physically nodded downward;
- pressing `下` physically raised the head.

This proves the Windows vertical semantic transform was inverted. It does not indicate a bad UART route, HID payload, center, range or servo adapter. The frozen T10C command carries only a signed Pitch step and never assigns physical words to that sign.

## Exact repair

The single `DIRECTION_COMMANDS` transform in `electron/manual-control-controller.cjs` is now:

| Windows action | Frozen output |
| --- | --- |
| left | Yaw `-1` |
| right | Yaw `+1` |
| up | Pitch `-1` |
| down | Pitch `+1` |

Only the two Pitch signs changed. The renderer still sends the semantic words `up/down`, and the existing coordinator still owns select-axis, fresh ARM, one fixed step, terminal gating and release cancellation. There is no duplicate transform or second motion state machine.

Unchanged boundaries:

- Windows HID reports `0x16/0x17`;
- DeskMate Link messages `0x20/0x21`;
- EasyInput and Xiaozhi firmware;
- request-ID persistence and stale recovery;
- provisional center, recenter, range and fixed step;
- one-request flight, 250 ms minimum interval and no replay;
- emergency stop and every lifecycle lock.

## Verification

- Focused manual-control/request-ID suite: `21/21` passed.
- The controller test executes all four semantic directions and checks their exact axis/sign after the normal center and ARM route.
- `npm ci --include=dev`: passed.
- Full `npm test`: `320/320` passed.
- Packaged native bridge `--protocol-self-test`: passed.
- `npm run build:desktop -- --config.directories.output=release-t10d-pitch-direction-recovery`: passed.
- `git diff --check`: passed.
- EasyInput and Xiaozhi firmware diffs from the exact base: empty.

Package root: `release-t10d-pitch-direction-recovery/win-unpacked`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `DeskMate.exe` | 202690560 | `B7E5A9B0D3EE4C00F94670B042BED690847DD21724A6F03BC2F467003109A13B` |
| `resources/input-bridge/DeskMate.InputBridge.exe` | 153512841 | `4DD2FDB0AB26BCB017BF98FEE1D6AB3B17A6EF64378FDE3B69ECB3C9BA502589` |
| `resources/app.asar` | 112816342 | `1046DDD3CB36A1DDC0822D43C37E5116654F5AAF0467FBBDA1A5E82FB125D5A7` |

Build outputs are ignored and are not committed.

## Remaining user-present HIL

After the integration owner audits and launches the exact package:

1. Briefly hold `上` and confirm the head raises.
2. Briefly hold `下` and confirm the head nods.
3. Confirm release produces no later queued step.
4. Complete recenter and emergency-stop observation under the existing physical gate.

No application was launched, no device/port was enumerated or accessed, and no firmware, Flash/NVS/eFuse, erase, OLED, audio, PWM or servo operation occurred in this repair.
