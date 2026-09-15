# T52 ordinary interruption and reminder follow-up diagnosis

## Scope and evidence

User requested inspection first. No product code, settings, user records, running process, or hardware were changed. Inspected the redacted report generated at 2026-09-15 19:40:12 Asia/Shanghai, current source, T21B/T49/T52 contracts, and synthetic in-memory probes. The report identifies `t52-reminder-listening-reliability`; this is not another T51 report. Inspection HEAD: `e46f6d7c5a85966e0fd3b747f5a2fd71d65b0095`, branch `codex/t52-reminder-listening-reliability`.

The report contains no utterance text or audio. Counters cannot establish which rejected candidates were genuine user speech, nor reproduce the exact spoken refusal. Do not copy private source data into this review.

## Ordinary interruption

| Evidence | Meaning |
| --- | --- |
| 65 candidates, 2 accepted; explicit 2, ordinary final 0 | Explicit stop commands worked; no ordinary interruption was accepted in this pipeline snapshot. |
| 40 weak, 3 unstable, 20 deferred partial, 3 inconsistent-final decisions | Recognition candidates reached the interruption filter; these are decisions, not counts of lost user sentences. |
| T21B contract | Stable/confirmed ordinary partial evidence could interrupt before the final. |
| T49 change, retained by T52 | Ordinary partials are deferred until a matching completed utterance passes additional evidence checks. Explicit commands retain the faster path. |

The earlier false-interruption repair intentionally narrowed ordinary interruption. The feature is not literally keyword-only, but its current gate makes it behave that way for many short or imperfectly segmented utterances. Final evidence requires at least five meaningful characters and 900 ms, plus a confirmed prefix, stable partial agreement, or the stricter no-partial fallback.

An additional source defect is independently reproducible in `electron/three-stage-companion-provider.cjs`: `consistentPartial` returns false for identical text; `recordPartialEvidence` then resets `stablePartials` to one. With no confirmed prefix, a stable two-partial sequence can accept its final, but repeating its last partial causes the identical final to be rejected as inconsistent. A single full partial followed by the same final also fails this evidence path. Reproduction used synthetic text and a 1800 ms speech interval, not user recordings.

T52's fresh post-playback speech-start path ran five times; eight old-item tail drops remain. This does not establish that all tail drops were valid echoes. Speech starting before playback ends and continuing after it without a fresh start remains a boundary case requiring an explicit test vector.

## Reminder creation

The report's latest reminder action is `capability`, with no active draft and pending/delivering/failed/notified counters all zero. These counters do not enumerate completed or cancelled historical records.

Synthetic parser probes, using a fixed clock and no user store:

| Synthetic request | Actual result |
| --- | --- |
| 明天下午六点提醒我开会 | create |
| 你能明天下午六点提醒我开会吗 | capability; no creation |
| 你可以下午六点提醒我开会吗 | capability; no creation |
| 你有没有提醒功能 | capability, expected |
| 十分钟后提醒我开会 | clarify: time-missing |
| 明天下午六点叫我去开会 | unrecognized |

`electron/personal-reminders.cjs` matches a broad capability expression before parsing concrete reminder time/purpose. Consequently polite creation requests are swallowed by the capability branch. A conversation probe also confirmed that this branch creates no draft, so a subsequent time-only reply is not claimed; the stub store received zero creates.

The deterministic capability answer says reminders are supported, not that they are impossible. The reported refusal therefore cannot be attributed directly to that answer. Unclaimed paraphrases/follow-ups can enter free chat, whose model instructions do not explicitly describe the local reminder capability and forbid tool execution. This is a plausible additional explanation, not verification of the exact spoken wording.

Local storage and due-delivery implementations exist. The demonstrated failure is natural-language routing and creation; with nothing scheduled, this report cannot establish whether due playback itself works or fails.

## Other observations and verification

- Provider/transport/dialog errors are zero; last stop is completed `listening-idle-timeout`, with 10000 ms saved and applied. This recorded stop is not a demonstrated crash.
- Reconnection counters include separate sessions and are not proof of transport faults.
- Focused existing tests passed: `node --test tests/t21-three-stage-streaming-companion.test.mjs tests/t51-personal-reminders.test.mjs tests/t52-reminder-listening-reliability.test.mjs` — 55/55. The reproductions above expose gaps in those tests; this is not live voice acceptance.
- KnowledgeOS Wiki focused search returned no results; no memory submission was performed.

## Next repair boundaries

1. Restore evidence-based ordinary early interruption using the fixed T21B reference/contract, while retaining explicit-stop priority and echo/noise rejection. Add repeated-identical partial, short genuine speech, mismatched final, and speech-across-playback-boundary vectors before changing thresholds.
2. Give concrete reminder creation precedence over generic capability questions; preserve appropriate follow-up state. Cover polite forms, relative time, and common reminder paraphrases without treating every casual time mention as authorization to create.
3. Provide truthful capability context to free chat, but only announce creation after the local persistence receipt. Test voice request → visible Workbench record → due spoken reminder as separate acceptance steps.

This round is diagnosis only. Neither reported feature should be marked accepted or fixed based on the existing passing tests.

## Follow-up: latency and contextual time interpretation

User clarified that explicit keywords are a fast interruption path, not a prerequisite for ordinary interruption. Ordinary interruption must remain available without waiting for complete semantic understanding. Reminder clarification should ask only about genuine ambiguity and retain prior content; fully specified requests should save directly.

Source inspection separates cheap local checks from waiting for evidence: ordinary interruption is gated on ASR final, speech duration, and text length; the slow perceived interaction is primarily caused by waiting for a completed utterance, not merely the count of local comparisons. No new timing benchmark was performed. A future design should separate yielding the speaker from finalizing recognition/answering; preserve echo protection and captured speech, without adding an LLM classifier before yielding.

Further synthetic fixed-clock parser probes:

| Local clock | Synthetic request | Current result |
| --- | --- | --- |
| 2026-09-15 19:30 | 一会儿八点钟提醒我开会 | Creates Sep 16 08:00, ignoring 一会儿 |
| 2026-09-15 07:30 | 一会儿八点钟提醒我开会 | Creates Sep 15 08:00 |
| 2026-09-15 19:30 | 晚上八点提醒我开会 | Creates Sep 15 20:00 |
| 2026-09-15 19:30 | 六点提醒我开会 | Requests AM/PM clarification |

`resolvedHour` treats only hours 1–7 as intrinsically ambiguous; 8–11 are interpreted as morning absent an explicit period. The parser then moves a past unqualified time to tomorrow. This is not contextual resolution, and can silently schedule the wrong occurrence. The current conversation draft is limited text reconstruction plus narrow reply patterns, not the main conversation's semantic context.

Recommended design, not implemented: keep the fast deterministic path for clear requests; use the existing conversational model with constrained reminder extraction for flexible expressions, supplying the local current time/timezone, relevant recent turns and a structured pending reminder. Validate and persist locally, resolve genuine ambiguity with one targeted question, and require a persistence receipt before claiming success. Do not add serial model classification calls to all ordinary chat or interruption. Ambiguous times must not be silently rolled to tomorrow; explicit dates/periods and user corrections outrank proximity guesses. No product change or real reminder creation occurred in this follow-up.
