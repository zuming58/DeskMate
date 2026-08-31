# T11A desktop EasyInput audio uplink handoff

## Git baseline

- Branch: `codex/t11a-desktop-easyinput-audio-uplink`
- Base: `c7d789e7359c744a2059680db4061a3d2a5dc9ff`
- Implementation commit: `c94d84184384bce4c12a8875fce08f1590658078`
- Status: `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`

## Delivered

- Strict Electron-main codecs for frozen `EIHB`, `EICC`, `EICA` and `EIAU` datagrams.
- Production `EasyInputLanAudioSource` with an explicit selected IPv4 binding, random session, matching-ACK source lock, finite control retry, 5-second keepalive and bounded in-memory PCM queue.
- Duplicate, stale, out-of-order, malformed, wrong-source and wrong-session packets fail closed; sequence gaps are counted without replay.
- A separate sandboxed audio setup window uses the T05 read/preview/60-second confirmation/write/readback path and can change only `wifi_ssid`, `wifi_password`, `audio_host` and `audio_port`.
- The main React renderer receives only sanitized readiness, state, 0–100 level and named counters. It never receives credentials, adapter IP, PCM or device paths.
- A maximum 30-second board-microphone diagnostic computes only an RMS-derived level and does not start Doubao, persist audio or substitute computer audio.
- Existing dictation/edit ownership remains authoritative. Dictation preempts the microphone test; microphone test and companion session are mutually exclusive and never auto-resume.
- T11 now uses the production EasyInput source. `UnavailableCompanionAudioSink` remains deliberate, so the UI continues to report that the EasyInput speaker is pending.

## Verification

- `npm ci --include=dev`: passed.
- `npm test`: 165/165 passed.
- `npm run build:desktop`: passed, including native InputBridge publish, Vite production build and Windows Electron unpacked packaging.
- CJS syntax, protocol golden vectors, malformed packet gates, session lifecycle, finite timeout, queue overflow, configuration transaction/privacy, foreground ownership, `git diff --check`, ASCII path and differential secret checks passed.
- Generated `node_modules/`, `dist/`, `release/`, native `bin/obj/publish` and user data remain ignored and uncommitted.

## Hardware and privacy boundary

This branch did not start the packaged app, bind a UDP port, scan a LAN, identify a device, read or write device configuration, access Flash/NVS, reset hardware, capture audio, save recordings, or operate Xiaozhi/OLED/servos. It modifies and verifies Windows software only.

## Next gates

1. The firmware task must independently complete T10E board microphone HIL against `EASYINPUT_AUDIO_CAPTURE_V1_FROZEN`.
2. With the user present, open the isolated setup window, write the four explicitly confirmed fields, and run the 30-second no-recording microphone diagnostic.
3. Freeze and implement the separate T11E EasyInput speaker downlink protocol in the firmware task.
4. Implement T11B `EasyInputLanAudioSink` in Windows software without changing the T11 conversation state machine.
5. Only after microphone, speaker and real Doubao network acceptance may the project claim complete realtime companion dialogue.
