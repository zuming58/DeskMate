# T53 natural interruption and reminders — delivery

## Implemented

- Explicit stop commands remain the immediate current-item path. Ordinary confirmed or consistent distinct partials now yield playback after a 250 ms observed evidence floor, without waiting for ASR final or calling a classifier. Short meaningful speech is eligible; noise labels, fillers, pure numeric candidates and assistant echo remain rejected. Identical hypotheses preserve, rather than reset or inflate, accumulated stability. A matching final starts one replacement turn; inconsistent finals cannot replace accepted speech with unrelated content. Partial activity refreshes the pending-final recovery timer. Speech crossing playback drain can release the old-item filter with confirmed/stable non-echo evidence.
- Polite reminder requests precede capability questions. Common synonyms, relative minutes/hours and Chinese numerals route locally. Bare 1–12 hours require clarification; near-time language can resolve the next same-day occurrence within four hours. Invalid dates/past times cannot silently roll forward. Pending reminders accept affirmative/date/period corrections without requiring the purpose again.
- Unresolved contextual reminder expressions can request one structured extraction using current local time/timezone, at most six recent messages and a bounded pending draft. Clear requests invoke no extraction API. Model-extracted complete proposals require a short user confirmation before local persistence; stale/expired/cancelled asynchronous results cannot write. Free chat knows the actual reminder capability but cannot fabricate a save receipt.
- Local scheduler, durable delivery/retry, TTS-only standalone announcements, settings and storage formats remain unchanged. No new idle API calls, hardware/firmware operations, profile reset or exported user content.

## Verification

- `npm test`: **784/784**, zero failed/skipped. After final small corrections, `node --test tests/*.test.mjs`: **784/784** again. T53 adds 24 tests. Older final-only assertions were explicitly revised to match the superseding T53 contract; numeric/mismatched-final and echo/noise vectors remain tested. The earlier full run caught one additional old final-only assertion in preemptive generation; it was updated and rerun, not ignored.
- `npm run build:desktop`: passed native bridge publish, frontend build, Electron directory package and exact resource checks. Existing Vite >500 kB chunk advisory remains. Built `release/win-unpacked` was moved within the workspace into a previously absent `release-t53/win-unpacked`, then reverified there; the running T52 directory was not overwritten.
- `node scripts/verify-prompt-package.cjs release-t53`, `node scripts/verify-t52-reminder-package.cjs release-t53`, and `node scripts/verify-t53-natural-package.cjs release-t53`: passed exact sources/resources and final-ASAR behavior. These load pure modules with fixtures, never production main or real audio.
- Isolated Electron UI: **29/29**, 1440×1024 and 960×680, synthetic reminder states/navigation/error recovery and no horizontal overflow. Report and screenshots: `C:/Users/Administrator/AppData/Local/Temp/deskmate-workbench-qa-n9vLGZ`. Inspected compact screenshot. Initial `electron.cmd` wrapper failed because its resolved executable path contained a newline; direct `node_modules/electron/dist/electron.exe scripts/verify-workbench-overview.cjs` succeeded. No dependency files were rewritten to mask it.
- `git diff --check`: passed. No private recording/transcript/configuration or build output added to Git.

## Delivered package and startup

- Build ID: `t53-natural-barge-reminders`; branch: `codex/t53-natural-barge-reminders`.
- EXE SHA-256: `98F0FE407984B7E9558D5EEDB716FE173068DB6DD2246EA3CB98A40A392AE876`.
- ASAR SHA-256: `759FB0064E5D6FA8EC4A4A4290B46F2ED76CE0B8437CE8D6C1E323B08CC1F510`.
- InputBridge SHA-256: `A3E941F1170C3E951C6136A53109B3142F6A27972765929BD42B2A77D2B69956`.
- Restart explicitly requested by user. Stopped only rechecked exact T52 executable/native-bridge process paths, then launched T53 with `--show-companion`. Saved profile was retained; no app data deletion or restore occurred. Main PID **42752**, responding, window handle **6950320**. All observed DeskMate/InputBridge processes are from `release-t53`; no observed T52 remainder.

## Limits and user acceptance

The 250 ms floor is not a measured end-to-end microphone-to-speaker interruption latency. Earlier yielding necessarily cannot wait to discover that an otherwise plausible confirmed partial is later revised away; the new code rejects an inconsistent final but cannot retroactively undo already yielded audio. Real noise/echo vs ordinary-interruption balance still needs microphone/speaker acceptance. Numeric-only interruptions deliberately remain guarded. Complex semantic extraction is mocked in tests, not verified through a paid live model call. Failed extraction retains a recoverable clarification rather than claiming creation. Software must be running and voice output available for on-time spoken notification; powered-off wake scheduling is not added.

User sequence: (1) interrupt a story using ordinary unrelated speech, without a stop keyword; verify the new sentence receives an answer; (2) also test explicit stop and one non-speech sound; (3) ask for a one-minute reminder and verify a Workbench record immediately, then spoken delivery; (4) request an ambiguous eight-o'clock reminder and answer only “明早” or the requested confirmation. These real tests remain pending, not passed by the automated suite.
