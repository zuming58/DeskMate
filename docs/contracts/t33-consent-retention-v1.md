# T33 consent-based local retention v1

Status: `CONSENT_RETENTION_V1_FROZEN`

## Scope

This slice adds automatic cleanup for DeskMate-managed local raw material. It does not enable backup restore, modify hardware, delete KnowledgeOS data, or change the daily/long-term memory products.

## Policy and consent

- Managed recordings default to 7 days and managed raw text defaults to 20 days. Both values are integer day counts from 1 through 365.
- Upgrading or installing never enables deletion silently. Before the first cleanup, DeskMate creates an exact, expiring preview and requires explicit user confirmation.
- Confirmation enables the current retention policy. Changing either retention period invalidates that consent and requires a new preview.
- After consent, DeskMate may run once per local calendar day while voice input, companion conversation, memory generation, KnowledgeOS sync, backup, and history writes are idle. The user can also request a retry.

## Eligibility

- Age is calculated from a reliable persisted timestamp. A row whose date is unknown is held.
- A recording is eligible only after its transcription is explicitly marked successful and no linked recovery or memory dependency remains.
- A raw memory turn or linked dictation history is eligible only after the corresponding daily journal is complete.
- When KnowledgeOS daily sync is enabled, both `work` and `personal` journal deliveries for that day must be accepted before raw material is eligible.
- Failed, cancelled, or unverified transcription, missing links, incomplete summaries, failed sync, and unknown dates are held with a reason.
- Daily/hourly summaries, journals, candidates, accepted long-term memory, manually exported backups, and all KnowledgeOS Raw are outside the deletion set.

## Transaction and recovery

- A preview token names exact row IDs, digests, timestamps, and cutoffs; it expires after ten minutes and contains no user text in renderer-visible results.
- Confirmation revalidates the preview before mutation. Concurrently added rows are never implicitly added to an already confirmed set.
- Before deletion, exact database rows and recording files are copied into a managed recovery job. Database deletion, file deletion, renderer legacy cleanup, and completion are journaled phases and can be resumed.
- Completed managed recovery jobs expire after seven days. Cleanup is limited to validated job files below DeskMate's recovery directory. User-exported backup files are never traversed or removed.
- Browser legacy copies are removed only by exact record/audio IDs and acknowledged back to the main process. Failure remains visible and retryable; it is never reported as complete.

## Visible status and diagnostics

The UI exposes enabled/disabled state, the current 7/20-day policy, preview counts, held-reason counts, last run time, removed counts, and retryable pending work. Diagnostics contain counts and reason codes only—never text, recording bytes, credentials, or raw paths.

## Non-claims

Passing isolated tests proves only the software contract with synthetic profiles. It does not prove cleanup of the user's live profile, backup restore, KnowledgeOS live delivery, or hardware behavior.
