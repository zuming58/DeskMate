# T11A desktop EasyInput audio uplink v1

Status: `T11A_DESKTOP_EASYINPUT_AUDIO_UPLINK_V1_FROZEN`

## Scope

T11A supplies the production `CompanionAudioSource` for EasyInput microphone capture. It implements the frozen `EIHB/EICC/EICA/EIAU` contract in Electron main and a separate microphone diagnostic. It does not implement speaker playback, change the T11 conversation state machine, modify firmware or claim real hardware acceptance.

## Security boundary

- UDP, live PCM and the selected IPv4 address live only in Electron main memory.
- Live PCM packets never cross into React. After an explicit text-dictation recording stops, Electron may return one bounded WAV to the existing `VoiceWorkflow`, which treats it like the completed computer-microphone recording for STT and local history. This exception does not expose a live stream, IP or credentials.
- Outside that completed recording result, the main React renderer receives only enumerated state, booleans, volume 0–100 and named counters.
- Wi-Fi credentials are entered in a dedicated sandboxed local window with a separate preload. They never pass through the main renderer.
- The desktop setup window only accepts explicit ports from `1024` through `65535`; it never silently selects another port.
- Configuration uses the T05 read → preview → 60-second single-use confirmation → write → full readback flow. Only `wifi_ssid`, `wifi_password`, `audio_host` and `audio_port` may change; all other JSON fields remain byte-semantically equal.
- Diagnostics cannot contain credentials, IP, PCM, transcripts, device identifiers or paths.

## Ownership

The existing foreground arbiter remains authoritative. Dictation or voice edit stops a running microphone diagnostic. Companion conversation and microphone diagnostic are mutually exclusive. No stopped source resumes automatically.

Text dictation persists one preferred source (`computer` or `easyinput`) and locks the actual source at session start. If EasyInput readiness fails before start, the UI reports the sanitized failure category and may fall back once to the selected Windows microphone. A failure after EasyInput recording starts ends that recording and never switches sources.

Ordinary keyboard global shortcuts are disabled by default. EasyInput voice and voice-edit actions remain available through the VID/PID-scoped Raw Input bridge; a generic keyboard or injected F22 event cannot impersonate the board.

## Readiness

T10E microphone capture has independent hardware evidence, but this Windows source-selection integration remains `HIL_NOT_RUN` until a user verifies source persistence, board capture, pre-start fallback, mid-record disconnect and ordinary-keyboard suppression in the packaged application. Since `CompanionAudioSink` remains unavailable, full realtime conversation must continue to report the EasyInput speaker as pending.
