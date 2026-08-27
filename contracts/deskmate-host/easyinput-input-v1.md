# DeskMate host contract · EasyInput input v1

- 状态：`INPUT_V1_FROZEN`
- 冻结日期：2026-08-24
- 修订日期：2026-08-27（普通命令键改为原子 tap；用户确认用于关闭 T03 Ctrl 断线粘连）
- 首个实现任务：[`T03-easyinput-usb-input-runtime.md`](../../flow/tasks/T03-easyinput-usb-input-runtime.md)
- 适用链路：EasyInput V2.0 实体输入 → ESP32-S3 → Windows USB HID

本切片只冻结第一版可观察输入闭环。配置、NVS、Host Action、BLE、音频、设备状态和 DeskMate Link 不属于本切片；其 Report ID 即使出现在描述符中也只表示兼容预留，不表示功能已实现。

## 1. USB identity and report layout

- USB VID/PID：`0x303A / 0x1006`，保持现有 EasyInput/DeskMate Windows 识别兼容。
- Keyboard Input Report ID：`0x01`；payload 固定 8 bytes：`modifier`、`apple_fn`、6 个 HID usage。
- Mouse Input Report ID：`0x02`；使用标准 buttons/x/y/wheel/pan 布局，本切片只发送 `wheel` 与 `pan`。
- Vendor Report ID 兼容预留：`0x10` Feature 63 bytes、`0x11` Input 63 bytes、`0x12` Feature 16 bytes、`0x13` Feature 16 bytes、`0x14` Feature 63 bytes、`0x15` Input 63 bytes。
- T03 不解析、保存或确认任何 Vendor Feature Report，也不发送 `0x11`/`0x15`。未实现报告必须 fail closed，不能返回伪成功。
- USB 描述符的来源、固定提交、许可证、采用方式和修改必须记录到 T03 来源文件。

## 2. Default physical actions

| 输入 | 默认动作 | HID 结果 | 触发语义 |
| --- | --- | --- | --- |
| S1 | 语音输入 | `Ctrl+Shift+Space` | hold：按下加入 held state，实体释放后移除 |
| S2 | 回车 | `Enter` | tap：稳定按下边沿发送 press→restore，实体释放不再发 HID |
| S3 | 语音编辑 | `Ctrl+Shift+E` | hold：按下加入 held state，实体释放后移除 |
| S4 | 退格 | `Backspace` | tap：稳定按下边沿发送 press→restore，实体释放不再发 HID |
| S5 | 全选 | `Ctrl+A` | tap：稳定按下边沿发送 press→restore，实体释放不再发 HID |
| S6 | 复制 | `Ctrl+C` | tap：稳定按下边沿发送 press→restore，实体释放不再发 HID |
| S7 | 粘贴 | `Ctrl+V` | tap：稳定按下边沿发送 press→restore，实体释放不再发 HID |
| S8 | 撤销 | `Ctrl+Z` | tap：稳定按下边沿发送 press→restore，实体释放不再发 HID |
| Encoder clockwise | 当前轴正向滚动 | vertical 时 `wheel=-3`；horizontal 时 `pan=+3` |
| Encoder counter-clockwise | 当前轴反向滚动 | vertical 时 `wheel=+3`；horizontal 时 `pan=-3` |
| Encoder press | 切换滚动轴 | vertical ↔ horizontal，只在稳定按下边沿切换一次 |

启动默认轴为 `vertical`，速度固定为 3。以后配置只能替换同一动作路由器中的映射，不得复制第二套输入状态机。

普通命令键的 tap 必须把临时 chord 叠加到当前 S1/S3 held snapshot，并把“临时按下”和“精确恢复原 snapshot”连续写入同一 16 项 USB keyboard FIFO。两帧必须先原子预留两个槽；容量不足时两帧都不接纳，增加丢弃计数并走全释放恢复，不能只排入 key-down。重复 Press 幂等，实体 Release 只重新武装下一次 tap。

