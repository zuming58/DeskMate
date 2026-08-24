# Progress log

> 最新记录置顶。这里是跨电脑、跨 Agent 的事实交接入口。

## 2026-08-24 · T02 首轮独立审计退回修改

- 做了什么：拉取并只读审计 `origin/codex/easyinput-input-foundation@315e7e2bb2d9298aec3a12cac849445973eb956d`，在隔离 worktree 使用本机精确 ESP-IDF v5.5.5、MSVC、CMake/CTest 重跑候选代码；形成审计报告和另一台电脑返工提示词。
- 结果：原有 host test 1/1 通过，但加入“松键必须清除 modifiers”断言后稳定失败；`idf.py build` 因 `main` 未声明 `esp_driver_gpio` 依赖而失败，因此 T02 当前为 `REVIEW_CHANGES_REQUIRED`，不得合并或烧录。
- 其他问题：主循环以 `tick++` 冒充毫秒，而生成配置为 `CONFIG_FREERTOS_HZ=100`、`pdMS_TO_TICKS(1)=0`；HID 仅能表达单 usage，尚未覆盖并发 held state；MSVC 原始 assert 会弹模态框；模块内误建 `docs/`；AGENTS/CLAUDE 已漂移。
- 板级与安全：静态板级扫描 1 PASS、1 WARN、0 FAIL；WARN 是扫描器不能识别 C++ constexpr，引脚由人工复核正确，GPIO0/GPIO8 未使用。远端提交无密钥、用户数据或构建产物。本轮未连接/识别设备，未读取或写入 Flash，未烧录、erase、monitor。
- 产出：`docs/reviews/t02-easyinput-input-foundation-audit-2026-08-24.md`、`docs/handoffs/second-computer-easyinput-rework-2026-08-24.md`；审计临时 worktree 和生成产物已删除。
- 下一步：另一台电脑继续原分支，安装/激活精确 ESP-IDF v5.5.5，修复审计项并真实通过 host test/build 后推送新提交；本机再次独立审计。任一电脑都可在后续承担 HIL，但必须在代码门通过后另行确认恢复与烧录授权。

## 2026-08-24 · 双电脑开发起点已推进入仓前状态

