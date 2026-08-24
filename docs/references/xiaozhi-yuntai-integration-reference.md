# Xiaozhi yuntai integration reference

本文件是 DeskMate 对 `F:\Codex\xiaozhi-yuntai` 参考工程的精简索引。完整分析保留在参考目录，不把参考源码、构建目录或近千行地图复制进正式产品仓。

## Authoritative reference files

| 文件 | 用途 |
| --- | --- |
| `F:\Codex\xiaozhi-yuntai\docs\xiaozhi-yuntai-baseline-report.md` | 精确工具链、构建命令、产物、哈希、告警和未验证项 |
| `F:\Codex\xiaozhi-yuntai\docs\xiaozhi-yuntai-capability-matrix.md` | 每项能力的源码/构建/真机证据和风险优先级 |
| `F:\Codex\xiaozhi-yuntai\docs\xiaozhi-yuntai-hardware-safety-map.md` | GPIO、舵机、音频、供电、分区和硬件门禁 |
| `F:\Codex\xiaozhi-yuntai\docs\xiaozhi-yuntai-interface-inventory.md` | 物理接口、云协议、MCP、NVS 和 DeskMate Link 缺口 |
| `F:\Codex\xiaozhi-yuntai\docs\xiaozhi-yuntai-technical-map.md` | 目录、启动链、状态机、表情/舵机、音频、网络和源码索引 |
| `F:\Codex\xiaozhi-yuntai\docs\xiaozhi-yuntai-today-handoff-copy-2026-08-24.md` | 组装、实物、后台、动作链、人脸跟随目标和当日增量总交接 |
| `F:\Codex\xiaozhi-yuntai\docs\xiaozhi-yuntai-hardware-backend-control-map-2026-08-24.md` | 实物模块、双 USB-C、机械装配、后台和动作调用链的交叉证据 |

2026-08-24 增量文件 SHA-256：交接 `EFDC290798E3AF1AEB27269418B725E1368CE1363680C7B87B8720C451274F51`；硬件/后台地图 `31662C52E0887B4A24160D83D8DCE0744555E5A5E11BBBA6B3DFEBA804DE630B`。原始教程、照片和提取图片继续只保存在外部参考目录，本仓不复制。

## Reproducible software baseline

- 项目：`xiaozhi` 1.9.0。
- 芯片/板型：ESP32-S3 / `esp32-s3n16r8-emoji`。
- 精确工具链：ESP-IDF 5.5.3；不能沿用 EasyInput Maker 的 5.5.5。
- 当前配置：16 MB Flash、Octal PSRAM、简体中文、AFE/VAD 和“你好小智”唤醒词。
- 独立构建：2,266/2,266 Ninja 步骤完成，`xiaozhi.bin` 为 2,596,368 bytes，约占 6 MiB OTA 槽 41.3%。
- 证据等级仅为 `BUILD_CONFIRMED`；参考任务没有连接、枚举、烧录或运行实物。
- 参考目录没有 Git；旧 `build/` 指向 `D:\oldxiaozhi`，只有 `build-baseline-20260823/` 是当前路径的软件构建证据，二者都不能进入 DeskMate Git。

## Reusable implementation entry points

| 能力 | 第一入口 | 约束 |
| --- | --- | --- |
| 启动与状态机 | `main/main.cc`、`main/application.cc`、`main/device_state.h` | 区分 idle/listening/speaking/connecting 等状态副作用 |
| 当前板装配 | `main/boards/esp32-s3n16r8-emoji/emoji_board.cc` | 只参考当前板，不继承其他兼容板能力 |
| 表情队列 | `emoji_controller.*` | 队列长度 10；满时丢新动画；需补明确背压/状态 |
| 情绪到表现 | `emotion_response_controller.*` | 新协议应进入高层语义，不直接操作 LVGL/PWM |
| 双舵机 | `servo_controller.*` | 复用角度限幅和平滑移动；必须支持回中/停止/错误 |
| 音频 | `main/audio/audio_service.*` | 当前链为 24 kHz I2S、AFE/VAD、16 kHz Opus；是否保留由产品决定 |
| Wi-Fi/云协议 | `wifi_board.cc`、`mqtt_protocol.cc`、`websocket_protocol.cc` | 现有能力面向云端，不是本地 DeskMate Link |
| MCP | `main/mcp_server.cc` | 当前板只有通用状态和音量；无表情/舵机工具 |

## Current hardware declaration

| 功能 | 静态声明 | 当前证据边界 |
| --- | --- | --- |
| OLED | SSD1306 128×64，I2C0，GPIO41/42，地址 `0x3C` | 实物电压、上拉、地址、方向待验证 |
| 水平舵机 | GPIO11，50 Hz，50–130° | 供电、方向、中心、机械限位待验证 |
| 垂直舵机 | GPIO12，50 Hz，70–110° | 供电、方向、中心、机械限位待验证 |
| 麦克风 | INMP441，GPIO5/4/6，24 kHz | 接线、增益、噪声待验证 |
| 功放 | MAX98357A，GPIO15/16/7，24 kHz | 电压、功率、爆音待验证 |
| 按键 | GPIO0/40/39 | BOOT 绑带和实物行为待验证 |
| LED | GPIO48 | 类型和电流待验证 |

