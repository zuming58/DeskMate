# 小智云台固件消化、调试与技术地图交接指导书

> 适用源码：`F:\Codex\xiaozhi-yuntai`  
> 用途：把本文件交给一个独立 Codex 任务，让它先把小智云台单独吃透、建立可信基线并输出技术地图，再把地图交给 `F:\Codex\deskmate`。  
> 本文件是执行指导和当前只读初查，不代表小智固件已经在本路径重新构建、烧录或完成真机验收。
>
> **后续状态：**五份正式地图和 ESP-IDF 5.5.3 软件构建基线已经完成，见 `F:\Codex\xiaozhi-yuntai\docs`；DeskMate 侧精简索引见 [Xiaozhi integration reference](../references/xiaozhi-yuntai-integration-reference.md)。用户已确认该目录是参考源，最终新云台固件属于 DeskMate 产品仓。

## 1. 先回答最容易混淆的问题：它有没有配套软件？

从当前本地 README 和源码看，它与 EasyInput 的工作方式不同：

- EasyInput 的核心交互对象是电脑端 EasyInput App，按键动作通过 USB/BLE 送到电脑。
- 小智云台的核心程序直接运行在 ESP32-S3 上。它自己采集麦克风、驱动扬声器/OLED/舵机，并通过 Wi-Fi 连接服务端。
- 固件默认接入 `xiaozhi.me`。底层协议由 OTA 配置选择 WebSocket，或 MQTT 控制加 UDP 音频。
- 首次没有 Wi-Fi 配置时，开发板会建立名为 `Xiaozhi...` 的热点，并提供一个浏览器配网页面。
- `xiaozhi.me` 网页控制台负责账号、大模型等配置；当前源码树中没有发现类似 DeskMate 或 EasyInput App 的 Windows 桌面伴侣工程。

因此，更准确的说法是：**它没有必须常驻电脑的本地配套 App，但并非完全离线；完整语音对话通常依赖 Wi-Fi、服务端和账号配置。** 独立任务还需要把首次配网、激活、云端会话、离线表情/舵机能力分别实测，不能把“能开机动舵机”写成“语音系统全部可用”。

## 2. 当前源码已经能确认的起点

| 项目 | 当前只读事实 | 证据入口 | 证据级别 |
|---|---|---|---|
| 工程 | ESP-IDF 工程，项目名 `xiaozhi`，版本声明 `1.9.0` | 根 `CMakeLists.txt` | 源码确认 |
| 芯片 | `esp32s3` | `sdkconfig`、`dependencies.lock` | 配置确认，未识别真机 |
| 板型 | `ESP32_S3N16R8_EMOJI`，源码目录 `main/boards/esp32-s3n16r8-emoji` | `sdkconfig`、`main/CMakeLists.txt` | 配置确认 |
| Flash/分区 | 16 MB；当前配置使用 `partitions/v1/16m.csv`，偏移 `0x8000` | `sdkconfig.defaults.esp32s3`、`sdkconfig.defaults`、`sdkconfig` | 配置确认 |
| IDF | README 写 5.4 或以上；当前 `dependencies.lock` 记录 IDF `5.5.3` | `README.md`、`dependencies.lock` | 锁文件确认；本机环境未确认 |
| 显示 | SSD1306 128×64，I2C SDA GPIO41、SCL GPIO42 | `board_config.h`、板型 README | 源码确认 |
| 舵机 | 水平 GPIO11，垂直 GPIO12；中心 90°；水平约 ±40°，垂直约 ±20°；50 Hz，500–2500 μs | `board_config.h`、`servo_controller.cc` | 源码确认，机械安全未验 |
| 按键 | BOOT GPIO0，音量+ GPIO40，音量− GPIO39 | `board_config.h`、`emoji_board.cc` | 源码确认 |
| 音频 | INMP441 输入 GPIO5/4/6；MAX98357A 输出 GPIO15/16/7；24 kHz | `board_config.h`、`emoji_board.cc` | 源码确认，接线/音质未验 |
| LED | GPIO48 | `board_config.h` | 源码确认 |
| 网络 | Wi-Fi；首次 AP+浏览器配网；WebSocket 或 MQTT+UDP；MCP 封装在网络协议上 | `wifi_board.cc`、`application.cc`、`docs/` | 源码确认，联网未验 |
| 测试 | 未发现独立 `test/tests/host_test` 源文件 | 全仓文件清单 | 只读扫描结果 |
| 版本控制 | 当前目录没有 `.git` | 文件系统检查 | 已确认 |
| 旧构建 | `build/project_description.json` 指向 `D:\oldxiaozhi\...` | 构建元数据 | **失效证据，不能当成本路径构建通过** |

