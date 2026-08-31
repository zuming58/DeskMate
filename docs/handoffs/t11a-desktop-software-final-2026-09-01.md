# T11A desktop software final handoff

## Scope and source line

- Branch: `codex/t11a-desktop-finalize`
- Finalization base: `d95860b9d1ffe22ae5cee80a1ccd28cd413f49e8`
- Repository main ancestor: `3e2a046f49260ead422da4c295c3321de13dca5d`
- Scope: Windows desktop software only.
- Status: `T11A_SOFTWARE_LOCKED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_PENDING`

The finalization branch contains the complete cumulative Windows line for T11A. It does not overwrite the user's dirty `F:\Codex\deskmate` worktree and does not modify either firmware module.

## Closed software slices

1. **EasyInput LAN microphone uplink**
   - strict `EIHB/EICC/EICA/EIAU` parsing and session/source locking;
   - bounded in-memory PCM and a single completed WAV result for the existing text `VoiceWorkflow`;
   - isolated four-field network setup and a no-recording microphone-level diagnostic.
2. **Microphone source selection**
   - computer microphone is the persisted default and retains concrete Windows-device selection;
   - EasyInput is an explicit alternative, locked for each recording;
   - a pre-start board failure is reported and may fall back once to the computer microphone;
   - an active board recording never switches source after failure;
   - Bluetooth stays disabled and labelled pending.
3. **Accidental-trigger prevention**
   - ordinary keyboard global shortcuts default off and migrate to off;
   - EasyInput KEY1/KEY3 continue through VID/PID-scoped Raw Input;
   - a generic keyboard or injected F22 cannot impersonate the board.
4. **Link diagnostics and recovery**
   - EasyInput HID presence, Xiaozhi Link health and Agent write ACK are separate facts;
   - bounded Link/Agent counters enter the UI and sanitized diagnostics only;
   - reconnect recovery reissues one current unexpired state, otherwise idle.
5. **Expression and hardware-state UX**
   - Windows expression preview never sends hardware state;
   - the seven real work states reuse the single Agent State publisher;
   - repeated selection sends a fresh request and disconnected Link is never labelled synchronized.

No second `VoiceWorkflow`, Agent state machine or transport was introduced.

## Final software verification

- `npm ci --include=dev`: passed.
- `npm test`: `187/187` passed, `0` failed/skipped/todo.
- `npm run build:desktop`: passed.
- Native `DeskMate.InputBridge` Release publish: passed.
- Vite production build and Windows Electron packaging: passed.
- `git diff --check`: passed.
- Generated dependencies, native build output, `dist/` and `release/` remain ignored and untracked.
- Packaged executable: `release/win-unpacked/DeskMate.exe`, 202,690,560 bytes.
- Packaged executable SHA-256: `B48D138250C4737536374DD2D7D0D208A53F6A6551672DD1F67DF442E9C8D53D`.

The executable hash is local build evidence, not a checked-in release artifact or code-signing claim.

## Remaining user-present acceptance

The T11A software code gate is closed. These physical/runtime checks remain deliberately open:

1. Run the packaged build and confirm five minutes without an unsolicited recording overlay while ordinary global shortcuts are off.
2. Confirm computer-microphone default, concrete Windows-device persistence and source switching only while idle.
3. Select EasyInput, record real speech, and confirm the result is labelled as the board microphone.
4. Confirm pre-start board unavailability produces an explicit one-recording fallback, while a mid-record disconnect stops instead of switching.
5. Confirm the companion page's Windows preview never changes Xiaozhi, while each of the seven hardware states advances the EasyInput ACK and Link evidence separately.
6. Restart/reconnect Xiaozhi and confirm only a still-valid state is restored; expired `listening`, `completed` and `error` are not replayed.

EasyInput speaker downlink and full duplex companion dialogue are not T11A scope. They remain a separate T11B/T11E package and must not be reported as completed by this handoff.

## Safety record

This finalization did not launch or automate DeskMate, scan ports or the LAN, identify devices, access Flash/NVS/otadata/eFuse, modify firmware, capture audio, or operate OLED, servos or speakers.
