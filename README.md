# DeskMate

DeskMate 是一个面向 Windows 的 AI 语音输入与桌面伙伴应用。它把 EasyInput 键盘按键、电脑或板载麦克风、千问语音识别、文本整理、历史记录和桌宠状态统一到一个 Electron 桌面应用中。

当前可用基线：

- EasyInput `VID 303A / PID 1006` 连接识别。
- 板子语音键 `Ctrl+Shift+Space`、F22 兼容入口和页面按钮共用同一录音状态机。
- 电脑麦克风录音、实时字幕、千问 `qwen3-asr-flash` 转写。
- 原样、智能和自定义文本整理。
- 历史记录、剪贴板及当前窗口输出、系统托盘、正式 Windows 图标。
- 板载麦克风与厂商 HID 协议已有源码级合同，尚待接入与真机验收。

## Start here

1. 阅读 [AGENTS.md](AGENTS.md) 了解项目规则。
2. 阅读 [flow/progress.md](flow/progress.md) 获取最新交接。
3. 阅读 [flow/plan.md](flow/plan.md) 获取当前阶段计划。
4. 文档总索引见 [docs/README.md](docs/README.md)。

## Development

要求：Node.js 20+、npm、.NET 8 SDK；桌面打包与输入桥仅在 Windows 验证。

```powershell
npm ci --include=dev
npm test
npm run build:desktop
.\release\win-unpacked\DeskMate.exe
```

Web 开发：

```powershell
npm run dev
```

## Repository layout

```text
electron/       Electron 主进程、IPC、系统托盘、千问与输入桥
native/         Windows Raw Input 自包含辅助进程
src/            React 界面、领域模型、适配器和状态管理
tests/          自动化测试
design/         自有概念图、界面稿与脱敏参考图
docs/           产品、架构、协议、测试和交接文档
flow/           Project Flow 项目控制面
```

## Safety

- API Key 使用 Windows 当前用户加密存储，不进入 Git、配置导出或诊断。
- 未经明确确认不烧录、不擦除、不改分区、不写 eFuse。
- 未知 HID 接口不得写入随机数据；正式厂商报告必须严格遵循固定协议。
- 不提交录音、识别正文、Wi-Fi 密码、IP/MAC/SSID、设备序列号或窗口标题。
