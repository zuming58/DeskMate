# Input bridge module rules

继承仓库根 `AGENTS.md`。本模块只负责 Windows Raw Input 设备识别和脱敏事件输出。

- 默认只读，不主动向 HID 写数据。
- 只识别明确的 EasyInput VID/PID 和已知按键合同。
- 输出逐行 JSON；不得输出完整设备路径、序列号、普通键盘文字或窗口标题。
- 释放触发、重复过滤、防抖、断线复位和进程重启行为必须有自动化覆盖。
- 厂商 HID Feature/Input 报告应放在独立、严格校验的模块中，不能把未知字节写入当前 Raw Input 进程。
