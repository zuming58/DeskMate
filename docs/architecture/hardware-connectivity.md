# DeskMate hardware connectivity: current evidence and target topology

> 2026-08-24 V1 冻结补充：采用方案 A，EasyInput 是唯一启用的麦克风与扬声器端点；小智板只负责 OLED、表情/状态和双舵机安全动作，其本板音频硬件仅保留且在 DeskMate 模式下不初始化。两板独立供电，三线 UART 不传音频。完整基线与接线门禁见 [DeskMate V1 hardware baseline](deskmate-v1-hardware-baseline.md)。

> 产品边界更新（2026-08-24）：本文主体记录迁移前后的桌面软件 + EasyInput Phase 3D 事实，不是最终硬件架构。目标产品将由本仓库内的 Windows 软件、EasyInput 总控固件和小智云台固件组成，主链为“桌面软件 ↔ EasyInput 总控板 ↔ 小智执行板”。首版板间传输已选择三线 3.3 V TTL UART，但接线、电平和 DeskMate Link framing 仍须按门禁逐项验收。

目标架构与参考源入口见 [integrated project start](../handoffs/integrated-project-start-2026-08-23.md) 和 [Xiaozhi integration reference](../references/xiaozhi-yuntai-integration-reference.md)。

## Existing Phase 3D desktop-to-EasyInput evidence

更新时间：2026-08-22（Phase 3D 真机验收）

> 2026-08-23 更新：公开 Maker 固件已经确认板载麦克风 UDP 与厂商 HID 合同。本文的 Phase 3D 运行状态仍有效，但“协议未确认”已被 [EasyInput Maker protocol](../contracts/easyinput-maker-protocol.md) 取代；代码接入和真机验收尚未完成。

## 当前结论

Phase 3 已完成软件实现和只读设备识别，当前链路为：

```text
EasyInput Ctrl+Shift+Space 语音键 / F22 兼容路径 / 页面按钮 / 系统托盘
  → 同一个语音状态机
  → 电脑麦克风录音
  → 千问 qwen3-asr-flash
  → 历史记录优先保存
  → 当前 Windows 输入框；失败时回退剪贴板
```

本机自包含 Raw Input 桥已实际检测到 `VID 303A / PID 1006`，返回 `boardConnected: true`。只读诊断已捕获真实语音键发送的 `Ctrl + Shift + Space` 完整按下/释放序列；F22 仍保留为兼容路径。连续 10 次完整录音和异常矩阵仍需在打包版中完成。

## 已实现

- Electron 安全桌面壳、系统托盘和不抢焦点的录音状态悬浮窗。
- 自包含 .NET 8 Windows Raw Input 辅助进程，用户无需另装运行库。
- 只识别来自 `VID 303A / PID 1006` 的 F22 兼容事件；当前真机语音键由 Electron 全局 `Ctrl+Shift+Space` 快捷键入口接收；不读取文字、序列号或完整设备路径，不向 HID 写数据。
- F22 只在释放时触发，带 350ms 防抖、重复按下过滤、断线复位和辅助进程自动重启。
- `Ctrl+Shift+Space` 备用快捷键；右 Alt 为可选兼容开关，默认关闭。
- `Esc` 取消当前录音或转写。
- `idle → recording → transcribing → outputting → completed/error` 统一状态机。
- 电脑麦克风、录音 Blob、千问真实转写、历史保存、剪贴板和当前窗口输出。
- 目标窗口改变或自动输入失败时，历史不丢失并自动回退剪贴板。
- 设备页分别显示输入桥、EasyInput HID、电脑麦克风、千问和文字输出状态。
- 诊断仅保留 F22/右 Alt 的来源类别、按下释放和时间；导出移除 API Key、IP、序列号、窗口标题、录音与识别文本。

## 现有板子其他按键

回车、退格、全选、复制、粘贴、撤销等属于标准 USB HID 键盘功能，由 Windows 直接执行，不需要 DeskMate 拦截、重发或伪造。DeskMate 的按键映射页面当前只保存本机配置；正式配置写回合同虽已确认，但实现完成并通过测试前仍不会向真实设备写入。

