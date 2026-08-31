# Voice edit, memory and AI service boundaries

## Current implemented slice

- `KEY1 / Ctrl+Shift+Space` continues to use the accepted text voice-input workflow. The resident Windows bridge recognizes the chord only when Raw Input identifies the EasyInput VID/PID. Ordinary keyboard global registration is disabled by default to prevent unrelated software, keyboards or input methods from opening the recorder.
- `KEY3 / Ctrl+Shift+E` starts the same recorder/state machine in `edit` mode. The resident Windows input bridge observes the board-scoped read-only chord and emits the semantic trigger only after the complete chord is released; this prevents the still-held Ctrl/Shift keys from corrupting the subsequent selection-copy operation. An ordinary global fallback can be enabled explicitly in settings, but is not part of the default path. Electron main then captures the selected text and exact foreground-window handle before recording. The renderer receives only workflow metadata and the spoken editing instruction; selected text never crosses into React.
- After ASR, the selected text and spoken instruction are sent by Electron main to the configured text model. Success writes the edited text back only when the original window is still foreground. Selection capture, model, or target failures leave the original selection unchanged.
- Raw organizer mode is local deterministic replacement only. Smart/custom organizer mode uses the configured text model and retains the original transcript on failure.
- Escape is a cancellation command only while the shared voice state is recording, transcribing, organizing or outputting. An idle, completed or failed session ignores Escape and never raises the floating cancellation state.
- `companion-memory.sqlite3` is created in Electron `userData` with WAL and full synchronous commits. Every future conversation turn can be committed before any summary job. Daily summaries, reviewable candidates, accepted memories and embedding records have separate tables.
- T11 adds one foreground companion session controller. Companion capture and text voice input/edit are mutually exclusive: dictation preempts and permanently ends the active companion session, while companion start is rejected during an active `VoiceWorkflow`.
- Text dictation defaults to a concrete Windows input device and can explicitly select the T10E EasyInput LAN source. The preference is local, while each recording locks its actual source. Board failure before start is visible and falls back once to the Windows source; failure after start ends the session without switching.
- The Doubao realtime adapter, finite reconnect, audio queues, credentials and turn commits live in Electron main. T10E now supplies the accepted EasyInput uplink, but the realtime companion remains blocked by the intentionally unavailable EasyInput speaker sink. Automated tests use simulated source/sink adapters and the companion does not silently fall back to computer or Xiaozhi audio.

## Service separation

| Plane | Current adapter | Consumers | Boundary |
| --- | --- | --- | --- |
| Speech transcription | Bailian `qwen3-asr-flash` | voice input, KEY3 instruction | Existing encrypted Bailian credential |
| Text model | Bailian fallback or configured OpenAI-compatible endpoint | smart organizer, KEY3 voice edit; later Bridge and memory jobs | API key encrypted in Electron main; endpoint/model status only in renderer |
| Realtime voice | Doubao binary WebSocket adapter behind `CompanionConversationController` | companion ASR/chat/TTS | Credentials encrypted in main; uplink exists, but real conversation remains blocked until the EasyInput speaker sink is available |
| Memory | local SQLite WAL | future companion turns and retrieval | Never written to EasyInput or Xiaozhi Flash |

The text model and realtime voice plane must remain separate. Realtime replies cannot directly run Windows commands. Conversation events go to a typed intent Bridge, which then invokes only registered, purpose-visible host actions. This preserves the existing UUID application registry rather than giving a model arbitrary shell access.

## Memory lifecycle

1. Commit each user/assistant turn locally before returning it to the UI.
2. On idle and day rollover, process only unsummarized turns; a crash can resume from the same source rows.
3. Write a daily summary and memory candidates with source turn IDs. Candidates remain `pending` until the user accepts or rejects them.
4. Embed accepted memories asynchronously. Keep structured facts and source references independent of the embedding model so vectors can be rebuilt.
5. Retrieval combines keyword/date filters with vector similarity, then supplies only a small, relevant context set to the text model.
6. The management UI must expose review, correction, export and forgetting. Sensitive classes such as passwords, verification codes, Wi-Fi and payment data are excluded by default.

The current slice implements step 1 end to end: each final provider event is written transactionally with a unique source event ID and a recoverable local outbox before the final UI event. The summary/candidate schema, status/search listing and candidate review remain available. Automatic summary scheduling, embedding generation, reminders and `F:\wiki` synchronization are intentionally not enabled yet. The SQLite database is the authoritative local source; a future wiki adapter may export reviewed Markdown summaries but must not become an untracked second source of truth.

T12 is split so a user-selected knowledge base does not become an unsafe second database:

1. T12A stores the selected root encrypted in Electron main and exposes only its final folder label. It does not scan or write the directory.
2. T12B generates reviewed daily summaries/candidates, then projects stable memory IDs to Markdown. Filenames are derived from IDs/date, links use `[[double-link]]` syntax, and a manifest records the last exported revision so external edits cause a visible conflict instead of silent overwrite.
3. T12C chunks only accepted memories, stores embeddings in the local SQLite index and records model/dimension/version. Embeddings are disposable and rebuildable; deletion starts from the structured memory ID and removes the vector plus projected Markdown.
4. Retrieval ranks keyword/date matches, explicit double-link neighbours and vector similarity, then sends only a bounded, user-permitted context set to the model.

## Suligent reference study

Read-only reference: `F:\Codex\suligent` on 2026-08-29. No files were copied.

- Its realtime plane uses a Doubao WebSocket with App ID, Access Key, Resource ID, App Key, model and speaker configuration.
- Its sidecar plane uses a separate OpenAI-compatible Chat Completions model for structured intent/state analysis with bounded context, timeout and deterministic fallback.
- Client playback can be interrupted when capture starts, which supports the DeskMate requirement that text voice input preempt companion speech.

DeskMate adopts the two-plane architecture, not the project-specific persona, navigation logic or credentials. T11 independently implements a strict realtime adapter and foreground interruption arbitration; real EasyInput audio and live credentials remain an explicit acceptance gate.
