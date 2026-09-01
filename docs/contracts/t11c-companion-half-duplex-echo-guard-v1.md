# T11C companion half-duplex echo guard v1

Status: `T11C_COMPANION_HALF_DUPLEX_ECHO_GUARD_V1_FROZEN`

Follow-up: T11D preserves this policy but supersedes its network-only `tts.end` release point with the played/drain boundary in `T11D_COMPANION_PLAYBACK_DRAIN_STOP_V1_FROZEN`.

## Scope and accepted baseline

T11C is an additive Windows-software contract for the one existing `CompanionConversationController`. User-present acceptance of the T11B repair proved a real Doubao handshake, computer-microphone upload, continuous session and computer-speaker reply. T11C does not create another conversation or Agent-state machine and changes no firmware, HID report, DeskMate Link frame, OLED scene, servo or board-audio contract.

The remaining rejected behavior was acoustic: computer-speaker playback could return through the microphone, create an ASR final event and interrupt its own answer. Natural hands-free automatic barge-in is therefore not accepted in this version.

## Strict turn taking

The default policy is `computer-speaker-echo-guard-v1`:

| Real phase | Microphone uplink | ASR handling | Conversation state | Agent state |
| --- | --- | --- | --- | --- |
| waiting for the user | enabled | partial/final accepted | `listening` | `listening` |
| user final accepted | enabled until playback begins | final committed once | `thinking` | `thinking` |
| actual assistant playback | disabled | partial/final ignored | `speaking` | `working` |
| `tts.end` before AudioSink drain | disabled | ignored | `speaking` | `working` |
| matching AudioSink drained | enabled again | accepted | `listening` | `listening` |
| manual interrupt | enabled immediately | accepted | `listening` | `listening` |
| stop/failure | stopped | ignored/stale | `idle` / `error` | `idle` / `error` |

`tts.start` enters `speaking`; the first real audio frame also enters `speaking` if the provider omitted that marker. T11D established that `tts.end` reports network delivery rather than audible completion, so the controller now returns to `listening` only after bounded AudioSink drain. The controller uses the existing ASR final event as the user-turn boundary because the provider exposes no more reliable local end-of-turn signal.

While the policy is active, microphone PCM is not sent to the provider and ASR partial/final events are ignored before UI, persistence, interruption or state transitions. The page action **打断回答并继续听** clears scheduled playback, asks the provider to interrupt through the existing adapter, returns to `listening` and resumes upload immediately. It is the supported V1 interruption path.

## Computer microphone request

Every computer-microphone request asks the browser audio stack for echo cancellation, noise suppression, automatic gain control and one channel. If the user selected a concrete Windows input, its exact opaque device ID remains in the existing renderer-only media request. The ID never enters React state, diagnostics or exports. These processing constraints reduce acoustic risk but do not replace the half-duplex guard.

## UI and expression ownership

- The realtime companion face is the first visual in Companion Overview and follows the one real lifecycle: listening face, thinking face, focused/working face, then listening again.
- Companion/device evidence remains beside the face. The full-width Xiaozhi work-state test follows the whole overview.
- Companion Overview has no second clickable Windows-expression preview or expression-library segment. Expression resources and hardware mappings remain available to other owned product surfaces.
- During playback the page says **回答中 · 防回声** and explains that automatic spoken interruption is paused while manual interruption remains available.

## Diagnostics and privacy

Only the policy enum, active boolean, `echoGuardDroppedChunks` count and `ignoredAsrDuringPlayback` count may enter runtime state and diagnostic export. No PCM, ASR text, response text, provider frame, device ID, session/connect ID, credential or user content may be added.

## Entry and compatibility boundary

This slice does not rebind EasyInput KEY1. KEY1 remains the accepted device-scoped text `VoiceWorkflow` trigger and preempts an active companion session under the existing foreground-owner contract. Companion is started by its explicit page action. A future product mode that gives the same physical key a companion-start meaning requires a separate visible ownership setting and frozen routing contract.

## Acceptance boundary

Software acceptance covers state order, playback upload suppression, reflected-ASR suppression, manual and normal resume, audio constraints, layout, diagnostics and full Windows packaging. User-present acceptance must confirm at least two complete spoken turns, one uninterrupted long reply, one manual interruption, and face/Xiaozhi state order. Automatic natural barge-in remains deliberately open and may return only after an independently tested AEC/acoustic gate.
