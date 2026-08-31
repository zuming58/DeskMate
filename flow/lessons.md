# Lessons learned

## Keep Agent identity separate from the hardware state vocabulary

- Symptom: a product may support Codex, Workbody, Hermes and other Agents, but the existing device contract intentionally carries only seven coarse states. Sending provider names or guessing the active provider from windows/processes would widen the privacy boundary and behave ambiguously when several Agents are open.
- Practice: keep the selected Agent identity and custom label local to the desktop, normalize all providers to the frozen state vocabulary, and expose a manual selector until real provider adapters and ownership rules exist. Let active voice work take priority over manual display requests.
- Rule: adding a provider must not create a new firmware state machine or leak provider identity to hardware. Identity selection, state inference and device rendering are separate responsibilities.

## Reference motion code is behavior evidence, not calibration evidence

- Symptom: the Xiaozhi reference contains nominal centers, ranges, GPIOs and direct LEDC initialization, so copying it would make a new product image move both servos immediately even though the real supply path, direction and mechanical limits remain unverified.
- Practice: audit the fixed reference first and reuse only bounded behavior such as per-axis limits, small steps and recenter semantics. Put power, common ground, center, direction and limits behind explicit product gates; keep the first motion package pure and disconnected from PWM.
- Rule: source-confirmed servo constants cannot become device-confirmed calibration. No production call site or actuator adapter is added until a user-present, recoverable electrical and mechanical calibration establishes the real values.

## Optional peripheral tasks must start after the transport baseline

- Symptom: T08 UART Link passed on the real two-board wiring, but the integrated T09 image showed a healthy idle OLED while EasyInput transmitted requests and received zero frames. The new image had started OLED initialization and its background task before installing the previously proven UART transport, and discarded both startup results.
- Practice: separate an optional peripheral's synchronous capability initialization from its worker-task allocation. Establish the required transport before allocating optional worker tasks, keep the capability state available for negotiation, and turn startup return values into a privacy-safe visible or status diagnostic.
- Rule: a visible optional peripheral is not evidence that the mandatory transport started. Integration tests must lock startup ordering, and optional display, animation or sensor tasks may not consume the transport baseline's resources or hide its initialization failure.

## A growing bounded status payload requires consumer-boundary regression vectors

- Symptom: firmware added privacy-safe T09 Link and Agent counters to an existing status JSON. The producer stayed below its 1024-byte buffer, but the Windows consumer silently retained the older 512-byte / 11-chunk limit and discarded the first 561-byte / 12-chunk response.
- Practice: define the producer's usable byte limit, derived maximum chunk count and per-kind limits once in the consumer protocol module. Test both the newly observed expanded payload and the exact reject boundary. Do not treat a successful full-config stream as evidence that the independent status stream is accepted.
- Rule: whenever fields are added to a bounded cross-end diagnostic payload, rerun a near-current-size golden vector through the actual native consumer. Sanitized counters must remain explicitly enumerated; raw JSON, user content and device identifiers must not be forwarded merely to simplify diagnosis.

## An app-only candidate must not hide a failed bootloader rebuild

- 现象：最终小智 T09 全量构建在 ESP-IDF 自带 bootloader 源码中触发 GCC 内部编译器错误，而产品源码、既有同源全量构建和独立 `app` 目标均正常。
- 做法：先明确失败发生在是否计划写入的对象。只有在同一固件源码已经通过完整构建、固定分区/bootloader 不变且本次授权明确为 app-only 时，才允许独立重建并验证 `app` 目标；必须把完整构建失败和 app-only 成功同时记录，不能把后者改写为全量构建通过。若 app 自身失败或 bootloader/分区也在写入范围内，立即阻断烧录。
- 规则：构建证据必须与实际写入范围一一对应；“app 候选可写”不等于“bootloader/整套镜像重新构建通过”。

## Compare partition-table semantics before hashing different read windows

