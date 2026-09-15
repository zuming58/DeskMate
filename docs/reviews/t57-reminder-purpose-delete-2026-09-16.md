# T57 reminder purpose extraction and deletion

## Cause and scope

The user's T56 diagnostic reports a completed manage_personal_reminder action, one pending item and one notified item. The screenshot and user explanation show that an answer to the previous question was saved together with the new reminder purpose. The diagnostic is content-free and does not independently prove the original wording.

Local comparison confirms T56 executeAsync called the writing local parser first and returned immediately on create. Its contextual extraction only ran after unresolved parsing. T57 prepares without writing, sends mixed purpose to a bounded title-only extraction, validates grounding/constraints and only then persists with the unchanged local reminder/event times. A failed extraction asks for purpose and retains those times. Clear requests remain local; existing records are not silently rewritten. Synthetic model responses verify routing, not actual provider understanding or audio quality.

Workbench adds selected-title delete confirmation, cancel, in-flight state, failure/retry feedback and a narrow delete IPC. The main store removes exactly one row with existing durable readback and rearms the scheduler. A delivering record is protected until speech ends; no claim that deletion can retract audio already played. Previous internal snapshots retain their existing recovery behavior. Conversation history and KnowledgeOS memory are not removed.

## Verification

- New T57 tests cover mixed utterance/purpose reply, fast path, invalid/unavailable extraction, retained event/reminder time, negation/numbers, stale responses, durable deletion/restart/failure, delivery protection and timer rearm.
- Initial full run exposed two build-ID assertions still pinned to T56; they now assert T57. A subsequent 828/829 run exposed T21J's six-hour-old fixture crossing midnight because it used Date.now. The fixture now uses fixed midday and an additional midnight regression explicitly excludes yesterday. Production calendar-day behavior is unchanged. The next full run passed 830/830; final added substantive-setting action coverage is verified in the closing progress entry.
- Isolated real React/preload UI 34/34, 1440x1024 and 960x680; report `deskmate-workbench-qa-QsjDla/report.json` in OS temporary output, no unhandled renderer errors. Includes delete/cancel/failure/retry and active-delivery disabled control. The fixture intentionally injects an overview IPC failure; it is not a production failure.
- Desktop build and archive probes pass for purpose extraction, retained time, deletion surface, T55/T56 behavior, 500 ms endpoint and exact bundled resources. Final artifact hashes and final test totals are recorded in the closing progress entry.

## Acceptance and deployment boundary

Test in the new package: ask for a reminder time, then answer the purpose with mixed chat such as “挺好笑的，你你帮我设置喝个水吧”. The card should contain only 喝水, at the retained time. Also test a complete mixed sentence containing a future reminder time. Cancel a deletion first; then confirm deletion and verify only that card disappears and is not subsequently announced.

No real reminder was created/deleted, no credentials changed, no cloud test used, and no firmware/Flash/NVS/servo action was performed. Existing raw-title cards remain until the user deletes them. Do not confuse a built package with a restarted production process; the final progress entry states whether deployment occurred. KnowledgeOS Wiki search returned no match; no work-memory submission.
