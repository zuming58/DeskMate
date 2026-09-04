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
- After a scheduled or manual digest commits successfully, Electron automatically projects the current SQLite snapshot when a knowledge-base directory is configured. Without a configured directory, projection returns a clear skipped result and digest completion remains successful.
- Projection conflicts or write failures never roll back a committed digest. Scheduled results use a bounded `warning` state and fixed reason code, and the existing manual double-link sync is the explicit retry path.

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

## Raw-turn history

- The user may explicitly open `逐句记录` to browse the authoritative companion and dictation turns that already exist in SQLite.
- Electron applies a source filter, a bounded 200-character search and a maximum 200-row result before returning display records.
- A display record contains only generated row ID, source, role, content and local timestamp. Session ID, source event ID, outbox metadata and digest identifiers never cross preload.
- Browsing does not approve a candidate, modify source text or add the turn to model context.

## Safety and privacy

Status, source labels, counts, sanitized failure codes and the explicit bounded raw-turn listing may cross preload. Digests, vectors, database paths, session/event identifiers, Wi-Fi information, device identity and credentials remain in Electron main. Reviewed exports continue to exclude raw turns.