- 现象：ESP-IDF 生成的 `partition-table.bin` 为 3072 字节，但从 Flash 分区表扇区读取 `0x1000` 字节会得到 4096 字节；即使有效表完全相同，整文件 SHA-256 也会因末尾 1024 字节擦除态 `0xFF` 而不同。
- 做法：先按项目合同核对地址和读取窗口，再解析两份表并比较有效分区条目；比较二进制时锁定生成文件的有效长度，并单独验证读取窗口剩余字节是否全部为 `0xFF`。任何真实条目、有效字节或填充值异常仍须 fail closed。
- 规则：不同长度的分区表文件不得只凭整文件哈希判定布局不一致；“有效表哈希 + 解析条目 + 尾部擦除态”必须作为一个完整校验门。

## Validate bounded input length before reading its discriminator

- 现象：Feature Report 归一化函数已经拒绝空指针，但在判断 `length == 0` 前先读取了 `buffer[0]`；正常平台回调不会传该组合，Host 边界仍允许零长度非空缓冲暴露逻辑越界。
- 做法：所有由 `buffer + length` 表示的协议输入都先统一验证空指针、零长度和最小头长度，再读取 Report ID、magic 或版本等判别字节；测试同时覆盖 null、zero-length、截断和正常最短帧。
- 规则：有界协议解析的第一条语句不能依赖尚未验证的判别字节。任务卡声称的 timeout、stale ACK 等失败向量也必须在真实测试清单中逐项存在，不能只由相邻的 disconnect 用例代替。

## HID Feature reports use the top-level collection length on Windows

- 现象：冻结的 `0x12` 业务 payload 只有 16 字节，但同一 HID 顶层集合还包含
  更大的 63 字节 Feature payload；如果 Windows 只向 `HidD_SetFeature` 传
  `report ID + 16`，平台合同和设备实际 callback 形态会不一致。
- 做法：从 `HIDP_CAPS.FeatureReportByteLength` 锁定 Windows 写入缓冲长度为
  64，前 17 字节放 report ID 与业务字段，其余 47 字节全零。固件在 TinyUSB
  边界同时接受独立/内嵌 report ID 的紧凑和补零形态，并严格拒绝非零 padding。
- 规则：HID 业务 payload 长度与 Windows 顶层集合传输长度必须分开记录；
  黄金向量既要锁语义字节，也要锁平台补零和 callback 归一化，不能让填充进入
  业务协议或被宽松忽略。

## Optional capability failure must not tear down the transport baseline

- 现象：小智显示端按冻结合同在 OLED 初始化或渲染失败时移除 DISPLAY enabled，但保留 CORE、AGENT_STATE 与 Link；EasyInput 首版却把 DISPLAY 当成能力握手的硬条件，并沿用不含显示状态位的旧掩码，导致合法显示降级会被误判成整条 Link 失败。
- 做法：把“建立基础链路所需能力”和“执行当前命令所需能力”分开验证。握手只要求 CORE+AGENT_STATE；发送显示状态时再要求 DISPLAY；对端的显示 enabled/fault 状态位单独纳入当前切片的严格掩码。用 implemented `0x07`、enabled `0x03`、status `0x81` 的跨端向量证明链路保持 connected 且状态发送失败关闭。
- 规则：新增可选下游能力时，不得把它自动提升为传输层生存条件。两端审计必须覆盖健康、未实现、暂时禁用和运行时故障四种能力矩阵，并分别验证“链路是否存活”与“动作是否允许”。

## UART signals are crossed by direction, not matched by label

- 现象：两块板分别单独通过 UART/协议检查，但板间 Link 一直超时；物理线最初接成 RX→RX、TX→TX。
- 做法：始终按发送者与接收者写完整关系并交叉连接：EasyInput TXD0→小智 RX、EasyInput RXD0←小智 TX，同时保留 GND 共地和 3V3 悬空。纠正后 Link 立即进入 connected，收发计数持续增长，小智重启后也能自动重连。
- 规则：UART 接线说明和验收记录不得只写“RX/TX 三根线”或“同名相接”；必须写明两端角色、方向和禁止连接的电源脚。两端单板自测通过不能代替方向正确的板间验收。

