# T11D.5 DialogCommonError root-cause review

## Outcome

The evidence selects an input-stream silence-policy mismatch, not playback loss, local drain failure, an explicit stop or a transport close.

DeskMate intentionally suppresses microphone upload while computer TTS is speaking and draining. The rejected exact T11D.4 run recorded 600 echo-guard drops, eight complete TTS starts/ends, 136 accepted and played audio blocks, zero playback cancellation, drain timeout, queue drop or backpressure failure, and no transport error/close. Immediately after an audible answer and event `359`, the provider emitted event `599` while the local phase was draining.

The current official Volcengine realtime dialogue document says a microphone client that may be muted or unable to upload audio must set `dialog.extra.input_mod` to `keep_alive`; its error table defines `52000042 DialogAudioIdleTimeoutError` for audio-stream timeout and recommends the same setting. T11D.4 instead declared legacy `input_mod: "audio"` while intentionally creating upstream silence.

The rejected package retained only `unknown-provider-error`, so this is an evidence-supported causal inference rather than a claim that the private live numeric code was exported. The trigger, phase, counters and official remedy align, and competing local/transport causes are contradicted by the same run. T11D.5 fixes the declared silence policy and adds a future-safe closed classification for official code `52000042`.

## Sources and comparison

| Evidence | Result |
| --- | --- |
| Volcengine `端到端实时语音大模型API接入文档`, updated 2026-08-20 | `keep_alive` is required when microphone audio can stop; event `359` is `TTSEnded`; event `599` is `DialogCommonError`; `52000042` is the documented audio-idle timeout. |
| Official linked Python sample | Uses one connection/session across turns and continuously streams microphone audio; its legacy `audio` mode does not model DeskMate's strict playback mute. |
| Fixed `suligent@3e2744fcef780466e82d6803362573c6d8560cf0` reference | Separates TTS end from dialog error but exposes raw provider content, so no source was copied. |
| Exact T11D.4 sanitized HIL | Full local playback, no drain/queue/transport failure, upstream mute active, adjacent post-359 dialog error. |

Official protocol page: <https://www.volcengine.com/docs/6561/1594356?lang=zh>.

## Repair boundary

- Change only StartSession input mode from `audio` to `keep_alive`.
- Preserve strict half-duplex echo suppression and the local played/drain boundary.
- Preserve event `599` fail-closed behavior; no speculative reconnect or error swallowing.
- Map only the documented idle-timeout code to `audio-idle-timeout`; all unknowns remain coarse.
- Keep the UI correction independent: controls are grouped into ordinary document flow with responsive one-column evidence.

## Residual gate

Automated tests prove the contract and lifecycle, not provider availability. The exact T11D.5 package still needs one user-present long-answer/two-turn test. If event `599` remains, use the existing sanitized class/phase/counts to select the next repair; do not widen recovery behavior.