### 2026-08-24 实物与组装增量

- 实物模组标识 `ESP32-S3-N16R8` 与目标板型一致；容量仍需只读枚举后才能标为 `DEVICE_CONFIRMED`。
- 顶部 USB-C 的教程用途是烧录，底部 USB-C 的教程用途是充电；这两项是 `USER_OBSERVED`，不等于已经存在 DeskMate 应用协议。
- 顶部舵机负责 pitch，底部舵机负责 yaw；教程要求两组插头对应“上下/左右”，黄色信号线朝外。插座到 GPIO11/12 的实际电气连通仍需原理图或通断测量。
- 电池标签为 3.7 V、800 mAh、2.96 Wh；“单充单放”模块在低电流来源边充边用可能重启。供电拓扑、升压能力、舵机堵转电流和功放瞬态余量仍是 `POWER_PATH_UNKNOWN`。
- 用户未安装 PAJ7620U2；当前板型源码也已移除其支持。它不能提供人脸坐标，不纳入首版跟随链路。

`POWER_PATH_UNKNOWN` 是当前最高硬件风险。没有舵机独立/共享 5 V 供电、峰值电流、共地、反灌和机械范围证据前，不得驱动舵机。

## Existing interface and missing contract

现有业务接口面向小智云端：WebSocket 文本/二进制 Opus，或 MQTT 控制加加密 UDP 音频；MCP 复用云通道。当前不存在可供 DeskMate 或 EasyInput 总控板直接使用的本地应用协议。

DeskMate Link v1 至少需要定义：

- 物理传输与电气接口；
- 发现、身份和版本协商；
- framing、长度、序列号、幂等和重放处理；
- 心跳、超时、重连和错误码；
- `get_capabilities`、`get_status`；
- 表情、回中、安全动作和忙碌状态；
- 高优先级 `stop_motion`；
- 固件兼容与降级策略。

首版传输层已选择三线 3.3 V TTL UART，115200 8N1、无硬件流控，只承载控制、状态和确认。接线为 EasyInput J4 `TXD0 → 小智 RX`、`RXD0 ← 小智 TX`、`GND ↔ GND`，J4 `3V3` 不连接，两板独立供电。选择依据是新增实物排针丝印与当前板型源码占用核对；它不等于真机电气和应用协议已经验收。

当前端口结论必须按用途区分：GPIO41/42 仅是 OLED I2C，GPIO11/12 仅是舵机 PWM，GPIO5/4/6 是麦克风 I2S，GPIO15/16/7 是功放 I2S，GPIO0/40/39 是按键，GPIO48 是 LED。物理 TX/RX 仍可能出现 ROM 启动文本，因此正式固件使用 UART1 驱动映射到物理 43/44、把应用日志迁到 USB Serial/JTAG，并要求 framing 严格丢弃启动乱码、坏 CRC 和未知版本。

## Face following and motion arbitration target

用户新增目标是让摄像头提供人脸位置，并让云台在人脸连续跟随与对话离散动作之间安全切换。当前整机没有已确认摄像头，首版优先把视觉放在电脑侧，输出归一化 `x/y`、置信度和时间戳，再通过待冻结的 DeskMate Link v1 进入云台固件。

所有入口只能向唯一动作仲裁器发送高层目标或白名单动作，不直接写 PWM。优先级固定为：急停/故障保护 > 人工回中/安全恢复 > 对话动作 > 人脸跟随 > 待机随机表情。对话动作执行期间暂停连续跟随，结束后平滑恢复；控制层必须具备死区、滤波、限速、软限位、命令超时、丢脸回中和急停。

## Known software risks to revisit

- 随机动画恢复的时间判断可能无法按预期恢复。
- listening 结束路径可能固定误触发“向左看”。
- 部分动态 FreeRTOS 任务创建没有检查失败。
- `SuspendLVGLTask()` 为空，显示并发合同不完整。
- README 的手势传感器描述与当前实现不一致。
- 当前板缺少自动化行为测试、CI 和本地控制合同。

## License and copying rules

参考源码根许可证为 MIT，版权声明为 Shenzhen Xinzhi Future Technology Co., Ltd. 与项目贡献者。任何复制或实质性派生必须保留 MIT 版权和许可文本；managed components、语音模型、字体、声音和图片继续按各自许可证审计。

正式迁入前应建立逐文件 provenance 表，记录：来源路径、来源版本/哈希、许可证、采用方式（复制/修改/重写）、DeskMate 目标路径和验证。来源不明的二进制、模型或素材不得进入产品仓。

## Evidence discipline

必须继续区分：

- `SOURCE_CONFIRMED`：源码或配置存在；
- `BUILD_CONFIRMED`：当前路径构建完成；
- `DEVICE_CONFIRMED`：目标实物验证；
- `USER_OBSERVED`：用户现场观察；
- `UNKNOWN`：没有证据。

读取 Flash、备份分区/NVS、烧录、改变分区、写 eFuse 或驱动舵机均需要单独明确授权；参考地图中的“下一步建议”不构成设备操作授权。
