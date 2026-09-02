# DeskMate Link contract

当前冻结切片：`DESKMATE_LINK_V1_FROZEN`。

DeskMate Link v1 是 EasyInput 总控板到小智执行板的三线 3.3 V TTL UART 合同。两端实现必须逐字节消费同一份规范与黄金向量，不得在各自固件中重新定义 magic、消息 ID、CRC、超时或错误语义。

- [DeskMate Link v1](v1.md)
- [Language-neutral golden vectors](golden-vectors-v1.json)
- [EasyInput controller task](../../flow/tasks/T08-easyinput-link-controller.md)
- [Xiaozhi endpoint task](../../flow/tasks/T08-xiaozhi-link-endpoint.md)
- [Parallel ownership handoff](../../docs/handoffs/t08-parallel-firmware-split-2026-08-29.md)
- [T09 agent-state display execution profile](../../docs/contracts/t09-agent-state-display-v1.md)
- [T15 runtime motion presets](t15-motion-presets-v1.md) 与[黄金向量](golden-vectors-t15-motion-presets-v1.json)：`T15_MOTION_PRESETS_LINK_V1_FROZEN`，新增 `0x22/0x23` 高层预设、端点本地轨迹、状态轮询和急停/回中语义。

首次接线仍需两端 Host/build 通过、电气恢复门和用户单独授权。第一次 HIL 只允许 `HELLO`、`GET_CAPABILITIES` 和 `GET_STATUS`，不初始化 OLED、音频或舵机。
