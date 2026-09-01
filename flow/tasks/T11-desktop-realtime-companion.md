# T11 desktop realtime companion

Status: `T11_CORE_LOCKED / T11B_COMPUTER_AUDIO_IMPLEMENTED / REAL_AUDIO_AND_NETWORK_HIL_PENDING`

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
- Xiaozhi audio or any unversioned board-speaker fallback.
- Daily summary, embeddings, speaker identity, or third-party Agent adapters.
- Real-credential/network/HIL claims.

## Stop gate

T10E/T11A delivered the frozen EasyInput microphone uplink. T11B adds the computer audio production baseline and pre-start-only EasyInput input fallback. Stop before real provider use; credentials, network, packaged audio, echo/interruption quality and physical Agent behavior require user-present acceptance. EasyInput speaker work remains blocked until an independent T11E contract is frozen.
