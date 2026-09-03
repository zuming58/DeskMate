# Xiaozhi yuntai firmware · local rules

> 本文件只适用于 `firmware/xiaozhi-yuntai/`。总体规则见 `../../AGENTS.md`；总体计划与文档见 `../../flow/`、`../../docs/`。

## Responsibility

- 负责 DeskMate 小智执行固件：DeskMate Link 严格解析、OLED 场景、唯一动作仲裁器、双舵机限幅/队列/回中/急停。
- DeskMate V1 不初始化小智 INMP441、MAX98357A、扬声器或原云端对话；EasyInput 是唯一启用的音频端点。
- 不负责 Windows 编排、长期记忆、EasyInput 输入或桌面直接 PWM。

## Development and safety

- 目标工具链由项目冻结为 ESP-IDF 5.5.3；当前状态为 `T09_VISIBLE_STATE_HIL_CONFIRMED / T10D_D_MANUAL_HIL_ACCEPTED / T15_MOTION_PRESETS_LINK_V1_FROZEN / T15D_V2_HIL_ACCEPTED / FROZEN_STAGE2_BASELINE`。基础 Link、T09、T10C、T15/T15D 合同和黄金向量只读消费；任何新固件仍需新的逐板授权。
- 无硬件电脑只能做 parser、场景、模拟舵机、host test 和 build，不得声称 OLED、音频或舵机真机通过。
- 不扫描端口、不烧录、不读取 Flash、不驱动舵机；机械动作始终需要单独授权。
- T10A 纯 C++ 运动安全核心现在只通过唯一 `MotionCoordinator` 服务 T10D 手动控制和 T15 预设；不得绕过协调器直接写 `ServoAdapter`，也不得把命令状态当成机械角度或到位实测。
- T10D-C 的真实双轴适配器保持惰性初始化和共同急停/故障锁存。普通默认配置必须继续关闭 calibration gate；只有 Stage 2 overlay 同时满足已接受配置和适配器门禁时，T15 才可发布 `MOTION` capability。
- T10D-D 不改 0x20/0x21 wire。Windows 手动控制仍使用 select/one-use ARM/center/step/recenter；Stage 2 overlay 是 T15/T15D 唯一允许启用运行时动作的配置，并已完成本轮用户真机验收。该事实不授权任何后续新镜像。
- T15A 严格实现冻结的 0x22/0x23、四个固定预设、重复/去重/冲突/看门狗、回中和 fail-soft。RUN 完成仅证明端点轨迹与逻辑中心命令被适配器接受，不证明轴角、负载或机械到位。
- OLED 动画仍只由 display owner 驱动；显示状态不会直接调用舵机，Agent 到动作的编排不在本包范围。
- 外部参考 `F:\Codex\xiaozhi-yuntai` 只读使用；复制或派生必须记录来源清单/哈希、许可证、修改与目标路径。
- 不在本模块建立第二套 `flow/`、`docs/`、hook 或嵌套 Git。
- Board1_2 的公开原理图与 PCB 网络已经证明实体 `GND/TX/RX` 焊盘连接到 GND、TXD0 和 RXD0；ESP32-S3 的 TXD0/RXD0 分别为 GPIO43/GPIO44。`board_link_pinout.h` 固定为已验证的 `43/44`，同时必须保留“未验证配置禁止安装 UART、已验证配置只使用证据 GPIO”的 Host 门禁测试。
- 产品分区表固定为 `partitions/v1/16m.csv`，必须保持与只读参考逐字节一致；app 仅允许链接到 `ota_0` 的 `0x100000`，容量上限为 6 MiB。构建通过不构成烧录授权。
- 应用/bootloader 日志和所有控制台保持关闭，不写 eFuse；ROM 启动噪声只由 parser 丢弃。不得以 Host/build 证据冒充实体 UART、USB 恢复或两板连接通过。

## Module entry points

- 说明：`README.md`
- 参考基线：`../../docs/provenance/reference-baselines-2026-08-24.md`
- DeskMate Link：`../../contracts/deskmate-link/v1.md` 与 `../../contracts/deskmate-link/golden-vectors-v1.json`
- Host tests：`cmake -S firmware/xiaozhi-yuntai/host_test -B firmware/xiaozhi-yuntai/host_test/build -DCMAKE_BUILD_TYPE=Debug`，随后 `cmake --build ... --config Debug` 与 `ctest --test-dir ... -C Debug --output-on-failure`。
- 固件构建：在精确 ESP-IDF 5.5.3 环境执行 `idf.py -C firmware/xiaozhi-yuntai build`；不得追加 `flash` 或 `monitor`。
