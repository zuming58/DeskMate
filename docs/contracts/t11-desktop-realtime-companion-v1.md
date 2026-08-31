# T11 desktop realtime companion v1

Status: `T11_DESKTOP_REALTIME_COMPANION_V1_FROZEN`

## Scope

This contract freezes the Windows-only conversation core. It does not enable or modify EasyInput firmware, Xiaozhi firmware, servos, board audio, or hardware.

The single conversation lifecycle is:

`idle -> connecting -> listening -> thinking -> speaking -> listening`

It may also enter `stopping`, `completed`, or `error`. A second start is rejected while a session is active. Every session has a bounded session ID, a monotonically increasing generation, and an internal token. Events from an older token are discarded.

## Foreground audio ownership

Only one foreground audio workflow may own capture at a time:

- Companion start is rejected while text voice input/edit is active.
- Starting text voice input/edit stops companion playback and capture first.
- Stopping, Escape, application exit, service loss, or device loss releases the owner and all audio resources.
- A preempted companion session is never resumed automatically.

`VoiceWorkflow` remains the only state machine for text voice input and edit. T11 does not create a second dictation workflow.

## Main-process boundary

Doubao credentials, WebSocket state, PCM queues, and SQLite writes remain in Electron main with `nodeIntegration: false` and `contextIsolation: true`.

Preload exposes only:

- `startCompanionConversation()`
- `stopCompanionConversation()`
- `getCompanionConversationStatus()`
- `onCompanionConversationEvent(listener)`

Renderer events contain only bounded partial transcript, final user text, assistant text, lifecycle state, and sanitized error text. They never contain credentials, raw provider frames, device paths, recordings, or diagnostic transcripts.

## Provider and reconnect behavior

T11 uses the Doubao realtime-dialogue binary WebSocket protocol through a strict main-process adapter. Frames, JSON payloads, session IDs, event IDs, and audio chunks are bounded. Startup and runtime reconnect use a finite retry schedule. A reconnect clears the old provider and audio queues; old audio, replies, and expression events are not replayed.

Qwen/Bailian ASR remains unchanged for text voice input and voice edit.

## Audio adapter contract

`CompanionAudioSource` provides `status`, `start`, `stop`, PCM chunks, and errors. `CompanionAudioSink` provides `status`, `start`, `write`, `interrupt`, and `stop`.

T11 ships simulated adapters for automated tests and explicit unavailable EasyInput adapters in production. Until T10E supplies the real board adapter, the UI reports `easyinput-audio-source-pending` / `easyinput-audio-sink-pending` and refuses to claim a live conversation. It must not silently fall back to the computer microphone or Xiaozhi audio.

## Turn persistence

Every final user or assistant turn is committed to local SQLite before the corresponding final UI event. `source_event_id` is unique. The transaction inserts an outbox row, inserts the turn, and marks the outbox row complete. Repeated identical events are idempotent; conflicting reuse of an event ID fails closed. Interrupted `processing` rows recover as `pending` on startup.

Automatic summaries, vector retrieval, and speaker recognition are not part of T11.

## Expression ownership

While companion conversation is active it owns the existing T09 state stream:

- connecting -> waiting
- listening -> listening
- thinking -> thinking
- speaking -> working
- completed -> completed, then listening
- error -> error
- stopped -> idle

Codex and manual Agent events received during this ownership window are dropped, not queued. They are not replayed after the conversation ends.

## Acceptance boundary

Code acceptance requires simulated provider/audio tests, SQLite exactly-once tests, desktop tests, and desktop packaging. Real Doubao credentials, real network dialogue, EasyInput microphone/speaker quality, and physical OLED behavior remain user-present acceptance items.
