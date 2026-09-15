# T51 Personal Reminders v1

Status: `FROZEN`

## Product boundary

Personal reminders belong to the DeskMate Workbench and are independent from Codex task status. A record has a user-visible title, an optional reminder time, an optional separate event time, an important flag and a lifecycle state. An important item may intentionally have no notification time.

## Voice contract

- Explicit personal-reminder utterances are handled by the trusted local intent bridge before the free-conversation model.
- “明天下午4点有活动，下午1点提醒我” creates an event at 16:00 and a notification at 13:00. The two times must not be collapsed.
- Ambiguous small hours such as “明天4点” require the user to say morning or afternoon. DeskMate must not guess.
- Explicit important-item capture may be stored without a time. Queries list only unfinished personal reminders and important items.
- Parsing, persistence, querying and background scheduling make no model, ASR, TTS or KnowledgeOS API request. Ordinary companion ASR still follows the existing three-stage voice contract; at the due time a bounded one-shot TTS announcement may use the already configured voice service.

## Persistence and delivery

- The main process owns `personal-reminders.json`; the renderer receives only bounded IPC projections and never a file path.
- Writes are validated, atomic, read back and preserve the previous valid file. Corrupt data is not replaced with defaults.
- The scheduler uses one local timer. A due reminder is durably changed from `pending` to `notified` before delivery, preventing repeated announcements after a restart.
- Delivery has no alarm, system notification sound or separate ringtone. 小岚 directly speaks one short reminder at the configured reminder volume. If dictation owns the voice channel, delivery returns to a short local queue and retries after the channel becomes available instead of interrupting dictation or pretending it was spoken. Reminder titles never enter diagnostics.
- “稍后 10 分钟” returns an item to `pending`; “完成” removes it from the active Workbench list without deleting the durable record.
- Local backup and restore include personal reminders. Credentials remain excluded.

## Workbench contract

The Workbench shows one responsive “提醒与重要事项” card. It supports manual creation, separate reminder/event time, important marking, completion and ten-minute snooze. Only active items are shown, with a bounded first page. Every asynchronous action has a busy/error result and does not silently discard a draft.
