# DeskMate project rules

本仓库是 DeskMate 的唯一产品边界。最终产品包含 Windows 桌面软件、EasyInput ESP32-S3 总控固件和小智 ESP32-S3 云台固件；课程资料、外部参考工程的完整副本和其他实验项目不得放入本仓库。

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

两台电脑交替工作时必须执行 `flow/guides/two-computer-handoff.md`：GitHub 是唯一代码交换通道；每次换电脑都要提交、推送并在 `flow/progress.md` 顶部记录准确分支、HEAD、验证、硬件操作和下一步。不得再用整目录覆盖另一台电脑的工作树。

用户要求所有目录使用英文 ASCII 名称。文件名也优先使用英文 kebab-case；正文可以使用中文。

## Product constraints

- Windows 桌面优先，主设计尺寸 1440×1024，同时适配较小窗口。
- 左侧深石墨导航，右侧浅灰或白色工作区；青蓝/钴蓝为主强调色。
- 视觉应未来、克制、高级、清晰，不堆叠装饰。
- EasyInput 现有能力必须保留：语音、历史、词库、按键映射、麦克风、网络、开机音效、AI 状态、快捷键、文字整理、账号与诊断。
- 最终正式固件在本仓库内开发和发布；`F:\Codex\easyinput-wzm\easy-input-maker` 与 `F:\Codex\xiaozhi-yuntai` 只是参考源，不是最终交付目录。
- EasyInput 板是外部硬件总控，也是 V1 唯一启用的外部板载麦克风与扬声器端点；普通文字语音输入默认使用电脑麦克风，用户可显式选择已验收的 EasyInput LAN Audio。小智板负责表情、双舵机和屏幕，本板麦克风/功放/扬声器仅物理保留且在 DeskMate V1 模式下不初始化。未完成验收前不得伪装成已经联通。
- 未接入的桌宠屏幕、灯效、舵机、传感器和第三方 Agent 必须明确标为模拟或待接入，不得伪装成真实连接。
- 实时语音悬浮条保持底部居中、单行、紧凑、不抢焦点，并持续显示最新识别片段。

## Architecture constraints

- React 渲染进程不能直接读取密钥、Node API 或原始设备路径。
- Electron 保持 `nodeIntegration: false`、`contextIsolation: true` 和最小化 preload/IPC。
- 语音入口共用一个版本化状态机，不得复制第二套 VoiceWorkflow。
- 电脑麦克风、板载麦克风、STT、设备和 Agent 均通过适配器隔离。
- 每次录音开始时必须锁定麦克风来源，录音期间不得切换；EasyInput 在开始前不可用时可明确提示并回退电脑麦克风，开始后断线只能安全结束当前录音，不能静默换源。
- 实时陪伴使用电脑扬声器时默认严格轮流说话：播放期间停止麦克风上行并忽略回灌 ASR，手动打断或 `tts.end` 后才恢复聆听。自动免提插话必须另行完成 AEC/声学门验收。
- 普通键盘全局语音快捷键默认关闭。EasyInput 语音键必须由 Windows Raw Input 按 VID/PID 设备身份识别，不能依赖普通键盘全局注册来冒充板载按键。
- Windows 输入桥只读 Raw Input；厂商 HID 写入必须有明确报告合同、长度校验和用户可见目的。
- 保留 F22 兼容入口；当前公开 Maker 固件默认语音键为 `Ctrl+Shift+Space`。
- 目标主链为“Windows 软件 ↔ EasyInput 总控固件 ↔ 小智云台固件”；桌面软件不直接写舵机 PWM，小智动作必须经过限幅、队列、回中和急停边界。
- DeskMate host contract 与 DeskMate Link 必须版本化；首版物理层已选择三线 3.3 V TTL UART，但 framing、能力、序列、超时、错误和兼容策略未冻结前，不实现猜测性板间通信。
- 跨端合同按切片冻结；只有显式标为 `*_FROZEN` 的切片可进入实现，同目录其余 `NOT_FROZEN` 内容不得猜测性实现。
- 本仓只维护一套根级 `flow/`、`docs/` 和 hook；正式固件模块建立后只补局部 `AGENTS.md`、源码、测试和构建入口。
- 从参考工程复制或派生代码前必须记录来源、版本/哈希、许可证、修改和目标路径；来源不明的二进制、模型、音频或图片不得进入产品仓。
- 已有固定参考实现覆盖同类行为时，先对照其源码与测试形成行为差异表，再设计产品侧最小实现。第一次真机证据否决候选后，下一轮不得继续猜测性修复，必须先复核固定参考、冻结合同和缺失测试向量。
- 两电脑协作通过 GitHub 上的短分支和小功能包交换：无硬件电脑只声明代码、host test、模拟器和构建证据；硬件电脑独立审查、重建并完成获授权的真机验收，任何一方都不得把另一类证据冒充为已通过。

