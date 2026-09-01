# T11D live companion follow-up HIL

Date: 2026-09-01

Status: `T11D_HIL_FAILED / MAIN_CHAIN_STILL_CONFIRMED / REPAIR_BLOCKED_ON_EVIDENCE`

## User-present facts

- The exact T11D package was running; process-path and package-time evidence excluded an old package and single-instance redirection.
- A real session could continue for several turns, so the previously accepted Doubao handshake, computer microphone, session and computer speaker main chain remain accepted.
- An assistant answer was still audibly cut off.
- Both the page action and the compact capsule action failed to clear the visible session; the renderer remained in `stopping`.
- The user rejected the enlarged face/layout direction. Visual redesign is paused; the later direction is a smaller face with real conversation/work state merged into the same card.

No audio, recognized text, reply text, credential, device identifier, session identifier or window title is recorded here.

## Sanitized failure snapshot

The user exported the existing sanitized diagnostic while the UI was stuck. At `2026-09-01T03:38:46Z` it reported:

- renderer projection `stopping`, `connected=true`, computer input/output;
- `sourceChunks=344`, `sinkChunks=54`, `interruptions=5`, `queueDrops=3`;
- `echoGuardDroppedChunks=113`, `ignoredAsrDuringPlayback=0`;
- the Agent-state delivery had already acknowledged terminal `idle` at `2026-09-01T03:38:33Z`;
- Link receive/transmit counters were increasing through frequent status traffic.

Interpretation: the audible truncation in this run correlates with three renderer queue overflows that clear all scheduled playback. It does not correlate with reflected ASR because no ASR event was ignored during playback. The successful terminal idle publication precedes a renderer that still says `stopping`, so the stop controller completed farther than the UI projection shows. The diagnostic file itself is user data and is not committed.

## Characterization evidence

`tests/t11d-hil-failure-characterization.test.mjs` reproduces both current behaviors without user data:

1. Five one-second PCM chunks arriving without playback-clock advance exceed the fixed three-second backlog. The current renderer emits `sink.queue-drop` and calls `stop()` on every previously scheduled node, producing audible truncation by design.
2. A companion idle patch and a high-frequency bridge patch built from the same `runtimeRef.current` snapshot are applied in sequence. Because both replace the whole `runtime` object through a shallow store patch, the later bridge patch restores the stale `stopping/active=true` companion value.

These tests characterize the rejected implementation. They are not repair evidence and do not change production behavior.

Verification after a clean `npm ci --include=dev`: the two characterization vectors passed `2/2`, controller/audio plus characterization tests passed `29/29`, and full `npm test` passed `224/224`. This confirms a deterministic description of the current defects; it does not turn the failed HIL into acceptance.

## Gate

Do not start another visual package, firmware package or speculative acoustic change. The next Windows package must first implement the evidence-backed queue and state-ownership design in `docs/reviews/t11d-companion-stop-drain-hil-failure-audit-2026-09-01.md`, expose the missing sanitized lifecycle evidence, pass automated regression and then repeat only the minimal user-present stop/long-answer gate.
