# DeskMate Xiaozhi yuntai firmware

这是 DeskMate 正式小智执行固件的产品目录，不是 `xiaozhi.me` 云端固件的副本。

当前状态：`T08_PHASE_B_PROTOCOL_READY / DESKMATE_LINK_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / HARDWARE_PINOUT_BLOCKED / HARDWARE_NOT_AUTHORIZED`。

Phase B 严格消费冻结提交 `c8b8a344a72a849640c8b19575768d6daf4d6667` 中的 [`v1.md`](../../contracts/deskmate-link/v1.md) 和 [`golden-vectors-v1.json`](../../contracts/deskmate-link/golden-vectors-v1.json)，已经实现：

- `DMLK` 编解码、CRC16-CCITT-FALSE 和 100 ms 流式解析超时；
- 分段、连续帧、启动噪声、坏 CRC、超长帧和 UART 溢出后的重新同步；
- `HELLO`、`GET_CAPABILITIES`、`GET_STATUS`、`SET_AGENT_STATE`；
- 一字节语义错误响应、最近八项精确请求缓存、重复序列幂等、冲突序列拒绝和 boot epoch；
- 固定 115200/8N1/无流控、512 字节 RX driver buffer 的唯一 UART owner；
- Host-only fake UART 和共享黄金向量测试。

`SET_AGENT_STATE` 只修改 RAM 中的状态。DISPLAY、MOTION、AUDIO 能力保持关闭；工程不初始化 OLED、麦克风、功放、扬声器、I2S、LEDC、PWM 或舵机。

## Hardware pinout gate

现有照片只能证明板上有 `GND/TX/RX` 丝印，当前板型源码只能证明功能代码没有占用 GPIO43/44。缺少 PCB 网络、原理图或断电通断测量，不能证明焊盘到 ESP32-S3 GPIO43/44 的实际连接。

因此 [`board_link_pinout.h`](main/board_link_pinout.h) 固定为未验证和 `-1/-1`，启动入口返回 `HARDWARE_PINOUT_BLOCKED`，不会安装 UART driver、配置 GPIO 或创建 owner task。完整证据见 [`t08-xiaozhi-link-phase-b-pinout-audit.md`](../../docs/provenance/t08-xiaozhi-link-phase-b-pinout-audit.md)。

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

当前默认 1 MiB factory 分区仅用于编译证明，不是获准烧录的最终 Flash/OTA/恢复合同。任何接线、设备识别、Flash 操作或真机 HIL 都必须等待 pinout/electrical/recovery 门和用户新的明确授权。
