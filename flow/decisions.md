# Decisions

## D001 · One standalone product repository

- 日期：2026-08-23
- 决策：DeskMate 使用独立仓库 `zuming58/DeskMate`，应用代码位于仓库根目录。
- 原因：它是一个产品和发布边界；再保留 `` 套壳只会增加路径和交接成本。

## D002 · English directory names

- 日期：2026-08-23
- 决策：所有目录使用英文 ASCII 名称，文件名优先英文 kebab-case，正文允许中文。
- 原因：避免 Windows、脚本、终端编码和跨电脑协作中的路径问题。
- 说明：Project Flow 原模板的中文文件名映射为 `progress.md`、`lessons.md` 和 `guides/`，语义保持一致。

## D003 · External repositories are pinned, not vendored

- 日期：2026-08-23
- 决策：`easy-input-maker`、`easyinput-board-cy` 和 `project-flow-cy` 不完整复制到本仓库，只记录 URL、固定提交、许可证和必要合同。
- 原因：保持产品仓库纯净，同时保留可复现的来源依据。

## D004 · Computer microphone remains default

- 日期：2026-08-23
- 决策：在板载音频完成真机验收前，电脑麦克风仍是默认录音源；板载麦克风作为显式选择的第二适配器。
- 原因：现有语音闭环已经可用，新增协议不能破坏稳定路径。

## D005 · No speculative hardware writes

- 日期：2026-08-23
- 决策：未知 HID 不写；厂商报告只按固定合同实现。烧录、擦除、分区和 eFuse 操作必须另行授权。
- 原因：保护用户现有可用产品和固件。

## D006 · One product repository with three production modules

- 日期：2026-08-23
- 决策：`F:\Codex\deskmate` 是 Windows 软件、EasyInput 总控固件和小智云台固件的共同正式产品边界；外部 Maker 与小智目录只作为参考源。
- 原因：最终交付是一个协同软硬件产品，不是 Windows companion 长期调用两套外部固件。
- 说明：根级只维护一套 `flow/`、`docs/` 和 hook；正式固件模块建立后补局部规则、源码、测试和构建入口。

## D007 · EasyInput board is the external hardware controller

- 日期：2026-08-23
- 决策：目标主链为“DeskMate Windows 软件 ↔ EasyInput 总控板 ↔ 小智云台执行板”。小智负责高层表情/动作执行，DeskMate 软件和总控板均不得绕过其安全控制器直接写舵机 PWM。
- 原因：用户确认 EasyInput ESP32 将承担外部总控和板间协调职责。
- 说明：首版板间物理层后续由 D014 选为三线 3.3 V TTL UART；DeskMate Link framing 和真机电气仍须按门禁冻结和验收。

## D008 · Reference code requires provenance and license review

- 日期：2026-08-23
- 决策：不整仓复制两个参考工程；任何复制、修改或实质性派生代码都记录来源、版本/哈希、许可证、修改和目标路径。
- 原因：Maker 项目自有代码是 PolyForm Noncommercial 1.0.0，小智参考源码根许可证是 MIT，二者还包含独立许可的第三方组件和资产。
- 说明：来源不明的二进制、模型、音频、图片或构建产物不得进入产品仓。

## D009 · Voice workflow stays mounted and never forces navigation

- 日期：2026-08-23
- 决策：全局快捷键和 EasyInput 语音键只驱动唯一的版本化 VoiceWorkflow 与底部胶囊，不自动切换主窗口页面；VoiceWorkflow 在应用生命周期内保持挂载。
- 原因：页面跳转会抢走 Codex 等目标输入框的焦点，且按页面挂载控制器会丢失跨页面的语音事件。

## D010 · Application actions use opaque host-side UUIDs

- 日期：2026-08-23
- 决策：“打开应用”的路径搜索、选择、持久化和执行只在 Electron 主进程完成；渲染进程和固件只保存规范小写 UUID 与显示名。
- 原因：Windows 路径和命令行不应进入 React 状态、固件报告或诊断；未知 UUID 必须可拒绝。

## D011 · Partial keyboard configuration must not overwrite the board

- 日期：2026-08-23
- 决策：在 DeskMate 能读取、验证并合并完整板载配置前，“同步到键盘”保持可见但实际写入被阻止；本机编辑与板上同步明确分开。
- 原因：Maker `ai_keyboard.v1` 配置是整份覆盖，仅发送按键和旋钮会丢失既有网络、音频等设置。

