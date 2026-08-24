# DeskMate 三端开发新会话交接 · 2026-08-23

> 用途：把本文件全文交给新的 Codex/Agent 会话。它记录的是接手起点、证据边界和推荐路线，不代表新会话已经重新运行测试、构建或真机验收。
>
> **边界更正：**用户随后确认最终 Windows 软件、EasyInput 总控固件和小智云台固件都要在 `F:\Codex\deskmate` 内形成正式产品模块；本文件把两套固件长期视为外部独立交付的表述已被 [integrated project start](integrated-project-start-2026-08-23.md) 取代。外部两个目录现在只作为参考源。

## 1. 新会话的任务与工作方式

请从 `F:\Codex\deskmate` 接手 DeskMate。先只读，不要一上来同时修改三套工程，也不要新建第二层 DeskMate 项目。依次读取：

1. `F:\Codex\deskmate\AGENTS.md`
2. `F:\Codex\deskmate\flow\charter.md`
3. `F:\Codex\deskmate\flow\plan.md`
4. `F:\Codex\deskmate\flow\progress.md` 顶部最新记录
5. `F:\Codex\deskmate\docs\README.md`
6. 本交接文件
7. `F:\Codex\deskmate\docs\handoffs\easyinput-maker-technical-map-2026-08-23.md`
8. `F:\Codex\deskmate\docs\handoffs\xiaozhi-yuntai-analysis-guide-2026-08-23.md`

项目目标是把三套独立系统组合成一个 DeskMate 产品：

- DeskMate Windows 软件负责界面、状态、语音和三端协调；
- EasyInput Maker 固件负责实体按键、USB/BLE 输入与 Maker 现有硬件能力；
- 小智云台固件负责 128×64 OLED 表情、横向/纵向舵机和现有语音/音频能力。

三个源码树必须保持为独立项目边界。DeskMate 是产品总控和协议真相来源，但不是两个固件的源码容器。

## 2. 四个真实位置

| 位置 | 身份 | 用法 |
|---|---|---|
| `F:\Codex\deskmate` | 正式 DeskMate 软件仓库 | 当前产品主仓库；从这里开始新开发 |
| `F:\Codex\easyinput-wzm\easy-input-maker` | EasyInput Maker 固件仓库 | 独立参考、测试、构建和烧录；不要复制进 DeskMate |
| `F:\Codex\xiaozhi-yuntai` | 小智 ESP32-S3 双舵机固件源码拷贝 | 独立消化和建立基线；当前还不是 Git 仓库 |
| `F:\Codex\ai hardware` | 原始构思、课程答疑、会议纪要和旧资料库 | 只作历史参考；不要整目录回灌正式仓库 |

Maker 的目录职责、技术栈、HID/Wi-Fi 接口、真实函数入口、硬件边界和 DeskMate 查阅路线，统一见 `docs/handoffs/easyinput-maker-technical-map-2026-08-23.md`；不要在本总交接里凭摘要替代该技术地图。

小智云台的独立消化顺序、断电接线审计、软件/云端关系、九张技术地图、真机能力矩阵与新任务首轮提示词，统一见 `docs/handoffs/xiaozhi-yuntai-analysis-guide-2026-08-23.md`。

`F:\Codex\deskmate` 本身已经是项目根。不要再创建 `F:\Codex\deskmate\deskmate`、`app-new` 或另一套 React/Electron 工程。需要同时查看三端时，应使用 VS Code 多根工作区，而不是合并目录或嵌套 Git。

## 3. 当前状态总表

