# T11B live companion main-chain acceptance

Date: 2026-09-01

## User-observed evidence

- The repaired package displayed the protocol-fixed App Key instead of requesting another user secret.
- The user started a real companion session, spoke through the selected computer microphone and received an audible assistant answer through the computer speaker.
- Therefore the real Doubao handshake, computer capture, provider session and computer playback main chain are accepted for this configuration.
- The assistant answer could still be interrupted before it finished. Code review identified microphone upload and ASR handling continuing during computer-speaker playback, so natural hands-free barge-in quality is not accepted.

No credential, transcript, PCM, device ID, network coordinate, session ID or provider frame is recorded here.

## Follow-up boundary

T11C freezes strict half-duplex behavior with manual interruption first. Its software implementation can proceed without hardware. User-present follow-up must verify answer completion, explicit manual interruption and lifecycle/Agent-state order. Re-enabling automatic spoken interruption requires a separate AEC/acoustic-gate package and acoustic evidence.
