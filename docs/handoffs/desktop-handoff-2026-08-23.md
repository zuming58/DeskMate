# DeskMate standalone repository handoff · 2026-08-23

## Repository

- Local path：`F:\Codex\deskmate`
- Remote：[zuming58/DeskMate](https://github.com/zuming58/DeskMate)
- Default branch：`main`
- Source baseline：old repo branch `codex/easyinput-desktop-continue`, commit `25b52540e0ec3e129760b15f3591d286be41d31b`

这是全新的产品仓库和 Git 历史。旧的 `ai_hard_progect` 继续保留课程/学习资料；不要把它的中文目录、参考仓库、缓存或构建产物再复制回来。

## First steps on another computer

```powershell
git clone https://github.com/zuming58/DeskMate.git F:\Codex\deskmate
cd F:\Codex\deskmate
npm ci --include=dev
npm test
npm run build:desktop
.\release\win-unpacked\DeskMate.exe
```

然后依次阅读：`AGENTS.md`、`flow/progress.md`、`flow/plan.md`、`docs/README.md`。

## Implemented

- React/Vite UI and Electron desktop shell.
- Self-contained .NET 8 Windows Raw Input bridge.
- EasyInput `VID 303A / PID 1006` detection.
- Current board voice key `Ctrl+Shift+Space`, F22 compatibility, page and tray triggers.
- Computer microphone, volume waveform, timer, compact bottom overlay and live rolling text.
- Qwen `qwen3-asr-flash`, encrypted API Key, raw/smart/custom organization.
- History schema v5, clipboard/current-window fallback, diagnostics and tray behavior.
- Mock AI state and pet intent models for Codex, Claude Code, Hermes and Workbody.

## Current facts and boundaries

- 用户已实测板子按键、录音、识别和文字输出基本可用。
- 当前正式录音源仍是电脑麦克风。
- 公开 Maker 固件已经给出板载麦克风 UDP 与厂商 HID 合同；应用尚未完成真实接入。
- 真实 Agent provider、屏幕、灯效、舵机和传感器尚未接入，当前相关页面是模拟或意图预览。
- API Key 绑定 Windows 当前用户加密存储，不通过 Git 迁移；新电脑需要在应用中重新配置。

## Next development package for a computer without hardware

执行 `flow/tasks/T01-maker-protocol.md`：

1. 按 `docs/contracts/easyinput-maker-protocol.md` 实现纯 UDP codec 和会话状态机。
2. 实现 mock board，覆盖 heartbeat、start/stop/keepalive、ack、音频帧、乱序、丢包和超时。
3. 实现厂商 HID `0x10/0x11/0x12/0x13` 纯编解码、长度/CRC/分块测试，但不连接或写真实设备。
4. 把新 adapter 接入现有录音源选择，同时保持电脑麦克风默认和回退。
5. 更新文档和测试，不宣称真机通过。

可复制给另一台 Codex：

```text
请在 F:\Codex\deskmate 开发 DeskMate。先阅读 AGENTS.md、flow/progress.md、flow/plan.md、flow/tasks/T01-maker-protocol.md、docs/contracts/easyinput-maker-protocol.md。执行 Phase 3E 的无硬件部分：实现 Maker UDP 音频协议 codec/会话、mock board、厂商 HID 纯编解码与完整自动化测试，并接入现有适配器边界。不要扫描局域网，不猜测地址，不写真实 HID，不烧录固件，不读取或输出任何 API Key。保持电脑麦克风默认及现有语音闭环不变。完成后运行 npm test 和 npm run build:desktop，更新 flow/progress.md 顶部、flow/decisions.md/flow/lessons.md（如有），提交到新的 codex/ 分支并推送；不要直接推 main，也不要声称真机已验收。
```

## Hardware acceptance later

在连接 EasyInput 的电脑上：

- 配置板子的 `audio_host/audio_port`，确认电脑网线与板子 Wi-Fi 在同一可互访局域网。
- 验证防火墙、heartbeat、start/keepalive/stop、音质、丢包、断线和电脑麦克风回退。
- 再验证配置同步、状态快照和 Agent 状态报告；任何真实写入都必须符合固定报告合同。
- 烧录公开 Maker 固件仍需单独决定、备份现有配置并再次确认。

## Privacy checklist

不得提交：API Key、token、Wi-Fi 密码、录音、识别正文、IP/MAC/SSID、窗口标题、设备序列号、完整设备路径、`node_modules`、`dist`、`release` 或本地日志。