## A protocol UART must have one owner and no console bytes

- 现象：EasyInput 的 J4 使用 UART0，而 ESP32-S3 的应用日志、bootloader 日志和 ROM 启动字符也可能占用同一线路；只把协议任务接到 GPIO43/44 并不能保证对端收到的都是协议帧。
- 做法：通过 `sdkconfig.defaults` 关闭应用控制台、secondary console、bootloader 日志和默认日志，把 UART0 的初始化、收发、解析和请求生命周期集中到一个任务；不写 eFuse，因此仍把不可逆关闭 ROM 日志之外的启动字符视为噪声，由两端流式解析器按 magic、长度、CRC 和 100 ms 字节间超时恢复同步。UART 初始化失败只降级 Link，不影响输入等已锁定能力。
- 规则：共享串口协议必须同时冻结“谁拥有端口”和“线上还可能出现什么字节”；关闭日志不能替代有界、可恢复的解析器，解析器绿测也不能冒充两块板已完成电气连接。

## A configuration save acknowledgement is not a read-status failure

- 现象：固件已经返回保存 ACK，实体功能和重新进入页面后的读取都正常，但保存页因为紧接着的第一次回读超时，把“键盘系统”和“同步结果”一起显示成失败。
- 做法：主进程在保存 ACK 后执行有界回读重试，指纹不一致仍立即失败关闭；renderer 分开维护板上配置读取状态与本次同步状态。ACK 后若重试仍不可读，只显示“已保存，回读待确认”，不得冒充完整验证成功，也不得把既有读取状态改写成读取失败。若 ACK 本身超时，只有随后完整回读与写入前已确认不同的预期指纹精确一致时才转为成功，否则继续报告失败。
- 规则：涉及持久化的 UI 必须区分“写入未发生”“写入已确认但回读未完成”“写入并回读一致”三种状态；不能用一个布尔值同时表示传输、持久化和读取健康。

## Repeated process startup must stay out of the voice output critical path

- 现象：转写完成后长时间停留在“正在写入目标窗口”，实际输出阶段先启动一次 PowerShell 查询前台窗口，再启动一次 PowerShell 发送粘贴键。
- 做法：本机实测空 PowerShell 冷启动平均约 1.35 秒，因此仅从两次减到一次仍不足。录音触发时和输出阶段都改用同一个常驻原生输入桥：即时捕获临时窗口句柄，输出时核对该精确句柄并用 `SendInput` 发送 Ctrl+V；命令不携带剪贴板文字、窗口标题或进程路径。目标变化、超时、部分发送或 helper 失败继续 fail closed，显式释放 modifier 并回退剪贴板。
- 规则：用户可感知的语音输出关键路径应把外部进程启动次数当作明确性能预算；合并调用时不得删除原有目标身份核对或失败回退。

## Bounded firmware configuration parsing must avoid a whole-document dynamic DOM

- 现象：普通按键配置可运行，但加入 Host Action 后保存会让按键和灯效停止；配置已经写入 NVS，完整重启又会在启动加载时重复触发。
- 根因：最多 2048 字节的配置在 ESP-IDF `-fno-exceptions` 环境中被递归解析成含 `std::string`、`std::vector` 的完整动态对象树，并在保存、回读、应用和启动恢复阶段连续重建。Host 上通过的小配置无法覆盖目标机的递归栈和动态分配压力。
- 做法：保留完整原始 JSON 作为无损存储真相，先做严格 UTF-8/JSON/深度验证，再以有界扫描器只提取冻结路径的运行时投影；未知字段、多 Profile、网络和音频字段继续原字节保存。Host 回归必须使用接近 2048 字节的真实配置，贯穿分块写入、双槽保存、回读、完整读取和模拟重启，并从 ESP32 ELF核对关键解析函数栈帧。
- 规则：固件中的有界输入不等于可以安全构造完整动态 DOM；涉及保存后重启恢复的配置功能，测试数据必须接近协议上限并覆盖完整生命周期，不能只测短样例的单次解析。

