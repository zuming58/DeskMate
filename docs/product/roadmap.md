# Product roadmap

## Delivered foundation

- Windows Electron application and self-contained Raw Input bridge.
- EasyInput voice-key trigger, computer microphone, live caption, Qwen ASR and text output.
- Raw/smart/custom organization, history schema v5, vocabulary and deterministic replacements.
- Tray operation, overlay, diagnostics, icon assets and Windows desktop packaging.
- UI surfaces for workbench, voice, history, vocabulary, keys, device, agents, expressions, environment and settings.

## In progress

- Freeze the integrated repository layout, source provenance and licensing inventory.
- Define the desktop-to-controller host contract and controller-to-yuntai DeskMate Link v1.
- Build mock controller/yuntai transports and deterministic protocol tests before hardware writes.
- Re-implement or carefully adapt selected Maker and Xiaozhi capabilities into production firmware modules in this repository.

## Subsequent delivery

- Real Codex, Claude Code, Hermes and Workbody status providers.
- EasyInput controller firmware with preserved voice/input/audio/light capabilities.
- Xiaozhi yuntai firmware with safe expression, screen, servo and local audio execution.
- First complete loop through desktop software, controller firmware and yuntai firmware.
- Light, temperature/humidity and direction sensors after separate contracts.
- Installer, updates, signing, privacy controls and release hardening.