| 系统 | 当前事实 | 已有证据 | 仍未证明 |
|---|---|---|---|
| DeskMate 软件 | 独立 Git 仓库，`main` 位于 `7d7eabd`；React/Vite + Electron + .NET Raw Input Bridge | 迁移记录显示 `npm test` 60/60、`npm run build:desktop` 通过、打包冒烟退出 0；Git 当前干净 | 用户尚未在迁移后的 `F:\Codex\deskmate` 亲自重新打开并逐项检查是否遗漏；本次交接没有重跑测试或构建 |
| Maker 固件 | `main`/`v0.4.53` 位于 `7619bd1`；`ff9f618` 已提交 Host Action v1，`7619bd1` 含 BLE 持久化修复 | 历史记录：宿主 CTest 60/60；ESP-IDF 5.5.5、`v2/esp32s3` 默认构建通过；应用镜像 1,640,528 字节；已写入目标板并恢复 `VID_303A/PID_1006` HID 正常枚举 | EasyInput App 中“打开应用”动作尚未由用户完成真实功能矩阵；不能把烧录成功、HID 枚举或宿主测试写成 Host Action 真机已通过 |
| 小智云台固件 | 项目名 `xiaozhi`、版本声明 1.9.0，目标 `esp32s3`，选择 `ESP32_S3N16R8_EMOJI` 板型 | 源码可见 OLED、表情、双舵机、语音/音频入口；板型源码固定显示 SDA GPIO41、SCL GPIO42、水平舵机 GPIO11、垂直舵机 GPIO12 | 当前目录没有 `.git`；旧 `build/project_description.json` 仍指向 `D:\oldxiaozhi\...`，不能作为本路径有效构建证据；尚未在新位置重建、烧录或做能力验收 |

### 用户已经观察到的 DeskMate 状态

- 用户此前实测 EasyInput 开发板可以触发输入，按键能够控制现有软件流程。
- DeskMate 迁移后的新目录尚未由用户重新打开检查，可能存在遗漏，必须先做迁移后基线复验。
- 最新 Maker Host Action “打开应用”尚未完成用户侧真实测试；用户不确定当前 DeskMate 软件是否已经提供对应入口。它必须保持为未验证项，不能猜成已完成。

## 4. Maker 固件交接

### 4.1 生产基线

