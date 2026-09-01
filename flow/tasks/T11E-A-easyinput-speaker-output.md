# T11E-A EasyInput local speaker output

- Status: `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED`
- Baseline: `codex/t10e-easyinput-audio-capture@7b194ccc8f2e1693b9fdb88e9f4501c94b8fb7f4`
- Branch: `codex/t11e-easyinput-speaker-downlink`

## Goal

Establish the smallest safe speaker hardware gate: I2S1 output, shared-power
lease discipline and microphone-priority arbitration. Use one synthesized
startup probe so a later authorized app-only HIL can verify the physical
speaker without a speculative network protocol or sound-bank operation.

## Scope

- Freeze and implement `EASYINPUT_SPEAKER_OUTPUT_V1_FROZEN`.
- Add host-testable playback generations and audio ownership arbitration.
- Integrate T10E microphone start/stop with the arbiter.
- Add sanitized speaker status to the existing config-status stream.
- Preserve T02-T10E, the fixed 16 MiB partition table and both sound banks.

## Gates

- Full EasyInput Host CTest.
- Exact ESP-IDF 5.5.5, `esp32s3`, Minimal Build, isolated sdkconfig and fixed
  partitions.
- Source/license, secret/privacy, ASCII path, artifact and diff checks.
- No port scan, device identity, Flash/NVS read/write, erase, monitor or HIL.

## Later HIL

After a separately authorized final-image app-only flash:

1. Cold boot produces one low-volume two-pulse tone and no repeated sound.
2. Keys, encoder, LEDs, HID, Link and OLED state remain unchanged.
3. Starting a board-microphone test during playback cancels speaker output and
   produces non-zero microphone audio without a stuck power or I2S owner.
4. Repeat boot and mic-start races; speaker failures must remain fail-soft.

Only after this gate passes may a separate package freeze a real-time desktop
speaker-downlink protocol. Sound-bank reads/writes remain independent gates.

