# T08 EasyInput Link controller

Status: `DESKMATE_LINK_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED`

## Objective and baseline

Implement the EasyInput side of the frozen DeskMate Link v1 without modifying the T07 desktop baseline or Xiaozhi firmware.

- Base: `origin/main@3e2a046f49260ead422da4c295c3321de13dca5d`
- Branch: `codex/easyinput-t08-link-controller`
- Contract: [`DESKMATE_LINK_V1_FROZEN`](../../contracts/deskmate-link/v1.md)
- Golden vectors: [`golden-vectors-v1.json`](../../contracts/deskmate-link/golden-vectors-v1.json)
- Fixed Maker audit: [`t08-easyinput-link-maker-reference-audit.md`](../../docs/provenance/t08-easyinput-link-maker-reference-audit.md)

## Ownership

- May change: `contracts/deskmate-link/`, `firmware/easyinput-controller/`, this task's tests, provenance and handoff documents.
- Must not change: `firmware/xiaozhi-yuntai/`, desktop `src/`, `electron/`, `native/`, T07 navigation or VoiceWorkflow.
- The Xiaozhi stream consumes the exact frozen contract and vectors; it does not edit the shared contract independently.

## Implementation

1. Add a host-testable C++ codec, streaming parser, controller lifecycle and bounded diagnostics.
2. Add one UART0 owner task using GPIO43/44 at 115200 8N1. Driver callbacks/other tasks do not parse or write Link bytes.
3. Release UART0 from ESP-IDF application/bootloader console ownership through `sdkconfig.defaults`; do not write eFuse.
4. Extend the existing configuration-status response with a backward-compatible, privacy-safe Link snapshot.
5. Preserve all T03 input release safety, T04 LED/GPIO8 ownership, T05 configuration/NVS and T06 Host Action behavior.

## Exclusions

- No Xiaozhi firmware, desktop/UI, BLE, Wi-Fi, audio, OLED, servo, camera or sensor work.
- No wiring, port scan, device identification, Flash/NVS read or write, flash, erase, monitor or eFuse operation.
- No Host Action `0x05` reuse for Link and no direct OLED/PWM writes.

## Verification and stop gate

- New codec/lifecycle/status Host tests plus every existing EasyInput Host test.
- Exact ESP-IDF v5.5.5 `esp32s3` build with the fixed 16 MB partition table.
- Root desktop test/build regression because the status JSON crosses the existing host boundary.
- Source-contract checks for one UART owner, fixed pins, disabled consoles/logging, provenance, privacy and unchanged partitions.
- Push the branch and report exact contract/final HEAD, tests, image size and SHA-256, then stop without hardware access or `main` merge.

## Delivered code evidence

- Frozen contract commit: `c8b8a344a72a849640c8b19575768d6daf4d6667`.
- EasyInput implementation commit: `697bffa0f372ef57e4b41fa3fa1d7b39bffbab0e`.
- Host CTest: 8/8 passed, including codec, streaming parser, retry/disconnect, peer restart, stale-state suppression and source-contract checks.
- Desktop regression: 115/115 tests and `npm run build:desktop` passed.
- ESP-IDF: exact v5.5.5, `esp32s3`, fixed 16 MB partition build passed.
- No port scan, device identification, Flash/NVS access, flash, erase, monitor, wiring, OLED, audio or servo operation was performed.