- 仓库：`F:\Codex\easyinput-wzm\easy-input-maker`
- 当前公开提交：`7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- 标签：`v0.4.53`
- Host Action 提交：`ff9f618 feat: add Host Action v1 support`
- 芯片/板型：EasyInput V2.0，固件别名 `v2`，ESP32-S3
- ESP-IDF：5.5.5
- 已构建镜像：`build/easy_input_keyboard.bin`，1,640,528 字节，时间 2026-08-23 13:18

### 4.2 Host Action v1 冻结事实

- 配置保存完整的 `host_action:<canonical-lowercase-uuid>`。
- 运行报告使用 Report ID `0x11`、kind `0x05`、chunk index `0`、total chunks `1`、data length `36`。
- 线上数据只放不带 `host_action:` 前缀的 UUID ASCII。
- 大写、长度错误、连字符位置错误或非法字符直接拒绝，不自动修复大小写。
- 按下发送一次，松开不发送。
- USB 优先，否则 BLE；已选通道失败时不跨通道补发；不能双发。
- 状态响应继续使用 kind `0x04`。
- 能力状态包含布尔值 `"host_action_v1": true`。
- 固定测试 UUID 只属于宿主测试，不是实际应用映射。
- UUID 到本机应用的真实映射只应保存在 EasyInput App 本地。

Host Action 是“Maker 请求电脑打开应用”的固定兼容协议，不能被改造成 DeskMate 与小智云台之间的状态或舵机通信协议。三端联动需要另行冻结 DeskMate Link v1。

### 4.3 当前 Maker 工作区不是干净状态

当前 `git status` 包含 flow/教学记录和 Windows 宿主测试兼容改动。宿主测试改动涉及：

- `host_test/CMakeLists.txt`：C++20 与 MSVC `/utf-8`；
- `host_test/config_status_tests.cpp`：跨编译器字符串断言；
- `host_test/firmware_source_contract_tests.cpp`：二进制资源按 binary 模式读取；
- `host_test/ima_adpcm_decoder_tests.cpp`：MSVC 可接受的 `static_assert` 写法；
- `host_test/sound_asset_store_tests.cpp`：lambda 显式捕获。

本次核对没有发现工作区中的 `components/` 或 `main/` 生产源码差异；Host Action 生产实现已在提交中。接手方不得擅自清理、回退、覆盖或把当前工作区称为干净上游克隆。若将来需要提交这些宿主测试兼容改动，应先单独审查和分组提交。

## 5. 小智云台固件交接

### 5.1 当前可确认能力

板型代码集中在：

`F:\Codex\xiaozhi-yuntai\main\boards\esp32-s3n16r8-emoji`

重要入口：

- `board_config.h`：板型、OLED、舵机、按键和音频引脚；
- `emoji_board.cc`：开发板初始化和显示屏安装；
- `emoji_controller.*`：表情动画与表情/动作组合；
- `servo_controller.*`：两个舵机的角度、平滑移动和复位；
- `emotion_response_controller.*`：情绪到表现的控制入口。

当前源码事实：

- SSD1306 OLED：128×64，I2C SDA GPIO41、SCL GPIO42；
- 水平舵机：GPIO11；垂直舵机：GPIO12；
- 舵机中心角：90°；水平范围约 ±40°，垂直范围约 ±20°；
- PWM：50 Hz；
- README 标注舵机 VCC 5V、GND 接地；
- BOOT：GPIO0；音量加/减：GPIO40/GPIO39。

### 5.2 接手前必须处理的风险

1. 当前目录不带 `.git`，所以没有可靠提交基线和差异审计能力。
2. `.gitignore` 当前忽略 `sdkconfig`、`dependencies.lock`、`managed_components` 和 `build`；在建立 Git 起点前必须决定如何保存板型选择和依赖锁定证据，不能盲目 `git init && git add .` 后以为已经完整记录。
3. 旧 build 元数据绑定 `D:\oldxiaozhi\...`，只能视为搬运残留，不能证明新路径能构建。
4. 当前只确认现有板型 GPIO。用于连接 Maker、电脑或另一块板的 UART/USB/BLE 通信入口尚未冻结；不得猜 UART 引脚、包格式或供电方案。
5. 舵机属于高瞬时电流负载。接线、供电和共地必须在真机动作前复核；不要在未经确认时连续扫角或扩大角度范围。

## 6. 三端最终职责

| 层 | 最终责任 | 不承担什么 |
|---|---|---|
| DeskMate App | 保存用户配置和设备状态；编排 Maker 事件与小智动作；提供可见诊断与失败提示 | 不直接复制固件内部状态机；不伪造硬件在线 |
| Maker 固件 | 产生实体按键/旋钮/音频等经过合同定义的输入事件 | 不保存应用路径、桌宠动作库或小智舵机细节 |
| 小智固件 | 执行表情、点头、摇头、屏幕和本板音频动作；返回明确完成/错误状态 | 不保存 DeskMate 全局业务流程；不猜电脑端应用语义 |

软件是三端协调者。两块板是否最终直连，要等协议和物理接口核对后决定；当前不能默认 Maker 直接通过 UART 控制小智。

## 7. 应该“先把两块板全部做完”吗

不应该走两个极端：

- 不要三套工程一次性全部修改；出错时无法定位。
- 也不要等两块板所有功能都开发完才开始联调；这样会很晚才发现通信和职责设计错误。

正确节奏是：

1. **单板基线**：分别证明每套现有工程在不修改时能测试、构建并完成最小真机动作。
2. **能力地图**：只读梳理每块板已经能做什么、入口函数、硬件风险和仍缺什么。
3. **最小三端闭环**：尽快做一条最小链路，例如“Maker KEY1 → DeskMate → 小智开心表情 + 点头一次 → 返回完成”。
4. **逐项上架**：闭环稳定后，每次只增加一个表情、动作、输入源或失败场景，并回归旧能力。

可以概括为：**先分别吃透到可控，不必吃透到完美；随后先打通一条链，再一个技能一个技能增加。**

## 8. 专用 12 步开发路线

### 第 1 步｜冻结三个起点

- 只读登记三个项目路径、版本、Git 状态、构建环境和现有产物。
- DeskMate 与 Maker 保留现有 Git 历史；小智目录先建立文件清单/哈希或可恢复备份，再决定 Git 初始化方式。
- 不修改代码，不烧录。

完成门：三个起点都能回答“代码从哪里来、当前版本是什么、哪些文件不受版本控制”。

### 第 2 步｜复验 DeskMate 迁移包

- 在 `F:\Codex\deskmate` 运行项目规定的 `npm ci --include=dev`、`npm test`、`npm run build:desktop`。
- 启动打包程序，人工检查现有页面、语音、EasyInput 输入、按键控制、历史和设置。
- 只比较旧资料库中确有疑问的文件；禁止把 `F:\Codex\ai hardware` 整体复制回来。

完成门：测试发现数/执行数/通过数闭合，桌面构建通过，用户确认迁移后没有关键能力遗漏。

### 第 3 步｜复验 Maker 固件基线

- 读取 Maker `AGENTS.md`、flow 顶部和 Host Action 冻结合同。
- 在保留当前工作区差异的前提下重新配置并运行完整宿主测试，再用 ESP-IDF 5.5.5 对 `v2/esp32s3` 默认构建。
- 先不烧录；真实设备操作另行授权。

完成门：清楚区分“Host Action 代码存在、宿主测试通过、固件构建通过、已烧录、真实功能通过”五类证据。

### 第 4 步｜为小智建立可追溯基线

- 先记录原始文件清单、板型、依赖、有效 sdkconfig 和旧 build 的失效路径。
- 设计 Git 起点，确保板型选择和依赖锁定不会因 `.gitignore` 被静默漏掉。
- 使用正确 ESP-IDF 环境在新构建目录重新构建；不得复用旧绝对路径缓存。
- 真机验证只做现有安全动作：开机、显示、居中、小角度点头/摇头；烧录必须单独确认。

完成门：当前路径能独立重建，板型和依赖可复现，至少一个表情和两个舵机的小范围动作有真实观察。

### 第 5 步｜制作两块板的能力与硬件地图

- Maker：按键、旋钮、USB、BLE、Host Action、音频、配置同步和状态。
- 小智：OLED 表情、横向/纵向舵机、语音、扬声器、按键和网络。
- 每项写明入口文件/函数、输入、输出、真机证据、禁止项和 UNKNOWN。

完成门：不能再用“这块板应该能”描述能力，必须能指向代码和证据。

### 第 6 步｜冻结 DeskMate Link v1

- 先决定第一版只需要哪些事件、命令、确认、超时和错误。
- 推荐最小语义：`button_pressed`、`set_expression`、`move_head`、`action_finished`、`error`。
- 决定电脑与小智的首选通信方式后，再确认物理接口、帧边界、长度、版本、重试和隐私规则。
- 不复用 Host Action `0x05`，不猜 UART 引脚或网络地址。

完成门：软件模拟器和固件可以依据同一合同各自开发，不需要互相读内部代码猜含义。

### 第 7 步｜先在 DeskMate 做小智模拟适配器

- 保留现有 React/Electron 安全边界，通过 adapter 暴露统一桌宠能力。
- 使用 mock 小智验证表情、动作、忙碌、完成、超时、断线和重连。
- UI 必须明确显示“模拟”，不能伪装成真机。

完成门：没有连接小智时，DeskMate 也能确定性测试整套编排逻辑。

### 第 8 步｜单独打通 DeskMate → 小智

- 小智只先实现一个合同命令，例如 `happy_nod`。
- DeskMate 发一次，小智显示开心并点头一次，再返回一次完成或错误。
- 先做单通道、单命令，不同时接 Maker，不扩展全部表情。

完成门：重复执行可预测；断线、超时和重复消息不会造成舵机连续失控动作。

### 第 9 步｜单独打通 Maker → DeskMate

- 先复用 DeskMate 已能观察到的实体按键输入边界。
- 判断需要的是现有快捷键/Raw Input、正式 Maker HID 事件还是另一个明确合同。
- Host Action 只继续负责“打开应用”，不能拿来发送桌宠动作。
- 如果产品确实需要“打开应用”，将其作为独立功能矩阵补验，不阻塞第一条桌宠链路。

完成门：一个指定实体键按下一次，DeskMate 只收到一次语义事件；松开不重复。

### 第 10 步｜完成第一条三端闭环

第一条推荐链路：

```text
Maker KEY1 按下
  → DeskMate 收到 button_pressed
  → DeskMate 选择 happy_nod
  → 小智显示开心并点头一次
  → 小智返回 action_finished
  → DeskMate 界面显示完成
