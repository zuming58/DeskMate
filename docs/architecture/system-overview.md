# System overview

## Target product topology

```text
React renderer
  ↕ minimal preload/IPC
Electron main process
  ↕ versioned host adapter
EasyInput ESP32-S3 DeskMate controller firmware
  ↕ DeskMate Link v1 over 3.3 V TTL UART (control/status only)
Xiaozhi ESP32-S3 DeskMate yuntai firmware
  → OLED / expressions / horizontal + vertical servos / local audio
```

EasyInput 板是外部硬件总控：它保留实体输入、本板音频/灯光等能力，同时承担桌面软件与小智执行节点之间的受控路由。小智板只执行经过能力协商和安全校验的高层动作，不保存桌面业务流程，也不接受直接 PWM 命令。

正式软件和两套新固件最终都在本仓库开发；外部 Maker 与小智工程只是带来源和许可证的参考输入。

## Current implemented desktop baseline

```text
EasyInput keys ──> Windows Raw Input bridge ──> Electron main process
Page/tray/hotkey ─────────────────────────────> shared voice controller

Computer microphone ─┐
Maker LAN microphone ├─> audio adapter ─> Qwen ASR ─> organizer ─> history
                     ┘                                  └───────> target window / clipboard

Agent providers ─> normalized AI state ─> pet intent ─> UI preview
                                               └───────> future controller/yuntai adapters
```

## Planned local companion path

```text
Speaker/consent ─> local profile + encrypted memory service ─> minimal retrieval context
                                                     └───────> companion conversation
```

这条本地长期记忆和说话人识别链是已冻结的产品方向，尚未实现；界面和设备不得提前显示为已连接或已有记忆。

## Trust boundaries

- React renderer：只处理 UI 和经过 preload 暴露的最小接口。
- Electron main：密钥解密、网络、托盘、窗口、STT、整理和本地输出。
- Input bridge：只读 Windows Raw Input，逐行 JSON 输出脱敏事件。
- LAN audio adapter：仅监听用户配置的端口并按固定协议处理已配置板子，不做网络扫描。
- Controller firmware：只接受版本化、长度校验且有用户可见目的的桌面命令；不把未知 HID 当控制面。
- DeskMate Link：首版使用三线 3.3 V TTL UART，只负责总控板到云台板的能力、状态、动作、完成、错误、超时和急停；不承载实时音频，未通过模拟器和接线门禁前保持模拟。
- Local memory：人物档案、声纹向量、情节/语义记忆、检索索引和删除/导出权限只在 Windows 端；两块板只接收脱敏人物标签与高层状态。
- Yuntai firmware：表情和舵机只能通过高层控制器进入，角度限幅、队列、回中和急停属于安全边界。

## State models

- Voice：`idle → recording → transcribing → organizing → outputting → completed/error`。
- AI：`offline/idle/listening/thinking/working/waiting/completed/error`。
- Device：HID、电脑麦克风、板载音频、千问和输出链路分别建模。
- Hardware：controller offline/ready/degraded/error 与 yuntai offline/ready/busy/error 分开建模，不能用总控在线推断云台在线。
