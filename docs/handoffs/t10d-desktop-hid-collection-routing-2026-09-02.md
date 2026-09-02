# Windows HID multi-collection routing repair

## Identity

- Branch: `codex/t10d-desktop-hid-collection-routing`
- Base: `codex/t14-desktop-agent-adapter-framework@8578f0cc8bef40ba269bb0960adbaf04c66432ed`
- Implementation commit: `7333cf3f43635cb7b14fdb868a4967da81c3aed5`
- Scope: DeskMate Windows software only. EasyInput and Xiaozhi source are unchanged.

## Root cause and repair

The EasyInput descriptor exposes two vendor top-level collections under the same
VID/PID:

| Report family | Usage Page / Usage | Windows Input / Feature length |
| --- | --- | --- |
| `0x10..0x15` config, status, Host Action and Agent State | `FF00:0002` | `64 / 64` bytes |
| `0x16` manual request and `0x17` manual response | `FF00:0007` | `64 / 64` bytes |

The old native bridge matched only VID/PID plus `>=64` report lengths and returned
the first compatible path. `WriteManualCalibrationRequest` therefore opened the
config collection and failed with `hid-set-feature-1`. Raw Input registered only
`FF00:0002`, so a valid `0x17` response on `FF00:0007` could not arrive.

The repair adds exact collection contracts and a report-family resolver. Feature
reports `0x10..0x15` open only `FF00:0002`; `0x16` opens only `FF00:0007`; wrong
Usage or non-exact platform lengths fail closed. Raw Input now subscribes to both
vendor collections while the existing strict `0x17` CRC/padding/privacy parser is
unchanged.

Runtime status now distinguishes:

- any EasyInput HID enumerated;
- config collection writable;
- calibration collection writable.

Electron gates config/Agent State and calibration independently. Re-enumerating
the config collection triggers one bounded Link-status refresh. A calibration
collection transition no longer clears config capabilities or fabricates
`easyinput-not-connected`. The settings diagnostics and exported JSON expose only
closed collection states; they contain no device path, serial, MAC, IP or content.

## Verification

- Focused routing/native/manual/bridge regression: `41/41` passed.
- Full `npm test`: `295/295` passed.
- .NET Release build and protocol self-test: passed with zero warnings/errors.
- Renderer production build: passed.
- `git diff --check`: passed.
- Default `release/win-unpacked` overwrite was blocked by the user's already-running
  DeskMate process (`EBUSY`). The process was not terminated or controlled. The same
  package step passed in the independent directory below.

Package:

- Path: `F:\Codex\deskmate-t14-agent-adapters\release-hid-routing\win-unpacked`
- `DeskMate.exe`: 202,690,560 bytes; SHA-256
  `154C5BA813B25472A1920FDCC766F49BB4A5A4B99744ECEEBEDF71E0E59B6C4F`
- `resources/input-bridge/DeskMate.InputBridge.exe`: 153,512,841 bytes; SHA-256
  `8FA5FB1D093F2C44285334C3D0019845EC9E8D7626F47AF649ACF7E370A36386`
- `resources/app.asar`: 112,776,795 bytes; SHA-256
  `3E33558D926994C7250142AA72EBC8759FBE74B146615018E25CC296864F872F`

Classification: `ROOT_CAUSE_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED /
HIL_NOT_RUN`.

## Shortest remaining HIL

1. Close the old DeskMate instance and launch only the exact package above.
2. Open Settings and Diagnostics. Confirm EasyInput HID is enumerated and both
   `FF00:0002` and `FF00:0007` show writable after USB enumeration settles.
3. Trigger one real manual Agent State such as `thinking`. Record EasyInput write
   ACK and the independently read DeskMate Link state; only a connected Link plus
   visible Xiaozhi change closes that path.
4. Open manual calibration and issue only the status query. Record the separate
   EasyInput accepted and Xiaozhi terminal response. `NOT_READY` is a valid truthful
   production result.
5. Stop. Do not ARM, step, recenter or claim servo movement from this repair.

This task did not launch/control the application, enumerate a device or port, read
or write Flash/NVS/eFuse, or operate OLED, audio, PWM or servo hardware.
