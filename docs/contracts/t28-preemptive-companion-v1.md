# T28: isolated preemptive companion generation

Status: `T28_SOFTWARE_SLICE_FROZEN`, 2026-09-11, user approved implementation.

Pre-response retry and visible connection feedback are subsequently amended by
[T29](./t29-voice-output-recovery-v1.md); private drafts still never auto-retry.

This narrowly amends T21's prohibition on model calls from partial ASR. It does not change hardware, the single VoiceWorkflow, ASR silence preference, Doubao voice, or the accepted playback echo/barge-in gates.

## First implementation boundary

- Debounce meaningful revised ASR text for 500 ms, then prepare an ordinary-chat model draft. This timer measures text stability, **not** acoustic silence or semantic end of turn. Keep the existing ASR final as the mandatory output gate. Do not shorten ASR segmentation in this slice, so incomplete fragments are still revised by the same ASR item rather than committed separately.
- Only one draft is active, at most three attempts per final utterance. Subsequent meaningful text cancels the old request. Final text must match after punctuation/case normalization; negations, numbers and words must still match. Otherwise run the normal confirmed request.
- Three-stage `thinking` also keeps microphone uplink open (legacy cloud realtime and one-shot announcements unchanged). The existing recognized-speech barge gate cancels an in-flight confirmed response; earlier confirmed user content stays in context for the follow-up. A raw `speech.started`/clap alone does not cancel it. Internal punctuation, especially decimal separators, is never stripped by draft equivalence.
- Drafts cannot emit assistant events/audio, call TTS/tools/KnowledgeOS, or append dialogue/SQLite records. Main-owned context and reviewed memory are revalidated before adoption. Cancellation, close, late callbacks and stale final text must not resurrect a draft.
- Read-only ordinary-chat draft preparation may use current dialogue and reviewed local memory. Historical/current-dialogue retrieval and trusted commands retain their confirmed-only path. This is not Smart Turn, audio semantic endpointing, or unbounded speculative TTS.
- A transient model-only failure before TTS starts returns to listening with a visible bounded error event, preserving microphone and context. Authentication, malformed/tool responses, ASR/TTS faults retain explicit failure handling. No automatic repeated model requests/replayed speech on failure.
- Keep the latest 20 completed/failed/cancelled model/direct turn measurements in this provider session. Export only duration fields, bounded outcomes and error classes/HTTP status. Queue acknowledgement is not physical playback onset. No text, IDs, paths, credentials or raw error bodies in diagnostics.

## Reference / divergence

Architecture reference only (no copied implementation): LiveKit `agents-js@79e2bf537de98f5aadc6d40fbcbb97baa09482f5`, private candidate, final equivalence check, unscheduled draft and cancellation ownership tests. See the [fixed-reference research](../architecture/companion-preemptive-turn-taking-research-2026-09-11.md).

Unlike LiveKit's early transcript endpoint, this minimal version debounces existing partials without changing the accepted ASR segmentation. Lack of partial updates must never itself release speech. Chinese learned turn detection, multi-final aggregation after shortening the ASR endpoint and preemptive TTS remain deferred until this first gate has live evidence.

## Verification gates

Synthetic tests: silence before final produces no audio/context; matching final reuses one request; revised/negated/numeric text cancels and regenerates; late old deltas are ignored; trusted/history requests do not speculate; context/reviewed-memory changes prevent adoption; bounded attempts; close clears timers; model HTTP/network/timeout classification and recovery; prior successful timing survives a failed turn; diagnostic redaction. Existing echo/clap/interruption and context regressions must still pass.

User-present acceptance: normal short phrase, hesitation and correction, continued speech during computation, public-speaker echo/clap, explicit commands and history questions, transient failure then next utterance. No guaranteed one-to-two-second acoustic result without live measurements. Preserve microphone routing and firmware throughout.
