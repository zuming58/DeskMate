# DeskMate Link contract

本目录将保存 EasyInput ↔ 小智的版本化 framing、消息、ACK、错误、超时、重试、去重、兼容策略和 C/C++/JavaScript 黄金向量。

当前状态：`T08_CONTRACT_TASK_OPEN / NOT_FROZEN`。V1 只冻结了三线 3.3 V TTL UART 物理层；T08 由 EasyInput 窗口单点拥有共享合同，先提交 framing、消息、生命周期和黄金向量，随后两端才能实现。合同冻结、两端 Host/build 和电气恢复门通过前不得接线。

- EasyInput 任务：[`T08-easyinput-link-controller.md`](../../flow/tasks/T08-easyinput-link-controller.md)
- Xiaozhi 任务：[`T08-xiaozhi-link-endpoint.md`](../../flow/tasks/T08-xiaozhi-link-endpoint.md)
- 并行分工：[`t08-parallel-firmware-split-2026-08-29.md`](../../docs/handoffs/t08-parallel-firmware-split-2026-08-29.md)