## 分链路状态

| 链路 | 状态 | 说明 |
|---|---|---|
| EasyInput USB/HID | 真机已识别 | `VID 303A / PID 1006`，桥返回已连接 |
| Ctrl+Shift+Space → DeskMate | 真机已捕获 | 来源为 `fallback-shortcut`，与页面按钮共用语音状态机 |
| F22 → DeskMate | 已实现，待其他固件/型号验收 | 来源可区分为 `easyinput-hid` |
| 标准编辑按键 | Windows 原生可用 | 不拦截、不重发 |
| 电脑麦克风 | 已实现 | Phase 3 固定使用 |
| 千问 STT | 已实现 | API Key 由 Windows 当前用户加密保存 |
| 历史与录音 | 已实现 | 输出前先保存 |
| 当前输入框 | 已实现 | 目标变化时回退剪贴板 |
| 托盘/悬浮窗 | 已实现 | 最小化后继续工作，不抢焦点 |
| 板载麦克风 | 合同已确认、代码待接入 | Maker UDP 协议已固定；未握手前不显示连接 |
| 板子配置写回 | 合同已确认、代码待接入 | 厂商 HID `0x10/0x11`；完成校验和验收前不写真机 |
| 小智云台 OLED/表情/舵机/音频 | 源码、构建、实物照片和用户组装证据已收口 | 顶部 USB-C 用于烧录、底部用于充电；排针 `GND/TX/RX` 作为 DeskMate Link v1 的物理候选，正式云台固件和 framing 尚未建立 |

## Xiaozhi port facts relevant to integration

| 端口/信号 | 当前用途 | 集成判断 |
| --- | --- | --- |
| 顶部 USB-C | 教程定义为固件烧录 | 可用于开发/恢复性验证；没有现成应用协议 |
| 底部 USB-C | 教程定义为充电 | 不能作为已确认的数据口 |
| 排针 GND/TX/RX | 当前与 UART0 调试控制台相关 | 选为首版 DeskMate Link 物理线路；应用使用 UART1 驱动映射到物理 43/44，日志先迁到 USB Serial/JTAG |
| USB Serial/JTAG | 次级日志/调试 | 不是 DeskMate Link；USB 角色与冲突待核对 |
| GPIO11 / GPIO12 | yaw / pitch 舵机 PWM | 仅内部执行层，任何上位机不得直接写 PWM |
| GPIO41 / GPIO42 | SSD1306 I2C | 屏幕专用，不作为板间链路 |
| 其他 UART/GPIO | 未确认 | 不能从芯片能力或“源码未占用”推断 PCB 可用 |

首版接线固定为：EasyInput J4 `TXD0 → 小智 RX`、`RXD0 ← 小智 TX`、`GND ↔ GND`，J4 `3V3` 留空并绝缘；两板独立供电。下一步仍不是马上接线，而是先完成日志迁移、codec/模拟器、坏帧和恢复性测试，再由用户确认断电接线与电平测量。

## 台式机使用网线

不影响后续板载 Wi-Fi 音频方案。电脑通过网线、板子通过路由器 2.4GHz Wi-Fi，只要位于同一可互访局域网即可；访客网络、AP 隔离、不同 VLAN 或防火墙可能阻断通信。

## 安全边界

- 不烧录、不读取 Flash、不修改固件、分区或 eFuse。
- 不向未知 HID 接口写随机报告，不主动伪造 F22 释放事件。
- 不把电脑麦克风称为板载麦克风，不伪造 Wi-Fi 音频连接。
- 不把 API Key、语音、窗口标题、设备路径或序列号写入 Git/诊断文件。

现有语音闭环验收步骤见 [voice loop acceptance](../testing/voice-loop-acceptance.md)；新协议任务见 [T01](../../flow/tasks/T01-maker-protocol.md)。
