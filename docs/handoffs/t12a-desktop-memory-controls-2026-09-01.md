# T12A desktop memory controls handoff

## Exact baseline

- Role: Windows desktop software only; no firmware or hardware work.
- Branch: `codex/t12a-desktop-memory-controls`
- Base HEAD: `da0fe11ccc429f9f166ef4d1b9e4a3ba82ece01b`
- Implementation HEAD: `99ecbf6e4f0b5cb2d58113788aa7ba583d675465`
- Contract: `T12A_DESKTOP_MEMORY_CONTROLS_V1_FROZEN`

## Delivered behavior

- Existing SQLite memory remains the sole source of truth.
- Pending memory candidates can be corrected, accepted or rejected; review is one-way and accepted items remain explicitly correctable.
- Export contains only reviewed daily summaries and accepted long-term memories. It excludes raw turns, pending/rejected items, IDs, source references and embeddings.
- Item deletion and whole-store forgetting require one-use, 60-second, revision-bound confirmation. Whole-store forgetting transactionally removes turns, summaries, candidates, embeddings and outbox rows.
- A native directory picker records the user's knowledge-base root. The absolute path is encrypted by Electron `safeStorage`, remains in Electron main and is never returned to React, logs or diagnostics.
- T12A stores the directory only. It does not scan, index or write the external knowledge base.

## Long-term knowledge architecture

1. T12B assigns stable memory IDs and projects reviewed SQLite records into deterministic Markdown with `[[double links]]` plus a projection manifest.
2. T12C chunks only accepted/projected records, stores model/version/dimensions with each embedding, supports complete rebuild and combines semantic with deterministic metadata/text retrieval.
3. Corrections and forgetting always mutate SQLite first. Markdown and vector indexes are disposable derivatives and must be refreshed or removed; they cannot preserve memory that the user deleted.

## Changed paths

- `electron/companion-memory.cjs`
- `electron/companion-memory-control.cjs`
- `electron/knowledge-base-settings.cjs`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/pages.jsx`
- `src/ui.jsx`
- `src/styles.css`
- `tests/memory-controls.test.mjs`
- `docs/contracts/t12a-desktop-memory-controls-v1.md`
- `docs/architecture/voice-edit-memory-ai-services.md`
- `flow/tasks/T12A-desktop-memory-controls.md`

## Verification

- `npm ci --include=dev`: passed.
- `npm test`: `198/198`, zero failure/skip/todo.
- `npm run build:desktop`: passed native InputBridge Release publish, Vite build and Windows Electron directory packaging.
- `git diff --check`: passed.
- Changed paths are ASCII-only; no firmware paths or differential secrets were introduced.
- Package: `release/win-unpacked/DeskMate.exe`, 202,690,560 bytes, SHA-256 `C454A8C315F75D3A91A286766C15408DD7A67BAECCBF8FF6A79070A99D659F65`.

## Hardware and privacy

- No application launch, UI automation, port or LAN scan, device access, audio capture, Flash/NVS/eFuse operation, firmware change, OLED, servo or speaker action occurred.
- The package contains no user database, knowledge-base contents, full selected path, transcript, recording or credential.

## Open gates and next action

- `HIL_NOT_RUN`: optional user-visible confirmation of the packaged memory controls remains open, but it does not block T12B code development.
- Do not claim Markdown projection or embeddings are complete: T12A only records a validated encrypted root.
- Next action: create T12B from this branch after closure, freeze stable IDs/manifest/path rules, implement dry-run preview and atomic Markdown `[[double links]]` projection without exposing the absolute root to React.
