# T10D-B Windows manual calibration UI handoff

## Scope and baseline

- Branch: `codex/t10d-desktop-manual-calibration-ui`
- Exact software base: `35e627389282d8279d82646787f509681474c048`
- T10D-B implementation commit: `695c47d255ccfc8b09e1fd2e9644735b7c0c1017`
- Imported EasyInput host contract branch: `codex/t10d-easyinput-manual-motion-bridge`
- Imported EasyInput final HEAD: `1645bf688b11d2f0d7ba3dfa7900f552886cb404`
- Windows software only. No application launch, port/device access, firmware,
  Flash/NVS, OLED, servo, audio-hardware or physical-motion operation occurred.

## Delivered

- Strict Electron codec for Feature Report `0x16` and Input Report `0x17`,
  checked against the language-independent host golden vectors.
- Strict .NET bridge validation before HID write and before response relay.
- One-request controller with USB mount epochs, status gating, correlated
  request/confirmation IDs, four ARM attestations and one-use volatile tokens.
- Minimal trusted IPC/preload surface. Raw reports and device paths never reach
  React.
- Connections-page safety panel with yaw/pitch selection, fixed one-degree
  steps, provisional center, recenter, emergency stop and clear.
- Three independent evidence cards: user intent, EasyInput accepted and
  Xiaozhi terminal including `completed_output_count`.
- Current production `NOT_READY` is explicitly presented as expected and keeps
  commands disabled. HID connection is never presented as motion readiness.

The existing `t12b1-provider-custom-vad-v2` package identity is preserved so
the independent eight-second endpointing acceptance remains attributable.

## Verification

- `npm ci --include=dev`: passed; 398 packages installed.
- Focused T10D-B/native tests: passed, 14/14.
- `npm test`: passed, 283/283.
- `npm run build:desktop`: passed.
- `git diff --check`: passed.
- Firmware-boundary, ASCII tracked-path and secret-pattern checks: passed.
- `DeskMate.exe`: 202690560 bytes; SHA-256
  `2DD0ECB13782AE5287977A13A34EFAA9711D7655D71DF67A6C1364EF0428F101`.
- `app.asar`: 112760685 bytes; SHA-256
  `E03DB4A22E3695496108159FDAF4F34E3708713D3AF7EECDE3497962E23150E1`.

## Status and next gate

Status: `CONTRACT_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`.

Do not use this package to claim servo readiness. T10D-C may start only after
the production Xiaozhi manual owner and adapter exist and the user is physically
present to authorize Stage 0 checks for board identity, independent current-
limited servo power, common ground, unloaded linkage, mechanical center and an
immediately reachable cutoff. Every action remains high-level and one degree;
no later package may add arbitrary desktop PWM or angle control.