## A passing HID model test does not prove the real callback boundary

- 现象：Feature Report 两种 ID 形态和 `0x04` 多分块 completion 的 Host 测试均通过，两个 app 镜像真机仍在能力读取阶段超时；独立原生桥只看到设备连接，看不到第一条进度事件。
- 做法：把链路拆成 `HidD_SetFeature → TinyUSB set callback → owner queue → first input report → transfer callback → Windows Raw Input` 六个可观测边界，先定位第一处缺失再修改。测试必须使用真机观察到的 callback 长度和 Report ID 形态，不能由生产假设反向制造“黄金向量”。
- 规则：同一 HIL 症状连续否决两个候选后立即停止烧录；下一候选必须带真实边界证据、固定 Maker 差异和缺失测试向量。

## TinyUSB Feature Report callbacks must normalize Windows report-ID delivery

- 现象：Windows `HidD_SetFeature` 返回成功、设备枚举和普通 HID 均正常，但 `0x13` 配置读取静默超时；只测“Report ID 由 callback 参数单独给出”的 Host 向量无法复现。
- 根因：同一 Feature Report 可能以两种 TinyUSB callback 形态出现：Report ID 单独传入，或 Report ID 位于 `buffer[0]`。固定 Maker 的状态请求解码器明确兼容两者，DeskMate 第一版 T05 漏掉了内嵌形态。
- 做法：在 callback 边界先归一化 Report ID/载荷，拒绝冲突 ID、未知 ID、越界长度和非零填充，再把固定长度载荷复制给唯一 owner；Host 测试必须同时覆盖独立 ID、内嵌 ID、填充上限和冲突输入。涉及 Windows HID 行为时，参考审计不能只看协议字段，还要核对平台适配器的输入形态兼容。

## ESP-IDF fixed task stacks cannot carry configuration aggregates

- 现象：T05 旧镜像在 app_main 首次 NVS 加载时重启；大容量 ConfigLoadResult、ConfigSlotRecord、legacy JSON 和保存结果沿调用链落入主任务或 4 KiB owner task 栈。即使局部声明很短，aggregate = {} 也可能生成同尺寸隐式临时对象。
- 做法：把有界配置工作区放入唯一 owner 的静态成员或静态缓冲，函数通过调用方提供的结果/工作区写入；用 Host source-contract 禁止大对象回到 app_main、配置 owner 或输入 owner 栈，并从最终 ELF 读取真实栈帧。
- 规则：ESP-IDF 栈预算必须按编译后的栈帧和隐式临时对象验证，不能只看源码或盲目增大任务栈；配置/NVS 失败仍须 fail-soft，不得以启动崩溃换取恢复。

## Maker reference logic must be consulted before inventing a replacement

- 现象：T03 早期多轮修复围绕新 HID lifetime 的全零报告、mount 顺序、transfer-complete、GPIO40 DCD 重连和重复释放反复试验，Host 测试可通过但真机仍在第二次或后续断线留下 Ctrl。
- 做法：先固定读取 Maker 提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的相关 `usb_hid`、keymap、held state、queue 和 host test，再判断产品合同是否适合采用其结构。最终采用的是 Maker synthetic `HidTap` 的 bounded press→restore 思路，按 DeskMate 合同独立重实现；不复制 Maker 运行时、工作区未提交内容或 build 产物。
- 规则：后续固件问题先做参考实现的行为核对和差异说明，再提出最小产品侧改动；参考逻辑不是盲目照搬，但不能在没有核对已有成熟路径前重复猜测。
- 止损门：若首个候选被真机证据否决，而固定参考覆盖同一子系统，下一候选开工前必须完成参考源码/测试差异表并补缺失向量；不得连续提交第二个猜测性修复。参考实现不适合产品合同时，也要先写明“不采用什么、为什么”。
- T05 再次验证：候选自行实现的简化 JSON/`std::stoi` 解析在 71/71 常规测试通过时仍可被畸形数值、UTF-8、转义和嵌套结构击穿，而 Maker 固定提交已经有非抛异常解析和完整负向用例。以后“参考优先”必须发生在写生产代码之前：先把适用的参考失败向量变成本仓红测，再做独立实现；不得等审计发现后才回头读参考。

