# System overview

```text
EasyInput keys ──> Windows Raw Input bridge ──> Electron main process
Page/tray/hotkey ─────────────────────────────> shared voice controller

Computer microphone ─┐
Maker LAN microphone ├─> audio adapter ─> Qwen ASR ─> organizer ─> history
                     ┘                                  └───────> target window / clipboard

Agent providers ─> normalized AI state ─> pet intent ─> UI preview
                                               └───────> future HID/screen/motion outputs
```

## Trust boundaries

- React renderer：只处理 UI 和经过 preload 暴露的最小接口。
- Electron main：密钥解密、网络、托盘、窗口、STT、整理和本地输出。
- Input bridge：只读 Windows Raw Input，逐行 JSON 输出脱敏事件。
- LAN audio adapter：仅监听用户配置的端口并按固定协议处理已配置板子，不做网络扫描。
- Hardware output：只有正式合同和用户可见目的的写入才允许启用。

## State models

- Voice：`idle → recording → transcribing → organizing → outputting → completed/error`。
- AI：`offline/idle/listening/thinking/working/waiting/completed/error`。
- Device：HID、电脑麦克风、板载音频、千问和输出链路分别建模。
