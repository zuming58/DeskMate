# T11D.6 intermediate-answer truncation root-cause review

## Accepted HIL facts

The exact T11D.5 run used build `t11d5-half-duplex-keepalive-ui-v1`. It kept one connection with zero reconnect, provider, dialog, transport or close errors. The final explicit user stop completed normally. Playback reported 233 accepted, 226 played and 7 cancelled blocks; TTS reported 11 starts and 10 ends; there were 11 sink interruptions, four ASR events ignored during playback and nine successful drains. The user heard one intermediate story response stop after one sentence.

Those aggregates prove that the earlier 599/audio-idle-timeout failure was removed. They do not, by themselves, prove whether the provider generated only one sentence or local playback cancelled the remainder.

## Code evidence and proved defect

T11D.5 captured `suppressAsr` before the serialized handler queue, but derived it from controller state that changed only inside that queue. If `tts.start` and a reflected `asr.final` arrived back-to-back, both could observe the old `listening` state even though provider order already assigned the answer to TTS. The guard also blocked uplink only while controller state was `speaking`; it allowed PCM and ASR during `thinking` and did not use the local drain phase in `forwardSourceAudio`.

Every accepted `asr.final` then unconditionally called both `audioSink.interrupt()` and `provider.interrupt()`. The latter only cleared DeskMate's local `replyText`; it did not send or receive a provider cancellation acknowledgement. A late ASR accepted through the phase gap could therefore clear queued local playback and local reply state while looking like a legitimate new user turn. This is a production race that can explain the seven cancelled blocks and audible truncation.

## Selected repair

T11D.6 adds a synchronous half-duplex arrival gate independent of the awaited event handler. Provider arrival updates that gate before the next event can be classified. Only `listening` accepts microphone/ASR; `thinking`, `speaking` and `draining` suppress both. Ordinary ASR final no longer interrupts playback or provider state. Explicit user interruption remains the only in-session response cancellation authority.

Local TTS completion is recorded only after played-block accounting and sink drain acknowledgement. A provider `tts.end` before local drain is not counted as audible completion.

## Distinguishing the next real run

- A genuinely short provider answer yields a chat final, TTS start, local drain, TTS completion and no cancellation cause.
- A local manual or teardown cancellation yields an abandoned TTS turn plus cancelled blocks attributed to a closed cause.
- A provider start without end remains visible as a started/open turn and becomes provider/stop-abandoned on termination.
- A delayed ASR during thinking/speaking/draining increments a suppressed arrival-phase count and cannot cancel playback.

All evidence is aggregate and content-free. A user-present HIL remains required before declaring the audible truncation closed.

