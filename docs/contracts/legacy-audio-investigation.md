# EasyInput 音频协议观察报告

> 历史记录：这是公开 Maker 固件源码到手前的只读调查结论。当前正式合同已经确认，后续实现以 [EasyInput Maker protocol](easyinput-maker-protocol.md) 为准；保留本文用于解释为什么早期版本没有进行网络扫描或未知 HID 写入。

当时结论：该阶段尚未确认 EasyInput 板载麦克风的局域网音频协议，因此 DeskMate 不显示“板子麦克风已连接”。

已知证据来自用户自有设备的只读系统枚举：EasyInput 为 `VID 303A / PID 1006` HID 键盘与厂商自定义 HID 集合；Windows 未枚举对应 USB Audio 输入端点，也未发现该板子的串口。原 EasyInput 软件说明板载麦克风可能通过 2.4GHz Wi-Fi 发送音频，但本阶段没有可安全复现的协议资料或网络观察证据。

因此当前联动使用电脑麦克风：板子快捷键/桌面全局快捷键触发 DeskMate 录音状态，录音结束后进入历史记录。未进行未知 HID 写入、随机报告发送、抓包、音频保存或网络主动探测；报告不包含真实 IP、账号、Token、密码、序列号或语音内容。

待补资料：原 EasyInput 软件版本与用户自有网络环境下的脱敏连接日志、协议类型/端口、握手、帧边界、编码和采样率证据。

Phase 3C 软件边界：已加入协议无关的 `EasyInputLanAudioAdapter`、有限缓冲和可注入合成传输；默认状态仍为 `protocol-unconfirmed`，不会扫描或连接未知 IP/端口，也不会把合成帧写入用户历史。

网络拓扑补充：电脑可以使用有线网卡，板子使用路由器的 2.4GHz Wi-Fi；两者不要求使用同一种介质，只要求处于可互访的同一局域网。访客 Wi-Fi、AP 隔离、不同 VLAN 或 Windows 防火墙可能阻止板子向电脑发送音频。
