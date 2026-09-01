# T11D.1 companion playback credit, runtime ordering and stop reconciliation v1

Status: `T11D1_COMPANION_PLAYBACK_CREDIT_RUNTIME_STOP_V1_FROZEN`

Implementation status: `TEST_CONFIRMED / HIL_NOT_RUN`.

This Windows-software-only contract supersedes the rejected implementation details in `t11d-companion-playback-drain-stop-v1.md`. It does not change Doubao wire frames, microphone selection, strict half-duplex, EasyInput KEY1, firmware, HID, DeskMate Link, OLED, audio hardware or servos.

## Evidence and reference difference

The rejected T11D HIL showed `queueDrops=3`, no ASR ignored during playback, and main terminal idle before renderer remained stopping. The fixed product reference `F:\Codex\suligent@3e2744fcef780466e82d6803362573c6d8560cf0` has no licensed renderer/main playback-credit or React lifecycle reconciliation implementation to reuse. The official Doubao contract defines provider `tts.end` but not local speaker completion. Web Audio `ended` can follow explicit stop, so T11D.1 distinguishes `played` from `cancelled`; no source was copied.

## Continuous bounded playback

- Each main-to-renderer PCM command has one monotonically increasing audio sequence within the locked session/generation.
- Renderer emits `sink.accepted` only after scheduling the valid chunk, `sink.played` only after natural node completion, and `sink.cancelled` for explicit interrupt/stop. A cancelled node cannot satisfy played credit.
- Main grants at most 3000 ms of accepted/reserved PCM credit. When the window is full, the next write waits for a played acknowledgement instead of clearing scheduled nodes.
- Acceptance is capped at 1500 ms and credit wait at 6000 ms. Failure is an explicit sanitized session error (`computer-audio-accept-timeout` or `computer-audio-backpressure-timeout`); playback never silently discards old samples and continues as normal.
- `tts.end` remains `speaking/working` until all accepted audio is played and the final renderer drain acknowledgement matches. Interrupt/stop cancels waits and nodes. Cancellation during manual interrupt or stop is terminal control flow, not a new session error.

## Ordered renderer state

- `runtime.inputBridge`, `runtime.easyInputAudio`, `runtime.memory` and `runtime.companion` have reducer-owned atomic slice updates. No callback replaces the entire runtime from a captured render snapshot.
- Every main companion event receives a process-monotonic `eventSequence`; status snapshots carry the latest sequence. Renderer rejects older sequences, older generations and mismatched same-generation sessions.
- Reconnect rechecks the active token after every awaited adapter boundary and before publishing another state. A stopped generation cannot revive the UI or provider.

## One stop action

The page button, compact capsule button and Escape call one renderer action. Duplicate requests share one promise. It immediately marks a local pending lifecycle, awaits the stop IPC for at most 5000 ms, applies returned status, and requires `status.active === false` before accepting success. Failure, timeout or an optimistic active result triggers a bounded 1500 ms status refresh. Main idle always converges renderer to idle; a still-active or unknown main exposes a retryable sanitized error instead of a permanent spinner.

## Diagnostic boundary

Diagnostics may include only product version/build ID, event sequence, main/renderer state enums, generation number, stop result/counters, provider lifecycle counters and audio accepted/played/cancelled/backpressure/drain/high-water counters. PCM, transcript/reply, provider payload, connect/session identifiers, device ID/path/name, credentials, network identity, window/process metadata and user diagnostics remain excluded.

## Acceptance

Host tests must cover long/burst playback without truncation, explicit true-limit failure, played drain, interrupt/stop while credit-blocked, stale runtime updates, stale generations, reconnect-after-stop, three stop entries, stop success/failure/reconciliation and diagnostic redaction. HIL remains pending until one uninterrupted long answer and stop from listening/playback both pass in the exact packaged build.
