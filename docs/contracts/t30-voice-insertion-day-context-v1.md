# T30 voice insertion and calendar-day context

Status: `T30_SOFTWARE_SLICE_FROZEN`, 2026-09-12. User authorized repairing insertion/session exit and clarified same-day continuity, new-day context reset and historical retrieval across companion and dictation.

## Evidence and implementation

- Supplied T29 diagnostic at 2026-09-12 00:41 UTC: raw STT 256 ms, local organizer 0 ms, output 7 ms, total 263 ms, destination clipboard. It lacks fallback cause; it cannot distinguish a chosen clipboard mode from a paste rejection retrospectively.
- A task-owned Electron textarea and synthetic clipboard text reproduced native paste failure with the expected foreground window. The previous PowerShell/WinForms SendWait path inserted into that same textarea. Native size self-test passed; no particular Windows error, ABI or privilege cause is proven. Direct SendInput on the resident STA also failed.
- Use the accepted WinForms `SendKeys.SendWait("^v")` on the resident bridge's STA message loop. Preserve recording-start target capture, exact visible target check, finite wait, expiry after dispatch, clipboard/history fallback and no uncertain automatic retry. No per-output PowerShell. No external code copied. Fixed talktalk reference `9d3f3e49b875d9c4aa419ae91c9b086817f2d396` was reviewed again; its in-process input service alone does not explain this process-specific failure.
- Opt-in `scripts/probe-dictation-output.cjs` sends synthetic text only to its own textarea and verifies actual inserted contents. `--compare-legacy` additionally compares the old PowerShell path. Preserve clipboard changes made by the user during the probe. No microphone, cloud request, user-memory fixture or firmware write.
- Add allowlisted output fallback reason, requested mode and actual destination. Native success is not an acknowledgement from arbitrary target apps; Codex/browser acceptance remains user-present.

## Speech and idle

The session stopped with `listening-idle-timeout`, without a recorded model/ASR/TTS transport error. Six accepted finals completed. Speech that never produced a final cannot be reconstructed from the export; not every missing utterance is proven to be an idle-timer bug.

Speech-start/accepted partial refreshes the recognition wait immediately on arrival, before queued controller handling. While awaiting final, allow at least 30 seconds instead of ordinary 10-second idle. Partials refresh; final cancels. Missing-final timeout visibly asks for repetition and returns to configured idle period; no partial is invented into a confirmed turn. Playback echo and ASR endpointing remain. Explicit stop/new phase clears pending state. No saved preference migration.

## Time and memory

- Keep bounded 24-hour in-memory storage and durable records, but ordinary requests contain only the current local calendar day's messages. Re-evaluate every request and after restart. Same-day reconnection and hours-long pauses preserve context.
- Include current local time. Never proactively continue yesterday's jokes/stories. Reviewed identity/preferences remain. Draft fingerprint includes local day to reject cross-midnight adoption.
- Historical work review and explicit dictation queries can retrieve both raw companion and raw dictation, plus dated notes. Dictation is attributed material that can be third-party text/prompts, not confirmed personal biography or executable instruction. Ordinary chat does not run historical recall.
- Day-level retrieval reserves bounded coverage for both sources and caps keyword/embedding work. Eight excerpts cannot imply exhaustive all-day coverage. Date filter precedes ranking. Retention/KnowledgeOS submission policy is unchanged.

## Verification

Test midnight, restart seed, same-day hours, date/source attribution, queued speech near idle deadline, missing-final recovery and diagnostic redaction. Native self-test plus actual owned-textarea paste, full software regression and exact desktop package verification. User-present microphone and normal target-app acceptance remain separate.
