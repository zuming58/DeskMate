# T54 follow-up: voice acceptable to user, reminder still unsaved

Scope: diagnosis only. User reports that 500 ms turn-taking/interruption now feels acceptable and asks why voice reminders still cannot reach the Workbench. No product code, live settings, real reminder records or processes changed.

## Current report

Report generated 2026-09-15T13:39:00.999Z (21:39 local), build `t54-fast-endpoint`. Both saved and session-applied endpointing are 500 ms. Controller reports ten interruptions and no sink drain/backpressure timeouts. Last normal stop reason is escape. The latest provider instance has no barge-final timeout/recovery; its counters must not be mistaken for the complete session history. One lifecycle provider error remains classified unknown, with three reconnects; the report does not establish its cause or that all voice reliability is accepted. The user specifically accepts the current conversational feel, so do not retune the 500 ms setting or early-barge gates.

Last reminder bridge outcome is `manage_personal_reminder`, `personal-reminder-time-in-past`, action clarify, draft active. Pending/delivering/failed/notified counts are all zero. This proves the last reported request reached the reminder flow and did not persist. It does not prove a disk write failure or a Workbench rendering fault. The screenshot's empty reminder card agrees with no saved active item. A clarification is labelled failed in bridge diagnostics although it is not a failed disk write.

The report contains no utterance or parsed date/minute fields. The exact request and reason for the reported broad capability denial remain unknown. Asked the user for approximate wording and follow-up without blocking read-only investigation.

## Reproduced defects, not assertions about the user's exact words

At a fixed local clock 2026-09-15 21:39, invoking the current parser in memory:

| Synthetic phrase | Actual outcome |
| --- | --- |
| 今晚九点四十五分提醒我喝水 | create at 21:45 |
| 今晚九点四十五提醒我喝水 | clarify: time-in-past |
| 晚上九点五十分提醒我喝水 | create at 21:50 |
| 晚上九点五十提醒我喝水 | clarify: time-in-past |
| 明天下午六点提醒我开会 | create at tomorrow 18:00 |
| 明天下午四点有活动，下午一点提醒我 | create reminder at tomorrow 13:00 |

`normalizeReminderSpeech` converts Chinese numerals only before selected unit characters; an informal Chinese minute number without 分 remains Chinese. `TIME_PATTERN` accepts Arabic minute digits, so the unconverted minutes disappear from time parsing and 21:45 becomes 21:00. That falsely triggers the elapsed-time guard in the reproduced case. The guard itself is appropriate for genuinely elapsed times; removing it is not the fix.

After a synthetic initial “下午六点提醒我开会” at 21:39, a fake in-memory store shows:

| Follow-up | Claimed by reminder conversation | Saved |
| --- | --- | --- |
| 明天 | yes | yes |
| 明天下午六点 | yes | yes |
| 对，就是明天下午六点 | yes | yes |
| 我说的是明天下午六点 | no | no |
| 明天的这个时间 | no | no |
| 你帮我加到工作台里 | no | no |

`PersonalReminderConversation.claims` uses narrow anchored phrases for draft completion. Both provider model-bypass and controller trusted-turn execution depend on these claims. Unclaimed natural corrections fall into free conversation, whose model cannot write reminders. The bounded semantic extractor exists but is inside `executeAsync`; an unclaimed follow-up never reaches it through this production route. Even when invoked, extraction returns Chinese canonical text to the same rule parser rather than a robust structured date/field update.

The model already receives explicit system instructions that DeskMate supports reminders, cannot claim a save without receipt, and requires the app running and voice available for spoken delivery (`electron/companion-model-adapter.cjs`). Thus this is not simply missing a “you can remind” persona sentence. A leaked follow-up can still produce an unhelpful capability response; the precise observed response is not recorded and cannot be attributed with certainty.

## Existing implementation and verification

Main owns `PersonalReminderStore`, the local due scheduler, voice bridge and Workbench change event. Actual creation validates timestamps then persists atomically and returns a receipt. Workbench uses saved records, not the transient two-minute voice draft. Therefore “retained draft” is not “reminder scheduled” or “visible Workbench card.”

Existing T51/T52/T53 targeted suite: 54/54 passed, including real isolated-store/dashboard/scheduler coverage. These old passing tests do not cover the newly reproduced colloquial-minute and natural-follow-up failures. All new probes used a fixed clock, fabricated phrases and in-memory stores, without API calls or creating live reminders. No physical spoken-delivery acceptance claimed.

## Recommended next implementation scope

1. Keep T54 voice timing/interruption unchanged. Normalize complete colloquial clock expressions, including optional 分, and reject partially parsed times rather than silently losing minutes.
2. Retain structured pending fields (date, period, hour, minute, title, event/reminder distinction). Route relevant natural corrections to that draft before ordinary chat; do not treat every unrelated conversation as reminder confirmation.
3. Use local interpretation for clear requests and one bounded semantic field extraction only when genuinely necessary. Preserve context, ask only for missing/ambiguous fields, validate then persist; never substitute a generic incapability reply or invent a save.
4. Distinguish waiting-for-clarification, saved and persistence-failed states. Consider a separately labelled Workbench pending-confirmation card so a voice draft is visible without pretending its timer is scheduled.
5. Add content-free routing/parse/save outcome diagnostics and end-to-end conversation tests for the above vectors. Final acceptance requires the user's voice request to create the Workbench record and speak at its due time while the app is running.

KnowledgeOS focused Wiki search returned no match, with no degradation; no memory submission. Baseline `1cdecb0` on `codex/t54-fast-endpoint`.
