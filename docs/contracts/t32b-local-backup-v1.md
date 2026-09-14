# T32B local backup and offline restore

Status: LOCAL_BACKUP_V1_FROZEN

Implementation status: **partial package 1**. T32B exposes export and non-destructive inspection only. Offline prepare/apply/rollback are isolated engine tests, not production restart integration. Do not enable apply until the busy lock, renderer handover, credential/path review, imported-journal hold consumption and schedule guards below are implemented and tested.

- Private, versioned JSON bundle: allowlisted software settings/vocabulary, prompt workbench, history records, local memory and source metadata. Managed audio is opt-in. No credentials, registered application paths, arbitrary user-data directory copies or executable/SQL content.
- Worker performs disk reads, SQLite snapshot queries, hashing and bundle assembly. Normal backup does not acquire a voice lock. Each store is transaction-consistent; snapshots are not claimed to be a distributed instantaneous transaction.
- Restore accepts only known schema, bounded payloads and verified payload/record/audio hashes. It builds new databases from trusted product schemas, never runs SQL or loads an imported SQLite file supplied by a backup. Hashes detect corruption, not author identity; even a recomputed outer hash does not bypass schema validation.
- Preview is bound to an opaque expiring token and a verified immutable staged bundle. Confirmation rechecks busy state. Ongoing recording, transcription, model organizing, memory generation/sync and pending local writes forbid restore.
- Confirmed restore queues a durable offline job and restarts. Before any normal service starts, save exact previous target files, replace only explicit allowlisted targets and retain a journal. Interrupted/failed application rolls back before services run; inability to roll back fails closed.
- Renderer state handover must complete before mounting normal UI effects. Original browser copies remain recoverable. Restoration does not touch secrets or write hardware. Application launch bindings are disabled until reselected; automatic wake, memory scheduling and KnowledgeOS reads/sync require re-enabling/revalidation.
- Imported journal dates are excluded from automatic submission; do not disguise held submissions as accepted. New journals are not globally suppressed after the user re-enables normal sync.
- Internal restore copies are managed recovery data, pending the consent-based retention slice. They are not automatically deleted yet. User-exported backups are never deleted by the application.
- This slice is not a claim that 7/20-day cleanup, scene management or whole-product UI closure is finished.
