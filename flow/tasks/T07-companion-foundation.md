# T07 - Companion desktop foundation

Status: `T07A_READY / T07B_NOT_FROZEN`

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

## T07B: durable memory store

Status: `NOT_FROZEN`.

Before code, separately freeze the `MemoryStore`, `MemoryOutbox`, reminder confirmation, deletion/retention, encryption, embedding-provider and optional Wiki-mirror contracts. No current task authorizes a database migration, embedding provider, cloud request, or a write beyond the boundary-reserving files in `F:\wiki\deskmate-memory`.

## Handoff requirement

T07A uses its own short Git branch and is committed/pushed as a small independent package. The hardware computer may audit/build it but must not present its host-test evidence as Xiaozhi or EasyInput HIL.
