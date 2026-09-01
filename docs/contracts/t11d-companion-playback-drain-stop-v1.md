# T11D companion playback drain and bounded stop v1

Status: `T11D_COMPANION_PLAYBACK_DRAIN_STOP_V1_FROZEN`

## Accepted baseline and rejected follow-up

The user-present T11C follow-up proved that the repaired Doubao session can complete several real spoken turns. It also rejected three details: one answer could still end early, the explicit stop action could remain in `listening`, and the global in-app voice bar was wider than the compact capsule requirement. This contract changes Windows software only. It does not change EasyInput KEY1 ownership, firmware, HID, DeskMate Link, OLED, servo or board audio.

## Played boundary

Provider `tts.end` means that the network has finished delivering the response. It does not prove that the computer speaker has played the queued PCM. The computer AudioSink therefore exposes a session/generation-bound `drain()` operation:

- renderer `sink.drain` snapshots the playback nodes already scheduled for that request;
- `sink.drained` carries only the matching request sequence and is emitted after every snapshotted node ends;
- a late acknowledgement cannot satisfy a newer drain;
- the main-process wait is capped at four seconds; timeout interrupts and clears playback, increments a counter and fails soft;
- the controller remains `speaking`, keeps Agent state `working`, blocks microphone upload and ignores reflected ASR until drain succeeds or times out;
- only then does it return to `listening` and restore upload.

Manual **打断回答并继续听** still clears playback immediately, returns to `listening`, restores upload and consumes the pending response end exactly once.

## Bounded stop

The first stop request immediately emits `stopping`; duplicate stop requests share the same in-flight operation and UI controls are disabled. Source stop, sink interrupt/stop and provider close each have a 750 ms bound and execute without one stalled dependency blocking the others. The sink's ordered interrupt then stop may use two such steps. Terminal Agent publication is also bounded.

Regardless of a stalled renderer, source or provider, the controller emits `idle`, releases the foreground owner and clears the UI session. Provider events from the ended session are rejected by the existing token/generation boundary and cannot revive state, turns or audio. Diagnostics may expose only `playbackDrainTimeouts` and `teardownTimeouts` counts in addition to the T11C echo-guard counters.

## Product layout

At the desktop design width, Companion Overview uses one equal-height grid row. The realtime companion card fills the left row and assigns added height to the face stage; the right companion stack remains the row-height reference. Expression images keep their aspect ratio through container sizing and `object-fit`, rather than direct distortion. Below the desktop breakpoint the layout is a natural-height single column.

The in-app global voice bar is bottom-centred, one line and content-width with bounded minimum/maximum width. Narrow windows use the available viewport width and hide secondary icon/help copy before truncating the latest fragment. It preserves explicit stop and Escape guidance.

## Privacy and acceptance

Drain and stop diagnostics contain enums and counts only. PCM, transcript/reply text, device IDs, provider/session identifiers, credentials and window metadata are excluded. Software acceptance covers exact drain ordering, timeout closure, hanging teardown, duplicate stop, late events and responsive layout. User-present acceptance must confirm one full long answer, stop from `listening`, stop during an answer, immediate manual interruption, a compact capsule and aligned overview columns.
