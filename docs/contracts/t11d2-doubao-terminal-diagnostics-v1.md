# T11D.2 Doubao terminal diagnostics v1

Status: `T11D2_DOUBAO_TERMINAL_DIAGNOSTICS_V1_FROZEN`

Implementation status: `TEST_CONFIRMED / HIL_NOT_RUN`.

This Windows-software-only slice adds privacy-safe evidence for the provider event that follows a completed TTS turn. It does not change provider frames, error handling, reconnect, stop, speaker credit/drain, microphone half-duplex, UI expressions, EasyInput firmware or Xiaozhi firmware.

## Evidence boundary

The T11D.1 user-present run proved long playback and stop controls, but a completed answer later ended with `doubao-service-error`. Existing diagnostics could distinguish a transport close and session failure, but collapsed protocol error frames and event `599` into the same result and did not count events `152` or `52`.

Provider arrivals are classified before they enter the controller's serialized event queue. A process-local monotonically increasing sequence therefore preserves arrival order even when an earlier `tts.end` handler is waiting for local speaker drain.

## Frozen fields

`providerLifecycle` retains its existing counters and adds:

- counters: `errorFrames`, `dialogErrors`, `sessionFinished`, `sessionFailed`, `connectionFinished`, `transportErrors`, `transportCloses`;
- event evidence: `lastProviderEvent`, `lastTerminalEvent`, `lastTerminalPhase`;
- ordering: `providerEventSequence`, `lastTtsEndSequence`, `lastTerminalEventSequence`;
- classification: `lastFailureBucket`, `terminalExpected`.

The event and phase values are closed allowlists. `terminalExpected` is true only when the terminal event arrives while an explicit stop is in flight. It does not reinterpret provider behavior.

Error-frame codes are never exported. They map to these fixed buckets:

| Provider code | Diagnostic bucket |
| --- | --- |
| `45000001` | `request-invalid` |
| `45000002` | `empty-audio` |
| `45000151` | `audio-format-invalid` |
| `55000031` | `server-busy` |
| other `550xxxx` | `server-internal` |
| every other value | `unknown-provider-error` |

The mapping follows the official provider error table at <https://www.volcengine.com/docs/6561/1840838?lang=zh>. Raw code, provider message, frame/payload, transcript/reply, PCM, timestamps, connect/session/request/message identifiers and device/network/window information are forbidden.

## Behavioral non-change

- `359` remains ordinary `tts.end`; local playback drain still owns the return to listening.
- `152` and `52` remain unmapped lifecycle evidence in this slice.
- `153`, `599` and protocol error frames keep their existing failure behavior.
- transport error/close keeps the existing bounded reconnect behavior.
- stop, backpressure, half-duplex and Agent State behavior are unchanged.

The next behavior repair must be selected from a new sanitized HIL diagnostic. This package must not infer that every provider terminal event is reconnectable.

## Acceptance

Host tests cover `359 -> error frame`, `359 -> 599`, `152`, `153`, `52`, transport error/close and reconnect, an expected terminal event during stop, every frozen failure bucket, unknown values, arrival ordering during speaker drain, and privacy rejection. The full long-answer/backpressure/stop/half-duplex suite remains required.

The Xiaozhi/Desktop seven-state visual synchronization audit is recorded separately. No expression or firmware change is part of T11D.2.