## D012 · Xiaozhi debug ports are not the board-to-board contract

- 日期：2026-08-24
- 决策：顶部 USB-C 仅按烧录/恢复入口管理，底部 USB-C 仅按充电入口管理；UART0 与 USB Serial/JTAG 只视为调试能力。未完成 PCB、电气暴露、冲突和恢复性核对前，不把它们或任意“未占用 GPIO”指定为 EasyInput→小智的正式链路。
- 原因：2026-08-24 的实物和教程证据确认了用途，但当前小智固件仍没有本地应用 framing，芯片外设能力也不能证明 PCB 连接可用。
- 后续：D014 在补充实物排针丝印和源码占用核对后选择了首版 UART 方案；本条仍保留“调试能力不能自动冒充应用合同”的约束。

## D013 · One motion arbiter owns all Xiaozhi servo movement

- 日期：2026-08-24
- 决策：人脸跟随、对话动作、人工回中和待机动作都进入小智固件中的唯一动作仲裁器；桌面与 EasyInput 总控只发送归一化目标、高层角度或白名单动作，永不直接发送 PWM。
- 原因：连续跟踪与离散动作会争抢同一双舵机，必须统一处理优先级、死区、滤波、限速、软限位、超时、丢脸回中和急停。
- 说明：首版人脸检测优先放在电脑侧；当前硬件没有已确认摄像头，PAJ7620U2 也未安装且不能提供人脸坐标。

## D014 · DeskMate Link v1 uses a three-wire UART control link

- 日期：2026-08-24
- 决策：首版 EasyInput↔小智采用 3.3 V TTL UART，115200 8N1、无硬件流控；EasyInput J4 TXD0 接小智 RX，RXD0 接小智 TX，GND 共地，J4 3V3 不连接，两板独立供电。UART 只传控制、状态和确认，不传实时音频。
- 原因：实物照片已确认小智侧 `GND/TX/RX` 排针候选，源码核对未发现当前板型对物理 GPIO43/44 的应用占用；UART 离线可用、确定性强、调试边界清晰，适合第一版最小闭环。
- 门禁：正式实现使用 UART1 驱动映射到物理引脚并把应用日志迁到 USB Serial/JTAG；接线前完成电平、供电、通断、坏帧/启动乱码、重启和恢复性测试。选择方案不构成接线、烧录或舵机授权。

## D015 · Long-term memory and speaker identity live on Windows

- 日期：2026-08-24
- 决策：人物档案、声纹向量、长期记忆、检索索引、备份和删除权限全部由 DeskMate Windows 软件本地管理；两块固件只接收本轮必要的脱敏人物标签与高层状态。
- 原因：这些数据需要多年迁移、纠正、导出、忘记和权限治理，且声纹属于敏感生物特征，不适合放进板载 NVS/Flash。
- 安全：登记需明确同意，儿童由监护人管理，默认不长期保存原始登记录音；低置信度询问身份，声纹不得作为高风险操作的唯一凭证。

## D016 · Feature packages are locked by regression gates

- 日期：2026-08-24
- 决策：相似功能组成一个小功能包，每包完成后必须依次通过定向测试、两端/三端连通测试和全部已锁定功能回归，记录证据后才能开始下一包。
- 原因：三端协同中一次修改大量不相关功能会让故障归因和回滚失去边界；短周期联调与持续回归能让软件、总控和云台稳步前进。

## D017 · DeskMate V1 uses EasyInput as the only active audio endpoint

- 日期：2026-08-24
- 决策：V1 采用方案 A。EasyInput 板载麦克风负责语音采集，EasyInput 功放与扬声器负责播放；小智板的麦克风、功放和扬声器物理保留，但在 DeskMate 模式下不初始化。小智只承担 OLED 表情/状态与双舵机安全动作。
- 原因：两块板会紧邻叠放，声源位置差异没有产品收益；只保留一套音频链可避免回声、抢占、音量与状态同步问题，是首版最简单、最稳定的方案。
- 说明：板间三线 UART 只传控制、状态和确认，不传实时音频；开发期电脑音频可作为显式 fallback，但不改变最终硬件归属。

## D018 · V1 keeps independent power and forbids ad-hoc power bridging

