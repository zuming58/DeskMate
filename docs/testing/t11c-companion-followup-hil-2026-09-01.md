# T11C live companion follow-up HIL

Date: 2026-09-01

Status: `MAIN_CHAIN_CONFIRMED / T11C_FOLLOWUP_REJECTED / T11D_REQUIRED`

## User-present facts

- A real conversation completed several consecutive spoken turns, so the repaired provider handshake, computer microphone, continuous controller and computer speaker remain accepted.
- One assistant answer still ended before audible playback completed.
- Clicking **结束陪伴对话** did not end the session; the visible state remained `listening` and connected.
- The global in-app voice strip was much wider than the requested compact bottom capsule.
- At the desktop layout, the left realtime companion card ended above the right stack and left a large unused grey area; the user requested equal column bottoms with extra height assigned to the face stage.

No user audio, recognized text, provider payload, credential, device identifier or window title is recorded here.

## Code correlation

- Provider `tts.end` changed the controller from `speaking` to `listening` immediately even though Web Audio nodes could remain scheduled. This released the half-duplex guard early and allowed speaker feedback during the playback tail.
- The sink had no acknowledged played/drain boundary.
- Controller cleanup awaited source, sink and provider teardown without per-step timeout or an idempotent stop operation.
- The in-app live bar used a fixed 760 px maximum rather than content-width capsule sizing; the overview grid aligned items at their starts.

T11D freezes and verifies these missing boundaries before another user-present run.
