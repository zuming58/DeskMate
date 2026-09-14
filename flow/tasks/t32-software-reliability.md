# T32–T35 software reliability delivery

Baseline: T31, user-approved four-package plan on 2026-09-12. No new firmware, music or sensors. Deliver package-sized verified slices without marking simulation as hardware acceptance.

## Fixed policy

- Default original audio: 7 days; original text: 20 days; both ultimately adjustable.
- Daily summaries and approved long-term memories are not raw records. Never purge KnowledgeOS Raw.
- Backup defaults to text/configuration; audio explicitly opted in; no secrets.
- First cleanup requires a preview and explicit activation. Until then, raw deletion is paused.

## Package 1 — safety / persistence / backup

- [x] Separate worker-owned SQLite history and managed audio directory; restricted IPC.
- [x] Legacy history and all IndexedDB recordings staged, hashed and checked before publishing; keep source; interrupted migration retry.
- [x] Reliable new timestamps, linked memory event IDs; unknown legacy dates; main-process lookup for linked old memory time.
- [x] ID-based appends and paginated snapshot loading; no stale list replacement.
- [x] Corrupt renderer settings do not overwrite originals; validated previous settings copy and tested recovery function.
- [x] User-facing recovery preview/confirmation, main database verified recovery snapshots, replay-safe startup recovery.
- [x] Versioned complete backup: settings, vocabulary, prompts/scenes, history, memory with provenance; optional audio; secret exclusion.
  - [x] T32B versioned input/companion settings, vocabulary, prompt workspace, primary history and local memory export; optional managed audio; worker verification and read-only preview.
  - [x] Complete remaining software-settings coverage and production restore integration; do not mark the whole item complete from the export slice.
- [x] Restore: validation/preview/confirmation, whole-store rollback, pause writes, busy guard, application path/credential revalidation; no keyboard sync or KnowledgeOS journal replay.
- [x] Retire eligible migration source copies only through the unified retention lifecycle and exact browser acknowledgement; retained records remain intact.

## Package 2 — automatic cleanup

- [x] Stop old daily-close raw cleanup from bypassing first-use confirmation during upgrade.
- [x] Configurable 7/20-day policy, expiring preview token tied to exact candidate rows/references, first confirmation and consent revocation after duration changes.
- [x] Eligibility by successful transcription, reliable date, recovery need, completed summaries and necessary accepted work/personal submissions.
- [x] Unknown/failed/unsynced/invalid-linked records held with visible reasons.
- [x] Journaled file/DB/browser cleanup, interruption/retry, concurrent additions protected; managed recovery expires after seven days and manual exports are never traversed.
- [x] Last run/counts/held reasons, exact boundary, changed-preview, child-process interruption and corrupted-recording tests.

## Package 3 — scenes

- [x] Single keymap management entry; add/rename/description/reorder/archive/restore.
- [x] Separate user names from built-in library metadata; keep bindings/prompt order while archived.
- [x] Shared active state and ordered active-only Tab cycle; min one active.
- [x] Shared KEY1/2/3/4/8 and per-scene KEY5/6/7 remain unchanged.
- [x] Revision conflict UI without overwriting newer state.

## Package 4 — interface / acceptance

- [x] Separate automatic Codex task status from manual hardware tests; accurate LED/expression instructions, emergency stop retained.
- [x] Memory results first; connections/index/dangerous controls in advanced section.
- [x] Consistent draft guards, cancel/error feedback, busy/success/failure/retry and repeat-click protection.
- [x] 1440×1024 and small-window visual checks across affected pages, not just DOM presence.
- [x] Full tests, isolated UI, desktop candidate package and resource verification per completed slice.
- [ ] User acceptance only for actual dictation/insertion, continuous speech, keys/encoder/LED/Xiaozhi, actual KnowledgeOS sync.

Checked items above indicate implemented software with synthetic verification, not user acceptance. Database recovery snapshots are manually requested/verified; automatic periodic full-database snapshots are not implemented. UI checks cover affected flows, not every combination of every page. T34A adds whole-session dictation completion and full-recording fallback. User acceptance remains open.

Implementation evidence and exact package state belong in `flow/progress.md`, not on this task card.
