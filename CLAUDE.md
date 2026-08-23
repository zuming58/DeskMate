# DeskMate project rules

本仓库是 DeskMate 的唯一产品边界。课程资料和其他实验项目不得放入本仓库。

## Required reading

开始工作前依次阅读：

1. `flow/charter.md`
2. `flow/plan.md`
3. `flow/progress.md` 顶部最新一条
4. 与任务相关的 `DESIGN.md`、`docs/` 和 `flow/guides/`

## Project Flow

- `flow/charter.md`：长期目标、边界与成功标准。
- `flow/plan.md`：当前阶段和后续路线。
- `flow/progress.md`：跨电脑、跨 Agent 的最新事实交接，最新记录置顶。
- `flow/decisions.md`：影响未来实现的稳定决策。
- `flow/lessons.md`：可复用的问题与解决方式。
- `flow/tasks/`：大任务说明书；结果写入 `flow/progress.md`，不要堆回任务卡。
- `flow/guides/`：Project Flow 方法规范的本地副本。

用户要求所有目录使用英文 ASCII 名称。文件名也优先使用英文 kebab-case；正文可以使用中文。

## Product constraints

- Windows 桌面优先，主设计尺寸 1440×1024，同时适配较小窗口。
- 左侧深石墨导航，右侧浅灰或白色工作区；青蓝/钴蓝为主强调色。
- 视觉应未来、克制、高级、清晰，不堆叠装饰。
- EasyInput 现有能力必须保留：语音、历史、词库、按键映射、麦克风、网络、开机音效、AI 状态、快捷键、文字整理、账号与诊断。
- 未接入的桌宠屏幕、灯效、舵机、传感器和第三方 Agent 必须明确标为模拟或待接入，不得伪装成真实连接。
- 实时语音悬浮条保持底部居中、单行、紧凑、不抢焦点，并持续显示最新识别片段。

## Architecture constraints

- React 渲染进程不能直接读取密钥、Node API 或原始设备路径。
- Electron 保持 `nodeIntegration: false`、`contextIsolation: true` 和最小化 preload/IPC。
- 语音入口共用一个版本化状态机，不得复制第二套 VoiceWorkflow。
- 电脑麦克风、板载麦克风、STT、设备和 Agent 均通过适配器隔离。
- Windows 输入桥只读 Raw Input；厂商 HID 写入必须有明确报告合同、长度校验和用户可见目的。
- 保留 F22 兼容入口；当前公开 Maker 固件默认语音键为 `Ctrl+Shift+Space`。

## Hardware safety

- 未经用户明确要求和再次确认，不烧录、不读取或改写 Flash、不擦除、不改分区、不写 eFuse。
- 不向未知 HID 接口写数据，不扫描整个局域网，不猜测 IP、端口或包格式。
- 板载音频协议以 `docs/contracts/easyinput-maker-protocol.md` 固定合同为准。
- 诊断不得含 API Key、录音、识别文本、Wi-Fi 凭据、IP、MAC、SSID、设备序列号、窗口标题或完整设备路径。

## Verification

代码改动至少运行与风险相称的验证。完整基线：

```powershell
npm ci --include=dev
npm test
npm run build:desktop
```

有板子的电脑再执行 `docs/testing/voice-loop-acceptance.md`。无板子电脑只做协议单测、模拟板、构建和脱敏检查，不声称真机通过。

## Closure check

结束工作前：

1. 更新 `flow/progress.md` 顶部，记录做了什么、为什么、产出路径、验证、问题和下一步。
2. 稳定决策写入 `flow/decisions.md`，可复用问题写入 `flow/lessons.md`。
3. 结构、架构或视觉方向变化时同步更新 `AGENTS.md`、`DESIGN.md` 或 `docs/`。
4. 确认没有密钥、用户数据、录音、构建产物或中文目录进入提交。
