# T11A Desktop status truthfulness handoff

## Result

This Windows-only package is complete on `codex/t11a-desktop-status-truthfulness`. It starts from locked T11A desktop base `73057c92be7f631c19619bb8984b66504abbb046`; the implementation commit is `de105c0`.

- Role: Windows desktop software implementation and no-hardware verification.
- Branch: `codex/t11a-desktop-status-truthfulness`.
- Base: `73057c92be7f631c19619bb8984b66504abbb046`.
- Scope: Workbench status truthfulness, legacy fixture migration, tests and project records only.
- Changed paths: `src/App.jsx`, `src/pages.jsx`, `src/styles.css`, `src/store/appStore.js`, `src/domain/dashboardStatus.js`, `tests/app-core.test.mjs`, `tests/dashboard-status-truthfulness.test.mjs`, `DESIGN.md`, `flow/`, and this handoff/index.
- Hardware operations: none.
- Open risk: packaged-app visual confirmation and physical Link evidence remain user-present work.
- Next action: fetch this branch, verify the reported remote HEAD, then run the five-point packaged-app check below after the wiring work is complete.

The Workbench no longer presents sample values as real hardware evidence:

- The large face and the three expression buttons are explicitly labelled software preview and never publish Agent State.
- The compact Xiaozhi summary reuses the sanitized DeskMate Link diagnostic already owned by the input bridge.
- EasyInput HID presence does not imply Xiaozhi connectivity. Missing, partial or invalid Link evidence is `unavailable`.
- Temperature, humidity and ambient-light readings remain `pending`; servo pose remains disabled/pending calibration.
- The fixed relative sync message and fixed calendar date were removed.
- Schema v9 resets only the exact historical `正在整理桌宠开发文档 / 68%` fixture to idle and preserves non-identical restored Agent events.

Stable product boundary is recorded in D042. No new protocol, status owner, HID report, device read or hardware adapter was introduced.

## Verification

- `npm ci --include=dev`: passed.
- `npm test`: `192/192` passed; zero failure, skip or todo.
- `npm run build:desktop`: passed, including .NET InputBridge Release publish, Vite production build and Electron Windows directory package.
- `git diff --check`: passed.
- Changed paths are ASCII-only; no firmware paths changed.
- Differential secret scan found no credential assignment.
- `dist/`, `release/`, `node_modules/` and native build output remain ignored.

Local package evidence (not committed):

- Path: `release/win-unpacked/DeskMate.exe`
- Size: 202,690,560 bytes
- SHA-256: `6993BAC803B0721D15FF6A3CD4838826D86BA02F88AB8873A80337F886DEFA0D`

## Safety and remaining acceptance

No application was launched or controlled. No port, LAN, device, Flash, NVS, microphone, OLED, servo, speaker or firmware action occurred.

Software status is `TEST_CONFIRMED / BUILD_CONFIRMED`. Physical status remains `HIL_NOT_RUN`. When the user is present, open the packaged app normally and confirm only these visible points:

1. The Workbench face says software preview.
2. A disconnected or unreadable Link is not shown as Xiaozhi synchronized.
3. The compact Link summary agrees with System Diagnostics.
4. Sensor and servo fields remain pending/disabled until their real adapters are accepted.
5. A real non-demo Agent event still appears, while the old fixed 68% demo does not return.

Do not treat this visual check as microphone, speaker, OLED, servo or full three-end acceptance.
