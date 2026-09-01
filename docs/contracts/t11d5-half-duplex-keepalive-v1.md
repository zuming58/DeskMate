# T11D.5 strict half-duplex keep-alive contract

Status: `T11D5_HALF_DUPLEX_KEEPALIVE_V1_FROZEN`

## Scope

This contract applies only to the DeskMate Windows realtime companion. It does not change VoiceWorkflow, firmware, DeskMate Link, OLED, servo, audio hardware or provider credentials.

## Session input policy

- A companion session uses one WebSocket and one provider session across turns.
- The microphone uploads 16 kHz PCM while DeskMate is listening.
- Computer-speaker playback retains `computer-speaker-echo-guard-v1`: microphone chunks are not uploaded while speaking or draining.
- StartSession therefore declares `dialog.extra.input_mod = "keep_alive"`. This is the provider's documented mode for a microphone stream that can be temporarily muted or unavailable.
- Event `359` remains the current-turn TTS boundary. DeskMate drains accepted local playback, returns to listening and keeps the same provider session.
- Event `599` remains a terminal `DialogCommonError`. It is never ignored, converted to completion or used to create a replacement session.

## Diagnostics

- Official status `52000042` maps to the closed class `audio-idle-timeout`.
- Raw provider code, message, payload, text, PCM, timestamps and identifiers remain excluded from renderer state and diagnostic export.
- Unknown provider status values remain `unknown-provider-error`.

## UI layout

- The primary/restart action, stop warning, input/output/service evidence and session notices live in one normal-flow vertical control stack.
- The stack cannot use absolute positioning or negative margins.
- At 640 px and below, action buttons and the three evidence cards become one column.

## Acceptance

Automated acceptance requires the StartSession mode vector, same-session second turn, `52000042` fail-closed classification, diagnostics allowlist and responsive-flow assertions. User-present acceptance still requires a long audible answer followed by a second turn without an automatic stop, reconnect or repeated welcome.
