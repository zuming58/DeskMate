# T10E EasyInput audio capture

Status: `I2S_TIMEOUT_FIX_CONFIRMED / HOST_TEST_CONFIRMED / BUILD_CONFIRMED / NORMAL_BOOT_CONFIRMED / NONZERO_AUDIO_HIL_CONFIRMED / PRESSURE_REGRESSION_PENDING`

## Goal

Implement the EasyInput onboard microphone and the frozen Maker-compatible LAN
audio uplink without modifying the Windows desktop or Xiaozhi firmware.

## Allowed scope

- `firmware/easyinput-controller/`
- T10E contract, provenance, tests and project-flow records

## Required behavior

- Follow `EASYINPUT_AUDIO_CAPTURE_V1_FROZEN` exactly.
- Preserve T03 through T09 behavior and the fixed 16 MB partition table.
- Use the existing GPIO8 controller and `KeyboardMic` lease.
- Fail soft and keep all non-audio capabilities alive.
- Never log or report credentials, network identity or audio data.

## Stop gate

After Host tests, exact ESP-IDF 5.5.5 build, desktop regression and static
checks, push the short branch and stop. Do not scan ports, identify a device,
read Flash/NVS, flash, erase or monitor. Hardware validation requires a new
app-only authorization card.