## Firmware image hashes are not reproducible while compile timestamps are enabled

- 现象：原主电脑在精确 `5c09880`、ESP-IDF v5.5.5 和相同依赖下干净重建，app 大小仍为 `0x37310`，但 SHA-256 与已烧录镜像不同；生成配置显示 `CONFIG_APP_COMPILE_TIME_DATE=y` 且未启用 `CONFIG_APP_REPRODUCIBLE_BUILD`。
- 做法：把“源码提交可重建”和“已烧录二进制逐字节可复现”分开陈述。下一次申请烧录前启用并验证可复现构建，或明确保存受控、脱敏的发布产物与 manifest；在此之前不得用同提交的新构建哈希替代已烧录镜像哈希。

## T03 reconnect evidence must separate monitored and user-observed facts

- 现象：五次 HIL 中，前两轮由 Raw Input/PnP 诊断记录了连接状态和键事件，后三轮由用户连续完成后统一报告通过；诊断程序不能读取固件 HID 报告字节。
- 做法：交接文档分别标记底层监控证据与用户可见结果，不把未采集的每一轮报告伪装成监控事实；只有五次完整用户结果和既有功能回归共同通过后才关闭 T03。

## A new HID lifetime cannot reliably release an old lifetime's modifier

- 现象：Windows 已经从旧 USB HID lifetime 接收 Ctrl-down 后，物理移除设备再枚举同 VID/PID 的新 lifetime；新设备发送一次或反复全零报告、等待 TinyUSB transfer-complete，甚至显式 DCD disconnect/connect，仍可能留下旧 Ctrl。第一次通过、后续失败只是 PnP/消费时序差异，不能当作修复证据。
- 做法：没有持续 hold 产品语义的命令键应在旧 lifetime 存活时完成 press→restore，并原子预留两份 FIFO 报告；恢复帧必须精确恢复并发 held snapshot，而不是无条件全零。只有 PTT 等确需持续 hold 的键保留 stateful down/up，断线时继续 fail closed 并通过真实 HIL 验证。

## USB unplug HIL must model MCU cold boot, not only logical remount

- 现象：同一个运行时对象上的 unmount→mount Host 测试和 mount 首帧全释放都通过，但实体 USB 拔线会同时切断板子供电；修复版真机仍复现 Windows modifier 粘连。
- 做法：断线合同的自动化必须另建“固件状态全部丢失、上电时实体键已经按住”的冷启动向量，并验证初始物理采样、TinyUSB ready、传输完成、抑制期和实体释放之间的先后关系。测试通过前只能把冷启动基线遗漏标为假设，不能以同一对象 remount 代替真实断电证据。

## USB HID remount must explicitly clear host-visible modifiers

- 现象：组合键按下时直接拔掉 USB，固件虽在 unmount/mount 清空内部队列和 held source，Windows 仍可能保留旧设备最后一次看到的 modifier；重新连接后普通字母会继续表现为 `Ctrl+A` 等组合键。
- 做法：每个新的 mount epoch 在接受新实体输入前，先由唯一 USB owner 发送一份显式全释放键盘报告；同时清空旧报告/滚轮队列，并继续抑制重连时仍按住的实体键，直到它真实释放。Host 测试要锁定“按住 modifier 拔线 → 重连首帧全释放 → 释放旧键 → 新输入正常”。

## Electron app identity changes strand encrypted user data

