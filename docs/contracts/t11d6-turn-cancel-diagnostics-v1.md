# T11D.6 turn ownership and cancellation diagnostics v1

Status: `T11D6_TURN_CANCEL_DIAGNOSTICS_V1_FROZEN`

## Scope

This Windows-only slice repairs the strict half-duplex boundary used by the existing Doubao continuous companion session. It does not change credentials, provider framing, `keep_alive`, event `359`, fail-closed event `599`, firmware, DeskMate Link, OLED, motion or hardware audio contracts.

## Half-duplex ownership

The controller owns one closed arrival phase:

`idle / connecting / listening / thinking / speaking / draining / stopping / reconnecting / completed / error`

- Only `listening` may forward microphone PCM or accept ASR partial/final events.
- An accepted ASR final synchronously moves the arrival gate to `thinking` before queued event handling begins.
- Provider `tts.start` or the first audio frame synchronously moves the gate to `speaking` before queued event handling begins.
- Provider `tts.end` synchronously moves the gate to `draining`.
- `thinking`, `speaking` and `draining` drop microphone uplink and suppress ASR according to the phase captured when the provider event arrived. Handler-time state must not reclassify the event.
- The gate returns to `listening` only after every accepted local block reports its terminal playback outcome and the bound sink drain acknowledges. A drain timeout fails soft through the existing bounded interruption path.
- Transport loss moves the gate to `reconnecting`; explicit stop and fatal provider errors close it.

## Cancellation authority

- A normal accepted ASR final starts a user turn. It must not call the sink interrupt or provider interrupt methods.
- Only the explicit user action “interrupt response and continue listening” may cancel the current answer while the session remains active.
- Stop, renderer loss, provider failure/reconnect and bounded drain failure retain their existing teardown authority.
- The current provider `interrupt()` only clears a local reply accumulator. It is not evidence that the remote service cancelled TTS and must not be treated as a server acknowledgement.
- Natural automatic voice barge-in remains out of scope.

## Privacy-safe diagnostics

The snapshot and exported diagnostic may contain only closed enums and bounded counts:

- TTS turns started, completed after local drain, or abandoned.
- Implicit audio-first starts, starts while a turn is open and ends without a start.
- Chat finals, suppressed chat finals, chat-final/TTS-end pairs and chat finals without a TTS end.
- Accepted/suppressed ASR finals, their closed arrival-phase counts and the last arrival phase.
- Sink-cancelled block counts by `none / asr-final / manual / stop / renderer / provider / drain-timeout / other`.

The diagnostic must not contain transcript, reply, PCM, provider payload, numeric provider code, timestamp, credential, session/connect/request/message identifier or device/network/window identity.

## Compatibility

- The existing conversation controller, VoiceWorkflow arbitration, stop/Escape flow, playback credit, drain and keep-alive session remain the single owners.
- No second microphone, ASR, conversation or cancellation state machine may be introduced.
- The build identity is `t11d6-turn-cancel-diagnostics-v1`.

