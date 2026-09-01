# Xiaozhi yuntai firmware · local rules

> 本文件只适用于 `firmware/xiaozhi-yuntai/`。总体规则见 `../../AGENTS.md`；总体计划与文档见 `../../flow/`、`../../docs/`。

## Responsibility

- 负责 DeskMate 小智执行固件：DeskMate Link 严格解析、OLED 场景、唯一动作仲裁器、双舵机限幅/队列/回中/急停。
- DeskMate V1 不初始化小智 INMP441、MAX98357A、扬声器或原云端对话；EasyInput 是唯一启用的音频端点。
- 不负责 Windows 编排、长期记忆、EasyInput 输入或桌面直接 PWM。

## Development and safety

- 目标工具链由项目冻结为 ESP-IDF 5.5.3；当前状态为 `T09_VISIBLE_STATE_HIL_CONFIRMED / T10C_MANUAL_CALIBRATION_LINK_V1_FROZEN / T10C_CODE_ONLY / MOTION_HARDWARE_LOCKED`。冻结 Link 合同提交 `c8b8a344a72a849640c8b19575768d6daf4d6667` 必须保持为祖先，基础 Link 合同、黄金向量和 T09 合同只读消费。
- 无硬件电脑只能做 parser、场景、模拟舵机、host test 和 build，不得声称 OLED、音频或舵机真机通过。
- 不扫描端口、不烧录、不读取 Flash、不驱动舵机；机械动作始终需要单独授权。
- T10A 只能维护纯 C++ 运动安全核心与 Host 测试；不得在 `app_main` 建立实例，不得添加 LEDC/PWM/GPIO 适配器，也不得把参考工程的名义角度当成实板校准。
- T10C 只允许 frozen additive contract、纯 C++ manual owner、disabled/fake adapter、codec 与 Host 测试。生产构造必须不注入 owner，`MOTION` capability 必须关闭；GPIO11/GPIO12/50 Hz 只能标为参考板图证据，不能标为当前安装或校准实测。
- OLED 动画小包只能维护 display owner、过程式单色场景与 Host 测试；不得接入 T10A 到生产入口，不得加入 GPIO11/GPIO12、PWM、LEDC 或舵机适配器。
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
