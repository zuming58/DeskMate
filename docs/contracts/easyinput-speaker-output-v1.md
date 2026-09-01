# EasyInput speaker output V1

Status: `EASYINPUT_SPEAKER_OUTPUT_V1_FROZEN`

This slice freezes only the local EasyInput speaker hardware boundary needed
before any real-time desktop downlink can be designed. It is not a network
audio protocol and it does not authorize sound-bank access.

## Hardware

- Controller: ESP32-S3 I2S1 in master transmit mode.
- Codec/amplifier: board MAX98357A-compatible output.
- Pins: BCLK/WS/DOUT are GPIO14/13/15.
- PCM: signed 16-bit, 48 kHz, mono left slot, Philips framing.
- DMA: four descriptors, 10 ms / 480-sample frames.
- TX uses `auto_clear_after_cb`; an underrun cannot replay stale PCM.
- Shared rail: GPIO8 remains exclusively owned by
  `PeripheralPowerController`; playback acquires the existing `Speaker`
  lease and never writes GPIO8 itself.

## Playback lifecycle

- Capacity is one playback request. A second request is rejected as busy.
- A generation identifies every request and only an exact generation may
  release speaker ownership.
- Before enable, one zero frame is preloaded. Successful completion writes six
  zero frames (four descriptor frames plus two silent tail frames) before
  disabling I2S.
- T11E-A has exactly one producer: a low-volume, synthesized two-pulse startup
  probe. It reads no resource, configuration, NVS or sound bank.
- The startup probe is temporary hardware-acceptance behavior. No desktop,
  HID, UDP or DeskMate Link command may trigger playback in this slice.

## Microphone priority

- The board microphone has absolute priority over the speaker.
- A microphone request prevents new speaker admission and causes active
  playback to disable I2S immediately without the normal drain.
- I2S0 microphone initialization and its `KeyboardMic` lease may begin only
  after the exact speaker generation has disabled/deleted I2S1 and released
  its `Speaker` lease.
- Failure or timeout releases only the matching generation. Stale completion
  cannot release a newer microphone or speaker owner.

## Failure and diagnostics

- Speaker allocation, I2S, write and cleanup failures are fail-soft: input,
  LEDs, USB HID, configuration, Host Action, T10E capture, Agent state and
  DeskMate Link continue.
- A request is counted as completed or microphone-cancelled only after I2S1,
  the `Speaker` lease and the exact arbiter generation are all released. If
  safe I2S cleanup cannot be proved, the speaker enters `faulted` and audio
  admission fails closed; non-audio functions remain available.
- Sanitized status exposes only capability, state and numeric request,
  completion, microphone-cancel, busy, init, write and cleanup counters.
- Diagnostics contain no PCM, recording, text, network value, credential,
  address, identifier or device path.

## Explicitly excluded

- Real-time PCM/TTS downlink framing or desktop speaker selection.
- EIAD/Opus/IMA decoding and sound-bank reads.
- Sound A/B synchronization, erase or write.
- BLE audio, Xiaozhi audio, deep sleep, eFuse and any servo behavior.
