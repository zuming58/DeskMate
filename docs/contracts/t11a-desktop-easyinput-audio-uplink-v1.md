# T11A desktop EasyInput audio uplink v1

Status: `T11A_DESKTOP_EASYINPUT_AUDIO_UPLINK_V1_FROZEN`

## Scope

T11A supplies the production `CompanionAudioSource` for EasyInput microphone capture. It implements the frozen `EIHB/EICC/EICA/EIAU` contract in Electron main and a separate microphone diagnostic. It does not implement speaker playback, change the T11 conversation state machine, modify firmware or claim real hardware acceptance.

## Security boundary

- UDP, PCM and the selected IPv4 address live only in Electron main memory.
- The main React renderer receives only enumerated state, booleans, volume 0–100 and named counters.
- Wi-Fi credentials are entered in a dedicated sandboxed local window with a separate preload. They never pass through the main renderer.
- The desktop setup window only accepts explicit ports from `1024` through `65535`; it never silently selects another port.
- Configuration uses the T05 read → preview → 60-second single-use confirmation → write → full readback flow. Only `wifi_ssid`, `wifi_password`, `audio_host` and `audio_port` may change; all other JSON fields remain byte-semantically equal.
- Diagnostics cannot contain credentials, IP, PCM, transcripts, device identifiers or paths.

## Ownership

The existing foreground arbiter remains authoritative. Dictation or voice edit stops a running microphone diagnostic. Companion conversation and microphone diagnostic are mutually exclusive. No stopped source resumes automatically.

## Readiness

Software code gates and simulated UDP tests may establish `TEST_CONFIRMED` and `BUILD_CONFIRMED`. `HIL_NOT_RUN` remains until T10E is independently accepted on hardware. Since `CompanionAudioSink` remains unavailable, full realtime conversation must continue to report the EasyInput speaker as pending.