特别注意：`dependencies.lock`、`sdkconfig`、`managed_components/` 和 `build/` 当前都可能被 `.gitignore` 忽略。不能直接执行一次 `git init && git add .` 就声称建立了完整基线；必须先盘点并决定哪些有效配置和依赖锁需要可追溯保存。

## 3. 独立小智任务的目标和禁止边界

### 3.1 目标

独立任务最终应交付一份可供 DeskMate 开发直接查阅的“小智云台固件技术地图”，回答五个问题：

1. 这块板有哪些已经存在、真机可用的能力？
2. 每项能力从入口到硬件的真实文件、类、函数和数据链路是什么？
3. 哪些功能离线可用，哪些依赖 Wi-Fi、`xiaozhi.me`、WebSocket/MQTT/UDP 或 MCP？
4. 将来 DeskMate 想控制表情和双舵机，现有可复用入口在哪里，缺少的本地通信合同是什么？
5. 哪些引脚、电源、分区、账号、设备身份和恢复方式绝对不能凭猜测修改？

### 3.2 禁止边界

在完成只读盘点和基线报告前：

- 不修改源码、`sdkconfig`、分区、引脚、舵机范围、网络地址或设备身份。
- 不运行 `menuconfig`、`set-target`、`fullclean` 或来源不明的 `scripts/flash.sh`。
- 不把旧 `build/` 当成当前源码的构建证据。
- 不烧录、不擦除 Flash、不识别或操作设备，除非用户明确进入对应阶段。
- 不沿用 EasyInput 的 BOOT、端口和烧录规则；必须按小智实际开发板核对。
- 不猜测两个板之间已经存在 UART/BLE/USB 通信接口。当前只确认了小智的云端网络协议，**尚未确认 DeskMate 本地控制协议或板间链路**。
- 不把完整 Wi-Fi 密码、账号令牌、MAC、序列号或云端凭证写进技术地图。

## 4. 应当怎样分析：九张必须画清的地图

### 地图 A：目录与构建地图

至少解释这些位置，不需要逐个解释所有其他兼容板型：

| 位置 | 要回答什么 |
|---|---|
| 根 `CMakeLists.txt` | 工程名、版本、ESP-IDF 入口是什么 |
| `main/CMakeLists.txt` | 如何根据 Kconfig 只编译选中的板型目录 |
| `main/Kconfig.projbuild` | `ESP32_S3N16R8_EMOJI` 如何被选择 |
| `main/idf_component.yml`、`dependencies.lock` | 直接依赖、锁定版本、IDF 版本和目标 |
| `sdkconfig.defaults*`、`sdkconfig` | 默认配置与当前生效配置如何区分 |
| `partitions/` | 当前真正使用哪张表，应用/OTA/资源空间如何分配 |
| `managed_components/` | 哪些是托管依赖，是否与 lock 的 hash 一致 |
| `build/` | 哪些是生成物；旧绝对路径为何使其失效 |
| `scripts/` | 哪些是转换/调试辅助；为什么旧 `flash.sh` 不能盲用 |

### 地图 B：启动与状态机地图

必须按真实函数追踪：

```text
app_main()
  → 初始化事件循环和 NVS
  → Application::GetInstance()
  → Application::Start()
      → Board::GetInstance()
      → 初始化显示、音频服务
      → board.StartNetwork()
      → OTA/服务端配置检查
      → 选择 WebsocketProtocol 或 MqttProtocol
      → 注册消息回调与 MCP 通用工具
  → Application::MainEventLoop()
```

然后补全各 `DeviceState` 的进入条件、退出条件、屏幕/音频/舵机副作用和异常路径。

### 地图 C：板型与引脚地图

只分析当前选中的 `main/boards/esp32-s3n16r8-emoji/`，输出：

