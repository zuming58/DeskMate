# T12A Desktop memory controls v1

Status: `T12A_DESKTOP_MEMORY_CONTROLS_V1_FROZEN`

## Scope

T12A closes the local user-control boundary around the existing companion SQLite store. It does not generate summaries, call a model, create embeddings, identify speakers, or touch either firmware.

The desktop exposes only these operations:

- list daily summaries and reviewable memory candidates;
- accept or reject a pending candidate;
- correct the text of a pending or accepted candidate;
- export daily summaries plus accepted long-term memories;
- delete one displayed summary/candidate after a one-use confirmation;
- erase the entire companion memory database after a separate one-use confirmation.
- choose a future knowledge-base root through the native directory picker without exposing the full path to React.

## Privacy and deletion

- Raw conversation turns, outbox payloads, rejected/pending candidates, embeddings, database paths and identifiers are excluded from export.
- Export is written by Electron main through an explicit save dialog. React receives only completion counts and a cancelled/error state.
- Confirmation tokens expire after 60 seconds, are single-use and are bound to an exact database revision. Concurrent changes fail closed.
- Item deletion removes that displayed summary or candidate. Candidate embeddings are removed by foreign-key cascade.
- “Forget everything” is the only complete erasure operation. It transactionally removes turns, daily summaries, candidates, embeddings and outbox payloads.
- No undo or background cloud copy is created by DeskMate.
- The selected knowledge-base root is encrypted with Windows secure storage. T12A stores only the location and does not write, scan or index that directory.

## Deferred

- T12B: explicit daily-summary and candidate generation through the configured text-model adapter, followed by stable-ID Markdown projection and `[[double links]]` into the selected knowledge base.
- T12C: reviewed-memory chunking, rebuildable embeddings and hybrid keyword/link/vector retrieval. The vector index is not the source of truth.
- T13: people profiles and local speaker recognition.
