# EasyInput Maker 固件学习报告（2026-08-22）

## 1. 结论

`CY-CHENYUE/easy-input-maker` 是 EasyInput V2.0 / ESP32-S3 的完整公开固件基线，不是只有说明文件，也不是只有可烧录二进制。它包含按键、编码器、USB/BLE HID、本地配置、状态读取、Agent 状态、板载麦克风 Wi-Fi UDP 上行、扬声器、声音资源、电源与睡眠等源码和宿主测试。

这份源码解决了此前最关键的两个未知项：

1. 板载麦克风协议已经有源码级合同，可以按合同开发 DeskMate companion。
2. 键位配置、设备状态和 Agent 状态存在正式的厂商自定义 HID 报告，不再需要靠普通 F22 推测全部交互。

本轮只下载、比对、阅读和尝试宿主构建；没有烧录、读取现有 Flash、修改板子、发送未知 HID 报告或进行局域网扫描。

## 2. 固定上游版本

| 仓库 | 用途 | 固定提交 |
|---|---|---|
| `CY-CHENYUE/easy-input-maker` | 完整固件源码 | `34087cd40d24d23579da0357973ebc1a37e7ce7c` |
| `CY-CHENYUE/project-flow-cy` | 多电脑/多 Agent 文件化协作方法 | `7d3ad181f65e034b7b45cff916f15cfd8fc7db74` |
| `CY-CHENYUE/easyinput-board-cy` | 板级合同与硬件安全边界 | `73973762515a6e86a7005b7ab12a8c6618fefdf8` |

旧工作区曾把快照保存在中文参考目录；新的 DeskMate 仓库不再复制完整上游。复核时按固定提交重新克隆，并保留各自许可证和第三方声明。

## 3. 固件与硬件身份

- 目标：EasyInput V2.0 / ESP32-S3。
- PCB 丝印 `AI Keyboard V2.1`、固件别名 `v2` 与产品名 EasyInput V2.0 指同一硬件基线。
- USB/BLE 产品名：`EasyInput AI`。
- USB/BLE VID/PID：`0x303A / 0x1006`。
- USB 固件设备版本：`0x010A`。
- 固件构建基线：ESP-IDF `5.5.5`，不是当前台式机已安装的 5.4.4。
- 默认固件镜像名：`easy_input_keyboard.bin`。

板级关键边界：

- 8 键 GPIO：`2, 47, 38, 41, 1, 6, 7, 48`，低有效。
- 编码器 A/B/按压：`17/16/18`。
- WS2812：GPIO12，共 5 颗。
- USB D−/D+：GPIO19/20。
- BOOT：GPIO0，不是业务按键。
- GPIO8 是 LED、麦克风、扬声器共享高有效电源域，不能当作单独灯光开关。
- 麦克风 I2S：BCLK/WS/DIN = `9/10/11`。
- 扬声器 I2S：BCLK/WS/DOUT = `14/13/15`。

## 4. 默认按键合同

默认映射来自 `components/keyboard/src/keymap.cpp`：

| 输入 | 默认动作 |
|---|---|
| KEY1 | 语音输入 PTT |
| KEY2 | 回车 |
| KEY3 | 语音编辑 PTT |
| KEY4 | 退格 |
| KEY5 | 全选 |
| KEY6 | 复制 |
| KEY7 | 粘贴 |
| KEY8 | 撤销 |
| 编码器旋转 | 当前配置决定滚动/光标 |
| 编码器短按 | 默认切换滚动轴；新固件也支持文字选择模式 |

Windows 平台默认语音快捷键是 `Ctrl+Shift+Space`，语音编辑是 `Ctrl+Shift+E`。旧配置兼容 RightMeta、RightOption 和 AltGr 等名称。现有产品实测出现 F22，说明用户手上旧固件或既有配置可能与公开 Maker 当前默认配置不同；DeskMate 必须同时保留 F22 兼容入口，不能因为新源码存在就删除旧路径。

DeskMate 2026-08-29 的只读复核进一步确认：Maker 固件的 KEY3 只负责发出 `Ctrl+Shift+E` 并准备/结束板载音频，不会读取 Windows 选区，也不会调用大模型。选中文字捕获、口述指令转写、模型改写和原窗口替换必须由 Windows host 完成。产品实现因此复用现有 VoiceWorkflow，在主进程捕获选区和目标窗口；模型或目标校验失败时不替换原文。

## 5. USB HID 协议

固件除了标准键盘/鼠标报告，还定义厂商自定义 HID 报告：

| Report ID | 方向 | 作用 |
|---|---|---|
| `0x10` | Host → Board Feature | 分块写入 JSON 配置 |
| `0x11` | Board → Host Input | AppCommand：固定文字、热键、配置确认、状态响应 |
| `0x12` | Host → Board Feature | Agent 状态 |
| `0x13` | Host → Board Feature | 请求设备状态快照 |
| `0x14` | Host → Board Feature | 扬声器资源请求 |
| `0x15` | Board → Host Input | 扬声器资源响应 |

### 配置 `0x10`

- 每个 Feature payload 为 63 字节。
- 头部 11 字节，magic `S3C`，version 1。
- 每块最多 52 字节 JSON。
- 完整 JSON 上限 2048 字节。
- 包含分块序号、总块数、总长度和 CRC16-CCITT。
- 固件按 USB 端点生命周期隔离接收，避免跨重连拼接旧配置。