- 现象：项目迁移或打包名称变化后，Electron `app.getPath("userData")` 可能从旧 profile 切到新 profile；`safeStorage` 密文仍在旧目录，但当前应用的状态和凭据从新目录读取，于是用户明明“以前配置过”，新版本仍表现为未配置。
- 做法：发布前冻结 app identity 和 user-data 目录；必须改名时设计显式、可审计且经用户确认的一次迁移，先只比较记录存在性和 schema，不输出或写日志记录密钥。未实现迁移时让用户在当前应用重新保存自己的 Key，不静默复制密文，也不要把所有配置/请求错误压成同一条等待文案。

## A new ESP-IDF build directory can still reuse a stale source sdkconfig

- 现象：仅更换 `-B build-*` 目录时，ESP-IDF 仍默认读取源码根下被忽略的 `sdkconfig`；新增 `sdkconfig.defaults` 不会自动覆盖旧生成值，导致“全新 build”继续使用旧分区表。
- 做法：需要验证 defaults 的隔离构建时，显式把 `SDKCONFIG` 指向新构建目录内的新文件；对分区、Flash 大小等恢复性合同同时增加 CMake fail-closed 检查和 Host source-contract 测试，不能只看 build 目录名称。

## First-flash review must diff the live partition table

- 现象：应用能够构建且空间充足，不代表烧录安全；T03 默认 1 MiB 表与实板 3 MiB factory + 双声音 bank 不同，直接执行标准 `flash` 会在功能代码正确的情况下破坏存储合同。
- 做法：首次烧录先整片备份，再解析并逐项比较实板与候选分区表；保留布局时要求生成二进制逐字节一致，并证明 bootloader、partition table、app 三段写入不触及 NVS/PHY/资源 bank。

## Cross-task lifecycle callbacks must preserve order

- 现象：用多个独立布尔 pending 标志把 mount/unmount 等 callback 交给 owner task，会把同一消费周期内的不同先后序列压成同一个集合；固定处理顺序可能让最终状态与最后一个真实事件相反。
- 做法：跨 task 的生命周期变化使用有界有序事件、单调序列或可证明等价的状态机；测试必须同时覆盖 A→B 与 B→A、重复事件和旧 lifetime 完成回调，不能只分别调用单个 callback。

## Golden vectors must compare the complete artifact

- 现象：抽查少量 descriptor 索引或只解析 Report ID/长度，无法阻止 endpoint、attributes、usage、logical range、flags 和顺序在未覆盖位置漂移，却容易被误称为“精确黄金向量”。
- 做法：黄金向量先对生产使用的完整 bytes 做逐字节比较，再增加语义解析作为第二层断言；两层证据分别回答“是否完全相同”和“为何符合合同”。

## Windows paths and archives

- 现象：包含中文路径的 Git tar 在 Windows `tar.exe` 解包时可能出现乱码和损坏提示。
- 做法：正式项目使用英文目录；需要读取旧提交时优先使用临时 Git worktree，而不是经 PowerShell 管道传输二进制 tar。

## Build directory locks

- 现象：运行中的 `DeskMate.exe` 会锁住 `release/win-unpacked`，导致 electron-builder 报 EBUSY。
- 做法：打包前关闭正在运行的 DeskMate，再重试构建；不要把它误判为源码错误。

## ESP-IDF toolchain activation is process-local

- 现象：新的 PowerShell 工具进程中直接运行 `cmake`、`ctest` 或 `idf.py` 可能提示命令不存在，即使此前另一个终端已经激活过 ESP-IDF；PowerShell 的 `$LASTEXITCODE` 也不能可靠代表“命令未找到”这一类调用失败。
- 做法：每个执行 ESP-IDF/Host 验证的新进程先显式加载冻结版本的环境入口，再检查工具版本；命令链同时检查 PowerShell 成功状态或直接抛错，不凭陈旧的 `$LASTEXITCODE` 宣称测试通过。

## Overflow recovery must discard incomplete event history