```

逐项观察并计数，任何一步失败都停在对应层，不从头重写三端。

完成门：一次按下只产生一次可见结果；松开不重复；任何中间失败都有明确失败层。

### 第 11 步｜一个技能一个技能扩展

建议顺序：

1. 表情切换；
2. 点头、摇头、回中；
3. 多个 Maker 按键映射；
4. DeskMate AI 状态驱动表情；
5. 语音状态与小智反馈；
6. 断线、重连、超时和降级；
7. 最后才考虑更多传感器、灯效或板间直连。

每增加一项，都要补纯逻辑测试、协议测试、单端测试和三端回归；不能用新功能成功代替旧功能回归。

完成门：功能矩阵中的每一格都有独立证据，没有用“一次成功”代替整张矩阵。

### 第 12 步｜发布前总审计和真实验收

- 三个仓库分别执行完整测试和正式构建。
- 审计 Git 差异、ignored 产物、依赖锁、有效配置、GPIO、供电、设备身份和隐私日志。
- 分别烧录，逐台人工确认目标；不整片擦除，不盲试。
- 正常模式下执行三端真实场景矩阵，并记录软件版本、两个固件版本和失败恢复。

完成门：测试通过、构建通过、烧录成功、正常启动和真实功能通过分别有证据，不能互相替代。

## 9. 新会话第一轮只做什么

第一轮不要改协议或代码，先完成“第 1～2 步”：

1. 读取 DeskMate 项目规则、最新 flow 和本交接；
2. 只读核对三个路径和 Git/非 Git 状态；
3. 在 `F:\Codex\deskmate` 重跑迁移后软件基线；
4. 启动打包程序，请用户人工确认页面、EasyInput 输入、按键控制和语音链路；
5. 返回迁移遗漏项、真实通过项和下一轮唯一目标；
6. 未确认迁移完整前，不开始同时修改 Maker 或小智。

可直接复制给新会话：

```text
请在 F:\Codex\deskmate 接手 DeskMate 三端项目。先读取 AGENTS.md、flow/charter.md、flow/plan.md、flow/progress.md 顶部、docs/README.md、docs/handoffs/development-start-handoff-2026-08-23.md 和 docs/handoffs/easyinput-maker-technical-map-2026-08-23.md。DeskMate、F:\Codex\easyinput-wzm\easy-input-maker、F:\Codex\xiaozhi-yuntai 是三个独立项目边界，不要复制合并或新建第二层 DeskMate。原始课程和构思只读参考 F:\Codex\ai hardware。本轮只执行交接文档第 1～2 步：只读核对三个起点，在 DeskMate 根重新运行迁移后测试与桌面构建，再请我人工检查打包程序现有功能。不要修改两套固件，不要扫描设备、烧录、复位或猜通信接口；不要把历史测试当成本轮结果。最后明确列出迁移完整性、测试/构建结果、用户观察、UNKNOWN 和下一轮唯一目标，并按本仓库 Project Flow 记录交接。
```

## 10. 当前明确禁止越过的边界

- 不在 `F:\Codex\deskmate` 内嵌两个固件仓库或第二套 DeskMate。
- 不把 `F:\Codex\ai hardware` 的课程资料、缓存、旧构建或中文目录整包迁回正式仓库。
- 不擅自清理 Maker 当前未提交工作区，不改 GPIO、BOOT、GPIO8、电源、分区、HID/GATT 或设备身份。
- 不把 Host Action 当成小智控制协议。
- 不信任小智旧 build；不在无 Git 基线、板型/依赖不可复现时开始大改。
- 不猜小智 UART、网络地址、包格式或两块板的供电/直连方式。
- 未经用户明确确认，不烧录、不擦除、不写 Flash/eFuse、不连续驱动舵机扫角。
- 不提交 API Key、录音、识别正文、Wi-Fi 凭据、IP/MAC/SSID、设备序列号或本机私密诊断。

## 11. 当前 UNKNOWN 清单

- DeskMate 新仓库在用户这台电脑上的迁移后人工功能复验。
- DeskMate 是否已经具备 EasyInput App 0.1.26 的“打开应用”入口或对应 Host Action 接收逻辑。
- Host Action 在真实 USB-only、BLE-only、双连接和真实应用映射下的完整功能矩阵。
- 小智源码拷贝的准确上游提交、可复现依赖基线和当前路径构建结果。
- 当前实物小智板与 `ESP32_S3N16R8_EMOJI` 源码配置是否完全一致。
- DeskMate 与小智第一版通信介质、物理引脚、设备发现和身份策略。
- 两块板是否需要直接通信，还是都只通过 DeskMate App 协调。

这些 UNKNOWN 必须通过只读代码证据、重新构建或用户真机观察逐项关闭，不能由 Agent 猜测。
