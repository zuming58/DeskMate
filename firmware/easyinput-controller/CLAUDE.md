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
- T03～T06 已锁定，T07 桌面基线已冻结。T08 EasyInput DeskMate Link 总控端已完成代码、Host 与构建门，状态为 `HIL_NOT_AUTHORIZED`；后续只能做审计、可恢复烧录准备和获授权的只读双板验收。不得开发 BLE、音频或小智固件，不得修改 T07 桌面。
- T09 EasyInput 状态桥只接收冻结的 HID Feature `0x12`：业务 payload 固定 16 字节，同时兼容 Windows 顶层集合 64 字节报告产生的全零 transport padding；任何非零 padding 均拒绝。状态经独立最新状态邮箱、TTL/epoch/能力门转发既有 Link `SET_AGENT_STATE`；不得在本模块渲染 OLED、驱动舵机或补写桌面发送器。T09 代码、Host 和构建通过不等于可烧录或真机通过。
- T15B/T15D 已实现并完成用户真机验收：HID Feature/Input `0x18/0x19` 负责固定动作，`0x1A/0x1B` 负责有界可调动作与编舞；本板只做单槽校验、DeskMate Link 转发和双板 boot/action 关联。MOTION bit 3 是已知可选能力，T09 状态桥与 T10D 手动控制在该 bit 存在时必须继续工作；AUDIO bit 4 仍禁止。EasyInput 不展开轨迹，也不含 PWM、脉宽、GPIO 或绝对轴角。已验收基线不授权任何后续新镜像。
- T10E 只实现冻结的 EasyInput 板载麦克风 LAN 上行：I2S0 `GPIO9/10/11`、既有 `KeyboardMic` 电源租约、64 帧 PSRAM 有界队列和 Maker 兼容 `EIHB/EICC/EICA/EIAU`。S1/S3 只能准备 Wi-Fi，合法 `EICC start` 才能启用 I2S；配置、网络或音频失败不得影响输入、灯效、Host Action、Agent 状态或 DeskMate Link。扬声器、BLE、小智音频和桌面改动不属于 T10E。
- T11E-A 只实现冻结的本地扬声器输出：I2S1 `GPIO14/13/15`、48 kHz/16-bit/mono-left、既有 `Speaker` 电源租约、一次合成开机探针和麦克风绝对优先仲裁。不得猜测实时音频下行协议，不得读取或写入 sound bank，不得修改桌面、小智、BLE、深度睡眠或舵机；扬声器失败必须 fail-soft。
- T03 冷启动、mount 全释放、transfer identity、GPIO40 生命周期和 DCD 重连候选均被真实 Ctrl 粘连证据否决。最终 `5c09880` 参考固定 Maker synthetic tap 结构清晰重实现：S1/S3 保持 held PTT，S2/S4/S5～S8 使用原子 press→restore tap；连续五次 Ctrl 断线矩阵、Host、ESP-IDF 构建和桌面组合回归均通过，原主电脑独立审计已确认，状态为 `T03_LOCKED`。当前实板 S8 仍为烧录前已知的单板硬件阻断，固件继续保留 S8/GPIO48。
- T04 已锁定：5 颗 WS2812 使用 GPIO12，GPIO8 继续由唯一共享电源控制器写入，配置读写不得阻塞或重置输入灯效。已验收固件源码 HEAD 为 `75c65788524523325a4526718ad865ddf9f7a072`；当前样机 S8 仍是既有硬件阻断，健康板补测前不改 GPIO48/八键合同。
- T06 必须固定读取 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的 Host Action、固定文字和唯一 USB endpoint owner 实现及 Host tests，并逐项核对 T06 reference audit。固件只发送规范 UUID 或有界固定文字；应用路径和文字注入只归 Windows 主进程/原生桥所有，renderer 不得获得路径或固定文字原文。
- 不自动执行 flash、erase、monitor、端口扫描或设备发现。补刷前必须展示最终分支 HEAD、app SHA-256 和 app-only 精确写入范围，并取得用户新的明确授权。
- 从 `F:\Codex\easyinput-wzm\easy-input-maker` 复制或派生前必须记录来源提交、许可证、源文件、修改和目标路径；优先依据合同做清晰的重新实现。
- 不在本模块建立第二套 `flow/`、`docs/`、hook 或嵌套 Git。

## Module entry points

- 说明：`README.md`
- 当前任务卡：`../../flow/tasks/T11E-A-easyinput-speaker-output.md`
- T11E-A 冻结合同：`../../docs/contracts/easyinput-speaker-output-v1.md`
- T11E-A Maker 参考审计：`../../docs/provenance/t11e-a-easyinput-speaker-reference-audit.md`
- T10E 冻结合同：`../../docs/contracts/easyinput-audio-capture-v1.md`
- T10E Maker 参考审计：`../../docs/provenance/t10e-easyinput-audio-capture-reference-audit.md`
- T09 冻结合同：`../../docs/contracts/t09-agent-state-display-v1.md`
- T09 EasyInput 交接：`../../docs/handoffs/t09-easyinput-agent-state-bridge-2026-08-30.md`
- T15B Host 合同：`../../contracts/deskmate-host/easyinput-motion-presets-v1.md`
- T15 Link 合同：`../../contracts/deskmate-link/t15-motion-presets-v1.md`
- T15 Host/Link 黄金向量：`../../contracts/deskmate-host/golden-vectors-easyinput-motion-presets-v1.json`、`../../contracts/deskmate-link/golden-vectors-t15-motion-presets-v1.json`
- T08 并行分工：`../../docs/handoffs/t08-parallel-firmware-split-2026-08-29.md`
- T08 EasyInput 代码交接：`../../docs/handoffs/t08-easyinput-link-controller-2026-08-29.md`
- T08 首次只读双板验收：`../../docs/testing/t08-first-read-only-link-acceptance.md`
- DeskMate Link 入口：`../../contracts/deskmate-link/README.md`
- 冻结输入合同：`../../contracts/deskmate-host/easyinput-input-v1.md`
- 冻结输入灯效合同：`../../docs/contracts/easyinput-input-led-feedback-v1.md`
- 冻结配置合同：`../../contracts/deskmate-host/easyinput-config-v1.md`
- 冻结 Host Action 合同：`../../contracts/deskmate-host/easyinput-host-action-v1.md`
- T06 参考差异表：`../../docs/provenance/t06-easyinput-host-actions-reference-audit.md`
- 参考基线：`../../docs/provenance/reference-baselines-2026-08-24.md`
- 测试和构建入口：从仓库根运行 `cmake -S firmware/easyinput-controller/host_test -B firmware/easyinput-controller/host_test/build -DCMAKE_BUILD_TYPE=Debug`、`cmake --build firmware/easyinput-controller/host_test/build --config Debug`、`ctest --test-dir firmware/easyinput-controller/host_test/build -C Debug --output-on-failure`；在已激活且精确为 ESP-IDF 5.5.5 的环境中运行 `idf.py -C firmware/easyinput-controller build`。两者均不访问设备。
