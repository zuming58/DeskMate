# T24 Codex status on EasyInput LEDs v1

- Status: `T24_CODEX_LED_STATUS_V1_FROZEN`
- Frozen: 2026-09-11
- Scope: real Codex lifecycle status rendered by the five EasyInput WS2812 pixels

## Product behavior

Codex work state no longer uses Xiaozhi's face. A real `codex-hook-v1` lifecycle event may drive a low-brightness, solid base color on all five EasyInput pixels. This remains available in both full hardware mode and the optional `Windows + EasyInput` mode.

| State | RGB on each of 5 pixels | Lifetime |
| --- | --- | --- |
| `idle` | `0,0,0` | until a new live state |
| `listening` | `0,8,28` blue | host TTL, maximum 600 s |
| `thinking` | `14,0,28` violet | host TTL, maximum 600 s |
| `working` | `0,22,22` cyan | host TTL, maximum 600 s |
| `waiting` | `26,12,0` amber | host TTL, maximum 600 s |
| `completed` | `0,26,8` green | 10 s, then black |
| `error` | `28,0,0` red | 10 s, then black |

Input feedback retains priority: an already-confirmed key or encoder event may temporarily replace the base frame under the frozen T04 effect. When that bounded animation finishes, it restores the latest Codex base frame instead of assuming black.

## Host routing

T24 reuses the frozen T09 HID Feature report `0x12` version 2 and its exact 16-byte semantic payload/Windows zero-padding rules. It does not define another report ID.

- Source hash is the opaque constant `0x4c584443`; its little-endian bytes spell `CDXL` for source-code readability only.
- Firmware advertises `codex_led_status_v1: true` in the privacy-safe configuration capability snapshot.
- Desktop sends this source only for real Codex hook events. Simulation, window titles, process presence, task text and timers cannot invent a state.
- Firmware with no explicit capability receives no T24 report. The desktop fails closed and leaves the LEDs unchanged.
- The current bounded state may be restored when the capability first becomes available in the same desktop lifetime. An expired state restores `idle`; terminal states are never kept beyond 10 seconds.

## Firmware ownership and isolation

- EasyInput consumes the exact `CDXL` source locally before the existing T09 Link bridge. It never forwards that source to Xiaozhi.
- Every other valid `0x12` source follows the unchanged T09 path. T24 therefore cannot steal companion, voice or manual display states from the Xiaozhi owner.
- The local owner suppresses exact duplicates, clears on USB epoch change, expires by unsigned monotonic time and never infers a missing terminal event.
- The latest base frame and latest transient input event use separate bounded mailboxes. LED failure is fail-soft and cannot block keyboard, audio, configuration, Host Action or DeskMate Link.

## Electrical and privacy boundaries

- The five serial WS2812 pixels remain on GPIO12 and serialize in GRB order.
- GPIO8 remains the shared high-active LED/microphone/speaker power domain. T24 only submits RGB or black frames to the existing LED owner; it never writes or cycles GPIO8.
- No payload, source hash, task title, transcript, device path or user data enters diagnostics. Desktop diagnostics expose only support, bounded delivery status, target state, time and sanitized reason.
- This code/build slice does not authorize a port scan, Flash/NVS read or write, firmware flash, monitor, GPIO change or physical acceptance claim.

## Acceptance

Code acceptance requires state/color vectors, duplicate/TTL/epoch tests, proof that foreign sources still route to T09, restoration after transient input effects, native capability parsing, full desktop regression, EasyInput Host tests and an ESP-IDF 5.5.5 fixed-layout build.

Hardware acceptance is separate and user-authorized: on the exact built image, observe each live Codex state, terminal timeout, key/encoder override restoration, no Xiaozhi face change, and no audio interruption. Until then the classification remains `HIL_NOT_RUN`.
