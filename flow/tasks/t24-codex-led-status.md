# T24 Codex status on EasyInput LEDs

- Status: `CODE_AND_BUILD_CONFIRMED / HIL_NOT_RUN`
- Requested: 2026-09-11
- Contract: [`t24-codex-led-status-v1.md`](../../docs/contracts/t24-codex-led-status-v1.md)

## Goal

Use the five EasyInput LEDs for real Codex work-state colors so Xiaozhi can keep a neutral face except while speaking. The feature must also work when the optional Xiaozhi hardware extension is disabled.

## Boundaries

- Reuse Feature report `0x12` with a dedicated local-only source and advertised capability.
- Do not forward the dedicated source to Xiaozhi and do not change the frozen behavior of other T09 sources.
- Preserve T04 input effects as short, higher-priority animations; restore the latest base state afterward.
- Keep GPIO12/GRB and the single GPIO8 power owner unchanged.
- No hardware access or firmware write is authorized by this task.

## Remaining gate

Desktop tests, native Host tests, the ESP-IDF fixed-layout build and Windows packaging have passed. A user-present, separately authorized EasyInput firmware update and visual matrix are still required. Code/build evidence must not be presented as physical acceptance.
