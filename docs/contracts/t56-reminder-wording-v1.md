# T56 reminder title and spoken wording

Status: `T56_REMINDER_WORDING_V1_FROZEN`

User confirms T55 voice creation and audible due delivery worked; remaining issue is literal filler/request text in title and speech. Compare T55 `cleanReminderTitle` (提醒我 leaves 一下) and main delivery (literal 提醒你 + title). Clean only bounded spoken fillers and reminder-request wrappers, preserve substantive actions, negation, amounts, names and event/reminder timestamps. Filler-only purpose requires clarification. No LLM or new API call for cleanup or wording.

Use a deterministic delivery formatter with current saved persona ownerName, never a hardcoded or inferred name. Simple supported actions may use “喝水时间到了”; arbitrary titles use neutral reminder framing, not a claim that the event itself has begun (event time may be later). Old records are not rewritten; delivery may non-destructively remove clearly separated leading filler tokens. Ordinary dictation/history and reminder scheduler/receipt/audio-completion rules remain unchanged. Verify parsing, follow-up purposes, natural delivery, name fallback, old-title non-mutation, negation/number preservation, full tests, package and isolated UI. Real new spoken wording remains user acceptance.