- 做了什么：审计并提交此前的桌面修复、三端资料和 V1 硬件基线，形成提交 `dbae59e`；随后建立 `firmware/easyinput-controller/`、`firmware/xiaozhi-yuntai/`、两个合同目录、模拟器目录、局部 AGENTS/CLAUDE 入口、外部恢复基线索引和第一张无硬件任务卡 T02。
- 为什么：另一台电脑必须从正式产品仓的同一事实起点开发，不能在 Maker 或小智参考目录中直接修改，也不能等整个固件写完再一次性审计。
- 当前第一包：`flow/tasks/T02-easyinput-input-foundation.md`。只做 ESP-IDF 5.5.5 构建骨架、八键、旋钮、防抖、USB HID 内部表示和 host test；完成后推送 `codex/easyinput-input-foundation` 并停止。
- 外部资料：另一台电脑按相同路径放置 `F:\Codex\easyinput-wzm\easy-input-maker` 和 `F:\Codex\xiaozhi-yuntai`。它们只读使用，不上传到 GitHub；产品仓只保存路径、提交/哈希和来源记录，见 `docs/provenance/reference-baselines-2026-08-24.md`。
- 恢复证据：Maker 参考固定提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`，但工作区有未提交资料/host-test 改动且尚无独立恢复镜像；小智无 Git 身份，本机 `build-baseline-20260823` 的五个候选二进制只记录大小和 SHA-256，不上传，也未冒充已验证恢复集合。
- 交接产出：可直接复制给另一台电脑的提示词位于 `docs/handoffs/second-computer-easyinput-start-2026-08-24.md`；正式模块局部入口会把无硬件证据限定为 `TEST_CONFIRMED/BUILD_CONFIRMED`。
- 验证：新增骨架前 `npm test` 66/66；`npm run build:desktop` 通过；候选提交通过密钥、ASCII 路径、构建产物与 `git diff --check` 检查。骨架只含 Markdown/规则，未修改运行时代码。
- 安全边界：没有识别设备、没有接线、没有读取/写入 Flash、没有烧录、没有监视串口、没有驱动舵机；两个外部参考目录均未修改。
- 下一步：提交并推送当前骨架和 T02；另一台电脑 clone 最新 `main` 后严格执行 T02。本机等待其分支，随后做独立代码审计和重复构建，不立即烧录。

## 2026-08-24 · V1 硬件基线与双电脑开发指导书 V2 落地

- 做了什么：把用户确认的方案 A、音频归属、物理叠放、独立供电、三线 UART 和小智云端退出路线沉淀为独立硬件基线；生成并嵌入一张高密度信息图；把原三端指导书重排为“EasyInput 小包开发/审计/单板 HIL → 桌面闭环 → Link 模拟器 → 小智小包开发/审计/HIL → 首次三线联动”的可执行 V2。
- 冻结决定：Windows 日常只连接 EasyInput；EasyInput 是 V1 唯一启用的麦克风与扬声器端点，小智本板音频物理保留但 DeskMate 模式不初始化；小智只做 OLED、表情/状态和双舵机安全动作；两板独立供电，J4 `3V3` 留空，`TXD0→RX / RXD0←TX / GND↔GND` 只传控制、状态和 ACK，不传音频。
- 两电脑流程：无硬件笔记本通过 GitHub 短分支实现代码、host test、模拟器和 IDF build；接硬件电脑逐包独立审查、重建并在另行授权后执行 HIL。不得等整套固件写完才审计，也不得把 `BUILD_CONFIRMED` 冒充真机通过。
- 产出：`docs/architecture/deskmate-v1-hardware-baseline.md`、`docs/assets/hardware/deskmate-v1-hardware-baseline-infographic.png`、`docs/guides/deskmate-three-end-development-guide-2026-08-24.md`、31 页 `docs/guides/DeskMate-three-end-development-guide-2026-08-24.docx`，以及可重复生成的 `scripts/build-development-guide-docx.py`。
- 同步：更新 `AGENTS.md`、`flow/plan.md`、`flow/decisions.md`、`docs/architecture/hardware-connectivity.md` 和 `docs/README.md`；D017～D019 固定 V1 音频、供电与双电脑证据边界。
- 验证：Word 由本机 Office 导出 PDF，以 144 DPI 检查全部 31 页；信息图完整、无空白孤页、表格无截断。a11y audit 为 0 findings，图片为 5.90×7.37 英寸 inline 并带替代文本，标题层级为 18 个 Heading 1 + 55 个 Heading 2。DOCX SHA-256 `DC7ED65503DECFE589F44048E39CC0AECD7BB314512BB93E4FF3F5C9AFB768F5`；信息图 SHA-256 `D4A1BFCAB79B3D0E6CEBB694F15915D07F831000EB419AD2571D07BCC9A28C67`。
- 安全边界：本轮只改文档与生成脚本；没有连接设备、没有接线、没有读取/写入 Flash、没有烧录、没有驱动舵机。当前已经可以启动无硬件的阶段 1～2；焊接、电平和真机阶段仍需照片/测量与单独授权。
- 下一步：在另一台笔记本从 GitHub clone `deskmate`，建立第一个 EasyInput 正式固件小包（板型声明、构建骨架、八键/旋钮/HID host test）；推送独立分支后由本机审查和重建，再决定是否申请第一次 EasyInput 单板烧录。

## 2026-08-24 · 三端开发指导书、UART 路线与长期记忆规划冻结

- 做了什么：综合 DeskMate 当前桌面基线、EasyInput V2.0 板级合同、Maker 参考固件、小智源码/技术地图/组装实物证据和旧版三端指导书，生成一份面向新手、可逐阶段执行的 26 页最新版 Word 指导书；同时把 UART 物理路线、长期记忆/说话人边界和功能包回归门禁同步到项目规则、charter、plan、architecture、decisions 和 lessons。
- 核心结论：EasyInput 是外部总控，小智是安全执行节点，Windows 软件是语音、AI、长期记忆和总编排器；首版两板采用三线 3.3 V TTL UART，`TX→RX / RX←TX / GND↔GND`，J4 `3V3` 留空，两板独立供电，UART 不传实时音频。正式接线前必须先迁移日志、完成 codec/模拟器、坏帧/重启和电平/供电验收。
- 开发流程：相似能力组成一个小功能包；每包按“定向测试 → 两端/三端连通 → 所有已锁定功能回归 → 记录并锁定”推进。任一步失败就停留修复，不叠加下一个功能包；摄像头、温湿度等扩展放在主链稳定后。
- 本地陪伴：人物档案、情节/语义记忆、声纹向量、检索、备份、导出和删除全部在 Windows 本地管理；低置信度询问身份，儿童由监护人管理，声纹不作为高风险操作的唯一凭证，两块板只接收脱敏标签和高层状态。
- 产出：`docs/guides/DeskMate-three-end-development-guide-2026-08-24.docx`（SHA-256 `23E4268D1EFB4262947DB0A8A5150AA1306F77C6AFAF0B2B268DE40307EA7E9F`）、可维护源 `docs/guides/deskmate-three-end-development-guide-2026-08-24.md` 和生成脚本 `scripts/build-development-guide-docx.py`。
- 验证：Word 经本机 Office 导出为 PDF 并以 144 DPI 渲染 26 页，逐页视觉检查完成；中途修复独立列表错误续号；a11y audit 为 0 findings，9 张表全部通过 9,360 dxa 固定几何审计，标题层级为 18 个 Heading 1 + 48 个 Heading 2。文档/流程任务未改运行时代码，因此未重跑 npm 测试或桌面构建。
- 安全边界：没有连接设备、没有带电接线、没有读取或写入 Flash、没有烧录、没有驱动舵机；外部固件、原始照片、旧 Word 和构建产物均未复制进产品仓。
- 下一步：先完成 DeskMate 当前桌面人工验收和 Maker 配置安全读改写闭环；然后按指导书阶段 2～5 建立正式两套固件骨架、冻结 DeskMate Link v1 并完成电脑模拟器，最后再申请第一次三线 display-only 真机联动。

## 2026-08-24 · 小智实物、端口与动作控制增量收口

- 做了什么：完整读取 `F:\Codex\xiaozhi-yuntai\docs\xiaozhi-yuntai-today-handoff-copy-2026-08-24.md`，并复核其直接引用的硬件/后台控制地图、更新后安全地图、接口清单和能力矩阵；把新增可信事实、检索路径、哈希、端口边界、人脸跟随目标和动作仲裁约束收口到 DeskMate 的精简参考索引、硬件连接图、计划和稳定决策。
- 为什么：用户已经完成小智云台组装和现场控制，未来要把它接入 EasyInput 总控；DeskMate 需要知道去哪里查、哪些接口能做什么，同时不能把教程照片或调试口误写成已冻结的板间协议。
- 怎么理解：顶部 USB-C 是烧录入口，底部 USB-C 是充电入口；GPIO11/12 是 yaw/pitch 舵机内部 PWM，GPIO41/42、GPIO5/4/6、GPIO15/16/7 分别被 OLED、麦克风和功放占用。UART0 115200 与 USB Serial/JTAG 当前只有日志/调试能力，没有 DeskMate 应用 framing；板间传输仍须在 LAN/UART/USB CDC/BLE/云 MCP 中基于硬件证据选择。
- 新目标：首版人脸检测优先放在电脑侧，只发送归一化坐标/高层动作；小智端由唯一动作仲裁器统一处理对话动作、人脸跟随、回中和待机动画，强制限幅、限速、超时、丢脸回中与急停。用户未安装 PAJ7620U2，它也不能替代摄像头。
- 产出：更新 `docs/references/xiaozhi-yuntai-integration-reference.md`、`docs/architecture/hardware-connectivity.md`、`flow/plan.md`、`flow/decisions.md`；未复制外部固件、原始 DOCX、照片、提取图片或构建产物。
- 验证与边界：只读核对外部资料；交接 SHA-256 `EFDC290798E3AF1AEB27269418B725E1368CE1363680C7B87B8720C451274F51`，新增硬件地图 SHA-256 `31662C52E0887B4A24160D83D8DCE0744555E5A5E11BBBA6B3DFEBA804DE630B`。未连接设备、未读取或写入 Flash、未烧录、未执行舵机动作。
- 下一步：继续完成桌面人工复测；准备板间方案时先取得小智 PCB/接口电气证据，比较传输候选并起草只读 `get_capabilities/get_status` 合同与宿主模拟器，再讨论接线和真机操作。

## 2026-08-23 · 桌面人工测试问题修复与安全同步门禁

- 做了什么：根据用户首轮人工复测，修复备用语音快捷键的物理组合键捕获/确认、历史复制误报、全局语音触发强制跳页和默认不输出到当前输入框；重构按键映射为结构化动作，补齐旋钮旋转/短按配置和“打开应用”的搜索、选择、测试打开与 UUID 映射；实现 Maker `0x10` 配置编码、`0x11` 配置确认/Host Action 解码和 Windows 原生厂商 HID 长度校验。
- 为什么：原界面有可见控件但多处仍是演示行为，导致用户无法按正常输入产品的方式验证；同时 Maker 配置是整份覆盖，不能为了恢复同步按钮而冒险清空板上已有网络/音频配置。
- 关键行为：VoiceWorkflow 全程保持单例挂载，快捷键和实体键只弹底部胶囊且不切页面；当前窗口输出默认开启并保留剪贴板回退；复制只在 Electron 剪贴板返回成功后提示成功；应用路径只存在主进程，固件/渲染进程只使用 UUID。
- 安全边界：本机按键、旋钮和打开应用设置可保存、可测试；“同步到键盘”按钮已恢复但当前明确拦截实际写入，直到完成读取并合并板上完整网络、音频和按键配置。未烧录、未写 Flash、未向实板发送厂商 HID 配置、未改外部参考仓。
- 产出：`src/domain/shortcutCapture.js`、`src/domain/keymap.js`、`electron/easyinput-config.cjs`、`electron/app-actions.cjs`、`electron/input-bridge*.cjs`、`native/DeskMate.InputBridge/Program.cs`、相关 UI/IPC/状态迁移与测试；完整人工清单在 `docs/testing/voice-loop-acceptance.md`。
- 来源：只读复核 `F:\Codex\easyinput-wzm\easy-input-maker@7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的协议证据；该参考工作区本身有未提交内容，本轮未修改、未复制外部源码或二进制。详细记录见 `docs/references/upstream-sources.md`。
- 验证：`npm test` 66/66；输入桥自包含发布成功；`DeskMate.InputBridge.exe --self-test` 正确输出 F22、Host Action、配置确认与断开事件；`npm run build:desktop` 通过；打包版 `--deskmate-smoke-test` 退出码 0；`git diff --check` 仅报告既有 CRLF→LF 提示，无空白错误。
- 下一步：由用户按人工清单复测快捷键、Codex 输入、历史复制、不跳页、旋钮和打开应用；随后实现厂商 HID 的安全“读取完整配置 → 差异确认 → 合并写入 → 保存确认”闭环，再开放真机同步。

