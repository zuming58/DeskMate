# DeskMate

DeskMate 是一个 Windows 优先的软硬件 AI 工作伙伴。最终产品由桌面软件、运行在 EasyInput ESP32-S3 上的总控固件，以及运行在小智 ESP32-S3 云台上的表情/双舵机执行固件组成。当前仓库已交付桌面软件基线，正式固件模块将在跨板合同冻结后进入本仓库。

当前可用基线：

- EasyInput `VID 303A / PID 1006` 连接识别。
- 板子语音键 `Ctrl+Shift+Space`、F22 兼容入口和页面按钮共用同一录音状态机。
- 电脑麦克风录音、实时字幕、千问 `qwen3-asr-flash` 转写。
- 原样、智能和自定义文本整理。
- 历史记录、剪贴板及当前窗口输出、系统托盘、正式 Windows 图标。
- 板载麦克风与厂商 HID 协议已有源码级合同，尚待接入与真机验收。
- EasyInput Maker 与小智云台参考工程的技术、安全和接口地图已完成；正式 DeskMate 固件与板间协议尚待建立。

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
<firmware>/     规划中的总控与云台正式固件模块；目录冻结后创建
design/         自有概念图、界面稿与脱敏参考图
docs/           产品、架构、协议、测试和交接文档
flow/           Project Flow 项目控制面
```

## Safety

- API Key 使用 Windows 当前用户加密存储，不进入 Git、配置导出或诊断。
- 未经明确确认不烧录、不擦除、不改分区、不写 eFuse。
- 未知 HID 接口不得写入随机数据；正式厂商报告必须严格遵循固定协议。
- 不提交录音、识别正文、Wi-Fi 密码、IP/MAC/SSID、设备序列号或窗口标题。
