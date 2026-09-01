# T10D-A EasyInput manual-motion bridge handoff

Date: 2026-09-02  
Owner: main Agent / EasyInput controller  
Branch: `codex/t10d-easyinput-manual-motion-bridge`  
Implementation commit: `0c69d9b3d89b99a2f29d502586b46ad40dd7131e`

## Delivered

- Frozen contract: [`EASYINPUT_MANUAL_CALIBRATION_HOST_V1_FROZEN`](../../contracts/deskmate-host/easyinput-manual-calibration-v1.md).
- Golden vectors: [`golden-vectors-easyinput-manual-calibration-v1.json`](../../contracts/deskmate-host/golden-vectors-easyinput-manual-calibration-v1.json).
- Feature Report `0x16`: 63-byte `DMCR` request payload; Windows HID buffer is 64 bytes including report ID.
- Input Report `0x17`: 63-byte `DMCS` accepted/terminal payload.
- Exact byte-for-byte forwarding to frozen Xiaozhi T10C `0x20` command and empty `0x21` status query.
- One host/Link request in flight, finite inherited retry/timeout, duplicate replay, conflict/stale/busy rejection, and USB/Link/reboot clearing.

## T10D-B software control points

1. Send a status query first. Keep every command control disabled until a correlated terminal `0x21` response is decoded. In the current production Xiaozhi image, `NOT_READY` is expected because no manual owner/real adapter is injected.
2. Present axes as yaw `0` and pitch `1`; never show or send a GPIO, PWM, pulse width, duty, absolute angle or arbitrary step-size field.
3. Command operations are ARM `0`, SELECT_AXIS `1`, PROVISIONAL_CENTER `2`, SINGLE_STEP `3`, RECENTER `4`, EMERGENCY_STOP `5`, CLEAR_EMERGENCY_STOP `6`.
4. ARM requires a non-zero volatile token, selected axis, lease `1000..5000` ms and all four explicit attestations: user present, linkage unloaded, independent current-limited supply, reachable cutoff. The token is one-use.
5. SINGLE_STEP exposes only direction `-1/+1`; the endpoint fixes the step at `10` tenths of a degree. Show the user `-1°` and `+1°` buttons, not a numeric target field.
6. Emergency stop stays visible and highest priority. Clear does not restore readiness; the user must select, arm and establish/recenter again.
7. Generate a non-zero monotonic request ID per USB mount epoch and a separate non-zero confirmation ID for every command. Status uses confirmation ID zero.
8. Render three facts separately: user intent/confirmation; EasyInput accepted/forwarded; Xiaozhi terminal result plus completed-output counter. Never label accepted as moved or successful.
9. Allow only one outstanding request. An identical retry may reuse the same bytes/request ID; different bytes with the same ID are a conflict.
10. Map transport results exactly: completed `0`, malformed `1`, busy `2`, stale `3`, conflict `4`, Link not ready `5`, Link queue busy `6`, timeout `7`, Link error `8`, peer disconnected/restarted `9`, invalid response `10`, internal `11`.

## Verification and safety

- EasyInput Host CTest: `13/13` passed, including fake Windows frames, fake Xiaozhi endpoint, golden vectors, timeout, duplicate/conflict/stale/busy and lifecycle cases.
- ESP-IDF: exact v5.5.5 fixed-layout build passed. App size `0xD2F60`; factory partition remains `0x300000`; NVS/PHY/sound banks are unchanged.
- No port/device enumeration, application control, Flash/NVS/eFuse, flash, monitor, OLED, audio, LEDC/PWM/GPIO-servo or physical motion occurred.
- Classification: `T10D-A CODE_BUILD_CONFIRMED`; T10D-B software is next; T10D-C real adapter/HIL remains `NOT_READY / HARDWARE_LOCKED`.
