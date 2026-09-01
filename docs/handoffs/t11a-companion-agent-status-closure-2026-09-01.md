# T11A companion and Agent status closure handoff

## Exact baseline

- Role: Windows desktop software only.
- Branch: `codex/t11a-companion-agent-status-closure`
- Base HEAD: `b61cef36b856e802b1fb9bded7b2e2d81ba74808`
- Implementation commit: `cbb9097cab32669ae5d881fb1f14c04b1d961388`
- Status: `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`

## Delivered behavior

- The companion page places the real Xiaozhi seven-state test above the fold and moves Windows-only expression preview into the expression library. Preview never publishes Agent State.
- Companion, Connections and Diagnostics now render EasyInput HID, Xiaozhi Link and EasyInput LAN microphone readiness from one bounded runtime presentation model. An integrated but unselected board microphone is labelled `已接入 · 当前未选用`, not pending.
- EasyInput write ACK remains distinct from downstream DeskMate Link evidence. A disconnected Link is never described as synchronized to Xiaozhi.
- Codex automation is identified as `codex-hook-v1`, can be explicitly disabled, and uses only official lifecycle event metadata. Duplicate states are suppressed; states displaced by voice/companion ownership or disabled provider selection are not replayed.
- Reliable automatic mappings cover idle, thinking, working, waiting and completed. Official Codex Hooks currently expose no general turn-failure event, so `error` remains an explicit manual state; response text, window titles and process content are not inspected.

## Main changed paths

- `src/domain/deviceServiceStatus.js`
- `src/domain/agentControl.js`
- `src/App.jsx`
- `src/pages.jsx`
- `src/store/appStore.js`
- `electron/main.cjs`
- `docs/contracts/t10-codex-real-status-v1.md`
- `tests/device-service-status.test.mjs`
- `tests/expression-link-ux.test.mjs`
- `tests/manual-agent-control.test.mjs`

## Verification

- `npm ci --include=dev`: passed.
- `npm test`: `202/202`, zero failure/skip/todo.
- `npm run build:desktop -- --config.directories.output=release-t11a-verify`: passed native InputBridge Release publish, Vite production build and Windows Electron directory packaging. The alternate ignored directory avoided overwriting the user-open package.
- Package: `release-t11a-verify/win-unpacked/DeskMate.exe`, 202,690,560 bytes, SHA-256 `8E0E2453B983D7DC6BCD394B816C9A7E736476C036DF05E97FBA8BE4EC1F0FA1`.
- `git diff --check`: passed. Generated dependencies, native publish output, `dist/` and package output remain ignored.

## Safety and open gates

- No firmware file, protocol, device, port, Flash/NVS/eFuse, OLED, servo or audio hardware operation was performed.
- No automated UI acceptance was performed. The user-open application was left untouched while packaging used an alternate output directory.
- Packaged-app confirmation and physical Xiaozhi state observation remain `HIL_NOT_RUN`.
- The next independent software package may build continuous dialogue behavior, but it must keep any unfrozen EasyInput speaker transport behind an unavailable adapter and must not invent packet framing.