- 日期：2026-08-24
- 决策：V1 两板独立供电，仅通过 `GND/TX/RX` 三线通信，EasyInput J4 `3V3` 留空并绝缘。未来单电源属于新的电源树设计任务，不能简单焊一根 3.3 V 或 5 V 线跨板供电。
- 原因：小智双舵机的峰值电流、压降、回灌与保护边界尚未完成测量；临时跨板供电会扩大复位、过流和损坏风险。

## D019 · Two-computer development separates implementation evidence from hardware evidence

- 日期：2026-08-24
- 决策：无硬件笔记本承担短分支上的协议、固件逻辑、host test、模拟器和构建；接硬件电脑承担独立审查、重建、设备身份确认以及经授权的烧录和 HIL。每个小功能包经 GitHub 交接，不等待整套固件写完才审计。
- 原因：两个 Plus 账号和两台电脑可以并行提高吞吐，但硬件缺席时不能宣称固件完成或真机通过；小包审查可把故障范围限制在最近一次改变。

## D020 · Current workstation is the default hardware acceptance host

- 日期：2026-08-24
- 决策：默认把运行 `F:\Codex\deskmate` 当前主会话的这台电脑作为硬件验收主机，EasyInput 与小智平时接在这里；另一台电脑默认负责分支实现、host test、模拟器和无硬件构建。
- 例外：只有用户明确说明外出、临时换机或指定另一台电脑接硬件时，才把当轮设备识别、经授权烧录和 HIL 转移过去；转移不降低恢复、身份确认和烧录授权门禁。
- 原因：让硬件连接、恢复资料、审计环境和真机证据长期集中，减少频繁搬板、电脑环境差异和证据混淆。

## D021 · Cross-end contracts freeze by implementation slice

- 日期：2026-08-24
- 决策：跨端合同采用逐切片冻结；只有明确标记为 `*_FROZEN` 的切片可以进入实现，同一合同目录中仍为 `NOT_FROZEN` 的内容不得根据参考工程或猜测提前实现。T03 只冻结 EasyInput 实体输入到 Windows USB HID 的 `INPUT_V1_FROZEN` 切片，完整 Host Contract 继续保持未冻结。
- 原因：不必等配置、音频、Host Action 和 DeskMate Link 全部设计完才验证实体输入，同时又能防止另一台电脑把未讨论功能混入当前包。
- 门禁：T03 只产生代码、Host 测试和无硬件构建证据；当前电脑独立复审、恢复方案准备完毕且取得用户单独授权后，才进行第一次 EasyInput 烧录/HIL。

## D022 · Auditing fixes bounded defects locally

- 日期：2026-08-24
- 决策：另一台电脑提交候选后，当前审计电脑若发现边界清楚、不改变冻结合同、能用定向回归证明的局部缺陷，直接在原候选分支修复、复验并留下审计记录；只有协议重定、架构重做、来源/许可证冲突或硬件安全边界变化才退回另一台电脑重新开发。
- 原因：局部问题跨电脑反复返工会重复消耗审计与交接成本，而且并不增加独立性；本机“先复现、再小修、再跑完整门禁”可以保留证据链并缩短反馈回路。
- 门禁：直接修复不得借机打开下一个功能包或扩大写硬件授权；仍需更新候选分支、通过完整代码门并在主线记录本机改动。

## D023 · EasyInput preserves the canonical 16 MB Flash layout

- 日期：2026-08-25
- 决策：DeskMate EasyInput 固件永久保留当前实板与固定 Maker 基线一致的分区：24 KiB NVS、4 KiB PHY、3 MiB factory app、两个 576 KiB 声音 bank。即使当前功能包不使用 NVS 或声音资源，也不得退回 ESP-IDF 默认 1 MiB factory 表或重排范围。
- 原因：T03 首次预写检查证明默认最小构建会静默删除双声音 bank，并缩小后续正式固件可用的应用合同；这既破坏恢复性，也会让后续音频功能被迫迁移分区。
- 门禁：仓内 `partitions.csv` 为构建真相源，CMake 与 Host 测试 fail closed；首次写入和分区相关升级都必须与实板/恢复镜像比较。改变布局属于独立迁移任务，需要新的备份、升级/回退方案和用户授权。

## D024 · Ordinary EasyInput command keys use atomic HID taps

