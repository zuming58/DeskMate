# DeskMate Xiaozhi yuntai firmware

这是 DeskMate 正式小智执行固件的产品目录，不是 `xiaozhi.me` 云端固件的副本。

当前状态：`T09_VISIBLE_STATE_HIL_CONFIRMED / T10C_MANUAL_CALIBRATION_LINK_V1_FROZEN / T10C_CODE_ONLY / MOTION_HARDWARE_LOCKED`。T09 的七状态、TTL 回 idle 和 latest-wins 已真机通过；T10C 只有纯逻辑 owner、disabled/fake adapter 和模拟协议入口，没有生产运动调用点。

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
- 唯一 display owner、单槽 latest-wins mailbox 和 Host fake OLED；
- DISPLAY capability 的初始化门禁，以及初始化/渲染失败后的 fail-closed 降级；
- 重复状态、latest-wins 合并、TTL 产生的实时 idle、断线、重连和对端重启处理；
- SSD1306 128×64、I2C0、SDA GPIO41、SCL GPIO42、地址 `0x3c` 的新过程式单色场景渲染。

独立 OLED 动画小包在不改变七状态合同的前提下补充：idle 采用
3.6～6.4 秒有界伪随机间隔与 120 ms 闭眼帧；waiting 使用高眼形和底部
三点等待标记，与 idle 明显区分。新的状态会抢占未完成的 blink，重复状态
只确认而不重绘；EasyInput 的 TTL 到期 live-idle 被渲染后会重新开始自然
眨眼。任何 OLED 帧失败仍只关闭 DISPLAY enabled，DeskMate Link 保持可用。

Link endpoint 只向 display owner 入队，只有 owner 接受后才 ACK `SET_AGENT_STATE`。`angry` 不参与自动映射。MOTION 和 AUDIO 仍关闭；工程不初始化麦克风、功放、扬声器、I2S、LEDC、PWM 或舵机。参考审计见 [`t09-xiaozhi-agent-display-reference-audit.md`](../../docs/provenance/t09-xiaozhi-agent-display-reference-audit.md)。

## T10A motion safety core

T10A 消费冻结的 [`t10-motion-safety-core-v1.md`](../../docs/contracts/t10-motion-safety-core-v1.md)，只加入 Host 可测的内部运动安全模型：

- 电源路径、共地、双轴中心/方向/限位全部显式验证后才接受校准；
- 新会话必须回中，旧会话动作全部清空且不重放；
- 急停/故障 > 回中 > 对话 > 人脸跟随 > 待机的唯一仲裁优先级；
- 每来源一个有界合并槽、严格序列/过期检查、双轴独立限速和软限位；
- 急停与故障锁存、只读快照和脱敏计数。

这一核心只有不透明的校准单位，不包含 PWM、脉宽、LEDC、GPIO 或实体适配器，也没有接入 `app_main`。因此当前板上 T09 固件不会因 T10A 源码存在而产生任何机械动作。来源差异见 [`t10-xiaozhi-servo-reference-audit.md`](../../docs/provenance/t10-xiaozhi-servo-reference-audit.md)。

## T10C manual calibration candidate

T10C 冻结了独立的 [`t10c-manual-calibration-v1.md`](../../contracts/deskmate-link/t10c-manual-calibration-v1.md) 与黄金向量，只开放 `SELECT_AXIS`、短时一次性 `ARM`、本地 provisional center、固定 1.0° `SINGLE_STEP`、`RECENTER` 和最高优先级急停语义。每一次可能输出都会消耗 ARM token；租约、断线或 boot epoch 变化都会解除 ARM 且不重放。

产品 `app_main` 仍用未注入 manual owner 的原构造函数，`MOTION` capability 仍为关闭。GPIO11/GPIO12/50 Hz 仅作为固定参考板图的来源证据；当前安装映射、供电、中心、方向和限位并未实测，真实 adapter 明确禁止安装。T10C 不是烧录候选，完整来源与交接分别见 [`t10c-xiaozhi-manual-calibration-provenance.md`](../../docs/provenance/t10c-xiaozhi-manual-calibration-provenance.md) 和 [`t10c-xiaozhi-manual-calibration-candidate-2026-09-01.md`](../../docs/handoffs/t10c-xiaozhi-manual-calibration-candidate-2026-09-01.md)。

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

The normal defaults and source-tree `sdkconfig` stay Stage 0 locked. A
separately reviewed, user-present reference-baseline micro-trial uses its own
generated config file so it cannot silently reuse or overwrite Stage 0:

```powershell
$trialRoot = (Resolve-Path '.').Path
$trialSdk = Join-Path $trialRoot 'build-stage1-reference-trial-enabled/sdkconfig'
idf.py -C firmware/xiaozhi-yuntai -B build-stage1-reference-trial-enabled `
  -D "SDKCONFIG=$trialSdk" `
  -D "SDKCONFIG_DEFAULTS=sdkconfig.defaults;profiles/stage1-reference-trial.defaults" build
```

That overlay permits only the frozen one-axis manual-calibration flow and a
single 11 us step around 1500 us within 1489..1511 us. It is not the production
motion profile and does not enable presets or expression-linked movement.

干净构建必须在 `app-flash_args` 中把应用放在 `0x100000`，并证明镜像严格小于 6 MiB。T10A/T10C 都是 code-only 包，不是烧录候选；任何接线变更、设备识别、Flash 操作或舵机校准仍必须等用户在场并取得新的明确授权。
