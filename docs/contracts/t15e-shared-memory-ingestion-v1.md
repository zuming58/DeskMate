# T15E shared memory ingestion v1 — FROZEN

## Scope

This contract applies to the DeskMate Windows application only. It does not change EasyInput firmware, Xiaozhi firmware, HID reports, DeskMate Link, OLED, servo, or audio wire protocols.

## Sources

The local memory store accepts exactly two independent sources:

- `companion`: final user and assistant turns committed by the companion conversation controller.
- `dictation`: successful final `voice-input` history events from a real STT adapter.

Voice edit, mock STT, failed/cancelled/empty transcription, raw audio, credentials, network identity, device paths, and hardware diagnostics are excluded. Existing rows without a source migrate to `companion` without deleting content.

## Policy and schedule

- Both source switches default to enabled and can be disabled independently, including both off.
- The default schedule is daily at local time `23:30`; users may choose another `HH:MM` minute or manual-only mode.
- Each source owns an independent last result and startup catch-up path. A failed source remains retryable without rerunning a completed source.
- Empty input never calls the model and never creates an empty summary.
- The memory page shows the next local run and each source's latest completed, no-pending, or failed result in compact status rows; a failed result explicitly points to manual retry.

## Storage and idempotency

- Daily summaries are keyed by `(source, local_day)`. Same-day companion and dictation summaries never share a row.
- A digest run is uniquely identified by SHA-256 over `source + local_day + input_digest`.
- `input_digest` is SHA-256 over the stable ordered set of source/day turn IDs, timestamps, roles, and content.
- Repeating the same run does not duplicate summaries, candidates, or processed turns.
- Candidates inherit the source of their daily summary and remain pending until explicit user review.

## Projection and retrieval

- SQLite remains the source of truth.
- Managed Markdown daily notes are written to `DeskMate/daily/<source>/YYYY-MM-DD.md`.
- Reviewed memory notes include `source` frontmatter and link to the matching source/day note.
- UI listing and local hybrid retrieval support `all`, `companion`, and `dictation` source filters.
- External edits are preserved through the existing managed-manifest conflict rule.

## Safety and privacy

Only bounded status, source labels, counts, and sanitized failure codes cross preload. Raw turns, digests, vectors, database paths, Wi-Fi information, device identity, and credentials remain in Electron main.
