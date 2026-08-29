# Lessons learned

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

# Windows foreground capture needs a bounded stabilization window

- `GetForegroundWindow()` can briefly return zero while Windows transfers focus between two visible applications. Two monitored DeskMate runs measured gaps of roughly 60-90 ms even though the user did not change targets during the subsequent voice operation.
- A single capture at shortcut dispatch can therefore lose the intended target. Capture should retry for a short fixed deadline and accept only the same visible HWND observed consecutively; output must still compare the captured HWND exactly and fail closed if it later changes.
- Active-window fallback UI must preserve the original failure reason. `no-captured-target` and `target-window-changed` have different causes and should not both be described as user-driven target changes.
