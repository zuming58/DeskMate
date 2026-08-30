# T09 EasyInput agent state bridge

Status: `OPEN / T09_AGENT_STATE_DISPLAY_V1_FROZEN / HIL_NOT_AUTHORIZED`

## Baseline and ownership

- Branch: `codex/easyinput-t09-agent-state-bridge`
- Base: `37f0cbd997ddd737f1ec1938a983e1047bed2ff5`
- Owner: EasyInput window only.
- Shared contract: `docs/contracts/t09-agent-state-display-v1.md`.

## Scope

1. Audit Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
   agent-status source and tests before implementation.
2. Decode HID Feature `0x12` versions 1 and 2 using a pure Host-testable core.
3. Accept both TinyUSB report-ID delivery forms and fail closed on all other
   forms.
4. Use a bounded latest-state mailbox owned outside the USB callback.
5. Normalize to the existing seven-state Link model, apply TTL, capability and
   epoch gates, and call the existing `SET_AGENT_STATE` queue.
6. Add privacy-safe counters without exposing payload or source identity.

Do not modify desktop UI, Xiaozhi firmware, Link framing, input/LED semantics,
NVS, BLE, Wi-Fi, audio, partitions or GPIO ownership. Do not access hardware.

## Verification

- New Agent-state codec/bridge Host tests.
- Existing EasyInput Host CTest suite.
- ESP-IDF v5.5.5 `esp32s3` fixed-partition build.
- Root `npm test` and `npm run build:desktop` regression.
- `git diff --check`, provenance, license, privacy, ASCII-path and artifact
  checks.

Push the branch and stop before port scan, Flash/NVS access, erase, flash,
monitor or HIL.
