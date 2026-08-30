# T08 Xiaozhi Link endpoint

Status: `T08_PHASE_B_PROTOCOL_READY / DESKMATE_LINK_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / HARDWARE_PINOUT_BLOCKED / HARDWARE_NOT_AUTHORIZED`

## Objective

由独立窗口只负责小智执行端。共享合同冻结前只做 UART/控制台证据核对、ESP-IDF 工程与 Host 测试骨架；拿到本窗口提供的准确合同提交后，才实现同一套 DeskMate Link v1 parser、能力和状态响应。

精确产品基线：`origin/main@3e2a046f49260ead422da4c295c3321de13dca5d`。

精确并行协调提交：`90585a6d23a448ad12433c112d451ddea8c737f5`。小智分支从该提交创建；它只比产品基线增加任务卡、分工和计划文档，不含 EasyInput 实现代码。

开发分支：`codex/xiaozhi-t08-link-endpoint`。

## Ownership

- 可修改：`firmware/xiaozhi-yuntai/`、本任务的小智测试/来源/交接文档。
- 冻结后只读消费：`contracts/deskmate-link/` 和共享黄金向量。
- 不得修改：`firmware/easyinput-controller/`、桌面源码、T07 UI、外部参考工程。

## Phase A: work allowed before contract freeze

1. 固定只读参考提交、许可证和采用文件；不得从参考脏工作树或构建产物复制。
2. 核对小智板 UART、现有 UART0 控制台、USB Serial/JTAG、可恢复日志路径和目标引脚。无法用板级证据确认的项目保持 `UNKNOWN`，不得猜空闲 GPIO。
3. 明确 DeskMate V1 下小智音频不初始化；OLED 和双舵机在本包也不初始化。
4. 建立 ESP-IDF v5.5.3/`esp32s3` 正式模块骨架、纯 C/C++ transport 抽象、fake UART 和 Host test 入口；不得写 framing 常量或真实 UART pin 配置。
5. 建立只读 capability/status 数据模型，默认把 display/motion 标为未验收或 locked，不伪装真机可用。

## Phase B: only after exact contract commit is supplied

1. 只读使用 `DESKMATE_LINK_V1_FROZEN` 和黄金向量，不自行发明或修改 framing、消息 ID、CRC、超时和兼容策略。
2. 实现严格 parser/encoder、有限队列、序列去重、重启 epoch 和错误响应。
3. 实现 `HELLO`、`GET_CAPABILITIES`、`GET_STATUS`、`SET_AGENT_STATE`；Agent 状态只更新内存状态，不写 OLED、不驱动舵机。
4. 同一批共享黄金向量必须在小智 Host tests 中逐字节通过。

## Stop gate

完成 Host tests、ESP-IDF v5.5.3 `esp32s3` 构建、来源/许可证/隐私/产物检查后提交推送并停止。不得合并 `main`，不得接线、扫描端口、识别设备、读写 Flash、烧录、monitor、初始化 OLED/音频或驱动舵机。

## Phase B result

- 冻结合同提交 `c8b8a344a72a849640c8b19575768d6daf4d6667` 已通过 merge 成为分支祖先；合同与黄金向量未重写。
- framing、CRC、流式 parser、四类消息、语义错误、八项去重缓存、冲突拒绝、boot epoch、唯一 UART owner 和 fake UART 已实现。
- `SET_AGENT_STATE` 只更新内存；DISPLAY/MOTION/AUDIO 能力为零，没有 OLED、舵机或音频初始化。
- 实体 `GND/TX/RX` 焊盘到 ESP32-S3 GPIO 的映射没有原理图网络或通断证据，因此生产入口保持 `HARDWARE_PINOUT_BLOCKED`，不安装 UART driver、不配置 GPIO、不创建 owner task。
- Phase B 只形成 Host/build 软件证据；不得申请烧录、接线或两板 HIL。下一步只能补齐 pinout、电平、供电、共地和恢复证据，且仍需用户独立授权。
