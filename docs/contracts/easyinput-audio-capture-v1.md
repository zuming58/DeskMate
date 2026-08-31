# EasyInput audio capture v1

Status: `EASYINPUT_AUDIO_CAPTURE_V1_FROZEN`

This slice defines the DeskMate V1 microphone uplink implemented by the EasyInput ESP32-S3. It does not define speaker playback, BLE transport or a Xiaozhi audio endpoint.

## Configuration and trust boundary

The firmware reads only four existing top-level fields from the complete T05 JSON document: `wifi_ssid` (1–32 UTF-8 bytes), `wifi_password` (0–64 UTF-8 bytes), `audio_host` (IPv4 or DNS text) and `audio_port` (1–65535). It does not scan the LAN, broadcast, guess an address, log credentials or expose the fields through diagnostics. Control datagrams are accepted only from the resolved configured host.

## UDP wire protocol

All integers are little-endian.

### `EIHB` heartbeat

The device sends 20 bytes approximately once per second: ASCII `EIHB`, version `1`, streaming/audio-ready flags, two reserved zero bytes, active session u64 or zero, and heartbeat sequence u32.

### `EICC` control

The trusted host sends exactly 36 bytes: ASCII `EICC`, version `1`, action (`1` start, `2` stop, `3` keepalive), two reserved zero bytes, non-zero session u64, monotonic sequence u32 and a 16-byte opaque token. Exact duplicates are idempotent; conflicts, stale sequences, wrong sessions and malformed packets fail closed. The host sends keepalive every 5 seconds. Firmware ends the lease after 15 seconds and every session after 300 seconds.

### `EICA` acknowledgement

The device answers with exactly 20 bytes: ASCII `EICA`, version, echoed action, status, reserved zero, session and control sequence. Status is OK `0`, bad request `1`, unauthorized `2`, busy `3` or unavailable `4`.

### `EIAU` audio

Each datagram is exactly 672 bytes: a 32-byte version-2 header and 640 bytes of PCM S16LE. It carries one channel at 16 kHz, 320 samples (20 ms), session, capture sequence and monotonic timestamp. Audio is never written to diagnostics or persistent storage.

## Desktop receiving rules

- Bind only the user-selected non-loopback IPv4 adapter and explicit port (default `17333`); do not scan or auto-switch ports.
- Use a random non-zero session; lock to one source only after a matching ACK.
- Accept audio only from the locked source with the matching session and exact frozen format.
- Drop duplicate, stale and out-of-order frames. Count sequence gaps without retransmission.
- Keep a bounded in-memory queue. Never persist, replay or expose PCM to React.
- Stop and release the socket/session on cancellation, device loss, process exit or error.

## Sanitized status

Only enumerated state, configured/network/heartbeat booleans, volume level and named counters may cross to React. SSID, password, host, IP, MAC, raw PCM, user text and device paths are forbidden.