- 现象：输入 ring 已满时，如果只发送全释放报告、随后继续消费 ring 中旧事件，被丢弃的 Release 之前残留的 Press 会再次生成 key-down，造成粘键。
- 做法：任何输入事件丢弃都会让剩余事件序列失去完整性；owner 必须先丢弃整个 pending ring，再用当前实体采样重建 suppress/release 状态，并以“松开事件被丢弃”的端到端测试锁定。

## npm production defaults

- 现象：部分电脑的 npm 全局配置偏向 production，导致缺少开发依赖。
- 做法：使用 `npm ci --include=dev`。

## Hardware evidence

- 现象：Windows 枚举到 HID 或网络可用，不等于板载麦克风或厂商协议已经连接。
- 做法：界面分别展示 HID、电脑麦克风、板载音频、千问和输出状态；只有协议握手成功才声明真实连接。

## Clipboard success must be observed

- 现象：渲染进程直接调用 `navigator.clipboard` 并吞掉异常，会在系统拒绝写入时仍提示“已复制”。
- 做法：通过受控 Electron 剪贴板桥执行写入，只在返回成功后显示成功；失败保留原文并给出可见错误。

## Global workflows cannot be page-owned

- 现象：VoiceWorkflow 只在语音页挂载时，全局按键不得不先切页，既抢焦点又可能丢事件。
- 做法：全局控制器在应用生命周期内保持单例挂载，页面只决定内容是否可见，底部胶囊独立展示实时状态。

## Whole-document device configuration needs read-modify-write

- 现象：把“同步当前按键”误当成局部 patch，可能通过整份配置报告清空板上的 Wi-Fi 或音频设置。
- 做法：先读取完整配置并验证版本，再只替换用户确认的字段、展示差异、写入并核对保存确认；闭环未完成前阻止写入。

## Three-end work needs feature-package gates

- 现象：桌面、总控和云台若同时改十个无关功能，失败后无法判断是状态机、传输、路由还是执行端回归。
- 做法：按相似能力组成小包；每包立刻跑定向测试、连通测试和旧功能全量回归，证据完整后锁定。失败就留在当前包修复，不把新功能叠上去。

## Queue capacity and callback epochs must share production truth

- 现象：使用“空槽区分空/满”的环形队列时，存储长度 16 实际只有 15 个可用槽；如果 callback 忽略 publish 失败，关键生命周期事件会静默消失。另行复制一套测试处理器或由 callback 与 owner 分别推进 epoch，也会让测试通过但生产状态分叉。
- 做法：声明容量 N 时为 sentinel 另加一个存储槽，并对满队列做饱和计数与 fail-safe 状态重建；callback 状态生成和 owner 消费逻辑必须是 Host 测试直接调用的生产实现。重复事件、真实 remount、第 N 条、第 N+1 条和溢出恢复都要作为边界向量锁定。
# 2026-08-28 · Whole-worktree copying destroys provenance

- 直接把一台电脑的整个项目目录覆盖到另一台，会把过期 build、sdkconfig、未跟踪审计文档和远端状态混在一起，既拖慢审计，也无法证明哪个提交生成了镜像。
- 处理方式是把生成物移入 Git 忽略的待删除目录，仅保留可追溯源码/文档；此后只用 Git 提交交换，并在干净 HEAD 后重新构建烧录镜像。

## Performance changes must preserve a HIL-proven Windows focus boundary

- 现象：语音输出的 PowerShell 路径已经在真机上成功写回目标窗口；为减少约 1.35 秒进程启动耗时，将目标捕获和粘贴迁移到常驻原生桥后，连续候选均出现“目标窗口已变化”并回退剪贴板。250 ms 稳定采样虽通过自动化，也没有修复用户现场失败。
- 做法：性能优化不能在缺少等价 HIL 的情况下替换已通过的跨进程焦点边界。候选被真机否决后，应恢复最后已知稳定实现，再单独设计可观测、可回滚的性能改进；自动化只证明失败关闭和调用形态，不能代替真实 Windows 焦点/输入注入验收。
