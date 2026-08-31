# EasyInput audio capture v1

Status: `EASYINPUT_AUDIO_CAPTURE_V1_FROZEN`

This slice defines the DeskMate V1 microphone uplink implemented by the
EasyInput ESP32-S3. It does not define speaker playback, BLE transport or a
Xiaozhi audio endpoint.

## Configuration and trust boundary

The firmware reads only these existing top-level fields from the complete T05
JSON document:

- `wifi_ssid`: non-empty JSON string, at most 32 UTF-8 bytes.
- `wifi_password`: JSON string, at most 64 UTF-8 bytes; empty means an open
  network.
- `audio_host`: ASCII DNS name or IPv4 text, at most 253 bytes.
- `audio_port`: integer from 1 through 65535.

All four fields must be present and valid. Missing fields produce
`config-incomplete`; malformed fields produce `faulted`. The firmware does not
scan the LAN, broadcast, guess an address, log credentials or expose these
fields through HID diagnostics. DNS is resolved only for the configured host,
and control datagrams are accepted only from the resolved IPv4 address.

## UDP wire protocol

All integers are little-endian.

### `EIHB` heartbeat

The device sends a 20-byte heartbeat approximately once per second:

| Offset | Bytes | Meaning |
| --- | ---: | --- |
| 0 | 4 | ASCII `EIHB` |
| 4 | 1 | version `1` |
| 5 | 1 | bit 0 streaming, bit 1 audio ready |
| 6 | 2 | zero |
| 8 | 8 | active session, or zero |
| 16 | 4 | heartbeat sequence |

### `EICC` control

The trusted host sends exactly 36 bytes:

| Offset | Bytes | Meaning |
| --- | ---: | --- |
| 0 | 4 | ASCII `EICC` |
| 4 | 1 | version `1` |
| 5 | 1 | start `1`, stop `2`, keepalive `3` |
| 6 | 2 | zero |
| 8 | 8 | non-zero session ID |
| 16 | 4 | monotonically increasing sequence |
| 20 | 16 | opaque host token, retained for wire compatibility |

At most one session is active. Exact duplicate controls are idempotent;
conflicting duplicates, stale sequences, wrong sessions and malformed packets
fail closed. A session stops after 15 seconds without an accepted start or
keepalive, and always stops after 300 seconds. Disconnects and configuration
changes discard the old session; audio is never replayed later.

### `EICA` acknowledgement

The device answers with 20 bytes: `EICA`, version, echoed action, status,
reserved zero, session ID and control sequence. Status values are OK `0`, bad
request `1`, unauthorized `2`, busy `3` and unavailable `4`.

### `EIAU` audio

Each UDP datagram is 672 bytes: a 32-byte version-2 header and 640 bytes of PCM
S16LE. It contains one channel at 16 kHz, 320 samples (20 ms), the session ID,
capture sequence and monotonic millisecond timestamp. Audio is never written to
diagnostics or persistent storage.

## Hardware and scheduling

- I2S0 master, 32-bit MSB input, mono right slot.
- BCLK/WS/DIN are GPIO9/GPIO10/GPIO11.
- Samples are converted to signed 16-bit PCM by arithmetic shift.
- GPIO8 remains owned only by `PeripheralPowerController`; capture acquires the
  existing `KeyboardMic` lease and releases it on every stop/failure.
- Capture and UDP sending run in different tasks. Their 64-frame fixed-capacity
  queue lives in PSRAM. When full, the oldest frame is discarded.
- S1/S3 presses may wake or prewarm Wi-Fi, but only a valid `EICC start` may
  initialize and enable I2S.
- Audio task priorities remain below input/config/DeskMate Link ownership.

Wi-Fi, DNS, socket, I2S, PSRAM and allocation failures affect only the audio
state. Existing eight-key HID, encoder, LED feedback, configuration, Host
Action, agent-state forwarding and DeskMate Link continue to run.

## Sanitized status

The existing configuration status adds capability `audio_capture_v1` and only:

- state: `disabled`, `config-incomplete`, `ready`, `streaming` or `faulted`;
- captured, sent and dropped frame counts;
- read errors, send errors and recovery count.

No SSID, password, host, port, IP, MAC, audio content, user text or device path
is included.
