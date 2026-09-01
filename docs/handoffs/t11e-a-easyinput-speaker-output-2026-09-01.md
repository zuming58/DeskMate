# T11E-A EasyInput local speaker output handoff

## Result

T11E-A establishes the first local speaker hardware gate without defining a
desktop audio downlink. The implementation is isolated on
`codex/t11e-easyinput-speaker-downlink` from
`7b194ccc8f2e1693b9fdb88e9f4501c94b8fb7f4`.

- I2S1 uses GPIO14/13/15, Philips framing, signed 16-bit 48 kHz mono-left PCM.
- The existing GPIO8 `Speaker` lease is the only power path; this package adds
  no direct GPIO8 write.
- A single low-volume synthesized two-pulse startup probe is the only playback
  producer. No desktop, HID, UDP or DeskMate Link command can play audio.
- The T10E microphone has absolute priority. Its exact generation blocks new
  speaker admission, cancels active playback, waits for I2S1 cleanup, then
  acquires the existing `KeyboardMic` lease and starts I2S0.
- Speaker failure is fail-soft for keys, encoder, LEDs, USB HID, configuration,
  Host Action, microphone capture, Agent state and DeskMate Link.
- Sanitized configuration status adds only the speaker capability, state and
  bounded numeric counters.

## Verification

- EasyInput Host CTest: `12/12` passed.
- ESP-IDF: exact v5.5.5, `esp32s3`, Minimal Build and the fixed 16 MiB partition
  layout passed before final delivery; a final clean-HEAD rebuild is required
  before any image identity or later flash authorization is issued.
- Source-contract checks keep one GPIO8 writer, reject network/sound-bank access
  from the speaker service, preserve the partition layout and require the
  microphone-priority handoff.
- `git diff --check`, ASCII-path, source/license, privacy and ignored-artifact
  checks are required at closure.

## Safety and remaining acceptance

No port, device, Flash, NVS, sound bank, eFuse, monitor or hardware operation is
authorized by this package. Status is
`TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED`.

Later HIL requires a separate exact app-only authorization. A cold boot should
produce one short two-pulse tone; the probe must not repeat. Keys, encoder,
LEDs, HID, Link and the optional board microphone must continue to work. This
does not prove a real-time desktop speaker path; that remains a separate frozen
contract after the local hardware gate is accepted.
