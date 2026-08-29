# DeskMate Link contract

当前冻结切片：`DESKMATE_LINK_V1_FROZEN`。

DeskMate Link v1 是 EasyInput 总控板到小智执行板的三线 3.3 V TTL UART 合同。两端实现必须逐字节消费同一份规范与黄金向量，不得在各自固件中重新定义 magic、消息 ID、CRC、超时或错误语义。

- [DeskMate Link v1](v1.md)
- [Language-neutral golden vectors](golden-vectors-v1.json)
- [EasyInput controller task](../../flow/tasks/T08-easyinput-link-controller.md)
- [Xiaozhi endpoint task](../../flow/tasks/T08-xiaozhi-link-endpoint.md)
- [Parallel ownership handoff](../../docs/handoffs/t08-parallel-firmware-split-2026-08-29.md)

首次接线仍需两端 Host/build 通过、电气恢复门和用户单独授权。第一次 HIL 只允许 `HELLO`、`GET_CAPABILITIES` 和 `GET_STATUS`，不初始化 OLED、音频或舵机。