- GPIO 占用表、总线表、供电电压表、共享 I2C 资源和可能冲突。
- BOOT、音量键、OLED、麦克风、功放、LED、水平/垂直舵机的真实入口。
- 机械中心、软件限位、PWM 参数和上电初始化动作。
- 哪些“空闲 GPIO/UART”经过源码和硬件原理图证明可用；无法证明的一律写 `UNKNOWN`，不得按 ESP32-S3 通用能力猜测。

### 地图 D：表情与舵机动作地图

至少追踪以下链路：

```text
服务端 llm/tts 文本或 emotion
  → Application::OnIncomingJson(...)
  → Display::SetEmotion(...) / Display::SetChatMessage(...)
  → EmojiDisplay 覆写
  → EmotionResponseController
  → EmojiController / ServoController
  → LVGL 绘制 / LEDC PWM GPIO11、GPIO12
```

逐项列出 `HeadCenter`、`HeadNod`、`HeadShake`、`HeadRoll`、上下左右动作，以及每种表情的入口、线程/任务、阻塞延时、队列和并发风险。特别核查：动作执行是否可能阻塞业务任务、连续命令怎样排队、断网时哪些动作仍可触发。

### 地图 E：按键与本地交互地图

按真实回调解释：

- BOOT 短按为何调用 `Application::ToggleChatState()`。
- 启动且未联网时，短按何时触发 Wi-Fi 重置逻辑。
- BOOT 长按如何切换表情模式、屏幕和舵机中心。
- 音量键单击/长按如何改变输出音量。
- README 中描述的行为与源码是否完全一致；不一致处单列，不选边站。

### 地图 F：音频链路地图

追踪麦克风 I2S → `AudioCodec` → `AudioService` → Opus 编码 → 网络上传，以及网络音频 → 解码 → I2S 功放。记录采样率、单/双工、唤醒词、VAD、任务/队列和错误回调。把“代码存在”“构建成功”“麦克风真机有声”“云端能对话”分成四种证据。

### 地图 G：配网、云端和协议地图

至少分清：

- 无 Wi-Fi 凭证时：`WifiBoard::EnterWifiConfigMode()` → `WifiConfigurationAp` → `Xiaozhi...` 热点 → 浏览器页面。
- 有 Wi-Fi 时：扫描、连接、60 秒等待和失败回退。
- OTA 检查怎样取得 WebSocket/MQTT 配置。
- WebSocket 的 JSON 控制和二进制 Opus；MQTT 控制和 UDP 加密音频。
- `tts`、`stt`、`llm`、`mcp`、`system`、`alert` 消息分别进入哪里。
- NVS 保存什么；技术地图只写字段职责，不泄露用户值。

### 地图 H：MCP 与可扩展控制面

核对 `McpServer::AddCommonTools()` 当前注册的能力，并搜索当前板型是否另行 `AddTool`。

当前初查发现：通用 MCP 工具有设备状态、音量等能力，但 `esp32-s3n16r8-emoji` 目录没有直接注册舵机动作的 `AddTool`；现有舵机动作主要由显示/AI 文本与情感控制链触发。独立任务必须复核并把结论写成证据，不能误写成“DeskMate 已可通过 MCP 直接控制点头”。

### 地图 I：DeskMate 对接地图

这里不设计最终协议，只交付设计所需事实：

- 当前是否存在本地 UART、USB、BLE、局域网 HTTP/WebSocket 或其他控制入口。
- 已占用引脚、可用外设、任务模型、最大消息大小和身份/重连机制。
- 表情和舵机最小可复用 API 在哪一层，怎样避免 DeskMate 直接操纵 PWM。
- 如果没有本地入口，明确写“缺少 DeskMate Link v1”，并列出候选接入层及其代价；不要偷偷选择并实现。
- 不把小智云端 MCP 与将来的两块板本地链路混为一谈。

## 5. 安全组装与真机消化顺序

### 第 0 阶段：先给散件拍照和认板

让用户提供开发板正反面、舵机型号/线色、OLED、麦克风、功放、扬声器、供电模块和接线全景。Agent 先把“照片可见事实、README 说明、源码定义”三列对照；任何冲突先停。

### 第 1 阶段：断电接线审计