## 2026-08-23 · 小智五份地图收口与软硬件产品边界更正

- 做了什么：完整读取 `F:\Codex\xiaozhi-yuntai\docs` 的基线报告、能力矩阵、硬件安全地图、接口清单和技术地图；新增 DeskMate 正式集成交接与小智精简参考索引，并同步修正根规则、charter、plan、总体架构、硬件连接、路线、上游来源和稳定决策。
- 为什么：用户确认 `F:\Codex\deskmate` 最终同时交付 Windows 软件、EasyInput 总控固件和小智云台固件；外部两个固件目录只是参考源。此前“只做 companion、固件长期独立”的交接已不符合产品边界。
- 怎么理解：目标主链为“Windows 软件 ↔ EasyInput 总控固件 ↔ 小智云台固件”。EasyInput 板承担外部硬件总控，小智板通过高层控制器安全执行表情/双舵机/屏幕/本板音频；板间传输仍为 UNKNOWN，需先冻结 host contract 与 DeskMate Link v1。参考源码不整仓复制，正式迁入需逐文件来源和许可证审计。
- 产出（路径）：`docs/handoffs/integrated-project-start-2026-08-23.md`、`docs/references/xiaozhi-yuntai-integration-reference.md`、`docs/architecture/system-overview.md`、`flow/charter.md`、`flow/plan.md`、`flow/decisions.md`、`AGENTS.md` 及相关索引。
- 验证：五份外部地图均完整读取；小智 ESP-IDF 5.5.3 的 2,266/2,266 构建仅作为外部 `BUILD_CONFIRMED` 证据；本轮本仓仅改 Markdown，`git diff --check` 通过，新增/修改文档的本地 Markdown 链接全部可解析，未运行代码测试、未访问设备、未烧录或驱动舵机。
- 问题→解决：早期交接保留了“两个固件是独立交付”的旧判断，已新增最终真相源并在旧交接顶部标为被取代；Maker 项目自有代码为 PolyForm Noncommercial、小智根源码为 MIT，已把来源/许可证门禁写入根规则和决策。
- 下一步：先由用户人工复验迁移后的 DeskMate 桌面软件，再冻结正式模块目录、来源清单和两块实板可用接口；随后从 `get_capabilities/get_status` 的无机械风险纵向切片开始本项目开发。

