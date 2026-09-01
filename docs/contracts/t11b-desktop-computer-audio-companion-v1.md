# T11B desktop computer-audio companion v1

Status: `T11B_DESKTOP_COMPUTER_AUDIO_COMPANION_V1_FROZEN`

## Scope

T11B closes the Windows production audio loop around the existing `CompanionConversationController`. It adds no second conversation or dictation state machine and changes no firmware, HID report, DeskMate Link frame, OLED scene, servo or board-audio contract.

The supported production path is:

`selected microphone -> DeskMate -> Doubao realtime dialogue -> computer speaker`

The computer microphone is the default. A concrete Windows input device may be selected. The accepted EasyInput LAN microphone may also be selected, but the output remains the computer speaker.

## Session locking and fallback

- A start request creates one session ID and one foreground generation.
- The microphone preference is sampled once before capture and the actual adapter is locked for the whole session.
- If EasyInput was requested but is unavailable or cannot start, DeskMate may visibly fall back once to the selected computer microphone before capture begins. The saved preference is unchanged.
- A source failure after capture begins ends the session. It never switches adapters mid-session.
- EasyInput HID loss ends a companion session only when the active source is EasyInput. A computer-audio session remains independent of unrelated board disconnection.
- Repeated start is rejected while active. Stop and Escape are idempotent and release provider, source, sink, timers and queues.

## Computer audio bridge

Electron main owns the conversation session, credentials, provider connection and lifecycle. A versioned, session- and generation-bound IPC bridge delegates only Web Audio operations to a renderer audio engine:

- microphone output: PCM S16LE, 16 kHz, mono;
- provider playback: PCM S16LE, 24 kHz, mono;
- maximum IPC audio chunk: 64 KiB;
- maximum scheduled playback: 3 seconds; excess backlog is cleared and counted;
- renderer readiness and start operations use bounded waits;
- stale session/generation events, malformed chunks and late events are rejected.

Raw PCM necessarily crosses this narrow Electron-to-Web-Audio boundary. It must not enter React application state, UI events, diagnostics, logs, SQLite or exported files. Provider credentials remain in Electron main and never cross preload.

## Continuous turns and interruption

The frozen lifecycle remains:

`idle -> connecting -> listening -> thinking -> speaking -> completed -> listening`

The session stays active across turns. Final user and assistant turns are committed transactionally before final UI events.

Manual interruption and a confirmed user utterance during playback clear scheduled computer audio immediately. The controller clears its local partial reply and discards late audio/reply frames from the interrupted response until its `tts.end`. No undocumented provider cancellation event is transmitted. The next user turn remains the current turn and stale frames never re-enter playback or persistence.

Transport failures use the existing finite reconnect path. Reconnect creates a new provider instance, restarts capture through the already locked source adapter and never replays old PCM, replies or Agent states. Provider/content errors fail closed with an enumerated error code.

## Agent state ownership

The existing single publisher remains authoritative:

- connecting -> waiting
- listening -> listening
- thinking -> thinking
- speaking -> working
- completed -> completed, then listening
- error -> error
- stopped -> idle

Voice input/edit preempts companion ownership. Displaced states are dropped, not queued for replay.

## Explicit exclusions

- EasyInput speaker downlink is `NOT_FROZEN` and remains visibly unavailable.
- No UDP, HID or DeskMate Link speaker framing is invented.
- Xiaozhi audio is not initialized or used as a fallback.
- Real Doubao credentials/network, microphone permissions, acoustic echo, latency, packaged playback and physical Agent/OLED behavior require user-present HIL.

