# T12B companion layout, timing settings and evidence handoff

## Identity

- Repository: `F:\Codex\deskmate`
- Isolated worktree: `F:\Codex\deskmate-t12b-companion-layout-timing-settings`
- Branch: `codex/t12b-companion-layout-timing-settings`
- Exact base: `7555d4161b90df000aae600a098ea336e198c743`
- Implementation and verification commit: `c1c35cd4ce74b78e1d9d690ab6bc3b81ec4f3599`
- Packaged renderer startup hotfix: `c2aa8b6f7fd48d6a18cbdbcd67688062a46aa2bf`
- Build ID: `t12b-companion-layout-timing-settings-v1`
- Final implementation HEAD: report the pushed branch tip; a commit cannot contain its own hash.

## Delivered

- Removed the Companion overview's grid/full-height/flex stretch chain. The realtime face is bounded to `3:2`; the left realtime card and hardware-state test no longer inherit the height of the right settings stack.
- Replaced auto-saving presets with a draft form and one explicit Save action. Provider pause accepts 0.5–50 seconds by 0.5; listening idle stop accepts 0/off or integer 10–3600 seconds.
- Electron main validates, atomically writes, rereads and revision-tags preferences. A conversation snapshots one revision before start; its provider identity, endpointing and idle policy stay frozen through that session and reconnects.
- Diagnostics distinguish saved from session-applied timing. They add only a bounded provider partial-to-final interval and sample count; identity, wake phrase, text and audio remain excluded.
- Idle timeout now publishes final stop lifecycle evidence after completion. The renderer retains lifecycle/timing metadata carried by non-state events, while lifecycle-only events cannot reopen the compact overlay.
- T12A physical EasyInput call behavior, VoiceWorkflow arbitration, microphone selection, strict half-duplex, memory and Agent/Link behavior are unchanged.

## Verification

- `npm ci --include=dev`: passed, 398 packages.
- Full `npm test`: `267/267` passed.
- `npm run build:desktop`: passed.
- Packaged build ID: `t12b-companion-layout-timing-settings-v1`.
- `DeskMate.exe`: `202690560` bytes; SHA-256 `8C53F101492C35B279DCEB6BE7AF75108A5CB098E3BEA28A2C74D4248C5811A3`.
- `app.asar`: `112679861` bytes; SHA-256 `5ED1632252AB8DB287FE2EC67FC058ECC379DD497760243EA0B7EC3A56C92271`.
- `git diff --check`, ASCII tracked paths and firmware/native source boundary checks passed.

## Packaged renderer startup hotfix

- First packaged launch exposed a white window: Electron loaded, but React failed on its first render because `AppContent` used the existing App Store `patch` action in companion-preference hydration without selecting that action from `useAppStore`.
- The fix adds the missing selector only; no state machine, preference contract, firmware or hardware behavior changed.
- A real first-render smoke test now loads `src/App.jsx` through Vite SSR and renders the shell with React. It covers the exact runtime reference failure that a successful Vite bundle did not detect.
- Final focused T12B tests: `9/9`; final full tests: `269/269`; final Windows packaging: passed.
- Rebuilt `DeskMate.exe`: `202690560` bytes; SHA-256 `A02519A277F9676D3AB8DA1E118804B75CB8E487681324BEC252796CDDB49AC0`.
- Rebuilt `app.asar`: `112679856` bytes; SHA-256 `142F769D5F228ED3C330E2D7F97365E4BD87EA04C72FE7DF2A1BDA260A3E0181`.

## Safety

The T12B package was not launched or controlled. Before the active task was corrected after a context handoff, existing T12A processes were mistakenly restarted once; no further application control occurred. No credential, transcript, reply, PCM, provider payload, port/device, firmware, Flash/NVS, OLED, servo or audio-hardware access occurred. Build outputs remain ignored and are not committed.

## Remaining user-present acceptance

1. Launch the exact package manually and confirm the face is not vertically stretched at the main size or a smaller window.
2. Start a session, save a visibly different pause/idle value, and confirm the UI says the active session is unchanged.
3. End and start a new session; export a sanitized diagnostic and confirm `saved` equals the new values while the new `sessionApplied` records the same revision.
4. Exercise one real sentence pause and an idle auto-stop; confirm the diagnostic has a bounded partial-to-final sample and completed stop evidence.
