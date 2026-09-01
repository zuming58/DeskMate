# T11B desktop computer-audio companion

Status: `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`

## Goal

Complete a production continuous-dialogue audio loop using the selected computer/EasyInput microphone and the computer speaker while preserving the single T11 controller, foreground owner, provider and memory pipeline.

## Included

- Computer microphone capture and selected Windows input-device reuse.
- Computer speaker playback with bounded queue and interruption.
- EasyInput microphone pre-start fallback to computer input, with per-session source locking.
- Finite reconnect, generation-based stale-event rejection and no replay.
- Sanitized UI/diagnostic evidence and complete automated regression.

## Excluded

- EasyInput speaker protocol or firmware.
- Xiaozhi audio, OLED, servo and hardware operation.
- Real credentials, network/audio HIL or automatic UI control.

## Stop gate

Stop after tests, packaging and documentation. User-present acceptance must separately validate the packaged app with real credentials, microphone permissions, selected Windows device, playback, interruption, fallback and physical expression behavior.
