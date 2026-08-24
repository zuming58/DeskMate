# DeskMate host contract

本目录将保存 Windows ↔ EasyInput 的版本化机器合同、共享类型与黄金向量。

当前状态：`PARTIALLY_FROZEN`。只有以下明确切片可以实现；未列出的配置、状态、Host Action、音频和未来消息仍为 `NOT_FROZEN`，没有任务卡时不得猜格式。

- [`easyinput-input-v1.md`](easyinput-input-v1.md)：`INPUT_V1_FROZEN`，冻结 EasyInput 默认实体输入、USB HID 身份、报告布局和断线安全语义。

现有 Maker `ai_keyboard.v1`、厂商 HID 和 Host Action 证据仍以 [`docs/contracts/easyinput-maker-protocol.md`](../../docs/contracts/easyinput-maker-protocol.md) 为来源合同。切片冻结不等于整份 Host Contract 已冻结。
