# T13_DESKTOP_PERSONA_MEMORY_INTENT_V1_FROZEN

Status: `FROZEN` for the Windows software boundary. No firmware or hardware contract changes.

## Scope

This slice adds five Electron-owned capabilities without creating a second voice state machine: versioned companion persona; reviewed long-term memory generation and control; managed Markdown double-link projection and rebuildable local indexing; typed, confirmation-gated desktop intent proposals; and privacy-safe Codex lifecycle summaries.

## Persona contract

- Persona schema v1 contains `role`, `traits`, `speakingStyle`, and `boundaries`.
- Electron main validates, atomically persists, and rereads persona configuration.
- A new companion session freezes one persona snapshot; changing the saved persona never mutates an active session.
- The provider prompt appends an immutable safety boundary after user-authored persona fields.
- Persona cannot grant command execution, secret access, hardware control, or claims about unverified capabilities.

## Memory contract

- `companion-memory.sqlite3` remains the only source of truth, using WAL, full synchronization, transactions, and idempotent source event IDs.
- A user-triggered text-model task may summarize unprocessed final turns and create candidates. Model output cannot directly create accepted memory.
- Candidate acceptance is explicit and one way. Correction, reviewed-only export, revision-bound deletion, and complete forget remain available.
- Only accepted memories may enter a new session's bounded reviewed-memory context.
- Raw turns, pending/rejected candidates, paths, vectors, credentials, or device identity never enter renderer diagnostics or reviewed export.

## Knowledge projection and retrieval

- The encrypted user-selected root stays in Electron main.
- Projection writes only under `<selected-root>/DeskMate/`, with stable ASCII paths and a private manifest.
- Daily notes and accepted-memory notes use stable IDs and `[[daily/...]]` / `[[memories/...]]` links.
- A file changed outside DeskMate is a conflict and is not overwritten or deleted.
- SQLite remains authoritative; Markdown and indexes are disposable derivatives.
- Accepted memories are bounded into chunks and indexed by `deskmate-local-hash-embedding-v1` (256 dimensions). This is a local, deterministic, privacy-preserving retrieval embedding, not a claim of neural semantic equivalence.
- Search combines local vector similarity and keyword overlap and returns bounded text results, never raw vectors.

## Intent and tool contract

- A sidecar text-model classifier may return only `none`, `open_application`, or `query_codex_status`.
- `open_application` must reference an already registered opaque AppAction UUID. Paths, arguments, URLs, shell commands, and arbitrary tools are invalid.
- Every non-empty proposal requires a visible, one-use, 60-second confirmation. Analysis alone performs no action.
- The renderer receives only a label, type, opaque token, expiry, and redacted result.

## Codex status contract

- Existing `codex-hook-v1` metadata remains authoritative.
- DeskMate presents bounded idle/thinking/working/waiting/completed summaries and an attention flag.
- It does not infer percent complete, task content, errors absent from the official event set, prompt text, response text, tool parameters, working directory, or window title.

## Deferred acceptance

- Persona tone and real provider behavior require a new user-present conversation.
- Memory model quality, real knowledge-base content, and retrieval usefulness require user review with non-sensitive data.
- Intent proposal classification and AppAction execution require explicit user confirmation in the packaged app.
- A real Codex lifecycle run must confirm the new summary copy. These are HIL/UX gates, not software test claims.
