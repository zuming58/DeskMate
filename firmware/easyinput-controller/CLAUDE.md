# EasyInput controller firmware · local rules

> 本文件只适用于 `firmware/easyinput-controller/`。总体规则见 `../../AGENTS.md`；总体计划、任务和文档见 `../../flow/`、`../../docs/`。

## Responsibility

- 负责 DeskMate 正式 EasyInput ESP32-S3 总控固件：八键、旋钮、USB/BLE HID、完整配置、Host Action、板载音频、状态以及 DeskMate Link 路由。
- 不负责 Windows UI、长期记忆、小智 OLED/舵机执行，也不在本目录复制外部 Maker 工程。
- 跨端合同以 `../../docs/contracts/`、`../../contracts/deskmate-host/` 和 `../../contracts/deskmate-link/` 为真相源。

## Board baseline

- 硬件身份：EasyInput V2.0，固件板型别名 `v2`，PCB 丝印 AI Keyboard V2.1；SoC 为 ESP32-S3R8，16 MB Flash。
- S1～S8：GPIO `2,47,38,41,1,6,7,48`，低有效；GPIO0 只用于 BOOT，不是 S5。
- 编码器 A/B/按压：GPIO `17/16/18`；A/B 必须按正交相位解码。
- 原生 USB：GPIO19/20。GPIO8 是 LED、麦克风和扬声器共享电源域，不是单独灯开关。
- J4：`3V3/RXD0/TXD0/GND`；V1 只计划使用 `RXD0/TXD0/GND`，`3V3` 不接小智。
- Flash 分区固定为 `0x9000/0x6000` NVS、`0xF000/0x1000` PHY、`0x10000/0x300000` factory app、`0x310000/0x90000` sound_a、`0x3A0000/0x90000` sound_b；功能包不得退回默认分区或重排这些范围。

## Development and safety

- 目标工具链由项目冻结为 ESP-IDF 5.5.5；若本机版本不匹配，停止并报告，不静默换版本。
- 所有构建必须通过仓内 `partitions.csv` 和根 CMake 的精确布局保护；新 build 目录也必须使用由当前 `sdkconfig.defaults` 生成的隔离 sdkconfig，不得复用布局不明的生成配置。
- T02 输入基础已达到 `CODE_REVIEW_CONFIRMED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED`，但仍未连接或访问硬件，不代表可烧录、HIL 或真机通过。
- 当前唯一开放任务是 `../../flow/tasks/T03-easyinput-usb-input-runtime.md`，实现范围只以 `../../contracts/deskmate-host/easyinput-input-v1.md` 的 `INPUT_V1_FROZEN` 切片为准。
- T03 冷启动断线候选 `a97d85e` 在指定矩阵第二次再次发生 Ctrl 粘连，已被真机证据否决。当前 GPIO40 物理 USB 生命周期返工为 `TEST_CONFIRMED` / `BUILD_CONFIRMED` / `T03_GPIO40_REWORK_PENDING_NEW_FLASH_AUTHORIZATION`：Host 3/3 与 ESP-IDF v5.5.5 / `esp32s3` 构建已通过，仍需文档状态提交后的最终干净镜像、重新授权 app-only 补刷和连续五次真机复测。当前实板 S8 仍是烧录前已知的单板硬件阻断，固件继续保留 S8/GPIO48。
- T03 未通过连续五次 Ctrl 断线复测及既有功能回归前，不得进入 T04。
- 不自动执行 flash、erase、monitor、端口扫描或设备发现。补刷前必须展示最终分支 HEAD、app SHA-256 和 app-only 精确写入范围，并取得用户新的明确授权。
- 从 `F:\Codex\easyinput-wzm\easy-input-maker` 复制或派生前必须记录来源提交、许可证、源文件、修改和目标路径；优先依据合同做清晰的重新实现。
- 不在本模块建立第二套 `flow/`、`docs/`、hook 或嵌套 Git。

## Module entry points

- 说明：`README.md`
- 当前任务卡：`../../flow/tasks/T03-easyinput-usb-input-runtime.md`
- 冻结输入合同：`../../contracts/deskmate-host/easyinput-input-v1.md`
- 参考基线：`../../docs/provenance/reference-baselines-2026-08-24.md`
- 测试和构建入口：从仓库根运行 `cmake -S firmware/easyinput-controller/host_test -B firmware/easyinput-controller/host_test/build -DCMAKE_BUILD_TYPE=Debug`、`cmake --build firmware/easyinput-controller/host_test/build --config Debug`、`ctest --test-dir firmware/easyinput-controller/host_test/build -C Debug --output-on-failure`；在已激活且精确为 ESP-IDF 5.5.5 的环境中运行 `idf.py -C firmware/easyinput-controller build`。两者均不访问设备。
