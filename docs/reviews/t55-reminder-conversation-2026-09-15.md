# T55 reminder conversation repair and acceptance

## Scope and implementation

User requested fixing voice-created reminders so they appear on the Workbench and speak at the due time. Baseline T54 `1cdecb0`, branch `codex/t55-reminder-conversation`. T54's accepted 500 ms silence and early interruption remain unchanged. No firmware, credentials, live reminder data or user settings changed.

- Normalize clock-attached Chinese minutes even without 分; support colon clocks and quarter-hour forms. Reject invalid hours/minutes rather than silently dropping them. A corrected clock replaces an invalid pending span instead of leaving the bad span to fail forever.
- Accept near-term “过一分钟” locally. Draft replies such as “我说的是明天下午六点”, “明天的这个时间” and a time-only “那你明天这个时间提醒我吧” stay in the trusted route. Retain selected reminder clock, event clock, date and purpose. Date-only corrections replace stale absolute/yesterday dates; minute-only changes retain known period.
- Workbench-save replies can confirm a valid proposal but cannot bypass missing/past fields. Unrelated chat, negation, cancellation, duplicate confirmation after save and expired drafts cannot create reminders. Drafts remain transient for two minutes; this package does not add a visible draft card or claim an unsaved draft is scheduled.
- Bridge diagnostics distinguish `awaiting-details` from persistence failure. Result `ok` remains false for an unsaved clarification; the outer operation reports successful handling, not a saved record. Durable store receipt remains the only basis of a saved confirmation.
- Reproduced an additional final-dispatch race: an event handler can save and synchronously clear the draft before the provider checks model bypass. Fixed by deciding trusted ownership before dispatching that final; it cannot also start free chat. New test failed on the old order and passed after the fix. This does not change ASR timing or barge-in thresholds.

This is a bounded local-language repair, not a claim of understanding arbitrary natural language. The existing bounded contextual model proposal path remains; clear requests/corrections add no model call. Historical screenshot/diagnostic did not contain the actual utterance, so synthetic cases are not attributed to the user.

## Verification

- Full final `npm test`: 809/809 passed (15 new T55 tests). An intermediate 807-test run passed before adding invalid-clock repair and dispatch-race cases. Two initial new tests used the wrong test accessor for bridge status; corrected to the actual API and rerun. No failing test was hidden.
- End-to-end test uses real isolated reminder persistence and readback, trusted voice bridge, Workbench reminder projection, fixed clock/scheduler and actual companion controller with synthetic provider/audio. It verifies no early delivery, `delivering` until audio drain resolves, then `notified`, no duplicate due claim and no standalone microphone capture. Existing T52 tests retain busy/retry, audio failure and active-conversation volume/listening restoration coverage.
- Isolated Electron UI: 29/29, 1440×1024 and 960×680, no unhandled renderer errors. Report in OS temp `deskmate-workbench-qa-DRoqNL/report.json`; compact screenshot inspected. The deliberately injected IPC/history warning belongs to the fixture, not the live app.
- `npm run build:desktop` passed; existing Vite bundle-size/dependency duplication warnings remain. Exact resource verifier plus T52/T53/T54/T55 final-ASAR probes passed. `git diff --check` passed. Real microphone recognition and audible reminder delivery are still user acceptance, not simulated completion.

## Package and restart

Candidate `release-t55/win-unpacked`, build ID `t55-reminder-conversation` (ignored artifacts).

| Artifact | SHA-256 |
| --- | --- |
| DeskMate.exe | 5C53AE9021B49D51A3A87C60001F1DF9A7C469AFC2A3B46ACD71A4A738EF4507 |
| resources/app.asar | 4FCA55696100F8F08AA82F384D9220066E1E573CB61C8B1472D7A93A5046089A |
| resources/input-bridge/DeskMate.InputBridge.exe | A0F85BAAEF2D017D42DE73D332EC45EA0ACDA3962EFB5B00EC26BA377FF7705D |

Stopped only revalidated exact T54 DeskMate/InputBridge processes, then launched T55 with the retained profile and `--show-companion`. Main PID 23388, responding, visible-window handle 987416. All observed app/input-bridge paths belong to T55. Read-only preference check remains 500 ms. No live reminder was inserted, no user file reset, and no firmware/Flash/NVS/servo action was performed.

## Manual acceptance

1. In T55, say “小岚，一分钟后提醒我喝水。” Wait for the saved confirmation.
2. Open Workbench → 提醒与重要事项. Verify one 喝水 entry and its future time. An empty card is a failure even if spoken wording sounds successful.
3. Keep the app running, computer awake and speakers audible. You may leave the companion page or finish the conversation. At due time, 小岚 should speak, without an alarm. Active dictation may defer delivery until the voice channel is free.
4. Verify the record changes to notified after playback; if unsuccessful, retain the record and export a new diagnostic immediately. Do not repeatedly create duplicate reminders while diagnosing.
5. Separately test “明天下午六点提醒我开会”; and a time correction after a clarification. Missing morning/evening or purpose may require one targeted answer, not a false success.

No live test reminder was created by the developer. KnowledgeOS focused Wiki search returned no match; no memory submission.