## Hardware safety

- 未经用户明确要求和再次确认，不烧录、不读取或改写 Flash、不擦除、不改分区、不写 eFuse。
- 不向未知 HID 接口写数据，不扫描整个局域网，不猜测 IP、端口或包格式。
- 板载音频协议以 `docs/contracts/easyinput-maker-protocol.md` 固定合同为准。
- EasyInput 正式固件必须保留既有 16 MB Flash 布局：24 KiB NVS、4 KiB PHY、3 MiB factory app、两个 576 KiB 声音 bank；功能包不得退回 ESP-IDF 默认分区或重排范围，构建产物必须在首次写入前与实板备份分区表逐字节核对。
- EasyInput 的 5 颗串联 WS2812 使用 GPIO12；GPIO8 是 LED、麦克风和扬声器共享的高有效电源域。GPIO8 只能由统一电源控制器写入，按键灯效只能发送 RGB/黑帧，不得按键级开关共享电源。
- 小智参考板的舵机供电、峰值电流和机械中心/限位当前仍是 UNKNOWN；板间排针虽已选择 `GND/TX/RX`，但未完成电平、独立供电、共地和恢复性验收前不接线、不驱动舵机、不假定其他空闲 GPIO/UART。
- EasyInput 与小智使用不同板级 GPIO、BOOT、工具链和分区合同，不得互相套用烧录或恢复步骤。
- 诊断不得含 API Key、录音、识别文本、Wi-Fi 凭据、IP、MAC、SSID、设备序列号、窗口标题或完整设备路径。

## Verification

代码改动至少运行与风险相称的验证。完整基线：

```powershell
npm ci --include=dev
npm test
npm run build:desktop
```

有板子的电脑再执行 `docs/testing/voice-loop-acceptance.md`。无板子电脑只做协议单测、模拟板、构建和脱敏检查，不声称真机通过。

正式固件模块建立后，必须在各自局部入口补充精确 ESP-IDF 版本、host test、build 和真机验收命令。外部参考工程的构建通过只能作为参考证据，不能替代本仓新固件的验证。

## Espressif MCP support

- 项目级 `.codex/config.toml` 配置乐鑫文档、组件注册表和工程排障 MCP；使用流程与脱敏边界见 `flow/guides/espressif-mcp-troubleshooting.md`。
- MCP 回答只作为外部建议，不替代冻结合同、固定 Maker 参考、ESP-IDF v5.5.5 源码/文档、自动化测试或获授权真机证据。采用建议前必须在产品代码和精确版本中复核，并补能失败的回归测试。
- 向任何 MCP 提问不得包含密钥、Wi-Fi、原始配置、录音/转写、IP/MAC、序列号、COM 口、完整设备/用户路径、窗口标题或未脱敏日志。MCP 调用不构成端口扫描、Flash/NVS、烧录、monitor 或其他硬件授权。

## Closure check

结束工作前：

1. 更新 `flow/progress.md` 顶部，记录做了什么、为什么、产出路径、验证、问题和下一步。
2. 稳定决策写入 `flow/decisions.md`，可复用问题写入 `flow/lessons.md`。
3. 结构、架构或视觉方向变化时同步更新 `AGENTS.md`、`DESIGN.md` 或 `docs/`。
4. 确认没有密钥、用户数据、录音、构建产物或中文目录进入提交。
