# T11D companion stop/drain HIL failure audit

Date: 2026-09-01

Status: `AUDIT_COMPLETE / PRODUCTION_REPAIR_NOT_STARTED / HIL_FAILED`

Verification: clean `npm ci --include=dev` passed; characterization `2/2`, targeted controller/audio/characterization `29/29`, full `npm test` `224/224`, and `git diff --check` passed. No package was built because production behavior was intentionally not changed.

## Scope and evidence boundary

This is a Windows-software-only, read-only production audit plus two non-production characterization tests. It does not launch or control DeskMate, read credentials, audio, transcripts or window titles, access devices/ports, or modify firmware. The user-provided diagnostic is summarized only through its bounded enums and counters and is not stored in Git.

The exact rejected package is:

- executable: `F:\Codex\deskmate-t11d-companion-stop-drain-capsule\release-t11d-stop-drain-capsule-verify\win-unpacked\DeskMate.exe`;
- size: `202690560` bytes;
- SHA-256: `45480D7E2C624B0449E6E962FB8550109BC8B2020D70C75C5633CEEA069E279B`;
- `resources/app.asar` SHA-256: `CAC299F816EA364C04F4EB67AEC6FBB8F624216E196406D104B441373B2A9C5B`;
- packaged `electron/companion-conversation.cjs` SHA-256: `AD839A11FD3E7117D475C9CF6730A5869ACA3272AC5D6ACB3CC4FE0F228522A8`, equal to the exact T11D source file.

Read-only package inspection found the bounded stop, sink drain, `stopping` control and compact capsule markers. Runtime process-path evidence independently confirmed that all DeskMate processes came from this exact directory. Old-package execution is excluded. The package has no user-visible or diagnostic build commit/package identity, so future evidence should not depend on filesystem inspection.

## Evidence table

| Question | Code/package evidence | HIL evidence | Finding |
| --- | --- | --- | --- |
| Does the package contain T11D? | Packaged controller hash equals exact T11D source; renderer bundle contains stopping/capsule markers. | Runtime path is the exact package. | Yes. The failure is not an old build. |
| Can provider `tts.end` prove audible completion? | The controller waits for `audioSink.drain()`, and Web Audio `onended` is used for scheduled nodes. The W3C contract says `ended` fires when a source stops or its buffer completes; it does not prove physical-device drain. `interruptPlayback()` also resolves all drain waiters. | `queueDrops=3` while an answer was cut off. | The new drain orders scheduled nodes, but a queue overflow deliberately stops those nodes and can still satisfy/erase the wait without audible completion. |
| Why was the answer cut off? | `MAX_BUFFERED_SECONDS=3`; once exceeded, `interruptPlayback()` stops every scheduled node and emits `sink.queue-drop`, then playback continues with the newest chunk. | `queueDrops=3`, `ignoredAsrDuringPlayback=0`. | Directly reproduced. The observed run supports silent queue truncation, not echo-ASR interruption. |
| Could provider VAD/turn handling still matter? | Microphone upload is blocked only in `speaking`, not `thinking`; provider `interrupt()` sends no server event. Events 351/450/459 and server turn boundaries are mapped only to diagnostics/unmapped events and have no lifecycle counters. The fixed reference uses the same TTS-end event family and a 900 ms ASR smoothing window but does not establish a local played boundary. | No ignored ASR during playback in this failure. | Server VAD/turn behaviour remains insufficiently observable, but it is not needed to explain this run. Do not change VAD from this evidence alone. |
| Did main stop complete? | Controller emits `idle` before bounded terminal idle publication; the terminal publish follows cleanup. | Agent-state `idle` ACK succeeded 13 seconds before the export, while UI still reported `stopping`. | Main reached terminal publication. The visible stuck state is downstream of main lifecycle completion. |
| Can renderer state roll back? | Companion, InputBridge and EasyInput-audio effects each copy `runtimeRef.current` and replace the entire nested `runtime` through a shallow patch. Companion events/status have no monotonic event sequence check. Initial status can also arrive after a newer event. | Link counters were changing frequently while the UI retained stale `stopping`. | Directly reproduced stale-snapshot lost update. This is the leading stop-UI cause. |
| Are both stop controls observable? | Page button awaits IPC and shows only a toast; it does not immediately apply returned `status` or force a refresh. Capsule button is fire-and-forget and drops result/error. Neither owns a UI timeout/reconciliation path. | Both appeared unable to end. | Stop invocation/result cannot be proven from renderer evidence. Both must share one awaited action and reconcile main status. |
| Can late lifecycle work overwrite stop? | Provider events are token-checked, but reconnect performs source/sink waits and then emits `connecting` without rechecking the token immediately before the transition. Renderer accepts all state events without sequence/generation ordering. | No event timeline is exported. | A secondary race remains possible and needs counters/order tests; current evidence does not prove it caused this run. |
| Are diagnostics sufficient? | Export retains queue drops and two echo-guard counters, but drops T11D `playbackDrainTimeouts`/`teardownTimeouts`; it has no build identity, state-event order, stop IPC/result, provider event, queue high-water or main-vs-renderer status. | Existing snapshot separated queue drop from ASR, but cannot reconstruct stop lifecycle. | Insufficient for one-pass root cause. Add bounded counters/enums before the next HIL. |

