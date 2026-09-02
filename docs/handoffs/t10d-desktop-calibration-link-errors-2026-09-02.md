# T10D Windows manual-calibration Link error diagnostics handoff

Date: 2026-09-02

## Exact delivery

- Branch: `codex/t10d-desktop-calibration-link-errors`
- Base: `7208b20236d585ced59aa6c4f6553e228efaa8b1`
- Implementation commit: `a712c90011dc966b99472b07d2cf0c9c45703ff5`
- Final documentation commit: recorded by the final branch HEAD after this handoff is committed
- Scope: DeskMate Windows software only
- Classification: `HIL_INPUT_CONFIRMED / SOFTWARE_REPAIR_TESTED / BUILD_CONFIRMED / HIL_NOT_RERUN`

## Input evidence and root cause

The upstream HIL established four separate facts:

1. EasyInput HID and its `FF00:0002` configuration collection were available.
2. The `FF00:0007` manual-calibration collection was writable.
3. DeskMate Link and Agent State traffic were otherwise healthy.
4. A read-only manual-calibration status query was accepted by EasyInput, but its terminal result was only displayed as generic `link-error` and the panel became unavailable.

The native report decoder retained bytes for the Link flag and error, but the Windows controller, panel and diagnostic export did not preserve the frozen error meaning. The software therefore erased the distinction between `UNKNOWN_TYPE` and `NOT_READY` even though the DeskMate Link v1 contract already freezes those values.

## Implemented behavior

### Strict report decoding

The calibration Input Report decoder keeps the stable generic `link-error` transport and adds an allowlisted subtype:

| Code | Frozen name |
| ---: | --- |
| 1 | `UNKNOWN_TYPE` |
| 2 | `BAD_PAYLOAD` |
| 3 | `NOT_READY` |
| 4 | `BUSY` |
| 5 | `SEQUENCE_CONFLICT` |
| 6 | `INTERNAL` |

An accepted report must have no Link flag, no Link error and no endpoint payload. A successful terminal report must carry response flag `0x02`, no Link error and the exact endpoint length. A `link-error` terminal must carry error flag `0x04`, one known non-zero code and no endpoint payload. All other combinations and unknown codes fail closed.

### Controller and UI

- `UNKNOWN_TYPE` selects the status-only `unsupported` gate and explains that the current Xiaozhi firmware does not support the manual-calibration protocol.
- `NOT_READY` selects the existing `not-ready` gate and explains that the protocol exists but its calibration owner or real adapter is not ready.
- `BAD_PAYLOAD`, `BUSY`, `SEQUENCE_CONFLICT` and `INTERNAL` retain their exact frozen names and bounded user-facing descriptions.
- Every error path clears endpoint context and keeps all movement controls disabled.
- The panel explicitly states that the result is not motion success and does not authorize unlock.

### Sanitized diagnostics

`deskmate-diagnostics.json` now includes one bounded `manualCalibration` object:

```json
{
  "status": "available",
  "request": { "kind": "status", "id": 23 },
  "accepted": true,
  "transport": "link-error",
  "linkError": { "enum": "NOT_READY", "code": 3 },
  "endpoint": null,
  "at": "2026-09-02T10:00:00.000Z"
}
```

Only request kind/id, acceptance, allowlisted transport, exact frozen error name/code, allowlisted endpoint result/state and a strict UTC timestamp can enter this object. Invalid or inconsistent input becomes `unavailable`; HID reports, payloads, paths, device identifiers, IP/MAC/SSID and user content cannot enter it.

## Verification

- `npm ci --include=dev`: passed.
- Focused calibration/routing/diagnostics regression: `30/30` passed.
- Full `npm test`: `299/299` passed.
- Native bridge Release publish: passed.
- Native bridge `--protocol-self-test`: passed.
- Full build/package: `npm run build:desktop -- --config.directories.output=release-calibration-link-errors-npm` passed.
- `git diff --check`: passed.
- Firmware diff from the exact base: empty.

The normal `release/win-unpacked` directory was already locked at `icudtl.dat` by an existing process. That process was not stopped or controlled. The same full build command passed using the isolated output directory.

## Package evidence

Package root: `release-calibration-link-errors-npm/win-unpacked`

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `DeskMate.exe` | 202690560 | `3D5B0C9022FA31CB46D302DDB88A4D3805592071FB16A649BB6783A08AC48F03` |
| `resources/input-bridge/DeskMate.InputBridge.exe` | 153512841 | `88A7B980BE6185B6D272F0AFB9DE49272706D2AAB2C8E1EAD89E113C82A0C4C8` |
| `resources/app.asar` | 112783381 | `6D4222FC402BC5A7CDC3F2086ADFF4C379B6195DC27A0D398E356C58FBAFD6EB` |

Build outputs remain ignored and are not committed.

## Remaining HIL

When the user is present and the old DeskMate instance has been closed:

1. Launch only this exact isolated package.
2. Open the manual-calibration area and issue one read-only status query.
3. Confirm intent, EasyInput accepted, Link transport/error and Xiaozhi endpoint remain visibly separate.
4. If the result is `UNKNOWN_TYPE (1)`, open a narrowly scoped Xiaozhi firmware protocol-gap task.
5. If the result is `NOT_READY (3)`, the protocol exists and the next work is the separately gated production owner/real-adapter path.
6. Do not issue movement commands. Either result keeps output disabled and is not mechanical, power or servo evidence.

No application, device/port, firmware, Flash/NVS/eFuse, OLED, audio, PWM or servo operation was performed in this package.
