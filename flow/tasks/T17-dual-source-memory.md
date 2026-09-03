# T17 dual-source memory

Status: `WINDOWS_CODE_BUILD_CONFIRMED / USER_HIL_PENDING / NO_FIRMWARE_CHANGE`

## Goal

Make completed AI-companion conversations and completed DeskMate voice-input text useful as two independently manageable sources in one local, review-first memory system. No firmware or board storage is involved.

## Source contract

- `companion`: completed user/assistant conversation turns already accepted by the realtime conversation lifecycle.
- `dictation`: final text from a successful DeskMate voice-input/history item after optional organization. It is not microphone audio and does not include clipboard content, target-window metadata or device/network facts.
- Existing memory rows migrate to `companion` without loss.
- A stable source-event key prevents duplicate ingestion after retry or restart.

## Daily processing

- Each source has an independent `participates in daily summary` switch.
- The user may choose a local daily time; default is 23:30.
- While DeskMate is open, each local day runs at most once per source/input digest.
- If DeskMate was closed, the next start performs a bounded catch-up for missed days.
- Empty sources create no summary. Model failure preserves the pending input and exposes a retryable result.
- Every generated long-term item begins as a pending candidate. Only explicit review may accept, correct, ignore or permanently delete it.

## Management UI

- Source filter: All / AI companion / Voice input.
- Per-source counts for unprocessed events, daily summaries, pending candidates and accepted long-term memories.
- Visible next run, last result per source, catch-up state and a manual `Process now` action.
- Reuse the existing knowledge-base folder picker, review controls, local index, export and forget flows.

## Knowledge-base projection

- SQLite is the only source of truth.
- Write only under the selected managed `DeskMate/` directory.
- Daily paths are source-specific, for example `daily/companion/YYYY-MM-DD.md` and `daily/dictation/YYYY-MM-DD.md`.
- Reviewed memory documents include stable ID and source metadata. Existing double links and external-edit conflict preservation remain intact.

## Safety and privacy

- Treat all source text as untrusted data and never execute instructions found in it.
- Do not infer sensitive attributes or retain credentials, keys, raw audio, window titles, paths, clipboard content, SSID/IP/MAC, serials or complete device paths.
- React receives only bounded memory records and status; raw database and configured directory paths remain in Electron main.

## Verification

- Migration preserves existing companion rows.
- Source isolation and filter/count behavior.
- Idempotent event ingestion and `source + local day + digest` summary generation.
- Local-day/time-zone rollover and next-start catch-up.
- Model-unavailable retry, review/edit/reject/delete, export and index rebuild.
- Source-specific managed Markdown projection, stable IDs and conflict preservation.
- `npm test`, `npm run build:desktop` and the standard renderer isolation/security checks.
