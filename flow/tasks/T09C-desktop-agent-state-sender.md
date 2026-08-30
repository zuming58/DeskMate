# T09C desktop agent-state sender

Status: `THREE_END_INTEGRATED / AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / T09_AGENT_STATE_DISPLAY_V1_FROZEN / HIL_NOT_AUTHORIZED`

Independent audit: `codex/desktop-t09-agent-state-audit` fixes the zero-length
Feature Report boundary and adds the previously missing timeout/stale-ACK
regression. Full evidence is recorded in
[`t09c-desktop-agent-state-sender-audit-2026-08-30.md`](../../docs/reviews/t09c-desktop-agent-state-sender-audit-2026-08-30.md).

## Baseline and ownership

- Branch: `codex/desktop-t09-agent-state-sender`.
- Base: `d9f91e30e6f52325df70d0665f900de1164bfd96`.
- Owner: Windows desktop and the host-side transport boundary only.
- Shared contract: `docs/contracts/t09-agent-state-display-v1.md`.

## Scope

1. Map the existing versioned VoiceWorkflow states to the frozen seven-state
   model without creating a second workflow.
2. Encode HID Feature `0x12` v2 in Electron main and pass a bounded 64-byte
   Windows transport report to the resident native bridge.
3. Keep one request in flight and one latest pending state. Supersede older
   queued state, use bounded timeout, and never replay after disconnect,
   native-bridge restart or process restart.
4. Validate the full report again in the native bridge before
   `HidD_SetFeature`; return only request metadata and a bounded reason.
5. Ensure simulator, mock STT and demo paths never write hardware.
6. Normalize the corresponding all-zero Windows padding at the EasyInput
   TinyUSB boundary without changing the 16-byte semantic contract.

Do not modify Xiaozhi firmware, DeskMate Link framing, OLED scenes, servo,
audio, NVS, partitions, input mappings or the T07 navigation. Do not access
hardware.

## Verification

- Exact v2 golden vector and zero-padding tests.
- Native protocol self-test and strict report validator.
- Latest-wins, supersede, timeout, disconnect and no-replay bridge tests.
- Mock/simulator isolation and existing VoiceWorkflow integration checks.
- EasyInput Host CTest, ESP-IDF v5.5.5 fixed-partition build.
- Root `npm test`, `npm run build:desktop`, static/privacy/artifact checks.

Completed evidence:

- Desktop Node tests: `125/125` passed, including the exact v2 report
  vector, latest-wins/no-replay behavior and simulator isolation.
- Native bridge protocol self-test passed; the Release desktop package built
  successfully.
- EasyInput Host CTest: `9/9` passed.
- ESP-IDF `v5.5.5`, target `esp32s3`, fixed 16 MB partition build passed.
  App size is 318,768 bytes (`0x4DD30`), SHA-256
  `B275C31CBC681FF07A1AA79614AD39C397DB4045C9F2A7F040A46F95590C746D`.
  This is code-gate evidence, not a flash authorization image; rebuild the
  final remote HEAD and recalculate its hash before any write request.
- Fixed partition-table SHA-256 remains
  `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`.
- `git diff --check`, ASCII paths, privacy/secret scan, ignored build-product
  checks and local `AGENTS.md`/`CLAUDE.md` parity passed. The board-baseline
  helper reported no failure and one expected warning because it cannot parse
  C++ pin declarations; this package does not modify pins or GPIO ownership.

Push the branch and stop before port scan, device identification, Flash/NVS
access, erase, flash, monitor, OLED, servo, audio or HIL.
