# T55 reminder conversation completion

Status: `T55_REMINDER_CONVERSATION_V1_FROZEN`

Trusted turn ownership must be decided before dispatching final to the controller. A synchronous local save may clear a pending reminder; rechecking claims afterward incorrectly starts a second free-chat model turn. Freeze ownership for that final only; do not cache stale claims across utterances.

Software only; preserve T54 500 ms endpointing, barge-in and ordinary dictation. Comparison against T51/T52/T53 and T54 diagnostic probes: Chinese minutes without 分 are lost; natural corrections fail the claims gate before semantic extraction; clarification is labelled failure. Implement complete clock normalization/validation, pending field-aware corrections and honest waiting status. Clear reminders remain local; relevant draft corrections must stay in the trusted route without capturing unrelated chat or treating negation as confirmation. Expired/cancelled drafts cannot save.

Retain selected reminder time and event time separately. Date-only, period-only and time corrections retain other known fields and purpose; missing/ambiguous fields require only targeted clarification. Accept informal Chinese minutes, colon clocks and common near-term reminder wording; invalid clocks cannot silently become a valid partial time. Save only after local validation and durable receipt. A request to put a pending item on the Workbench cannot override invalid/past time. Semantic proposals retain confirmation and expiry boundaries. Do not add continuous model calls or change wake behavior.

Verify voice bridge -> real isolated reminder store -> Workbench projection -> scheduler -> controller announcement -> accepted audio/drain -> notified, plus persistence failure, busy/retry, cancellation, duplicate confirmation, invalid date/time, unrelated chat, and expiry. Synthetic speech/audio evidence is not real microphone/speaker acceptance. No user reminder or credential data in repository, no hardware operations.
