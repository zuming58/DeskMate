# T11A desktop microphone source selection handoff

## Exact code baseline

- Branch: `codex/t11a-desktop-microphone-source-selection`
- Base: `a427ff7b2f7f989079a80cc487ab9bdd090666fb`
- Implementation: `84b153df61fa71db01a054fccdf2b42fd5bd0a8f`
- Scope: Windows software only. No EasyInput or Xiaozhi firmware file changed.

## Delivered behavior

- Computer microphone is the persisted default and still supports a concrete Windows input device.
- EasyInput board microphone is an explicit Wi-Fi LAN Audio option.
- The successful adapter is locked for the full recording. The selectors are disabled until recording/processing ends.
- An unavailable board before start produces a visible sanitized reason and falls back once to the selected computer microphone without changing the saved preference.
- Board failure after start ends the board recording. It never continues through the computer microphone.
- Bluetooth is visible only as disabled `pending` capability.
- Both adapters feed the existing `VoiceWorkflow`, STT, organizer, output and history path. There is no second voice state machine.
- Live board PCM remains in Electron main. The renderer receives one bounded completed WAV only after explicit stop, matching the existing completed computer-recording boundary.

## Unexpected recording fix

Ordinary global `Ctrl+Shift+Space` and `Ctrl+Shift+E` registration now defaults off. Schema migration also disables it for existing users. EasyInput KEY1 and KEY3 remain active because the native bridge identifies VID `303A` / PID `1006` Raw Input and emits board-scoped `VoiceInput` / `VoiceEdit` events only after a complete chord release. Generic F22 and ordinary keyboards cannot use the board authority. The legacy ordinary global path can be explicitly enabled under Settings -> Input and shortcuts.

## Verification evidence

- `npm ci --include=dev`: passed.
- `npm test`: 176/176 passed.
- `npm run build:desktop`: passed, including self-contained Windows InputBridge publish and Electron packaging.
- `git diff --check`: passed.
- ASCII changed paths, differential secret scan, firmware-scope and ignored generated-output checks: passed.
- Generated `node_modules/`, `dist/`, `release/` and native `bin/obj/publish` remain ignored and uncommitted.

## User-present acceptance still required

1. Start the packaged application and confirm `普通键盘全局快捷键` is off.
2. Leave DeskMate idle for five minutes; no recording capsule may appear.
3. Press ordinary-keyboard `Ctrl+Shift+Space`, `Ctrl+Shift+E` and F22; none may start recording.
4. Press EasyInput KEY1 and KEY3; each must trigger exactly once through the same workflow.
5. Select a concrete Windows microphone, record once, restart and confirm persistence.
6. Select EasyInput and record once while heartbeat/audio are ready; verify board-labelled history.
7. Make EasyInput unavailable before start; verify explicit warning and one-time computer fallback without changing the saved source.
8. Disconnect EasyInput after board recording starts; verify safe termination and no mid-session source switch.

Do not claim full realtime companion dialogue from this package. EasyInput speaker/downlink and the production `CompanionAudioSink` remain unavailable. No hardware write or firmware operation is authorized by this handoff.
