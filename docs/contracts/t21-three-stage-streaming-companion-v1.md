# T21 three-stage streaming companion v1

Status: `T21_THREE_STAGE_STREAMING_COMPANION_V1_FROZEN`

This contract replaces the end-to-end realtime-dialogue provider inside the Windows companion path. It does not change Voice Input, HID, DeskMate Link, either firmware image, servo behavior, or hardware audio wiring.

## Product boundary

The companion turn has exactly three semantic stages:

1. `StreamingAsrAdapter`: computer or EasyInput PCM16 input to partial/final text.
2. `DeskMateCompanionModelAdapter`: final user text plus the bounded DeskMate session context to assistant text deltas/final text.
3. `StreamingTtsAdapter`: confirmed assistant text segments to PCM24k mono output.

Only `DeskMateCompanionModelAdapter` is allowed to decide the conversational answer. The ASR adapter must not answer questions. The TTS adapter must not rewrite, continue, summarize or classify the answer. The transport/controller must not submit every transcript to a second language model.

The configured Doubao realtime service is retained only as the v1 `StreamingTtsAdapter`. DeskMate never uploads microphone audio to it in this path. Bailian `qwen3-asr-flash-realtime` is the v1 ASR adapter. The configured OpenAI-compatible text service, or the existing encrypted Bailian text fallback, is the v1 companion model.

## Normalized events

The composite provider exposes only the existing controller event vocabulary:

- `asr.partial { text }`
- `asr.final { text }`
- `chat.partial { text, fullText }`
- `chat.final { text }`
- `tts.start`
- `audio { audio }`
- `tts.end`
- `error { message }`
- `connection.closed`

Provider-specific payloads, request identifiers, keys, URLs, transcript text and answer text must not enter diagnostics.

## Turn lifecycle

- ASR partial text is UI-only and never invokes the model.
- One non-empty ASR final opens one turn. Duplicate final events for the same ASR item are ignored.
- A final that deterministically claims an existing trusted DeskMate action/status route is emitted to the controller but is not sent to the companion model. The existing trusted route owns its answer and effects.
- Every other final is sent exactly once to the companion model.
- Only visible `delta.content` is accepted from the model stream. Reasoning fields and tool-call drafts are rejected and never spoken.
- Stable sentence segments may be sent to TTS before the model finishes. Segments keep their original order, are spoken once and must concatenate to the final assistant text after whitespace normalization.
- One logical assistant turn emits one aggregate `tts.start` and one aggregate `tts.end`, even when several TTS requests are required.
- User and assistant finals continue to be committed by `CompanionConversationController`; partials and PCM are not persisted.
- After aggregate playback drain, the existing strict half-duplex controller returns to listening.

## Cancellation and stale work

- Stop, interrupt, reconnect or a superseding provider generation aborts the active model request, clears unsent TTS segments and closes active ASR/TTS sessions.
- Events from a closed generation are ignored.
- An interrupted response is never replayed and its remaining text is never synthesized.
- Queue depth is bounded to 16 speech segments and 16 KiB visible assistant text. Exceeding either bound fails closed.
- No automatic microphone barge-in is promised by v1. Manual interrupt remains available.

## Context and tools

- The companion model receives the frozen persona, at most 20 reviewed memory summaries and at most 12 prior user/assistant turns from the current live session.
- Raw historical conversations, window titles, prompts, tool parameters, device paths and credentials are not attached.
- Existing Codex status, motion, application and media routes remain deterministic compatibility tools in v1. Their results are spoken through the TTS adapter, but the model cannot invent or directly execute them.
- Native structured model tool calls are a later slice and are not claimed by this contract.

## Errors and readiness

- Start requires all three stages to be configured: Bailian ASR key, companion text model/fallback, and Doubao TTS credentials.
- Stage errors map to bounded stable reasons: `three-stage-asr-unavailable`, `three-stage-model-unavailable`, `three-stage-tts-unavailable`, `three-stage-stream-invalid`, or `three-stage-session-failed`.
- No provider error body or user content is surfaced in diagnostics.
- Failure terminates the current foreground session. The next user start creates fresh adapters and may retry normally.

## Content-free metrics

The provider may expose counts and monotonic durations for:

- `speechStarted`
- `firstAsrPartialMs`
- `asrFinalMs`
- `modelRequestStartedMs`
- `firstAssistantDeltaMs`
- `firstTtsRequestMs`
- `firstTtsAudioMs`
- `playbackStartedMs`
- `turnCompletedMs`
- turn, segment, cancellation and error counters

No transcript, response, task title or other user content is included. The latency target is ASR-final to first audio P95 at or below two seconds; the separately configured end-of-utterance silence window is measured on its own. Both remain `HIL_PENDING` until measured on the user's machine and configured services.

## Acceptance

Automated:

- partials never invoke the model;
- one final invokes it once;
- trusted finals bypass it;
- first stable text reaches TTS before model final;
- ordered segments produce one aggregate playback turn;
- interrupt/stale generation cannot speak queued text;
- malformed stream/tool-call content fails closed;
- diagnostics contain no transcript or answer;
- existing Voice Input and companion persistence regressions pass.

User-present:

- two ordinary conversational turns preserve context and use the configured DeskMate persona;
- the caption shows ASR partials promptly;
- speech begins without waiting for the full model answer when a stable first sentence exists;
- manual interrupt stops remaining speech;
- Codex status and one whitelisted action remain truthful;
- stopping and starting again creates a clean usable session.