## Fixed references

- Official Doubao realtime wire contract: <https://www.volcengine.com/docs/6561/1594356?lang=zh>. Event `359` is a provider-side TTS-ended event; DeskMate must keep it separate from local output completion.
- W3C Web Audio API: <https://www.w3.org/TR/webaudio/>. `AudioScheduledSourceNode.ended` covers explicit stop as well as normal buffer completion, so a stopped node cannot be counted as proof that the user heard all samples.
- Product reference: read-only `F:\Codex\suligent@3e2744fcef780466e82d6803362573c6d8560cf0` via Git object inspection. It uses the same event family and does not supply a licensed stop/drain implementation. No source was copied.

## Minimum next repair design

### 1. Preserve continuous playback or fail visibly

- Replace the renderer's silent three-second `interruptPlayback()` overflow with a versioned, session/generation-bound queue contract.
- Track accepted, scheduled, played and rejected chunks plus queued-duration high water. Do not report a stopped node as played.
- Apply backpressure/acknowledgement before an unbounded renderer backlog forms. Freeze a finite maximum based on time and bytes.
- If the bound is exceeded, fail the current conversation explicitly with an enum such as `computer-speaker-backlog-overflow`, clear it once and return through the normal terminal path. Never discard the old answer and continue as if playback succeeded.
- Keep `speaking/working` through all accepted samples. `tts.end` plus a successful played acknowledgement is required before listening resumes.

### 2. Give each runtime slice atomic ownership

- Replace whole-`runtime` copies with reducer actions/functional updates that merge only `runtime.companion`, `runtime.inputBridge` or `runtime.easyInputAudio` from the latest state.
- Add a monotonic main-process companion event sequence and include it in both event and status snapshots. Filter by session, generation and sequence; an initial status response may not overwrite a newer event.
- Recheck the active token immediately before every reconnect transition and after every awaited adapter operation.

### 3. Make stop one awaited renderer action

- Page, capsule and Escape use one `stopCompanion()` action. It immediately sets a local in-flight/stopping control, awaits IPC, handles `{ok,status}` or rejection, and applies/reconciles the returned status.
- After success, failure or a bounded UI timeout, call `getCompanionConversationStatus()` and merge it through the monotonic reducer. Display an enumerated failure instead of swallowing it.
- Duplicate controls share the same promise. A late result from an older session/generation cannot affect the new session.

### 4. Add privacy-safe proof fields

Minimum diagnostic schema additions, all enum/count/boolean only:

- `build`: product version, source commit/build ID and package channel;
- `conversation.mainState`, `conversation.rendererState`, `active`, `generationClass` (`none/current/stale`) and last accepted event sequence;
- stop counters: requested, duplicate, IPC fulfilled/rejected/timed-out, main completed, renderer reconciled, stale result dropped; last stop phase/reason enum;
- provider counters: connection close/reconnect, TTS start/end/audio chunks, ASR partial/final, unmapped turn events and local interrupt requests;
- audio counters: chunks accepted/played/rejected, queue overflows, queued-duration high water bucket, drain requested/succeeded/timed-out/interrupted;
- export the already-existing `playbackDrainTimeouts` and `teardownTimeouts` counters.

Do not add PCM, text, IDs, device names/paths, payloads, credentials, IP/SSID/MAC, timestamps precise enough to reconstruct speech, or window/process metadata.

## Required regression vectors before another HIL

1. More than three seconds of valid queued PCM remains continuous, or ends the session with one explicit overflow error; it never silently stops old nodes and continues.
2. Queue overflow cannot resolve a drain as successful playback.
3. Companion idle and high-frequency Link/audio events in the same render batch leave companion idle.
4. Initial status after a newer event is rejected; older session/generation/sequence events cannot revive state.
5. Both stop controls and Escape await the same action; IPC success, rejection and timeout each force a status reconciliation.
6. Reconnect at every await boundary cannot emit a post-stop state.
7. Diagnostics distinguish package identity, queue overflow, provider interruption, stop-main completion and renderer reconciliation without sensitive content.

Only after these vectors and full Windows regression pass should the user repeat one long answer and one stop-from-listening test. Visual merging/shrinking is a later package after this functional gate.
