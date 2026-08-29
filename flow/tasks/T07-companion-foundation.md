# T07 - Companion desktop foundation

Status: `T07A_IMPLEMENTED / T07B1_IMPLEMENTED / T07C_IMPLEMENTED / T07B2_NOT_FROZEN`

## Why this package can run in parallel with T06

User explicitly authorized controlled parallel work while another computer completes T06. T06 remains the only package allowed to alter EasyInput Host Action, application-opening configuration, firmware, input bridge, and related UI. T07A creates only new desktop domain/test files and must not modify those paths.

## T07A: foreground-session arbiter

Contract: [`FOREGROUND_SESSION_V1_FROZEN`](../../contracts/deskmate-host/companion-foreground-session-v1.md).

Implement a pure `ForegroundSessionArbiter` and its host tests. It must enforce one foreground audio/conversation owner across `dictation` and `companion`, handle deterministic interrupt/replacement, and reject stale provider events by session ID/generation.

Allowed paths:

- `src/domain/foregroundSessionArbiter.js`
- `tests/foreground-session-arbiter.test.mjs`
- tightly related documentation/progress records

Forbidden paths and behavior:

- Existing `VoiceWorkflow` integration, React UI, Electron IPC, EasyInput firmware, input bridge, Host Action, DeskMate Link, Xiaozhi, serial/HID writes, cloud credentials, audio capture/playback, or any hardware access.

Verification: direct host tests plus `npm test`; no hardware claim.

## T07B1: memory outbox domain

Contract: [`MEMORY_OUTBOX_V1_FROZEN`](../../contracts/deskmate-host/companion-memory-outbox-v1.md).

Implementation: `src/domain/companionMemoryOutbox.js` with host coverage in `tests/companion-memory-outbox.test.mjs`. This slice is complete at the pure-domain boundary; it does not claim persistence, retrieval, reminders or UI integration.

Implement a pure, immutable outbox domain for finalized Companion turns, completed tool results, explicit remember requests, idempotent enqueue, bounded FIFO claims, worker ownership, release, completion and startup recovery.

Allowed paths:

- `src/domain/companionMemoryOutbox.js`
- `tests/companion-memory-outbox.test.mjs`
- the T07B1 contract and tightly related documentation/progress records

Forbidden paths and behavior:

- Database dependencies or migrations, Electron/React integration, cloud calls, embeddings, Wiki runtime writes, reminders, existing VoiceWorkflow, T06 paths, firmware, HID/serial, DeskMate Link or hardware access.

## T07B2: durable persistence and retrieval

Status: `NOT_FROZEN`.

Before code, separately freeze the persistence engine, reminder confirmation, deletion/retention, encryption, embedding-provider and optional Wiki-mirror contracts. No current task authorizes a database migration, embedding provider, cloud request, or a runtime write to `F:\wiki\deskmate-memory`.

## T07C: Companion desktop shell

Status: `IMPLEMENTED`.

T07C adds a software-only Companion surface without opening any unfrozen audio, memory, reminder, Host Action or hardware contract. The permanent left navigation contains exactly six daily workflows: Workbench, Voice, Companion, History, Vocabulary and Key mapping. Existing low-frequency pages remain available through the Companion management hub rather than occupying the sidebar.

The Companion page provides an honest UI preview for listening, reminders, memory candidates, expressions and device management. Preview controls only update local React state/store presentation; they do not capture audio, persist memory, schedule reminders, execute Host Actions, write serial/HID, or claim Xiaozhi connectivity. The shared software identity uses the selected large-eye cyan face asset. The current fixed Xiaozhi reference remains a 128×64 one-bit SSD1306 display, so the eventual physical display mapping is black background with white eyes until real-board evidence proves otherwise.

Allowed scope:

- `src/App.jsx`, `src/appData.js`, `src/pages.jsx`, `src/styles.css`
- the selected face asset, UI source tests, design QA and tightly related documentation/progress records

Explicitly excluded:

- Existing `VoiceWorkflow`, Electron IPC, T06 input bridge/Host Action behavior, durable memory, reminders, embeddings, Wiki writes, DeskMate Link, firmware, hardware access, OLED writes and servo motion

## Handoff requirement

T07A uses its own short Git branch and is committed/pushed as a small independent package. The hardware computer may audit/build it but must not present its host-test evidence as Xiaozhi or EasyInput HIL.
