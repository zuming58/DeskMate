# T10D-A - EasyInput manual-motion bridge

## Status

`IMPLEMENTED / TEST_CONFIRMED / BUILD_CONFIRMED / HARDWARE_FORBIDDEN`

## Objective

Complete the missing controller-side route between a future DeskMate manual
control UI and the already frozen Xiaozhi T10C manual-calibration endpoint,
without enabling or operating real motion.

## Exact baseline

- Project integration base: `codex/t11f-three-end-integration@ee0ac8418b1d7c0497f72e3edc67b5ee39b232d4`.
- Xiaozhi contract/endpoint: `codex/xiaozhi-t10c-manual-calibration@b83ce886ec8efd1fea288a65e0127d2a887d5883`.
- Frozen downstream contract: `T10C_MANUAL_CALIBRATION_LINK_V1_FROZEN`.

## First action: contract audit

Before choosing a Desktop→EasyInput report ID or payload, audit the existing
Host Action, Agent State Feature Report, EasyInput native bridge, status stream
and available report/message namespace. Freeze one additive transport only
after proving that it does not collide with the current contracts.

## Permitted implementation

- One bounded Desktop→EasyInput manual-calibration request and independent
  status/terminal response shape.
- One request in flight; explicit busy, timeout, disconnect and peer-restart
  terminal results.
- Exact translation to the existing T10C operation, axis, direction,
  session/action IDs, volatile arm token, 1000..5000 ms lease and four safety
  attestations.
- Correlated three-layer evidence: Windows intent, EasyInput forwarding and
  Xiaozhi terminal result remain separate.
- Host tests with fake Windows frames and a fake Xiaozhi Link endpoint, plus an
  exact ESP-IDF v5.5.5 fixed-layout build.

## Forbidden

- No Windows UI or modification of the active DeskMate software task.
- No arbitrary angle, target, pulse width, duty, GPIO or PWM field.
- No real Xiaozhi adapter, production motion owner, `MOTION` capability enable,
  preset action, expression-linked movement or dancing.
- No port scan, device identity, Flash/NVS/eFuse access, flash, erase, monitor,
  OLED, audio or servo operation.

## Exit evidence

- Frozen additive Desktop→EasyInput contract and golden vectors.
- Host tests cover normal completion, rejection, duplicate/conflict, stale
  action, one-in-flight busy, timeout, disconnect/reboot clearing, emergency
  stop priority and no replay.
- EasyInput Host suite and exact ESP-IDF build pass without changing the fixed
  16 MiB partition table or locked T03–T11 behavior.
- Main Agent records exact branch/HEAD and leaves physical motion classified as
  `NOT_READY / HIL_NOT_RUN`.

## Result

- Frozen Host transport: `EASYINPUT_MANUAL_CALIBRATION_HOST_V1_FROZEN`, HID Feature `0x16` and Input `0x17`, both with 63-byte payloads and committed golden vectors.
- EasyInput implements one strict host slot, accepted/terminal evidence, exact T10C `0x20/0x21` forwarding, timeout/disconnect/restart closure and redacted counters.
- Host CTest passed `13/13`, including fake Xiaozhi endpoint and source-contract safety gates.
- Exact ESP-IDF v5.5.5 fixed-layout build passed; application size `0xD2F60` inside the unchanged `0x300000` factory partition.
- No device, port, Flash/NVS/eFuse, OLED, audio, PWM, GPIO-servo or physical motion operation occurred. Production motion remains `NOT_READY / HIL_NOT_RUN`.
