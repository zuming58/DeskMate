# T12A Desktop memory controls

## Objective

Turn the existing local memory viewer into a truthful control surface for review, correction, reviewed export and deletion without requiring hardware or a live model.

## Acceptance

- Candidate correction is bounded and persists in SQLite.
- Pending candidates can still be accepted/rejected through the existing state transition.
- Export contains only daily summaries and accepted memories.
- Item deletion and whole-store erasure require distinct, expiring, one-use confirmations.
- Whole-store erasure removes every content-bearing memory table in one transaction.
- A native directory picker stores an encrypted future knowledge-base location while exposing only its final folder label to React.
- Renderer IPC exposes no database path, raw turns, outbox payloads, embedding vectors or save path.
- Full desktop tests and Windows packaging pass.

## Exclusions

No automatic summary/model call, Markdown write, directory scan, embeddings, reminders, wiki sync, speaker profiles, firmware, device access or hardware action.
