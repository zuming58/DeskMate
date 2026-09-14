# T32 local history persistence

Status: LOCAL_HISTORY_V1_FROZEN

This is the first implementation slice of the approved four-package reliability plan, not a declaration that backup/restore and retention are finished.

- Electron owns a dedicated `voice-history.sqlite3` and `voice-recordings/` under its private user-data directory. A worker performs SQLite and file I/O; the voice output/state-machine order is unchanged.
- Renderer IPC passes bounded records, identifiers and audio bytes, never arbitrary paths or SQL. Content and paths must not enter diagnostic logs.
- History IDs and audio IDs are immutable. Duplicate identical migration inputs are idempotent; different content under the same ID fails closed.
- Legacy localStorage/IndexedDB migration stages bounded batches, then verifies the complete manifest and each referenced recording before one transaction publishes the staged histories. Source data is preserved. Failure/restart permits retry. Orphan legacy audio is migrated too.
- Explicit ISO timestamps, recording timestamps and linked memory timestamps are evidence. Relative labels such as “今天” are not dates. Unresolvable legacy dates remain unknown.
- New records append by ID, never replace a stale whole history list. Unavailable persistence is visible and retains an in-session retry copy.
- Corrupt settings must not be overwritten by defaults. A previously validated settings copy may be explicitly recovered; recovery does not silently run on startup.
- No automatic cleanup is activated by this slice. The target defaults remain audio 7 days, raw text 20 days; summaries/approved memory and KnowledgeOS Raw are excluded. No hardware writes or cloud submissions are added.
- Whole-product backup/restore, recovery snapshots, retention coordination, scene management and UI consolidation remain separate slices and must not be advertised as complete.
