# DeskMate host contract

本目录将保存 Windows ↔ EasyInput 的版本化机器合同、共享类型与黄金向量。

当前状态：`PARTIALLY_FROZEN`。只有以下明确切片可以实现；未列出的配置、状态、Host Action、音频和未来消息仍为 `NOT_FROZEN`，没有任务卡时不得猜格式。

- [`easyinput-input-v1.md`](easyinput-input-v1.md)：`INPUT_V1_FROZEN`，冻结 EasyInput 默认实体输入、USB HID 身份、报告布局和断线安全语义；2026-08-27 修订普通命令键为原子 tap，S1/S3 held PTT 不变。
- [`easyinput-config-v1.md`](easyinput-config-v1.md)：`CONFIG_V1_FROZEN`，冻结完整配置读取、无损主进程合并、脱敏确认、双槽 NVS、恢复与回读；只开放纯 HID 映射，Windows 主机动作仍未冻结。
- [`easyinput-host-action-v1.md`](easyinput-host-action-v1.md)：`HOST_ACTION_V1_FROZEN`，冻结固定文字与 UUID 打开应用的 Maker 兼容 AppCommand、USB 生命周期和 Windows 主进程安全执行边界。

现有 Maker `ai_keyboard.v1`、厂商 HID 和 Host Action 证据仍以 [`docs/contracts/easyinput-maker-protocol.md`](../../docs/contracts/easyinput-maker-protocol.md) 为来源合同。切片冻结不等于整份 Host Contract 已冻结。

T04 的实体输入灯效是固件内部行为合同，不新增 Windows↔EasyInput 报告，见 [`INPUT_LED_V1_FROZEN`](../../docs/contracts/easyinput-input-led-feedback-v1.md)。

T06 只可实现上述冻结切片；其他 AppCommand、BLE、音频和 DeskMate Link 仍为 `NOT_FROZEN`。