这是对 2026-08-24 首版 held 语义的兼容修订：S2/S4/S5～S8 长按不再保持按键或触发主机 typematic，只在稳定按下时执行一次。VID/PID、Report ID、报告字节、默认动作、GPIO、队列总容量和 S1/S3 PTT hold 语义均不变。原因是连续真机 HIL 证明：物理 USB 设备消失后，Windows 可能保留旧 HID lifetime 最后看到的 Ctrl，新 lifetime 的零报告不能可靠替旧 lifetime 松键；让普通 Ctrl 命令在拔线前已经完成 restore 可把风险窗口限制在相邻两帧传输期间，而不是整个实体长按期间。

## 3. Runtime interfaces

- `InputSourceId` 必须区分 S1～S8 和旋钮按压；S1/S3 的键盘 held state 以物理来源拥有 chord，不能只按 usage 去重；S2/S4/S5～S8 只保留用于幂等/rearm 的物理 pressed 状态，不进入 held snapshot。
- `KeyboardSnapshot` 包含 `modifier`、`apple_fn` 和 6 个 usage；第七个普通 usage fail closed，不能部分写入。
- `MouseWheelSnapshot` 包含有符号的 `vertical` 与 `horizontal` 相对位移；相对位移不得跨 USB lifetime 重放。
- `RuntimeDiagnosticsSnapshot` 至少包含 `raw_edge_drops`、`input_event_drops`、`hid_report_drops`、`encoder_resyncs` 和 `usb_mount_epoch`；字段使用单调、饱和的无符号计数，不持久化。

## 4. Capture, queue and lifetime rules

- 编码器 A/B 使用 GPIO any-edge ISR；ISR 只读取相位/单调时间、写入容量 64 的有界队列并通知 owner task，不记录日志、不分配内存、不执行业务动作。
- 八键和旋钮按压由 owner task 每个 FreeRTOS tick 采样，沿用 20 ms 防抖；默认 100 Hz tick 下不得把循环次数冒充毫秒。
- InputEvent ring 容量保持 32；USB report queue 容量固定 16。所有队列只有一个 task owner。
- 原始边沿队列溢出时：增加 `raw_edge_drops`、设置 resync、清除编码器半步累计，并以当前 A/B 相位重新建立基线；不得合成旋转事件。
- InputEvent 溢出时增加 `input_event_drops`；HID 队列溢出时增加 `hid_report_drops`，丢弃未发送滚轮位移，并在端点可用时优先恢复全零键盘报告。
- tap press→restore 必须按两份报告原子准入；不足两个空槽时不得发送部分序列。发送失败、lifetime 变化或队列恢复会丢弃整段未完成 tap，并以全释放报告 fail closed。
- 每次真实 TinyUSB mount 产生新的、非零 `usb_mount_epoch`；unmount 立即使该 lifetime 失效，resume 不凭采样伪造新 lifetime。
- USB 未挂载时不排队键盘或滚轮报告。断开时已经按住的 chord 不向新端点重放；只有全部相关实体键释放后，新按下才能选择新端点。
- TinyUSB callback 只更新 lifetime/完成标志并唤醒 owner task；不得直接 drain 队列或执行输入动作。

## 5. Safety and observability

- T03 日志只允许启动、USB mount/unmount、队列溢出和 resync 类别；不得包含完整设备路径、MAC、序列号、按键正文、窗口标题或用户数据。
- 本切片不新建诊断线协议。真机可观察证据来自 Windows HID 枚举、隔离测试文本框中的按键行为和滚轮行为。
- GPIO0 只用于 BOOT；GPIO8、GPIO12、音频 GPIO、J4 UART、GPIO19/20 以外的 USB 替代映射均不得由本切片使用。
- 本合同冻结不构成端口扫描、设备识别、Flash 读取、烧录、monitor 或 HIL 授权。

## 6. Change control

本切片锁定后，任何 VID/PID、Report ID/长度、默认动作、滚动方向、队列容量、断线重放或 fail-closed 语义变更，都必须先更新本合同与黄金向量，说明兼容影响，再进入新的任务卡。未冻结 Host Contract 内容继续保持 `NOT_FROZEN`。