## 2026-08-23 · 小智云台独立分析指导交接

- 做了什么：只读核对 `F:\Codex\xiaozhi-yuntai` 的当前板型、构建配置、板级引脚、启动/网络/音频/表情/舵机/MCP 入口和旧构建元数据，新增一份可直接交给独立 Codex 任务的固件消化、组装调试、能力验收与技术地图指导书，并补充总交接和文档索引指针。
- 为什么：小智不是 EasyInput 式 Windows 配套 App 设备；它主要在 ESP32-S3 上独立运行并经 Wi-Fi 接入 `xiaozhi.me`。如果新任务只看舵机文件或直接烧录，会混淆板内能力、云端依赖、机械/供电风险和未来 DeskMate 本地接口。
- 怎么理解：先把小智作为独立产品建立“来源/配置 → 当前路径构建 → 断电接线 → 分层上电 → 单项真机证据 → 技术地图”的可信基线；当前源码确认首次 AP+浏览器配网、WebSocket 或 MQTT+UDP、MCP 和双舵机能力，但尚未确认本地 DeskMate 控制协议，不能猜 UART/BLE 接口。
- 产出（路径）：`docs/handoffs/xiaozhi-yuntai-analysis-guide-2026-08-23.md`；入口更新于 `docs/handoffs/development-start-handoff-2026-08-23.md` 和 `docs/README.md`。
- 问题→解决：当前小智目录没有 `.git`，`sdkconfig`/`dependencies.lock` 又在忽略范围内，且旧 `build/project_description.json` 仍绑定 `D:\oldxiaozhi\...`；指导书要求先盘点有效配置、使用 lock 中 IDF 5.5.3 建立本路径构建证据，并把源码、构建、设备和用户观察分级，禁止把旧 build 或构建通过冒充真机通过。
- 下一步：在小智独立任务中先执行指导书首轮提示词，只读建立目录/启动/接口地图并重建软件基线；用户提供实物照片和原理图后再做断电接线、供电与机械限位核对，烧录必须另行给出设备授权卡。