- 按板型 README 核对 OLED、INMP441、MAX98357A、两路舵机和按键引脚。
- 舵机文档写 VCC 5 V、信号 GPIO11/12、共地；但必须再核对实际 PCB/电源能力，不能仅凭 README 断定开发板 5 V 轨足以同时带两个舵机。
- 检查舵机堵转电流、共地、反接、裸线短路和机械干涉。
- 舵机摇臂先不锁死在极限位置；确认软件中心 90° 与实体中位的对应关系后再装配。
- 不用 USB 口是否能承受两个舵机的瞬时电流作为默认假设。证据不足时标记 `POWER_PATH_UNKNOWN`，先解决供电再上电。

### 第 2 阶段：本路径重新建立软件基线

1. 记录完整文件清单、关键配置 hash、来源压缩包/仓库 URL/版本信息和旧构建失效证据。
2. 检查本机 ESP-IDF。README 的“5.4+”不是精确复现版本；优先解释并验证 `dependencies.lock` 中的 IDF `5.5.3`，不要直接套用 Maker 的 5.5.5。
3. 重新配置/构建时使用当前板型和目标，不运行 `set-target` 改写既有选择。
4. 返回实际 IDF 版本、目标、板型、依赖解析、应用镜像、分区余量和 warning。
5. 构建通过只证明能生成固件，不证明接线、舵机、音频、联网或云端功能。

### 第 3 阶段：烧录前授权

只有软件基线、接线和供电均通过后，才扫描端口并只读识别芯片。烧录前必须给出目标端口、ESP32-S3 身份、镜像路径/大小、分区和显式命令，等待用户针对该设备明确确认。不得执行 `erase_flash`，不得用根目录旧 `scripts/flash.sh` 的固定 `/dev/ttyACM0` 和旧发布镜像。

### 第 4 阶段：分层上电，不一次验所有功能

推荐一次只引入一种风险：

1. 仅确认正常启动、无重启循环、芯片/Flash/PSRAM 与配置一致。
2. 验证 OLED 初始化和静态显示。
3. 无机械负载或松开摇臂时验证舵机上电是否回中；先单路、小动作，再双路。
4. 验证 BOOT 短按、长按和两个音量键。
5. 验证表情动画、眨眼、点头、摇头和回中；每项记录次数、方向、卡顿和越界。
6. 验证扬声器，再验证麦克风输入，避免音频问题与舵机供电问题混在一起。
7. 验证首次 AP/浏览器配网，再验证 Wi-Fi 重连。
8. 最后验证账号激活、云端语音对话、情感响应和 MCP。

任何阶段失败，保留现场并定位到“供电/接线、板型配置、驱动、任务并发、网络、账号/云端、协议或应用逻辑”之一；不通过连续烧录来碰运气。

## 6. 必须逐项完成的真机能力矩阵

| 能力 | 最低可接受证据 | 不可替代它的证据 |
|---|---|---|
| 启动稳定 | 冷启动后持续运行，无重启循环 | 构建通过 |
| OLED | 用户看到正确画面和模式切换 | 源码含 SSD1306 |
| 水平舵机 | 左/右/回中方向和范围经观察确认 | PWM 初始化成功 |
| 垂直舵机 | 上/下/回中方向和范围经观察确认 | 另一只舵机成功 |
| 双舵机 | 点头、摇头等组合无干涉、不过流重启 | 单路测试通过 |
| 按键 | 短按/长按分别观察，次数匹配 | 日志打印回调 |
| 扬声器 | 实际听到测试音/回复，音量可调 | I2S 编译通过 |
| 麦克风 | 实际语音被采集并进入识别链 | 扬声器有声 |
| 首次配网 | `Xiaozhi...` 热点和浏览器页面可用 | Wi-Fi 代码存在 |
| Wi-Fi 重连 | 断开/重启后按预期恢复 | 首次配网成功 |
| 云端会话 | 实际 STT/LLM/TTS 闭环 | 只连上 Wi-Fi |
| 情感联动 | 指定响应对应表情/动作，时机正确 | 手动表情模式 |
| MCP | 工具列表和调用结果与代码一致 | README 写“支持 MCP” |

## 7. 最终技术地图必须怎样写

独立任务最终至少生成以下内容，可合并成一份主地图和若干附录：

