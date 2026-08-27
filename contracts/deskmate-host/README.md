# DeskMate host contract

本目录将保存 Windows ↔ EasyInput 的版本化机器合同、共享类型与黄金向量。

当前状态：`PARTIALLY_FROZEN`。只有以下明确切片可以实现；未列出的配置、状态、Host Action、音频和未来消息仍为 `NOT_FROZEN`，没有任务卡时不得猜格式。

- [`easyinput-input-v1.md`](easyinput-input-v1.md)：`INPUT_V1_FROZEN`，冻结 EasyInput 默认实体输入、USB HID 身份、报告布局和断线安全语义；2026-08-27 修订普通命令键为原子 tap，S1/S3 held PTT 不变。

现有 Maker `ai_keyboard.v1`、厂商 HID 和 Host Action 证据仍以 [`docs/contracts/easyinput-maker-protocol.md`](../../docs/contracts/easyinput-maker-protocol.md) 为来源合同。切片冻结不等于整份 Host Contract 已冻结。

以下任务已规划但仍受前序门禁阻挡，不代表合同已经冻结：

- [`T04-easyinput-config-nvs.md`](../../flow/tasks/T04-easyinput-config-nvs.md)：必须先提出并自审完整配置读取/事务保存合同，显式标为 `CONFIG_V1_FROZEN` 后才能实现。
- [`T05-easyinput-host-actions.md`](../../flow/tasks/T05-easyinput-host-actions.md)：必须在 T04 锁定后提出并自审 Host Action 合同，显式标为 `HOST_ACTION_V1_FROZEN` 后才能实现。