## 2026-08-23 · EasyInput Maker 技术地图交接

- 做了什么：依据 Maker 当前仓库、公开文档、核心 header/source、宿主测试和 EasyInput V2.0 板级知识，新增一份面向 DeskMate 新会话的 Maker 技术地图；补充总交接与文档索引指针。
- 为什么：新的三端开发不能靠复制整个固件或让 Agent 临时猜入口，需要把目录职责、纯逻辑/平台分层、配置/Keymap/事件/USB/BLE/Wi-Fi/状态/声音接口、硬件护栏和测试入口集中交付。
- 怎么理解：DeskMate 读取并实现 Maker 协议的电脑端适配；Maker 保持独立上游。`components/keyboard` 是协议与业务逻辑第一入口，`main/platform` 是 ESP-IDF/硬件适配，`host_test` 是预期行为证据；Host Action `0x05` 只负责打开应用，不能被改造成小智通信协议。
- 产出（路径）：`docs/handoffs/easyinput-maker-technical-map-2026-08-23.md`；总入口更新于 `docs/handoffs/development-start-handoff-2026-08-23.md` 和 `docs/README.md`。
- 问题→解决：Maker 工作区存在未提交宿主测试兼容与 flow/教学记录，技术地图明确禁止自动清理；历史 60/60、构建、烧录和 HID 枚举与仍未完成的 Host Action 真实功能矩阵已分层记录；GPIO、BOOT、GPIO8、USB、音频和 J4 UART0 均按当前板级证据标注。
- 下一步：小智独立会话先建立其非 Git 源码拷贝的可追溯基线并产出同结构技术地图；随后 DeskMate 会话使用两份地图冻结 DeskMate Link v1 和第一条 `KEY1 → DeskMate → happy_nod` 最小闭环。

