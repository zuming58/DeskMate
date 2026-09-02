# T15/T16 three-end integration handoff

Date: 2026-09-02

Branch: `codex/t15-t16-integration`

Tested implementation: `871206c`

## Outcome

T15 runtime motion presets and T16 desktop actions/task briefing are integrated. All offline gates pass and both firmware candidates have reached the flash stage. Physical preset behavior and real T16 actions remain intentionally unaccepted until the user runs the ordered checks below.

## T15 implementation

- Windows→EasyInput uses frozen HID Feature `0x18` and status Input `0x19`.
- EasyInput→Xiaozhi uses frozen Link `0x22 RUN_MOTION_PRESET` and `0x23 GET_MOTION_STATUS`.
- Presets are `attention=1`, `nod=2`, `search=3`, and `dance=4`.
- Repeat is bounded to `1..3`; attention/search default to one, nod/dance default to two.
- EasyInput validates, correlates, retries within the frozen bound and clears on disconnect. It does not generate trajectories.
- Xiaozhi expands presets locally through the accepted motion safety/servo layer, runs one preset at a time, returns to center and never replays after disconnect/restart.
- Windows exposes only real preset buttons, repeat, status, stop-and-center and emergency controls. Endpoint completion is not displayed as physical acceptance.

## Firmware evidence

### EasyInput

- ESP-IDF: v5.5.5.
- Host tests: `14/14` passed.
- App: `871296` bytes, SHA-256 `54C5FD294C69ACE2C4D8D1E41BDA0F15F6503FE1BC8543E93A739CC9100BD081`.
- Offset/range: `0x10000..0xE4B7F` inside the unchanged 3 MiB factory partition.
- Before writing, the live partition table matched the fixed-layout build byte-for-byte and the existing 3 MiB factory app was backed up.
- User authorized app-only writing. Only the app range was erased/written; exact-length readback matched the source hash and the board re-enumerated after hard reset.
- No partition table, bootloader, NVS, PHY, sound bank or eFuse write occurred.

### Xiaozhi

- ESP-IDF: v5.5.3.
- Host tests: `14/14` passed.
- App: `218896` bytes, SHA-256 `376884547FC805672F253A5F93AA96412854873E2477CE853B5650F7B77CCD6A`.
- Offset/range: `0x100000..0x13570F`.
- The user reports successful app-only flashing. This turn does not contain an independent Xiaozhi readback, so physical preset behavior remains pending.

## Windows and T16 evidence

- Desktop tests: `353/353` passed.
- `npm run build:desktop`: passed.
- Packaged native bridge `--protocol-self-test`: passed.
- Package: `release/win-unpacked`.
- `DeskMate.exe`: `202690560` bytes, SHA-256 `DA8707405392E0DE96AA4955F929ED8708C2AD52D6919412C658E9C7CF24D50E`.
- `resources/input-bridge/DeskMate.InputBridge.exe`: `153516937` bytes, SHA-256 `EDDE6ED6D3A1CA8915D3516B4DBC6D51AD45E272C91E8A0111D577FB1AD363D2`.
- `resources/app.asar`: `112893712` bytes, SHA-256 `07136B90ABF4F630753D0C2C96147FC643BACE09CD2574A8FAAF99A657D7BE4D`.
- T16 provides explicit voice-enabled AppAction policy, strict `codex-task-brief-v1`, eight-task bounded storage, sequence rejection, 15-second ordinary-progress throttling and deterministic status answers.

## User-present acceptance

Run this sequence with the current Windows package:

1. `attention` once: small raise, brief hold, center.
2. `nod` with default two repeats: two complete nod cycles, center.
3. `search` once: left, right, center.
4. `dance` with default two repeats: two complete left/right plus small vertical cycles, center.
5. Start dance and trigger emergency stop; motion must stop and stay latched.
6. Explicitly clear/recenter; no automatic replay may occur.
7. After T15 passes, enable one registered application for voice launch and verify direct open plus a disabled/unregistered rejection.
8. Submit one opt-in Codex task brief lifecycle and verify start, throttled progress, waiting/completed announcement and a deterministic spoken status query.

Voice-triggered, conversation-context and idle motion remain disabled until steps 1–6 pass. Endpoint status alone is protocol evidence, not proof of physical travel or power safety.