1. `xiaozhi-yuntai-technical-map.md`：目录、分层、启动、状态机、动作、音频、网络、MCP、持久化、构建和产物。
2. `xiaozhi-yuntai-hardware-safety-map.md`：实物型号、引脚、供电、舵机中心/限位、共享总线、BOOT/恢复和禁止修改项。
3. `xiaozhi-yuntai-capability-matrix.md`：每项能力的 `PASS/FAIL/UNKNOWN`、命令、用户观察和证据路径。
4. `xiaozhi-yuntai-interface-inventory.md`：现有外部接口、消息/函数入口、并发模型、可复用 API、缺少的 DeskMate 本地控制合同。
5. `xiaozhi-yuntai-baseline-report.md`：来源、文件状态、ESP-IDF、依赖、目标、板型、构建/烧录状态和仍未验证项。

每个结论都要标记证据等级：

- `SOURCE_CONFIRMED`：源码/配置明确写出。
- `BUILD_CONFIRMED`：当前路径实际重新构建通过。
- `DEVICE_CONFIRMED`：只读识别或上电枚举确认。
- `USER_OBSERVED`：用户肉眼/听觉确认真机行为。
- `UNKNOWN`：尚无证据，不能猜。

技术地图中的函数必须写真实路径和函数名，最好再写调用者、输入、输出、线程/任务、硬件副作用和异常路径。最终给 DeskMate 的地图不得包含 Wi-Fi 密码、完整 MAC、账号令牌或其他隐私。

## 8. 推荐交给小智新任务的首轮提示词

把下面整段和本文件一起交给新的 Codex 任务：

> 请在 `F:\Codex\xiaozhi-yuntai` 接手小智 ESP32-S3 双舵机固件。先完整读取《小智云台固件消化、调试与技术地图交接指导书》，本轮只做第 0～2 阶段中的只读盘点与软件构建基线，不修改源码、sdkconfig、分区或引脚，不访问设备、不烧录。先检查当前路径生效的 AGENTS.md；记录目录没有 `.git`、被忽略但影响复现的 sdkconfig/dependencies.lock/managed_components，以及旧 build 绑定 `D:\oldxiaozhi\...` 的事实。使用 esp-idf-cy 核对本机环境、`dependencies.lock` 的 IDF 5.5.3、esp32s3 目标和 `ESP32_S3N16R8_EMOJI` 板型；不要直接沿用 EasyInput 的 5.5.5，不运行 set-target/menuconfig/fullclean。先返回操作前文件状态和真实构建命令，再重新生成本路径构建证据。随后按真实文件与函数输出初版目录地图、启动链、表情/舵机、按键、音频、Wi-Fi 配网、WebSocket/MQTT+UDP、MCP 和 NVS 持久化入口。构建失败时区分环境、依赖、配置、编译、链接问题；只在明确授权范围内做最小处理。最后返回构建产物/空间/warning、未发现宿主测试的证据、旧 build 与新 build 的差异、所有 UNKNOWN，以及下一步断电接线检查清单。不得把构建通过写成真机通过。

完成首轮后，再把实物照片、板子购买链接/原理图和装配状态交给同一个任务，按本文件第 5～6 节继续。不要在首轮提示词里夹带“顺便烧录”。

## 9. 交给 DeskMate 前的完成门

只有同时满足以下条件，小智“消化阶段”才算完成：

- 当前源码来源与文件基线可追溯，旧构建已排除。
- 当前路径可重复构建，IDF/目标/板型/分区/依赖有实际证据。
- 硬件接线、供电、两路舵机机械范围和恢复方式已核对。
- 能力矩阵逐项记录，未测试项保持 `UNKNOWN`。
- 技术地图能让 DeskMate 开发者直接找到动作 API、状态入口和网络依赖。
- 明确说明当前有没有本地控制协议；若没有，就只输出对接约束，不提前实现。
- 五份交付物不含隐私，并能被复制到 `F:\Codex\deskmate\docs\references\` 或作为固定外部证据引用。

完成后，DeskMate 才进入下一步：结合 EasyInput Maker 技术地图和小智技术地图，冻结第一版三端边界，先做一条最小闭环，例如 `EasyInput KEY1 → DeskMate → 小智 happy_nod`。不要先把两套固件合成一个仓库，也不要一次性把所有技能都接上。
