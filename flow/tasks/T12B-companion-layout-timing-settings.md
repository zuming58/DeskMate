# T12B companion layout, timing settings and evidence

Status: `WINDOWS_CODE_BUILD_CONFIRMED / USER_VISUAL_RUNTIME_HIL_PENDING / NO_FIRMWARE_CHANGE`

## Base

- Branch: `codex/t12b-companion-layout-timing-settings`
- Exact base: `7555d4161b90df000aae600a098ea336e198c743`
- Scope: Windows software only.

## Deliverables

- Independent Companion overview columns and a bounded `3:2` face.
- Explicit draft/Save/readback preferences with manual timing ranges.
- Per-session frozen identity, provider pause and listening idle policy.
- Separate saved versus session-applied diagnostic evidence.
- Content-free provider partial-to-final timing and final idle-stop lifecycle evidence.
- Full desktop regression and packaging without app/device operation.

## Gates

- `npm ci --include=dev`
- `npm test`
- `npm run build:desktop`
- packaged build-ID inspection, hashes, `git diff --check`, ASCII path and firmware/native source boundary checks.