配置 JSON可以表达平台、语音/编辑 PTT、按键动作、编码器、Wi-Fi SSID/密码、`audio_host`、`audio_port` 和扬声器同步密钥。实现桌面配置同步时必须复用这份合同，不应再把 UI 配置只保存在电脑本地。

### Agent 状态 `0x12`

- version 1，payload 16 字节。
- 状态：idle、running、waiting user、completed unread、failed。
- 还包含 flags、sequence、TTL 和 source hash。
- TTL 最大 12 小时；idle 强制 TTL 为 0。

这正是未来 Codex、Claude Code、Hermes、Workbody 状态驱动键盘灯效的正式固件入口。DeskMate 应在主进程建立受控 HID 写入，而不是模拟普通键盘按键。

### 状态请求 `0x13` / 响应 `0x11`

- 请求 version 1，16 字节，带 request ID 和 fresh 标志。
- 响应通过 `0x11` 分块返回 JSON，AppCommand kind 为 `0x04`。
- 单次状态 JSON 上限沿用固件安全限制。

这允许 DeskMate 读取板子当前系统、配置、音频、网络和运行状态，替代目前仅靠 Windows 枚举推断连接状态。

## 6. 板载麦克风协议

### 网络拓扑

- 板子通过 2.4 GHz Wi-Fi 连接路由器。
- 电脑可以走网线或 Wi-Fi，只要与板子处于同一可互访局域网。
- DeskMate 监听配置的 `audio_port`，默认 `17333`。
- 固件把 `audio_host` 解析为 IPv4，向该地址/端口发送心跳和音频。
- DeskMate 从心跳的数据报来源地址得到板子的控制端点，并向该端点回发控制命令。

### 控制协议 v1

所有多字节整数为小端：

- `EIHB`：心跳，基础 20 字节，version 1；包含 streaming/audio-ready、session ID 和 sequence。固件可能扩展到 80 字节，客户端必须接受基础与扩展。
- `EICC`：控制，至少 36 字节，version 1；action 1 start、2 stop、3 keepalive；包含非零 session ID、sequence 和 16 字节 token。
- `EICA`：确认，20 字节；status 0 OK、1 unavailable、2 bad request、3 unauthorized。

固件在录音期间期望约 1 秒一次 keepalive；15 秒没有 start/keepalive 会自动停流。单次流最长 300 秒。心跳正常约 2 秒一次，网络空闲时约 4 秒一次。

### 音频数据包 v2

- magic：`EIAU`。
- version：2。
- 固定头：32 字节。
- codec：PCM S16LE。
- 声道：单声道。
- 采样率：16 kHz。
- 每帧：20 ms，即 320 个样本、640 字节 PCM。
- 正常 UDP 数据报：32 字节头 + 640 字节负载 = 672 字节。
- 头字段：session ID、capture sequence、sample rate、capture timestamp ms、frame samples、payload bytes。
- 固件内部有 64 帧队列，约 1.28 秒；长时间网络中断会表现为 sequence 缺口，companion 应保留时间轴并记录丢帧，不能无限等待补包。

## 7. 安全结论

- 控制包只接受来自已配置 `audio_host` 解析地址的 IPv4 来源。
- 16 字节 token 当前只是兼容预留，固件不验证内容。
- 协议没有密码学认证、完整性校验或防重放。
- 同一允许来源还可发送配置 JSON。
- 只能在受信任局域网使用，不应暴露到公网、访客网络或不可信 VLAN。
- DeskMate 不应主动扫描整个局域网；应由用户配置本机可达地址和端口，再被动等待 `EIHB`。
- 诊断不得导出 Wi-Fi 密码、SSID、IP、MAC、token、同步密钥、设备序列号、音频或识别文本。

## 8. 构建与验证结果

- 上游记录：宿主测试 55/55（当前进展日志后续记录为 56/56）、ESP-IDF 5.5.5 默认构建通过、EasyInput V2.0 实板联合测试通过。
- 本机源码下载与哈希/提交固定完成。
- 本机尝试用 MSVC 生成宿主测试：核心库和多数测试目标可以编译，但完整构建失败；原因包括上游 CMake 未为 MSVC 设置 C++20，以及 GBK 代码页下 UTF-8 测试字符串被误解析。该结果是 Windows 宿主测试可移植性问题，不代表固件 ESP-IDF 构建失败。
- 本机没有使用错误的 ESP-IDF 5.4.4 去构建要求 5.5.5 的固件。
- 本轮未烧录、未做实板验证。

## 9. 对 DeskMate 路线的直接影响

下一步不再是“猜协议/只做占位适配器”，而是按固定源码提交实现：

1. UDP listener 与 `EIHB/EICC/EICA/EIAU` 编解码、会话、keepalive、乱序/丢包处理。
2. USB HID `0x10/0x11/0x12/0x13` 的配置同步、状态读取和 Agent 状态发送。
3. 保留电脑麦克风与旧 F22 兼容，板载麦克风作为用户主动选择的第二录音源。
4. 无硬件电脑完成协议单元测试和模拟板；有键盘笔记本完成防火墙、同局域网、音频质量和真机验收。
5. 在真正烧录公开 Maker 固件前，先备份用户现有配置并明确确认；新固件可能改变当前设备行为，不能自动烧录。