## 2026-08-23 · DeskMate 三端开发新会话交接

- 做了什么：只读核对独立 DeskMate 软件仓库、EasyInput Maker 固件仓库和新复制的小智云台源码，新增一份可直接交给新会话的三端状态、边界、12 步开发路线和首轮任务说明；同时把该交接加入文档索引。
- 为什么：用户将转入新的 DeskMate 开发会话，需要把课程资料、正式软件、两个固件以及“历史通过”和“本轮未验证”分开，避免新 Agent 复制混仓、一次性大改或误用旧构建。
- 怎么理解：`F:\Codex\deskmate` 已经是正式产品根，不应再嵌套第二套项目；Maker 与小智继续作为独立兄弟工程。开发节奏是“分别建立可信基线和能力地图 → 一条最小三端闭环 → 一个技能一个技能扩展”，不是全部单板功能做完后才联调，也不是三端一次性重写。
- 产出（路径）：`docs/handoffs/development-start-handoff-2026-08-23.md`；索引更新于 `docs/README.md`。
- 问题→解决：发现 Maker 当前含未提交的 Windows 宿主测试兼容与 flow 记录，已明确禁止擅自清理；发现小智源码拷贝没有 `.git` 且旧 build 绑定 `D:\oldxiaozhi\...`，已把建立可追溯基线和新路径重建列为前置门；DeskMate 迁移包虽有 60/60 和构建记录，但用户尚未亲自复验，保持为首轮任务。
- 下一步：新会话先只执行交接中的第 1～2 步——读取项目规则、核对三个起点、在 DeskMate 根重跑迁移后测试与桌面构建并由用户人工检查现有功能；迁移完整性确认前不修改两个固件。

## 2026-08-23 · Standalone repository migration

- 做了什么：从旧的混合学习仓库抽取 DeskMate 最新 Phase 3D 可运行代码，迁移到 `F:\Codex\deskmate`；建立英文目录结构、Project Flow 控制面、产品/架构/协议/测试/设计索引和新 Git 历史。
- 为什么：旧工作区包含空格、中文目录、课程资料、参考仓库和多个阶段任务，容易把构建产物、学习资料与正式产品混在一起。
- 怎么理解：`DeskMate` 现在是唯一产品边界；课程资料留在旧区域，外部固件只通过固定提交与协议文档引用。
- 主要产出：根目录应用源码，`flow/`，`docs/`，`design/`，`AGENTS.md`，`DESIGN.md`，`README.md`。
- 已确认基线：旧源分支 `codex/easyinput-desktop-continue`，提交 `25b52540e0ec3e129760b15f3591d286be41d31b`；迁移前 `npm test` 60/60、桌面构建通过。
- 新仓库验证：Project Flow 上游 Stop Hook 测试通过；`npm ci --include=dev` 通过；`npm test` 60/60；`npm run build:desktop` 通过；打包程序 `--deskmate-smoke-test` 退出码 0；提交候选不存在中文路径或常见密钥值。
- 外部事实：Maker 固件固定提交已公开板载麦克风 UDP 与厂商 HID 合同；当前产品仍默认电脑麦克风，真实 Agent 与未来硬件仍是模拟/待接入。
- 问题与解决：Windows tar 对中文路径解码失败，改用临时 Git worktree；Project Flow 测试缺少 jq，使用临时固定版本 jq 1.7.1 完成测试，不把工具带入仓库。
- 下一步：按 `flow/plan.md` 实现 Phase 3E 协议编解码和模拟板；有硬件的电脑最后做真机验收。
