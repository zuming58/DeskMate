# T10D three-end integration candidate

Date: 2026-09-02  
Owner: main Agent (`EasyInput固件开发`)  
Branch: `codex/t10d-three-end-integration`  
Tested implementation merge: `fd3204a2b294535a1f865d9a2901e16e257179d8`  
Classification: `THREE_END_CODE_BUILD_CONFIRMED / HIL_NOT_RUN`

## Integrated sources

- Control/T10D-A base: `b0a95d1c254d8fb8fad62933f76fa71fe7da10a3`.
- Exact Windows handoff: `codex/t10d-desktop-manual-calibration-ui@67325032eee4b8e056de23c1c9b204b6d442d2f8`.
- Windows implementation: `695c47d255ccfc8b09e1fd2e9644735b7c0c1017`, based on T13 `35e627389282d8279d82646787f509681474c048`.
- T10D-A implementation already present in control: `0c69d9b3d89b99a2f29d502586b46ad40dd7131e`.

Implementation directories merged without cross-module conflicts. Shared Flow/document conflicts were reconciled once. Windows D053-D059 decisions were renumbered to D060-D066 because the hardware control line already owned those identifiers. Firmware source has no diff from the control base.

## Desktop verification

Commands:

```powershell
npm ci --include=dev
npm test
npm run build:desktop -- --config.directories.output=release-t10d-three-end-integration
```

Results:

- Full test suite: `283/283` passed.
- Build identity: `t10d-three-end-integration-v1`.
- `release-t10d-three-end-integration/win-unpacked/DeskMate.exe`: 202,690,560 bytes; SHA-256 `F0257A6FEC1221815FB9EF07A4191402C8BDF06D00A3780E0F2F6ECEB595DFC5`.
- `release-t10d-three-end-integration/win-unpacked/resources/app.asar`: 112,760,686 bytes; SHA-256 `FB0E727AEC47753845CCE407D2C249AAF764CC48620FD515281A01DEA768692E`.

## Firmware verification

EasyInput:

- Host CTest: `13/13` passed using Visual Studio 17 2022 x64.
- ESP-IDF: exact v5.5.5 build passed.
- App size: `0xD2F60`; SHA-256 `21D27F5BCF7E818F8778D4DFA0E59809AE3F598F34F3F7036A68512036CC199A`.
- Partition table SHA-256: `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`.
- Fixed 16 MiB layout remains 24 KiB NVS, 4 KiB PHY, 3 MiB factory and two 576 KiB sound banks.

Xiaozhi:

- Host CTest: `11/11` passed using Visual Studio 17 2022 x64.
- ESP-IDF: exact v5.5.3 build passed.
- App size: `0x32660`; SHA-256 `582EAF3EA2F09B3EFC279FB6B526D7140B546068B2AB082EEE2B0B6594BC8CFD`.
- Partition table SHA-256: `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0`.

No firmware image is authorized for flashing by this handoff. The build output is evidence only.

## User gate

Launch only the exact packaged executable above, then verify:

1. Companion persona/name/style persists and affects a new realtime session.
2. Reviewed memory can be promoted, corrected and forgotten; knowledge projection can be rebuilt without exposing raw secrets.
3. An allowlisted application intent requires visible confirmation; cancel performs no action.
4. Codex lifecycle summary uses only bounded lifecycle facts and never chat text.
5. Device Connections → manual calibration reports production motion as `NOT_READY`; movement, ARM and output controls remain disabled. HID presence or EasyInput accepted evidence must not be shown as Xiaozhi readiness.

## Hardware boundary

This integration performed no application control, device/port enumeration, Flash/NVS/eFuse write, monitor, audio capture/playback, OLED write, PWM or servo operation. T10D-C remains blocked on user-present electrical/mechanical Stage 0 evidence and separate authorization. A physical motion test must not begin from this package alone.
