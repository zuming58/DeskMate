# T13 Windows persona, memory, knowledge and intent handoff

## Scope and baseline

- Branch: `codex/t13-desktop-persona-memory-intent`
- Base: `710595f0b8b4bd209721fef9c6a96d5b80f43481`
- Implementation commit: `04f1fc06e0021fd44dbe2a9ba99bcadb599714bf`
- Windows software only. No EasyInput or Xiaozhi firmware, hardware, port, Flash, NVS, OLED, servo, or audio-device operation.

## Delivered

- Versioned persona store with atomic readback and new-session freeze.
- Persona plus reviewed-memory context in the existing Doubao session; immutable safety instructions remain last.
- Real-turn memory generation into pending candidates, preserving explicit review/correction/forget controls.
- Stable managed Markdown notes with double links and conflict-preserving reconciliation.
- Local accepted-memory chunking, deterministic embeddings, rebuild, and bounded hybrid retrieval.
- Sidecar intent classifier with a closed type set, registered AppAction UUIDs, and one-use confirmation.
- Codex lifecycle summaries that expose attention without inventing progress.
- Companion and memory UI entries plus minimal preload/IPC surfaces; secrets, paths, raw PCM, raw vectors, and device identity remain in Electron main or never enter the flow.

## Verification

- `npm ci --include=dev`: passed, 398 packages installed.
- `npm test`: passed, 276/276.
- `npm run build:desktop`: passed.
- `git diff --check`: passed.
- `DeskMate.exe`: 202690560 bytes; SHA-256 `0A0A71CD547C4CFAE7381620B1658428EC46D459A17A221B2EAC1264398EF384`.
- `app.asar`: 112721657 bytes; SHA-256 `9CD874363D25830A3AF68BBFE45DA6434F270BCF83C274EFECFD146D5B7FFB16`.

## User-present gates

1. Start the packaged build, edit persona, restart a new companion session, and judge real tone/boundary behavior.
2. Use non-sensitive conversation data to generate candidates; review, correct, accept, rebuild, retrieve, project, and completely forget.
3. Confirm the selected knowledge root receives only the managed `DeskMate/` subtree and that manual note edits produce conflicts instead of overwrite.
4. Ask to open a registered application and query Codex status; verify no action occurs before confirmation.
5. Run a real Codex task through working/waiting/completed and check the bounded status copy.

The provider endpointing HIL from T12B.1 is independent and remains pending; this package does not alter its VAD or half-duplex policy.
