# T01 · Maker protocol implementation

> 状态说明（2026-08-24）：本任务的桌面协议/模拟部分已经进入现有代码；正式固件路线已拆分到 `T02-easyinput-input-foundation.md` 及其后续小功能包。本卡不再作为当前执行入口。

- 背景：公开 Maker 固件已经给出板载麦克风 UDP 与厂商 HID 正式合同，当前应用仍只有占位 LAN 适配器。
- 目标：先在无硬件电脑完成协议编解码、模拟板和自动化测试，再在有硬件电脑接入真实设备。
- 输入：`docs/contracts/easyinput-maker-protocol.md`、`docs/references/easyinput-maker-firmware-study.md`、`flow/progress.md`。
- 产出：协议模块、模拟 transport、单元测试、诊断状态和真机验收记录。
- 验收标准：格式、边界、乱序、丢包、超时、取消和重连测试通过；真实音频源可切换且电脑麦克风回退不受影响。
- 安全边界：不扫描局域网，不猜测地址，不写未知 HID，不烧录固件，不导出网络或音频隐私数据。
- 状态：已拆分并由新路线取代。
