# DeskMate Xiaozhi yuntai firmware

这是 DeskMate 正式小智执行固件的产品目录，不是 `xiaozhi.me` 云端固件的副本。

当前状态：`T09_THREE_END_INTEGRATED / CROSS_AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / FINAL_APP_CANDIDATE_REBUILT / RECOVERY_AUTH_PENDING / HIL_NOT_AUTHORIZED`。

Phase B 严格消费冻结提交 `c8b8a344a72a849640c8b19575768d6daf4d6667` 中的 [`v1.md`](../../contracts/deskmate-link/v1.md) 和 [`golden-vectors-v1.json`](../../contracts/deskmate-link/golden-vectors-v1.json)，已经实现：

- `DMLK` 编解码、CRC16-CCITT-FALSE 和 100 ms 流式解析超时；
- 分段、连续帧、启动噪声、坏 CRC、超长帧和 UART 溢出后的重新同步；
- `HELLO`、`GET_CAPABILITIES`、`GET_STATUS`、`SET_AGENT_STATE`；
- 一字节语义错误响应、最近八项精确请求缓存、重复序列幂等、冲突序列拒绝和 boot epoch；
- 固定 115200/8N1/无流控、512 字节 RX driver buffer 的唯一 UART owner；
- Host-only fake UART 和共享黄金向量测试。

T08 的 Link framing、CRC、序列缓存、UART owner、引脚和分区合同保持不变。

## T09 agent display

T09 消费冻结的 [`t09-agent-state-display-v1.md`](../../docs/contracts/t09-agent-state-display-v1.md)，新增：

- 七状态到 `neutral/listening/thinking/focused/attention/happy/sad_error` 的纯逻辑映射；
- 唯一 display owner、四项有界队列和 Host fake OLED；
- DISPLAY capability 的初始化门禁，以及初始化/渲染失败后的 fail-closed 降级；
- 重复状态、队列满、TTL 产生的实时 idle、断线、重连和对端重启处理；
- SSD1306 128×64、I2C0、SDA GPIO41、SCL GPIO42、地址 `0x3c` 的新过程式单色场景渲染。

Link endpoint 只向 display owner 入队，只有 owner 接受后才 ACK `SET_AGENT_STATE`。`angry` 不参与自动映射。MOTION 和 AUDIO 仍关闭；工程不初始化麦克风、功放、扬声器、I2S、LEDC、PWM 或舵机。参考审计见 [`t09-xiaozhi-agent-display-reference-audit.md`](../../docs/provenance/t09-xiaozhi-agent-display-reference-audit.md)。

## Partition contract

产品文件 [`partitions/v1/16m.csv`](partitions/v1/16m.csv) 与只读参考 `F:\Codex\xiaozhi-yuntai\partitions\v1\16m.csv` 逐字节一致，SHA-256 均为 `5F9FA5E46E092D5571D19DA7B8956F6F9BFD5B7F603799B24D8DFCE769E30C14`。ESP-IDF 配置强制使用该文件：

- `nvs`：`0x9000 / 0x4000`
- `otadata`：`0xD000 / 0x2000`
- `phy_init`：`0xF000 / 0x1000`
- `model`：`0x10000 / 0xF0000`
- `ota_0`：`0x100000 / 0x600000`
- `ota_1`：`0x700000 / 0x600000`

根 CMake 会在配置未指向该文件时直接失败，Host 测试也锁定全部条目。来源与许可证记录见 [`t08-xiaozhi-partition-contract-audit.md`](../../docs/provenance/t08-xiaozhi-partition-contract-audit.md)。

## Hardware pinout gate

公开 Board1_2 PCB 网络证明三针接头 H2 的 pad 1/2/3 分别属于 `GND/TX/RX`；同版原理图证明 `TX/RX` 分别连接到模块 `TXD0/RXD0`。Espressif 的 ESP32-S3 定义将 TXD0/RXD0 对应为 GPIO43/GPIO44。因此 [`board_link_pinout.h`](main/board_link_pinout.h) 现在为 `verified=true`、TX GPIO43、RX GPIO44。

Host 门禁会验证：未验证配置即使携带 43/44 也禁止安装 UART；已验证产品配置只能向 UART owner 提供 43/44。完整板级证据见 [`t08-xiaozhi-link-phase-b-pinout-audit.md`](../../docs/provenance/t08-xiaozhi-link-phase-b-pinout-audit.md)。这不代替独立供电、共地、空闲电压、短路和恢复检查，也不构成接线或烧录授权。

应用控制台、次控制台、bootloader 日志和应用日志均关闭；不写 eFuse。ESP32-S3 ROM 启动字节仍可能存在，协议 parser 会把它作为噪声丢弃。

## Verification

Host tests（不需要设备）：

```powershell
cmake -S firmware/xiaozhi-yuntai/host_test -B firmware/xiaozhi-yuntai/host_test/build -DCMAKE_BUILD_TYPE=Debug
cmake --build firmware/xiaozhi-yuntai/host_test/build --config Debug
ctest --test-dir firmware/xiaozhi-yuntai/host_test/build -C Debug --output-on-failure
```

固件构建（精确 ESP-IDF 5.5.3、target `esp32s3`；不得追加 `flash` 或 `monitor`）：

```powershell
idf.py --version
idf.py -C firmware/xiaozhi-yuntai build
```

干净构建必须在 `app-flash_args` 中把应用放在 `0x100000`，并证明镜像严格小于 6 MiB。三端候选已在 `codex/t09-three-end-integration` 汇合；任何接线变更、设备识别、Flash 操作或真机 HIL 仍必须等待最终镜像、恢复资料和用户新的明确授权。