- 日期：2026-08-27
- 决策：S1/S3 继续使用实体来源拥有的 held chord，满足语音 PTT；S2/S4/S5～S8 在稳定按下边沿把临时 chord 叠加到当前 held snapshot，并在同一 USB keyboard FIFO 原子排入 press 与精确 restore。实体释放只重新武装下一次 tap。
- 原因：多轮 HIL 证明，按住 S6 拔掉一个 HID lifetime 后，Windows 可能保留旧设备的 Ctrl；新设备的 mount 全释放、重复全释放、transfer-complete、GPIO40 生命周期和 DCD 软重连都不能可靠替旧 lifetime 产生 key-up。普通命令没有持续按住的产品需求，应在用户仍按住实体键时就完成主机可见释放。
- 兼容：默认动作、VID/PID、Report ID、报告布局、GPIO 和队列总容量不变；S2/S4/S5～S8 长按不再产生 host typematic 或持续 modifier。两帧必须预留两个槽，容量不足、发送失败或断线时 fail closed；T03 五次真机矩阵通过前本决策不构成 HIL 结论。

## D025 · Input LED feedback is an independent T04 package

- 日期：2026-08-27
- 决策：把 EasyInput 的 5 颗 WS2812 实体输入反馈独立设为 T04，并同时建立 GPIO8 最小共享电源安全底座；原配置/NVS 顺延为 T05，Host Action/打开应用顺延为 T06。
- 原因：灯效能直接显示实体按键是否经过防抖被固件识别，属于 T03 输入闭环的紧邻反馈，不应与配置事务混在一个包。固定 Maker 参考已经提供按键颜色、动画、旋钮反馈、RMT 和共享电源证据，继续从零猜测会重复 T03 的教训。
- 边界：T04 只实现 `INPUT_LED_V1_FROZEN` 的输入灯效；GPIO8 由唯一控制器持有，Awake 期间保持共享域开启，灯灭使用黑帧。不开音频、不做 Boot/连接/Agent 灯效、不改 T03 HID。T04 经原主电脑独立审计与真机锁定前，不开始 T05。

## D026 · T05 configuration is lossless, transactional and pure-HID only

- 日期：2026-08-27
- 决策：T05 冻结 `CONFIG_V1_FROZEN`，通过完整板载配置读取、Electron 主进程无损 read-modify-write、脱敏差异确认、DeskMate 双槽 NVS 和写后回读开放配置同步；React 不接触完整配置、网络/音频字段或设备路径。
- 原因：Maker `ai_keyboard.v1` 是整份覆盖，`0x13` 的状态/指纹不是完整配置；局部构造 JSON 会破坏既有字段，单槽直接覆盖也无法对掉电和坏配置提供确定恢复。
- 边界：T05 只激活纯 HID 按键与旋钮动作，继续复用 T03 held PTT/atomic tap 和 T04 灯效/GPIO8 owner。固定文字、Host Action/打开应用及其他 Windows 主机动作保留原始配置但不执行，统一留到 T06；旧 `ai_keyboard/config_v2` 只读导入，禁止自动擦除 NVS。
# 2026-08-28 · Cross-computer exchange uses Git only

- 两台电脑之间只通过 GitHub 的准确提交和短分支交换产品代码；不再整目录复制覆盖工作树。
- 每次换电脑前必须在 `flow/progress.md` 顶部记录角色、分支、HEAD、验证、硬件操作、未决风险和下一步；详细规范见 `flow/guides/two-computer-handoff.md`。

## D027 · Companion tools share one primary destination and one expression renderer

- 日期：2026-08-29
- 决策：T06 锁定后，桌面主导航收敛为工作台、语音输入、AI 陪伴、历史记录、词库、按键配置、设备连接、设备与诊断。AI 联动、表情库和动作编排嵌入 AI 陪伴；表情编辑与环境感知不再作为主入口。默认、眨眼、开心、难过、生气、思考、聆听七种状态共用一套真实光栅图片和一个 `CompanionFace` 渲染器。
- 原因：保持 T06 已验收功能入口不变的同时，减少侧栏碎片化；统一脸部资产可让品牌、软件预览和未来 OLED 状态使用同一语义，避免各页面出现不同机器人形象。
- 边界：陪伴对话、记忆、提醒、上传持久化、小智屏幕与舵机仍未接入。当前按钮和动作只做软件预览，不创建第二套麦克风流程、不发送硬件命令，也不构成 DeskMate Link、OLED 或舵机合同冻结。
