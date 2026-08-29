# DeskMate Xiaozhi yuntai firmware

这是 DeskMate 正式小智执行固件的产品目录，不是 `xiaozhi.me` 云端固件的副本。

当前状态：`T08_PHASE_A_SCAFFOLD / DESKMATE_LINK_V1_NOT_FROZEN / HARDWARE_NOT_AUTHORIZED`。本目录已经具备可构建的 ESP-IDF/Host 骨架，但尚未配置真实板间 UART、协议、屏幕或动作。

V1 目标只有：协议能力/状态、OLED 表情与 Agent 状态、唯一 MotionArbiter 和经现场限位约束的双舵机安全动作。小智本板麦克风、功放、扬声器和原云端会话保持禁用。

只读参考路径：`F:\Codex\xiaozhi-yuntai`。恢复候选与资料哈希见 [`reference-baselines-2026-08-24.md`](../../docs/provenance/reference-baselines-2026-08-24.md)，T08 固定文件清单与 UART/控制台结论见 [`t08-xiaozhi-link-endpoint-reference-audit.md`](../../docs/provenance/t08-xiaozhi-link-endpoint-reference-audit.md)。

Phase A 只包含：

- 纯 C++ transport abstraction；
- Host-only fake UART；
- 只读 capability/status 数据模型；
- USB Serial/JTAG 应用日志配置；
- fail-closed source-contract tests。

display 保持 `pending_validation`，motion 与 Link transport 保持 `locked`，小智麦克风、功放和扬声器保持 `disabled_by_product`。工程不包含 UART pin、framing、消息 ID、CRC、超时、重试、OLED、I2S、LEDC 或 PWM 初始化。

当前构建使用 ESP-IDF 默认的 1 MiB factory 分区，仅用于证明 Phase A 源码可以编译，不是获准烧录的最终分区合同。正式 Flash/OTA/恢复布局仍为 `UNKNOWN`，在冻结并核对实板前不得写入设备。

## Verification

Host tests (no device required):

```powershell
cmake -S firmware/xiaozhi-yuntai/host_test -B firmware/xiaozhi-yuntai/host_test/build -DCMAKE_BUILD_TYPE=Debug
cmake --build firmware/xiaozhi-yuntai/host_test/build --config Debug
ctest --test-dir firmware/xiaozhi-yuntai/host_test/build -C Debug --output-on-failure
```

Firmware build (exact ESP-IDF 5.5.3, target `esp32s3`; no `flash` or `monitor`):

```powershell
idf.py --version
idf.py -C firmware/xiaozhi-yuntai build
```

`idf.py --version` 必须真实输出 `ESP-IDF v5.5.3`。构建通过仅代表软件证据，不代表 USB、UART、OLED、音频或舵机真机通过。
