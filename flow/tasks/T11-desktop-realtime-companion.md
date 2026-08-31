# T11 desktop realtime companion

Status: `TEST_CONFIRMED / BUILD_CONFIRMED / REAL_AUDIO_AND_NETWORK_HIL_PENDING`

## Goal

Build the Windows conversation core for press-on continuous dialogue, press-again/Escape stop, Doubao realtime dialogue, bounded audio adapters, existing T09 expressions, and exactly-once local turn persistence.

## Included

- One `CompanionConversationController` and foreground-session arbitration with `VoiceWorkflow`.
- Main-process Doubao binary protocol adapter with finite reconnect.
- Explicit `CompanionAudioSource` / `CompanionAudioSink` boundaries.
- Compact, non-focusing live capsule and a real start/stop UI entry.
- Transactional SQLite turn/outbox persistence.
- Simulated audio/provider tests and full desktop regression.

## Excluded

- EasyInput firmware or T10E review.
- Xiaozhi firmware, OLED protocol changes, servo/PWM, and board audio.
- Computer-microphone or Xiaozhi-audio fallback.
- Daily summary, embeddings, speaker identity, or third-party Agent adapters.
- Real-credential/network/HIL claims.

## Stop gate

After code/build completion, stop before real provider use. Continue only when T10E delivers the frozen EasyInput audio adapter and the user is present for credential, audio, network, and device acceptance.
