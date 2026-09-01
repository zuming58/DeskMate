# T12B companion layout, timing settings and evidence handoff

## Identity

- Repository: `F:\Codex\deskmate`
- Isolated worktree: `F:\Codex\deskmate-t12b-companion-layout-timing-settings`
- Branch: `codex/t12b-companion-layout-timing-settings`
- Exact base: `7555d4161b90df000aae600a098ea336e198c743`
- Implementation and verification commit: `c1c35cd4ce74b78e1d9d690ab6bc3b81ec4f3599`
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

## Safety

The T12B package was not launched or controlled. Before the active task was corrected after a context handoff, existing T12A processes were mistakenly restarted once; no further application control occurred. No credential, transcript, reply, PCM, provider payload, port/device, firmware, Flash/NVS, OLED, servo or audio-hardware access occurred. Build outputs remain ignored and are not committed.

## Remaining user-present acceptance

1. Launch the exact package manually and confirm the face is not vertically stretched at the main size or a smaller window.
2. Start a session, save a visibly different pause/idle value, and confirm the UI says the active session is unchanged.
3. End and start a new session; export a sanitized diagnostic and confirm `saved` equals the new values while the new `sessionApplied` records the same revision.
4. Exercise one real sentence pause and an idle auto-stop; confirm the diagnostic has a bounded partial-to-final sample and completed stop evidence.
