# T09C desktop agent-state sender handoff

## Exact baseline

- Branch: `codex/desktop-t09-agent-state-sender`.
- Base: `d9f91e30e6f52325df70d0665f900de1164bfd96`.
- Implementation commit: `b93de789fd17b86f3022baa85abd52d2dff9dd29`.
- Contract: `T09_AGENT_STATE_DISPLAY_V1_FROZEN`.
- Status: `TEST_CONFIRMED / BUILD_CONFIRMED / T09_AGENT_STATE_DISPLAY_V1_FROZEN / HIL_NOT_AUTHORIZED`.

## Delivered

- Electron main owns the seven-state VoiceWorkflow mapping, transition IDs,
  TTL policy and private source hash.
- The resident input bridge accepts a 64-byte zero-padded `0x12` report,
  retains at most one in-flight and one latest queued state, and never replays
  stale state after disconnect or restart.
- The native bridge validates version, state, flags, transition, TTL and all
  transport padding before calling `HidD_SetFeature`.
- Mock STT and simulator sources are labelled non-live and never reach the HID
  sender.
- EasyInput accepts both compact TinyUSB forms and Windows-padded forms while
  preserving the 16-byte semantic payload.

## Safety and next gate

This package does not access hardware and does not modify Xiaozhi display,
servo or audio behavior. Desktop tests are `125/125`, EasyInput Host CTest is
`9/9`, the native protocol self-test and Release desktop package pass, and the
ESP-IDF v5.5.5 fixed-partition app is 318,768 bytes (`0x4DD30`) with SHA-256
`B275C31CBC681FF07A1AA79614AD39C397DB4045C9F2A7F040A46F95590C746D`.
This image is code-gate evidence only. The final remote HEAD must be rebuilt
cleanly and its new hash shown before any flash authorization is requested.

The next action is an independent review followed by a separately authorized
desktop plus two-board T09 OLED acceptance. Before that acceptance, also close
the two remaining T08 manual checks: disconnect TX and RX separately, then run
the T03-T06 combined regression. No app is flashed by this task.
