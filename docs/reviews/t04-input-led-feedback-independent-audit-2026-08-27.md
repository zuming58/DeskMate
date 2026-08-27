# T04 input LED feedback independent audit

## Scope

- Upstream candidate: `fbd4c2090f81adcce5e2eb7c9a86681424c9b7e9`
- Branch: `codex/easyinput-t04-input-led-feedback`
- Base: `b407f3a9b5e7527426b5c64ab726380e2f6ab70e`
- Audit worktree: an isolated worktree outside the primary `main` checkout
- Hardware access: none; no port scan, identity read, Flash/NVS read, flash, erase, monitor or HIL

The audit covered the complete T04 diff, the frozen LED contract, the T04 task card, the fixed Maker reference at `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`, firmware Host tests, exact ESP-IDF v5.5.5 builds, the fixed 16 MB partition layout and the unchanged DeskMate desktop baseline.

## Findings and bounded corrections

1. The candidate correctly preserved the T03 input/USB owner, publishes LED feedback only after the semantic event enters the existing HID runtime, and keeps LED failures fail-soft.
2. GPIO8 had one physical writer and the correct safe startup order, but the controller did not retain the four-owner lease interface explicitly required for later LED/microphone/speaker sharing. The audit added a pure `PeripheralPowerLeaseSet`, a single global controller, `DeviceAwake` plus LED ownership, fail-closed invalid-owner behavior and Host coverage. No microphone, speaker or I2S runtime was added.
3. The RMT implementation uses two 6000-tick low halves at 20 MHz, which is 600 us total. Documentation that called this a 300 us reset was corrected; the safe physical implementation did not change.
4. The release-manifest tool accepted a stale build directory while labeling it with the current HEAD. It now requires the project path, build directory, project name and embedded app version to match the current clean seven-character HEAD before producing an authorization manifest.

These corrections do not change `INPUT_LED_V1_FROZEN`, T03 HID behavior, colors, animation timing, pin assignments, USB identity, queues, NVS or partition layout.

## Independent evidence

- Host CTest: 5/5 passed, including input core, USB runtime, LED feedback, shared-power leases and firmware source contracts.
- ESP-IDF: exact v5.5.5, target `esp32s3`, Minimal build enabled; a full isolated pre-commit build passed with the fixed partition table.
- Desktop: `npm test` passed 68/68 and `npm run build:desktop` passed.
- Repository: `git diff --check`, ASCII tracked paths, ignored build outputs, no tracked firmware images, local `AGENTS.md`/`CLAUDE.md` equality and scope review passed.
- Board declaration scanner: 1 PASS, 1 declaration-parser WARN, 0 FAIL. Manual review confirms S1-S8 `2,47,38,41,1,6,7,48`, encoder `17/16/18`, USB `19/20`, GPIO8 shared rail, GPIO12 five LEDs, safe-low GPIO9/10/12/13/14/15 and disabled/floating GPIO11.

The clean committed HEAD must still be rebuilt twice and produce identical app and partition hashes before any burn authorization card is valid. That post-commit release gate is intentionally outside the tracked record because committing a recorded hash changes ESP-IDF's embedded Git app version; the generated release manifest is ignored and the exact values are reported with the authorization card.

## Verdict

`AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / PENDING_HIL`

T04 is eligible for an app-only burn authorization card after the final clean-HEAD double-build gate passes. It is not yet `T04_LOCKED`; hardware LED acceptance and the complete T03 regression remain required. T05 must not begin before that lock.
