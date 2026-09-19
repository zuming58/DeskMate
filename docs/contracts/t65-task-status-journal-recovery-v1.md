# T65 Task status and journal recovery

Status: `T65_TASK_STATUS_JOURNAL_RECOVERY_V1_FROZEN`

- Supersedes T10/T16A Stop completion mapping: Stop means turn idle, SessionEnd means session closed, neither proves task accomplishment or triggers completion speech/motion. Explicit task-report completed remains supported. Existing seven-state hardware uses idle; closed is local task-list metadata only.
- The journal service owns automatic hourly/daily processing. The old per-source digest remains an explicit manual operation. Closing a journal marks its raw IDs summarized. Configured schedule, source consent and retained 23:00 preference remain authoritative.
- Memory-only calls use a 120-second deadline, 4096 review output tokens / 8192 synthesis tokens, concise synthesis instructions and the existing official DeepSeek V4 non-thinking restriction. Truncated JSON is an explicit error. Ordinary voice request deadlines are unchanged. Daily input is split at 6000 characters, including fragments of a single oversized record, without dropping raw text.
- Successful raw-review chunks are cached by full input digest and chunk digest in local SQLite `memory_journal_jobs`. Failed synthesis resumes the review checkpoints. This disposable cache is excluded from export/backup and removed by forget-all; a restored profile safely recomputes it, and restored-day consent holds remain authoritative.
- Daily failures persist bounded stage/reason/attempt metadata. Automatic attempts stop at three, with 5- and 15-minute backoffs. The UI shows failures and exposes a narrow retry operation. An interrupted/manual close resumes the sealed day; it never closes tomorrow twice. An older failure must not block today's scheduled cutoff.
- Historical completion immediately drains the immutable two-class outbox. An explicit manual sync bypasses backoff for pending/failed rows only; accepted rows never resend. Existing per-day/class uniqueness and idempotency keys remain unchanged. Remote acceptance and server raw-sealed receipts are distinct from published knowledge.
- `scripts/recover-memory-journals.cjs` is an explicitly invoked maintenance entry requiring a stopped desktop, specific profile, closed/historical day and report path. It uses existing services and credentials; its report contains only stage, counts and receipt metadata, not raw records or secrets.

Verification: synthetic timeout/restart/checkpoint/deduplication/concurrency tests; full desktop suite and packaged-source checks; live recovery uses existing authorized DeskMate records and verifies returned submission receipts.
