# Progress log

> 最新记录置顶。这里是跨电脑、跨 Agent 的事实交接入口。

## 2026-08-27 · T05 second rework awaiting independent audit

- 分支：`codex/easyinput-t05-config-nvs`，基于原候选 `a795d309cb88a3a740c25c159e132609e1583d73`，未合并或 rebase `main`。
- 本轮关闭：`config-snapshot` 作为控制事件传递；旧整份 `syncKeyboardConfig` IPC fail closed 且 renderer 不再暴露；preview 前重读设备；原生读取绑定 textual/numeric request ID、严格递增与 duplicate-last 幂等、冲突/旧块/超长拒绝；配置 NVS 工作移入独立 `config_owner` 队列；旋钮配置的按压 chord、cursor HID 方向和既有 router 路由。
- 新增测试：桌面 `config-snapshot` parser/filter 控制链回归；桌面全量 `71/71`；固件 Host CTest `6/6`；精确 ESP-IDF `v5.5.5` / `esp32s3` build 通过，app `0x49210` 字节。
- 状态：`REVIEW_CHANGES_REQUIRED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED` / `HIL_NOT_AUTHORIZED`。严格 JSON/UTF-8/schema 异常矩阵与 NVS 掉电/故障注入仍需原主电脑第二轮独立审计，不能锁定 T05。
- 安全：未扫描端口、未识别设备、未读写 Flash/NVS、未烧录、未擦除、未 monitor、未 HIL；不得开始 T06。

## 2026-08-27 · T05 implementation pass awaiting independent audit

- 做了什么：在 `codex/easyinput-t05-config-nvs` 上完成 `CONFIG_V1_FROZEN` 的第一版实现：0x10 分块写入、0x13/0x11 kind 0x06 完整读取、CRC16、静态 callback 命令队列、输入优先的配置响应 transfer 生命周期、纯 HID 配置投影、双槽 `deskmate` NVS 事务/回读/marker 恢复、只读 legacy 导入，以及 Electron 主进程的脱敏读取、严格白名单合并和确认 token 接口。
- 来源与边界：依据 Maker 固定提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的配置 receiver/payload/state/status/NVS 行为审计重实现；未修改或复制两个外部参考目录。T06 Host Action/固定文字执行、BLE/Wi-Fi、音频、DeskMate Link、桌面 UI 业务均未实现。
- 验证：已激活并真实检查 `ESP-IDF v5.5.5`、Python `3.11.15`、target `esp32s3`；`cmake`/`ctest` 6/6 Host tests 通过；隔离目录 `firmware/easyinput-controller/build-t05` 的 `idf.py -C firmware/easyinput-controller -B firmware/easyinput-controller/build-t05 build` 通过，应用镜像 `0x48e00` 字节，最小 factory app 余量 91%。
- 状态：`REVIEW_CHANGES_REQUIRED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED`，等待原主电脑独立审计；当前未执行端口扫描、设备识别、Flash/NVS 读写、烧录、擦除、monitor 或 HIL。
- 交接：详见 `docs/handoffs/second-computer-t05-config-nvs-implementation-2026-08-27.md`。

## 2026-08-27 · T04 locked and T05 configuration/NVS opened for the second computer

- 做了什么：依据用户确认的完整压力矩阵，把 T04 从 `PENDING_HIL` 锁定为 `AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_CONFIRMED / T04_LOCKED`，并将 `codex/easyinput-t04-input-led-feedback` 快进合入 `main`。已验收固件源码 HEAD 为 `75c65788524523325a4526718ad865ddf9f7a072`，app SHA-256 为 `578A73E8E5FEB675096DAC88F4A512D3EF5CAFE2604D4ED869F457648E45813C`。随后冻结 `CONFIG_V1_FROZEN`，完成 T05 Maker 配置/NVS 差异审计、任务卡和第二电脑交接；准确的 GitHub `origin/main` 交接哈希随本次提交推送结果和用户复制文字交付。
- 为什么：T04 的 S1～S7/旋钮灯效、长按、50 次输入、五轮断线、20 次语音键及 DeskMate 组合回归均已通过，继续停留在 T04 没有收益。T05 必须先解决 Maker 整份配置覆盖、`0x13` 只有状态指纹、未知网络/音频字段保护和掉电恢复，才能安全开放软件“同步到键盘”。
- 怎么理解：T05 复用 Maker `0x10` 写入兼容格式，新增冻结的 `0x13` flag `0x02` 完整读取和 `0x11` kind `0x06` 响应；Electron 主进程独占原始配置并做无损合并，固件使用 `deskmate` 双槽 NVS，旧 `ai_keyboard/config_v2` 只读导入且禁止 `nvs_flash_erase`。本包只激活纯 HID 映射；固定文字、Host Action/打开应用及其他 Windows 动作统一留到 T06。
- 产出路径：`docs/testing/t04-input-led-feedback-acceptance-2026-08-27.md`、`contracts/deskmate-host/easyinput-config-v1.md`、`docs/provenance/t05-easyinput-config-nvs-reference-audit.md`、`flow/tasks/T05-easyinput-config-nvs.md`、`docs/handoffs/second-computer-t05-config-nvs-2026-08-27.md`、更新后的 `flow/plan.md`、`flow/decisions.md`、T06 任务卡、文档索引和固件局部入口。
- 验证：T04 合并前确认 `main` 是分支祖先且两个工作树干净；固定 Maker 提交的 config receiver/payload/state/status、status HID、NVS store 和 Host tests 已只读核对。合并后固件 Host CTest 5/5、桌面 `npm test` 68/68、`npm run build:desktop` 和精确 ESP-IDF v5.5.5 / `esp32s3` 隔离构建通过；隔离构建逐项输出固定 NVS/PHY/3 MiB factory/双声音 bank。Markdown 链接、ASCII 路径、AGENTS/CLAUDE 一致、密钥/构建产物和 `git diff --check` 继续作为提交门。本轮没有扫描端口、识别设备、读取或写入 Flash/NVS、flash、erase 或 monitor。
- 问题解决：完整配置中的 Wi-Fi/音频/未知字段不会进入 renderer 或被局部 JSON 覆盖；NVS 不再采用单槽写入或初始化失败整片擦除；T05 与 T06 按“纯 HID 配置”及“Windows 主机动作”拆包，避免配置事务和应用执行同时扩大故障面。默认 IDF 构建首次被根目录旧 `sdkconfig` 的单分区值触发 fail-closed，未修改该生成文件，改用显式 `-DSDKCONFIG=<隔离目录>` 后按仓内 defaults 构建通过。当前样机 S8 仍是单板硬件阻断，健康替换板到货后补测，不修改八键/GPIO48 合同。
- 下一步：另一台笔记本从用户复制文字给出的准确 `origin/main` 全哈希创建 `codex/easyinput-t05-config-nvs`，按冻结合同完成固件、Windows 主进程/桥、React 脱敏 UI、Host/桌面/IDF 测试和自审，推送后立即停止；不得接触硬件、合并 `main` 或开始 T06。原主电脑随后独立审计，另行申请 app/NVS 备份、烧录与配置写入授权。

## 2026-08-27 · T04 independently audited and prepared for the clean release gate

- 做了什么：原主电脑在隔离 worktree 审查 `fbd4c20` 的完整 T04 diff、冻结合同、任务卡及固定 Maker 参考。确认 T03 语义事件先进入唯一 USB runtime，灯效随后异步消费；GPIO8 只有一个物理写入口，GPIO12 RMT、颜色/时序、fail-soft 边界和固定分区方向正确。审计补齐四 owner 的共享电源租约底座，使 `DeviceAwake`、LED 以及未来麦克风/扬声器具有同一所有权模型；本包仍未初始化音频。
- 为什么：T04 任务明确要求为后续音频保留共享电源所有权接口。原候选只有 Awake 常开动作，若直接烧录虽然灯效可能工作，但 T08 音频接入时需要重构 GPIO8 边界。小修现在完成并用 Host test 锁定，避免再次形成第二个电源 owner。
- 怎么理解：本轮没有改变 T03 输入/HID、灯色、动画、引脚、USB 身份或分区。文档把 RMT reset 从误写的 300 us 修正为两个 6000 tick 低半段、总低电平 600 us；发布清单同时增加当前干净 HEAD、工程路径、构建目录和 embedded app version 一致性校验，拒绝把旧构建冒充新镜像。
- 产出路径：`firmware/easyinput-controller/components/input_core/include/peripheral_power_lease.h`、对应实现与 Host test、`main/peripheral_power.*`、`tools/write-release-manifest.ps1`、`docs/reviews/t04-input-led-feedback-independent-audit-2026-08-27.md`、更新后的 provenance、T04 任务卡和本记录。
- 验证：精确 ESP-IDF v5.5.5 环境下 Host CTest 5/5；全新目录 `esp32s3`/Minimal build 通过且固定 16 MB 分区不变；桌面 `npm test` 68/68、`npm run build:desktop` 通过；`git diff --check`、ASCII 路径、构建产物忽略和固件局部 AGENTS/CLAUDE 一致通过。板级声明扫描 1 PASS/1 已知 constexpr 识别 WARN/0 FAIL，人工引脚复核通过。
- 问题解决：补上共享租约和 stale-build manifest 防线；未把小问题退回另一台电脑。最终提交后必须从干净 HEAD 双构建得到逐字节一致 app，生成忽略的 release manifest，再展示 app-only 烧录卡。未扫描端口、识别设备、读取 Flash/NVS、flash、erase、monitor 或 HIL。
- 下一步：状态为 `AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / PENDING_HIL`。干净 release gate 通过后向用户展示最终 HEAD、app SHA-256、`0x010000` 起的精确 app-only 范围和恢复边界；得到新的明确授权后才识别当前 EasyInput 并烧录。真机灯效与 T03 全回归通过后才能标记 `T04_LOCKED` 并开始 T05。

## 2026-08-27 · T04 input LED feedback passes development-laptop gates

- 做了什么：在 `codex/easyinput-t04-input-led-feedback` 按 `INPUT_LED_V1_FROZEN` 完成 T04。T03 已确认语义事件先进入原 USB runtime，再非阻塞发布到独立 LED 任务；新增 S1～S8 八色 140/35 ms 波纹、旋钮 160/40 ms 左右方向流、300/60 ms 按压脉冲、5 像素 GRB 序列化和最终黑帧。灯效使用最新事件优先的有界邮箱，初始化、邮箱或 RMT 失败只增加脱敏饱和计数，不改变 HID、输入 ring 或 USB 生命周期。
- 电源与传输：建立 GPIO8 唯一物理写入口。冷启动依次预装 GPIO8 inactive latch、将 GPIO9/10/12/13/14/15 置低并让 GPIO11 禁用/浮空、配置 GPIO8 output/high、用调度器阻塞至少 50 ms，再初始化 GPIO12 RMT。Awake 期间共享域保持开启，灯灭只发黑帧；未初始化麦克风、扬声器、I2S、BLE、Wi-Fi、NVS、分区或其他外设。RMT 固定 20 MHz、5 像素/121 symbols、WS2812 `6/18` 与 `16/12` tick；reset symbol 的两个低电平半段各 6000 tick，总低电平 600 us；一项 TX queue 和有界完成等待。
- 测试：在真实 `ESP-IDF v5.5.5` 环境的 CMake 3.30.2/MSVC 下执行规定的 configure、build、CTest，`input_core_tests`、`input_runtime_tests`、`led_feedback_tests`、`firmware_source_contract_tests` 共 4/4 通过。新增覆盖八色/时序/逐帧黄金向量、释放静默、长按、同时按键、最新事件替换、非法编码器半步、GRB、计时回绕、fail-soft 隔离，以及 GPIO8 顺序/唯一所有权、GPIO11、RMT 和固定分区源码合同。
- 构建：每个 PowerShell 进程先加载 EIM 登记的精确 v5.5.5 并真实运行 `idf.py --version`。使用全新隔离 sdkconfig 对 `esp32s3`、Minimal build 执行 `idf.py ... build` 通过；`CONFIG_APP_REPRODUCIBLE_BUILD=y` 已真实生效。dirty-tree 候选 app 为 `0x3E440`（255,040 bytes），3 MiB factory 余量 92%，只作为构建证据，不作为烧录授权镜像；分区表 SHA-256 仍为 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`。
- 来源与发布：逐目标文件来源、固定 Maker 提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`、PolyForm Noncommercial 1.0.0、ESP-IDF Apache-2.0、采用方式和排除项记录于 `docs/provenance/t04-easyinput-input-led-feedback.md`。新增 `tools/write-release-manifest.ps1`，只允许从干净 HEAD 生成不含本机路径/设备信息的 app 大小、SHA-256、写入范围和分区哈希清单；生成清单与镜像保持 Git 忽略。
- 自审：任务范围、板级声明、禁止运行时、AGENTS/CLAUDE 逐字一致、来源/许可证、密钥、ASCII 路径、构建产物忽略和 `git diff --check` 通过。固定参考只读 HEAD 正确；未修改 Windows、小智、DeskMate Link、冻结合同、T03 输入/USB语义或两个外部参考目录。
- 状态与下一步：仅声明 `TEST_CONFIRMED / BUILD_CONFIRMED / PENDING_INDEPENDENT_AUDIT_AND_HIL`。本轮没有扫描端口、识别设备、读取 Flash/NVS、flash、erase、monitor 或 HIL。提交推送后从最终干净 HEAD 再构建并生成 release manifest；原主电脑仍须独立审计、重建并展示最终 HEAD、app SHA-256、app-only 范围和恢复方案，取得用户明确授权后才可烧录。T04 锁定前不开始 T05。

## 2026-08-27 · T04 rebased to physical-input LED feedback and handed to the second computer

- 做了什么：按用户新增需求固定读取 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的 `input_feedback`、`led_strip_status`、`peripheral_power` 与对应 Host tests，确认原功能是 GPIO12 上 5 颗 GRB WS2812：S1～S8 八种低亮度 140 ms 波纹、旋钮方向流和按压确认脉冲。现已冻结 `INPUT_LED_V1_FROZEN`，建立新的 T04 任务卡、参考审计和第二台电脑交接。
- 为什么：灯光能直接说明实体输入是否经过防抖被固件识别，尤其可区分当前样机 S8 的硬件无事件与上层动作失败；它是 T03 输入闭环的紧邻功能，应在配置/NVS 前独立完成。参考固件已经有成熟实现与测试，不能重复 T03 的从零猜测和多轮真机返工。
- 怎么理解：T04 只增加输入灯效与 GPIO8 最小共享电源安全底座，不改变 T03 HID。GPIO8 是 LED/麦克风/扬声器共享域，由唯一控制器在 Awake 期间保持开启；灯灭发送黑帧，不按键开关电源。音频、Boot/连接/Agent 灯效和配置均不进入本包。原配置/NVS 顺延为 T05，Host Action/打开应用顺延为 T06。
- 产出路径：`docs/contracts/easyinput-input-led-feedback-v1.md`、`docs/provenance/t04-easyinput-input-led-feedback-reference-audit.md`、`flow/tasks/T04-easyinput-input-led-feedback.md`、`flow/tasks/T05-easyinput-config-nvs.md`、`flow/tasks/T06-easyinput-host-actions.md`、`docs/handoffs/second-computer-t04-input-led-feedback-2026-08-27.md`、`flow/plan.md`、`flow/decisions.md`、根级/固件局部规则和本记录。
- 验证：本轮只做只读参考审计和项目文档/合同变更；固定参考提交的关键源文件与测试已核对。执行 Markdown 相对链接、ASCII 路径、AGENTS/CLAUDE 局部一致、旧活动任务链接和 `git diff --check` 检查；未访问硬件，未扫描端口，未读取或写入 Flash/NVS，未 flash/erase/monitor，未修改固件或桌面代码。
- 问题解决：避免把灯效塞进配置事务导致故障面扩大；S8 仍保留 GPIO48/八键产品合同，当前坏样机没有稳定输入就自然不亮，不为灯效伪造事件。共享电源的 50 ms 等待明确只是同板固定参考的当前策略，仍需后续 HIL，而不是普适电气常数。
- 下一步：另一台笔记本从最新 `origin/main` 创建 `codex/easyinput-t04-input-led-feedback`，严格按 T04 任务卡完成代码、Host/source-contract tests、精确 ESP-IDF v5.5.5 构建、来源和自审后推送并停止；不接触硬件、不开始 T05。原主电脑随后独立审计、重建，并在另行取得 app-only 烧录授权后执行灯效与 T03 完整真机回归。

## 2026-08-27 · T03 independently audited, accepted and locked on the original computer

- 做了什么：原主电脑从 `origin/codex/easyinput-t03-cold-boot-reconnect@ed842aa` 建立隔离工作树，逐项审查 `39ac64e..ed842aa` 的合同、来源、28 个变更文件和最终 atomic tap 实现；固定读取 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的 `HidTap`、snapshot 与 FIFO 测试，确认 DeskMate 只采用行为结构并在自身单一路由/队列中清晰重实现。审计未发现阻断性代码问题，T03 现正式锁定。
- 为什么：此前 6～7 轮猜测性 USB lifetime 修复耗费大量时间，且 Host 通过仍被真机否决；本次把“参考优先、一次 HIL 失败后停止继续猜测”固化进根级和固件局部规则，避免 T04/T05 重复同类过程。
- 怎么理解：S1/S3 仍是 held PTT；S2/S4/S5～S8 在稳定按下时原子排入 press 与精确 restore，实体释放只 rearm。用户在最终 `5c09880` 镜像上连续五次得到 `123abc`；S8 仅是当前样机既有硬件阻断，软件八键/GPIO48 合同继续保留。T03 状态为 `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_CONFIRMED / T03_LOCKED`。
- 产出路径：`docs/reviews/t03-final-independent-audit-2026-08-27.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md`、`flow/tasks/T04-easyinput-config-nvs.md`、`flow/plan.md`、`flow/lessons.md`、根级及固件局部 `AGENTS.md`、固件 `README.md` 与本记录。
- 验证：精确 `5c09880` 干净工作树 Host CTest 3/3、ESP-IDF v5.5.5/esp32s3 构建通过，app 大小 `0x37310`，固定分区 SHA-256 仍为 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`；交接 HEAD `ed842aa` 再构建通过；桌面 `npm test` 68/68、`npm run build:desktop` 通过；板级扫描 1 PASS/1 已知声明识别 WARN/0 FAIL；范围、来源、ASCII 路径、构建产物和 AGENTS/CLAUDE 一致检查通过。没有访问或写入硬件。
- 问题解决：清除了返回文档中不应进入 Git 的端口/MAC 后缀；确认当前构建启用编译时间戳，所以同一 `5c09880` 的新构建大小一致但 SHA-256 不会复现已烧录镜像，不能把源码重建冒充逐字节镜像复现。该构建可复现性缺口已写入 lessons，须在下一次烧录前关闭。
- 下一步：另一台笔记本从锁定后的最新 `main` 建立 `codex/easyinput-t04-config-nvs`，先做 Maker 配置/NVS 参考差异表与 `CONFIG_V1_FROZEN` 合同评审，再编码；完成代码、自审和无硬件验证后推送并停止，由原主电脑独立审计、获授权烧录和真机回归，T04 锁定前不开始 T05。

## 2026-08-27 · T03 atomic HID tap passes five reconnect repetitions

- 结果：当前分支 `codex/easyinput-t03-cold-boot-reconnect` 的最终提交 `5c0988097c44194269bb1c7b23fa24277fae6680` 已烧录并完成 app-only 数据哈希校验。用户在正常断电重启后完成五次断线矩阵：记事本输入 `123`，按住 S6 拔 USB，保持按住重连，等待约 3 秒，松开 S6，再用电脑键盘输入 `abc`；五次均得到 `123abc`，未出现全选或 Ctrl 残留。第 1、2 轮由只读 Raw Input/PnP 监控同步确认，第 3～5 轮由用户连续操作后确认通过。
- 监控证据：第 1、2 轮均观察到 EasyInput 的 `Ctrl` 与 `C` 在约 5 ms 内成对 down/up，随后设备断开并重新连接；重连后的 `A/B/C` 均来自 `other-keyboard`。监控进程为只读诊断，未读取 Flash、未输出用户文本或设备敏感资料，测试完成后已停止。
- 根因与修复：旧版 stateful S6 在 HID lifetime 消失时可能只留下旧设备的 Ctrl-down；新 lifetime 的全零报告、重复释放、transfer-complete、GPIO40 DCD 重连均不能可靠替旧 lifetime 产生 Ctrl-up。最终按 Maker 固定提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 中 synthetic tap 的结构清晰重实现：S2/S4/S5～S8 在稳定 Press 时原子排入临时 chord 与精确 restore，S1/S3 仍为 held PTT。
- 本轮证据：Host CTest `3/3` 通过；精确 ESP-IDF `v5.5.5`、target `esp32s3` 构建通过，app `0x37310`（226,064 bytes），3 MiB factory 余量 93%；镜像 SHA-256 `82731f1a72892fcefedf3f3dc920013de8110c384cab2f6a0edea4ec97e2913e`。
- 烧录边界：仅向用户确认的 EasyInput 写入 app `0x010000..0x04730F`；工具按 4 KiB 扇区擦除至 `0x047FFF`，仍在 factory app 分区内。端口与硬件身份只保存在 Git 外私有恢复记录。未擦除整片，未写 bootloader、分区表、NVS、PHY、声音区或 eFuse。
- 状态：`TEST_CONFIRMED / BUILD_CONFIRMED / HIL_CONFIRMED / T03_COMPLETE`。S8/GPIO48 仍保留原软件合同，当前样机 S8 的既有硬件问题不纳入本次软件结论。T04/T05 尚未实现，资料已准备交还原主电脑独立审计。

## 2026-08-27 · T03 ordinary command keys reworked as atomic HID taps

- 根因：`cf9fdf8` 的 GPIO40/TinyUSB DCD 软断开/连接和 500 ms 全释放重申在第一轮真机断线测试仍留下 Ctrl。结合此前多轮监控，结论是新 HID lifetime 的零报告不能可靠替已经消失的旧 lifetime 产生 Ctrl-up；第一次偶尔通过只是 Windows/PnP 时序差异。固定 Maker 默认 S6 同样是 stateful down/up，不能直接解决该 HIL；可采用的是其独立 synthetic `HidTap` 的 press/restore 结构。
- 合同与实现：用户确认修订 `INPUT_V1_FROZEN`。S1/S3 继续 held PTT；S2/S4/S5～S8 在稳定 Press 上把临时 chord 叠加当前 held snapshot，并在现有 16 项 USB FIFO 原子排入 press 和精确 restore；实体 Release 只 rearm。只剩一个槽时整对拒绝并全释放恢复，不新增第二套输入状态机、USB owner 或传输。
- Host：精确 v5.5.5 环境下执行规定 CMake configure/build/CTest，`input_core_tests`、`input_runtime_tests`、`firmware_source_contract_tests` 共 3/3 通过。新增覆盖物理松键前已恢复、重复/rearm、S1 并发精确恢复、两槽准入、HID 延迟 ready、发送失败和旧 endpoint 最后完成报告为全零。
- 构建：`idf.py --version` 为 `ESP-IDF v5.5.5`，target `esp32s3`，Minimal build ON；隔离 sdkconfig 构建通过。dirty-tree app `0x37310`（226,064 bytes），3 MiB factory 余量 93%；分区仍为 NVS 24 KiB、PHY 4 KiB、factory 3 MiB、sound A/B 各 576 KiB。
- 来源与静态检查：逐文件来源更新于 `docs/provenance/t03-easyinput-usb-input-runtime.md`，固定 Maker 提交与 PolyForm Noncommercial 1.0.0 已记录；没有复制 Maker 复杂运行时或 build 产物。板级源码复核、任务范围、密钥、ASCII 路径、构建产物、AGENTS/CLAUDE 一致和 `git diff --check` 通过；未修改两个外部参考、小智、桌面、配置/NVS、音频、BLE/Wi-Fi、DeskMate Link 或分区。
- 状态：只能声明 `TEST_CONFIRMED / BUILD_CONFIRMED / T03_ATOMIC_TAP_PENDING_CLEAN_HEAD_AND_HIL`。本轮尚未扫描端口、识别设备、读取 Flash、flash/erase/monitor 或执行 HIL。提交推送并从干净 HEAD 重建后，必须展示最终 HEAD、app SHA-256 和 app-only 精确范围，取得针对该镜像的新确认后才可补刷；T03 通过前 T04/T05 关闭。

## 2026-08-27 · T03 battery-powered USB DCD reconnect candidate passes local gates

- 做了什么：在既有唯一 `UsbInputRuntime` 和 owner task 内修复电池供电拔插的底层 USB 生命周期。GPIO40 低有效 SEN_VIN 继续由 25 ms 稳定滤波确认；稳定失去 USB 时 owner 调用 TinyUSB `tud_disconnect()`，稳定恢复时调用 `tud_connect()`，平台动作失败会重试且重复状态幂等。mount、输入丢失恢复和无 Press owner 的实体释放还会在首份全零键盘报告完成后，以 25 ms 间隔做 500 ms 有界全释放重申；HID 未 ready 或首份报告仍在途时不会提前消耗该窗口。
- 为什么：监控已经证明旧连接发送过 S6 的 Ctrl+C，重枚举后 Windows 没交付对应 Ctrl-up；候选 `a97d85e`、`dd7bb69`、`8ce5712` 和 `16bad4f` 的应用层 mount/epoch/一次性零报告均在第二次断线矩阵失败。样机有电池，拔 USB 不会重启，而旧实现只撤销应用层 endpoint，未让 TinyUSB DCD 物理软断开；这会让底层端点状态跨拔插存活。本候选首次关闭该缺口，同时保留冻结的八键、默认动作和不重放 held chord 合同。
- 测试：在每个 PowerShell 进程加载 EIM 登记的精确 v5.5.5 环境后，执行任务卡规定的 CMake configure/build/CTest，`input_core_tests`、`input_runtime_tests`、`firmware_source_contract_tests` 共 3/3 通过。新增覆盖 DCD connect/disconnect 去重与失败重试、HID 延迟 ready 不消耗恢复窗口、25 ms/500 ms 精确边界、`uint32_t` 回绕、GPIO40 原始掉线幂等恢复和旧滚轮清除。
- 构建：`idf.py --version` 为精确 `ESP-IDF v5.5.5`，target `esp32s3`；隔离目录 `build-usb-lifecycle-v5.5.5` 全新构建通过。dirty 候选 app 为 `0x371E0`（225,760 bytes），3 MiB factory 余量 93%；分区仍为 NVS 24 KiB、PHY 4 KiB、factory 3 MiB、sound A/B 各 576 KiB。最终提交后必须从干净 HEAD 重建并重新计算 SHA-256 与 app-only 结束地址。
- 来源与安全：固定只读核对 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的 `board_pins.h`、`app_main.cpp`、`usb_hid.cpp/.h`、snapshot delivery 和 queue 代码；同时核对锁定 ESP-IDF/esp_tinyusb/tinyusb 的 VBUS、`tud_disconnect/connect` 与 DWC2 实现，逐文件采用方式见 `docs/provenance/t03-easyinput-usb-input-runtime.md`。未修改外部参考、小智、桌面、冻结合同、分区、NVS、音频或 GPIO8；未扫描端口、识别设备、flash、erase、monitor 或读取 Flash。
- 状态：只能声明 `TEST_CONFIRMED / BUILD_CONFIRMED / T03_USB_DCD_RECONNECT_PENDING_HIL`。T03 仍开放，T04/T05 关闭。提交、推送和干净重建后，必须先展示最终 HEAD、app SHA-256 和精确 app-only 范围并取得新授权，才可补刷并连续执行五次断线矩阵。

## 2026-08-26 · T03 cold-boot reconnect mount delivery rework passes local gates

- 做了什么：修复真实 TinyUSB mount 回调被 GPIO40 单次物理存在采样拒绝的生命周期缺口。mount callback 现在始终建立并发布新 endpoint epoch；GPIO40 只继续承担 25 ms 断开确认和旧生命周期撤销，不再伪造或丢弃 mount。增加有界的 mount/unmount/物理状态日志，未记录按键、报告内容或用户数据。
- 测试：Host CMake/build/CTest 3/3 通过（`input_core_tests`、`input_runtime_tests`、`firmware_source_contract_tests`）；新增回归覆盖 mount 到达时物理存在采样暂时为 false、没有第二个 mount callback 时全释放报告仍可在 HID ready 后交付，并更新 source contract 断言不再存在 `try_mount`。
- 构建：精确 `ESP-IDF v5.5.5`、target `esp32s3`，独立构建目录 `build-codex-v5.5.5` 通过；app `0x36EA0`（224,928 bytes），factory 余量 93%；最终干净提交构建后的 SHA-256 在本候选交接时记录；精确 app-only 范围为 `0x010000..0x046E9F`（结束地址含）。
- 静态与安全：`git diff --check`、T03 范围、ASCII 路径、来源/密钥/用户数据和构建产物检查通过；`firmware/easyinput-controller/AGENTS.md` 与 `CLAUDE.md` 逐字一致。未扫描端口、识别设备、flash、erase、monitor 或读取 Flash/NVS，未修改外部参考、小智、桌面、冻结合同或分区。
- 状态：只能声明 `TEST_CONFIRMED / BUILD_CONFIRMED`；T03 仍为 `T03_COLD_BOOT_MOUNT_DELIVERY_PENDING_HIL`，真机尚未验证，T04/T05 继续关闭。新镜像如需硬件验证，必须展示本提交 HEAD、SHA-256 和上述 app-only 范围后重新取得明确烧录授权。

## 2026-08-26 · T03 second reconnect still leaves Ctrl sticky after 8ce5712 flash

- 做了什么：用户授权后，将 `8ce571228c4814e684ea1d5119b21413c8bf8428` 的 app-only 镜像写入 `0x010000`，数据长度 `0x36DA0`，esptool 数据哈希校验通过；正常重启后 Windows 重新枚举 `VID 303A / PID 1006` Keyboard、Mouse 和 Vendor HID。完整证据写入 `docs/handoffs/t03-second-reconnect-failure-2026-08-26.md`。
- 真机结果：按 `123`→按住 S6→拔 USB→保持按住重连→等待 3 秒→松开→输入 `abc`，第一次通过，第二次再次发生 Ctrl 粘连，A 触发全选；立即停止，没有继续凑五次。
- 结论：`8ce5712` 的 mount 首帧全释放加持键重连二次全释放仍不是可靠 HIL 修复。Host 3/3 与 ESP-IDF v5.5.5 / `esp32s3` 构建证据有效，但不能覆盖真实失败；T03 状态为 `T03_HIL_FAILED_CTRL_STICKY_SECOND_REPETITION_AFTER_8CE5712_FLASH`，T04/T05 继续关闭。
- 下一步：先补真实 USB 生命周期的有界观测或更强 desired/accepted 键盘交付状态，确认 mount、`tud_hid_ready`、报告接受/完成/失败、GPIO40 物理存在和 Windows HID 消费的顺序，再提出新候选。新镜像必须重新展示 HEAD、SHA-256、精确 app-only 范围并重新授权；不再盲目重复烧录。

## 2026-08-26 · T03 cold-boot release reassertion candidate passes local gates; HIL pending

- 做了什么：在现有唯一 `UsbInputRuntime` 内补充有序的 mount 释放序列。每次真实 mount 先排一份全释放报告；若冷启动扫描发现实体键仍按住，首份报告完成后再排一份全释放报告，释放屏障完成前继续抑制按键和滚轮。普通空 mount 仍只发送一份零报告；unmount/reset 会清理序列状态。新增冷启动晚到扫描、重连持键、旧完成事件、实体释放后新 Ctrl+C 和滚轮不重放回归。
- 为什么：昨日监控确认 USB 确实重枚举，但重连后没有观察到 EasyInput Ctrl-up；TinyUSB transfer-complete 只证明控制器接受，不能证明 Windows 已消费并清除旧 Ctrl 状态。对持键重连重复一次全释放报告，补足现有状态机的主机清除窗口，不建立第二套输入状态机。
- 测试：Host CMake/build/CTest 共 3/3 通过（`input_core_tests`、`input_runtime_tests`、`firmware_source_contract_tests`）；`git diff --check`、AGENTS/CLAUDE 逐字一致、范围/密钥/构建产物检查通过。
- 构建：精确 `ESP-IDF v5.5.5`、target `esp32s3` 隔离构建通过，仓内分区为 NVS `0x9000/24K`、PHY `0xF000/4K`、factory `0x10000/3M`、sound A/B 各 576K；dirty 工作树候选 app `0x36DA0`（224,672 bytes），提交后从干净 HEAD 重建最终镜像并计算 SHA-256。
- 状态：只能声明 `TEST_CONFIRMED / BUILD_CONFIRMED`；T03 仍为 `T03_COLD_BOOT_RELEASE_REASSERTION_PENDING_HIL`，真机 Ctrl 断线矩阵尚未通过，T04/T05 继续关闭。未扫描端口、未识别设备、未 flash/erase/monitor、未读取 Flash/NVS，未修改外部参考、小智、桌面、冻结合同或分区。
- 下一步：提交并推送当前分支，干净 HEAD 重建后展示最终 HEAD、app SHA-256 和精确 app-only 范围；只有取得针对该新镜像的明确授权后才可进行硬件验证。连续五次 `123`→按住 S6→拔线重连→等 3 秒→松开→`abc` 全部得到 `123abc` 且旧功能回归通过前，不关闭 T03、不进入 T04/T05。

## 2026-08-25 · T03 monitored reconnect failure captured; no new flash

- 做了什么：在明确告知用户监控已启动后，运行一次有界的只读 `DeskMate.InputBridge --diagnose`，用户完成 `123`→按住 S6→拔 USB→保持按住重连→等待约 3 秒→松开→`abc`。结果仍为 Ctrl 粘连/全选；完整时间线记录于 `docs/handoffs/t03-cold-boot-reconnect-monitored-failure-2026-08-25.md`。
- 证据：`14:41:46.547` EasyInput 断开，`14:41:50.741` 完整重连；断开前捕获连续 EasyInput Ctrl+C down，重连后电脑键盘 A/B 为 `other-keyboard`，未见 EasyInput Ctrl-up。PnP/Raw Input 证明 USB 确实重枚举，但桥接器不能读取原始 HID 报告字节。
- 判断：T03 仍为 `T03_HIL_FAILED_CTRL_STICKY`。高可信方向是 TinyUSB transfer-complete 被错误当作 Windows 已应用全释放；重连首份全零报告可能与主机 HID 轮询/接口稳定存在时序竞态。该机制尚未由原始报告抓包最终证明，不能宣称已修复。
- 本次状态：撤回了本轮尚未验证的二次全释放实验改动，工作树保持仅有文档记录；没有构建、提交、烧录、端口识别、Flash/NVS 读写或 monitor。T04/T05 继续关闭。
- 明天起点：先补 Host 模型验证“实体仍按住的重连释放报告在 transfer complete 后重新确认”，对照 Maker 的 desired/accepted 传递语义做最小修复；通过 Host/IDF 自审后再申请新的烧录授权。

## 2026-08-25 · T03 reconnect transfer-identity rework passes Host and IDF gates; new flash authorization pending

- 做了什么：在既有唯一 `UsbInputRuntime` owner 状态机内修复 USB HID 在途报告身份竞态。TinyUSB 完成/失败回调现在复制 Report ID、payload 长度、payload 内容和当前 callback epoch；owner 只有在四项身份全部匹配时才退休队列头或执行失败恢复。新增旧连接 Ctrl 报告迟到、旧连接全零报告与新连接全零报告同字节、错误长度/Report ID 回归，保持实体按住期间 fail-closed，实体释放后强制追加全释放报告。
- 为什么：真机第二、三次断线仍出现 Ctrl 粘连；仅按 epoch/布尔在途标记不足以解释旧 endpoint 回调迟到。相同全零报告无法仅靠字节区分，因此额外验证即使旧全零误命中新 mount 首帧，实体按住仍不能解锁，必须完成释放后的第二帧全零后才接受新 Ctrl+C。
- 测试：精确 ESP-IDF v5.5.5 环境执行 Host CMake/build/CTest，`input_core_tests`、`input_runtime_tests`、`firmware_source_contract_tests` 共 3/3 通过；新增 stale completion/failure、同字节 zero、持键屏障端到端覆盖。
- 构建：`idf.py --version` 为 `ESP-IDF v5.5.5`；target `esp32s3` 隔离构建通过，app `0x36D10`（224,528 bytes），factory 余量 93%；分区仍为 NVS 24 KiB、PHY 4 KiB、factory 3 MiB、sound A/B 各 576 KiB。提交后从最终干净 HEAD 再建同一镜像并计算 SHA-256。
- 静态与安全：`git diff --check`、范围、ASCII 路径、来源、密钥和构建产物检查通过；未扫描端口、识别设备、flash、erase、monitor、读取 Flash/NVS，未修改外部参考、小智、桌面、冻结合同或分区。当前只能声明 `TEST_CONFIRMED` / `BUILD_CONFIRMED`，T03 保持开放，T04/T05 关闭。
- 下一步：提交并推送交接记录；展示最终 HEAD、app SHA-256 和精确 app-only 写入范围，取得新的明确烧录授权后才做硬件验证。旧授权不适用。

## 2026-08-25 · T03 GPIO40 physical USB lifetime rework passes Host gate; final build and authorization pending

- 做了什么：第二次真实断线复测再次出现 Ctrl 粘连后，保持 T03 开放并停止真机操作。固定读取 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`，确认 EasyInput V2 的 GPIO40 是低有效 USB/SEN_VIN 物理存在信号；在现有唯一 `UsbInputRuntime` 内清晰重实现 25 ms 断开确认、物理断开撤销旧 endpoint、物理恢复不伪造 mount，以及每个真实 TinyUSB mount callback 建立新 epoch。
- 为什么：板子可由自身电源继续运行，拔 USB 不保证冷启动，也不保证 TinyUSB 先回调 unmount；旧实现把重复 mount 当作幂等并完全忽略 GPIO40，可能沿用旧 endpoint lifetime，符合第一次通过、第二次失败的间歇性真机事实。
- 测试：Host CMake/build/CTest 3/3 通过。新增覆盖 GPIO40 低有效/25 ms 精确边界和计时回绕、物理不存在拒绝 mount、持续运行且缺失 TinyUSB unmount、物理恢复不 mount、不重放旧滚轮、真实重复 mount 推进 epoch、held S6 抑制、无 Press owner 的释放零报告、旧 completion/fail/stale mount，以及连续两个完整断线重连循环。
- 构建：精确 ESP-IDF v5.5.5 / `esp32s3` 隔离构建已通过，冻结分区仍为 NVS `0x9000/24K`、PHY `0xF000/4K`、factory `0x10000/3M`、sound A/B 各 576K；干净提交构建 app `0x36A50`（223,824 bytes），factory 余量 93%。文档状态提交后还需再重建一次最终镜像，当前不得复用旧授权。
- 安全边界：未扫描端口、识别设备、flash、erase、monitor 或读写 Flash；未修改分区、NVS、PHY、声音区、eFuse、小智、桌面、冻结合同或外部参考目录。本轮现已具备 `TEST_CONFIRMED` / `BUILD_CONFIRMED` 代码与构建证据；真机仍未验证，旧授权不适用新镜像。
- 下一步：完成来源/范围/密钥/ASCII/构建产物检查，提交并推送原分支，从干净 HEAD 重建 app，展示 HEAD、SHA-256 和精确 app-only 范围并重新取得授权。获授权补刷后连续五次 `123`→按住 S6→拔线重连→等 3 秒→松开→`abc`，任一次失败立即停止；T03 通过前不进入 T04/T05。

## 2026-08-25 · T03 cold-boot candidate fails second reconnect repetition after app-only reflash

- 做了什么：用户明确授权后，重新核对 `codex/easyinput-t03-cold-boot-reconnect@a97d85e9bbafc6d76a7942d381d360d5ebd58d56` 与 app SHA-256 `20B1AF1D66D092E3BF17D6A16C4A22FF18F0D269F63149A251C3A6C737ADCE31`，只把 223,456-byte app 写入 `0x010000..0x0468DF`，写入工具完成数据哈希校验。完整关机/正常开机后，Windows Keyboard、Mouse 与 HID 接口均以 `VID 303A / PID 1006` 正常枚举。
- 真机结果：按指定矩阵在记事本执行 `123`→按住 S6→拔 USB→保持按住重连→等待至少 3 秒→松开→电脑键盘输入 `abc`。第一次得到 `123abc`；第二次再次发生 Ctrl 粘连。测试立即停止，没有继续凑满五次。
- 结论：`a97d85e` 的冷启动实体快照/释放确认屏障仍不是可靠 HIL 修复，状态改为 `T03_HIL_FAILED_CTRL_STICKY_SECOND_REPETITION`。Host 3/3 与 ESP-IDF v5.5.5 构建证据继续有效，但不能覆盖真实失败；T03 不关闭，T04/T05 继续关闭。
- 安全边界：本次只写授权 app 范围；未擦除整片，未修改 bootloader、分区表、NVS、PHY、双声音 bank 或 eFuse，未操作小智。失败后未继续扫描端口、识别设备、monitor 或写 Flash。
- 下一步：先基于这次间歇性失败重新审计 TinyUSB transfer-complete 与 Windows 实际接收之间的证据缺口，以及断电/重枚举时序；建立能够复现“第一次通过、第二次失败”的更严格模型和可观测证据后再提出新候选。任何再次补刷都必须重新展示 HEAD、app SHA-256、app-only 范围并取得明确授权。

## 2026-08-25 · T03 cold-boot Ctrl release barrier passes Host and IDF build; authorized HIL pending

- 做了什么：从最新 `main@39ac64e2dbd099f9de076a019e456f822c683aef` 建立并继续 `codex/easyinput-t03-cold-boot-reconnect`。在现有唯一 `UsbInputRuntime` 中接入 `InputCore` 防抖后的八键实体掩码，并增加冷启动释放确认屏障：mount 首帧全释放之后，若启动时曾观察到按键按住，必须等实体键释放后追加的全释放报告收到 transfer-complete，才重新接受按键和滚轮。没有建立第二套输入状态机。
- 为什么：上一版只在 mount 时发送零报告，真实拔线会让 ESP32-S3 冷启动；S6 在第一次稳定扫描前已经按下时没有本次运行的 Press owner，后续释放可能没有第二个零报告，Windows 因而仍保留 Ctrl。
- 测试：精确激活 `ESP-IDF v5.5.5` 环境后执行 Host CMake/build/CTest，`input_core_tests`、`input_runtime_tests`、`firmware_source_contract_tests` 共 3/3 通过。新增回归覆盖 fresh InputCore/runtime 且 S6 上电已按住、mount 早于首次实体扫描、held 期间输入抑制、无 Press owner 的释放、HID 未 ready/延迟 ready、发送拒绝、transfer complete/failure、重复 mount、释放早于 mount 首帧完成、旧滚轮不重放，以及释放完成后的新 S6 才重新发送 Ctrl+C。
- 构建：在 ESP-IDF v5.5.5 / target `esp32s3` 下使用隔离 sdkconfig 重建成功；冻结分区为 NVS `0x9000/24K`、PHY `0xF000/4K`、factory `0x10000/3M`、sound A/B 各 576K。当前工作树预构建 app 为 `0x368E0`（223,456 bytes），factory 余量 93%；它只用于代码构建门，不作为最终烧录哈希，最终镜像将在干净提交 HEAD 上重建。
- 来源与范围：更新 `docs/provenance/t03-easyinput-usb-input-runtime.md`，本轮只修改 EasyInput T03 输入/runtime/Host test/模块状态与本记录；外部 Maker 与小智目录未修改、未复制，未使用其 build 产物。
- 硬件状态：尚未扫描端口、识别设备、flash、erase、monitor 或读写 Flash。本轮只声明 `TEST_CONFIRMED` / `BUILD_CONFIRMED`；必须先推送干净提交、重建最终 app、展示 HEAD/SHA-256/app-only 范围并取得用户明确授权，之后才可补刷和连续执行五次 `123`→按住 S6→拔线重连→等 3 秒→松开→`abc`。
- 下一步：完成静态检查、提交和推送；从干净 HEAD 重建最终 app 并申请 app-only 烧录授权。五次结果均为 `123abc` 且旧功能回归通过后才能关闭 T03 并进入 T04。

## 2026-08-25 · Second laptop continuation clarified: T03 then independent T04/T05, original computer audits later

- 做了什么：补充跨电脑交接的后半程，新增受门禁阻挡的 T04 配置/NVS 与 T05 Host Action 任务卡，并把第二台笔记本的叠加分支顺序写入 T03 交接：先修并锁定 T03，再独立完成 T04、T05 的合同冻结、开发、自审、获授权真机验收和推送。
- 为什么：上一版交接只强调“T03 失败时不得提前做 T04/T05”，容易被理解成另一台电脑永远不能继续；用户的真实安排是硬件临时随笔记本外出，由那台电脑连续推进三包，回来后再由原主电脑做独立综合审计。
- 怎么理解：门禁顺序没有放松。T03 未通过不能进入 T04；T04 的完整配置读取合同未冻结，固定 Maker `0x13` 状态/指纹不能冒充完整配置；T05 必须建立在锁定的 T04 上。另一台电脑使用 T03→T04→T05 三个叠加分支，不合并 `main`、不开始 T06。
- 产出路径：`flow/tasks/T04-easyinput-config-nvs.md`、`flow/tasks/T05-easyinput-host-actions.md`、`docs/handoffs/second-computer-t03-cold-boot-reconnect-handoff-2026-08-25.md`、`flow/plan.md`、`docs/README.md` 与本记录。
- 验证：仅修改协作与任务文档；确认 T04/T05 在仓库中此前没有任务卡，确认当前 Host Contract 只有 `INPUT_V1_FROZEN`，配置和 Host Action 仍为 `NOT_FROZEN`。未访问硬件、未构建、未烧录。
- 问题解决：交接现已同时表达“当前不能越过 T03”和“T03 通过后继续独立完成 T04/T05”；后续审计责任明确归回原主电脑，避免另一台自审被冒充为最终合并审计。
- 下一步：第二台电脑拉取最新 `main`，按交接先开 T03 分支；T03 锁定后从其 HEAD 开 T04，再从 T04 HEAD 开 T05。每包推送证据但不合并，用户回来后由原主电脑依次审查三个 diff 和组合回归。

## 2026-08-25 · T03 app-only reconnect fix failed HIL; second hardware laptop takes over T03

- 做了什么：用户按本板合同完整关机/开机后，Windows 只读枚举确认 `VID 303A / PID 1006` 的 Keyboard、Mouse、HID 状态正常且下载端口消失；随后重复“记事本 `123` → 按住 S6 → 拔 USB → 保持按住重连 → 等 3 秒 → 松开 → 电脑键盘输入 `abc`”，Ctrl 仍粘连，`A` 仍触发全选。新增第二台硬件笔记本专用交接文档并更新 T03 状态。
- 为什么：写入与镜像校验成功只证明 app 已正确落盘，真实断线行为仍失败，不能锁定 T03，更不能把 T04/T05 叠加到未解决输入合同上。用户即将携带硬件与另一台笔记本继续开发，需要把失败事实和安全边界先推到 GitHub。
- 怎么理解：`dd7bb69` 的 mount 首帧全释放不是有效 HIL 修复。高可信但待证明的差异是 Host 测试保留同一运行时对象，而 USB 拔线让 ESP32-S3 冷启动且 S6 在启动时已按住；还需验证物理初始采样、`tud_hid_ready()`、transfer-complete 与释放屏障。当前状态为 `T03_HIL_FAILED_CTRL_STICKY_AFTER_APP_REFLASH`，T04/T05 关闭。
- 产出路径：`docs/handoffs/second-computer-t03-cold-boot-reconnect-handoff-2026-08-25.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md`、`docs/testing/t03-first-flash-authorization-card-2026-08-24.md`、`firmware/easyinput-controller/README.md`、`flow/plan.md`、`flow/lessons.md` 与本记录。
- 验证：补刷后 Windows HID 正常启动 PASS；相同 S6 断线测试 FAIL。既有自动化仍为桌面 68/68、固件 Host 3/3、ESP-IDF v5.5.5 构建通过，但这些证据已被真实 HIL 证明缺少冷启动向量。未进行新的 Flash/读取/擦除或小智操作。
- 问题解决：未解决的问题已如实保持开放；S8 继续单列为当前样机烧录前硬件阻断，语音单次请求失败继续单列为可恢复服务异常。Git 外 Flash/NVS/私有身份/日志和构建镜像不上传。
- 下一步：另一台电脑从最新 `origin/main` 创建 `codex/easyinput-t03-cold-boot-reconnect`，先补冷启动 held-key 与传输时序测试，再做最小固件修复、自审和构建；任何补刷需再次展示 app-only 清单并取得用户授权。五次真实断线复测全部通过前不锁定 T03，不开始 T04/T05。

## 2026-08-25 · T03 reconnect fix app-only reflash verified; normal boot retest pending

- 做了什么：用户按精确授权句确认后，短按并松开当前 EasyInput 的 BOOT；本机重新核对唯一下载端口、ESP32-S3 型号、原完整备份中的私有身份和候选镜像哈希，只把 `dd7bb69` 的 app 镜像写入 `0x010000..0x04662F`，随后验证数据哈希并再次匹配私有身份。
- 为什么：T03 断线压力测试暴露 Windows 残留 Ctrl；只需替换 app 即可验证 mount 首帧全释放修复，不应再次改写已经校验一致的 bootloader、分区或用户持久区。
- 怎么理解：写入成功不等于应用已启动或 HIL 已通过。当前板通过手动 BOOT 进入下载模式，必须按本板合同完整关机再开机；最终物理恢复后不再运行 esptool 验身，只用 Windows 枚举和用户行为证明新程序运行。
- 产出路径：Git 外恢复目录保存私有写入日志与写后身份记录；Git 内更新 `docs/testing/t03-first-flash-authorization-card-2026-08-24.md`、T03 任务、固件 README 和本记录。镜像及私有身份未进入 Git。
- 验证：app 222,768 字节，SHA-256 `0F4ABC7FA9A3A1A1FCBF457FA468931468940AFDC49460B8302E1B1DFEB517C8`；esptool 数据哈希验证 PASS；写前/写后身份均与原备份匹配；其他写入范围为零。
- 问题解决：补刷门已关闭，状态进入 `FLASH_VERIFIED_PENDING_NORMAL_BOOT_RETEST`。没有擦除、分区变更、NVS/PHY/声音区/eFuse 写入或小智访问。
- 下一步：用户用板上电源开关关机，等待 2～3 秒后正常开机，绝不再次按 BOOT；随后验证 Windows HID 枚举并复测“按住 S6 拔线/重连/释放后输入 `abc`”、快速旋钮和剩余语音循环。通过后再处理 S8 当前样机豁免并锁定 T03。

## 2026-08-25 · T03 reconnect blocker fixed in code; app-only reflash pending authorization

- 做了什么：依据用户真机压力测试复现语义，确认“按住 S6 拔线并重连后，普通 `A` 仍触发全选”是 host-visible Ctrl 粘连；在 `UsbInputRuntime::on_mount()` 中让新 mount epoch 首先排入全释放键盘报告，并用生产路径 Host 测试锁定首帧、旧队列丢弃和 held-key 抑制。同期完善桌面转写失败分类与历史标记，并把胶囊转写阶段的误导性 `0%` 改为“处理中”。
- 为什么：固件只清内部 router/queue 不能撤销 Windows 在设备突然消失前记住的 modifier；这是 T03 防粘键合同的真机阻断。语音压力中的一次请求失败随后恢复，属于可恢复服务异常，不能与 HID 生命周期缺陷混为同一根因。
- 怎么理解：`main@dd7bb69` 是补刷候选，不是 HIL 已通过版本。当前已通过的真机项包括 S1～S7、旋钮纵向/横向、DeskMate 语音输出、历史复制和快捷键捕获；S8 仍是当前单板烧录前已知硬件阻断。T03 保持 `HIL_REWORK_READY_PENDING_APP_ONLY_REFLASH`，T04/T05 仍关闭。
- 产出路径：`firmware/easyinput-controller/components/input_core/src/input_runtime.cpp`、`firmware/easyinput-controller/host_test/input_runtime_tests.cpp`、`src/services/voicePipeline.js`、`src/pages.jsx`、`electron/overlay-preload.cjs`、相关测试，以及 `docs/testing/t03-first-flash-authorization-card-2026-08-24.md`。
- 验证：桌面 `npm test` 68/68；固件 Host CTest 3/3；ESP-IDF v5.5.5 / ESP32-S3 隔离构建通过，app 222,768 字节，SHA-256 `0F4ABC7FA9A3A1A1FCBF457FA468931468940AFDC49460B8302E1B1DFEB517C8`；`npm run build:desktop` 和打包版烟测通过。未访问设备、未补刷。
- 问题解决：代码层已修复 remount 首帧缺少全释放的问题；语音失败现在以安全类别落历史，后续会话可恢复。仍需真机证明 Windows Ctrl 不再残留，并完成剩余 S1 压力次数。
- 下一步：向用户展示 app-only 补刷范围 `0x010000..0x04662F` 并取得新的明确授权；随后只补刷 app，正常重启后复测 S6 断线场景、快速旋钮和剩余语音循环。全部通过并处理 S8 当前样机豁免后才锁定 T03、整理并推送交接基线，开放另一台电脑的 T04/T05。

## 2026-08-25 · DeskMate voice trigger confirmed; ASR blocked by migrated user-data identity

- 做了什么：依据用户真机截图确认 S1 可正常开始/停止 DeskMate 录音，胶囊能观察到麦克风声音活动；只读追踪“录音完成，等待转写服务”到 STT 降级链路，并在当前 Windows 用户的两个限定应用配置区内仅核对加密凭据是否存在、JSON 是否完整和哪个 localStorage 最近活动，未读取、解密或输出 API Key。
- 为什么：该文案同时覆盖“未配置、密钥不可读、网络请求失败、响应无文字”等多种错误，不能凭截图把问题归咎于固件或 API 失效；项目迁移后应用身份变化也可能让 Windows 加密凭据留在旧 user-data 目录。
- 怎么理解：按键、固件、电脑麦克风和本地声音活动检测均工作；“已听到声音，正在识别”是录音期的本地活动提示，不代表云端 ASR 已调用。当前运行的 `deskmate` 配置区最近活动但没有 `bailian-credentials.json`，旧 `deskmate-ui-demo` 配置区仍有格式完整的加密凭据，因此根因是迁移后的当前应用未配置百炼，不是已证明的 Key 失效。
- 产出路径：`docs/setup/qwen-asr.md`、`flow/lessons.md` 与本记录；没有复制凭据、录音、识别正文或用户数据，也没有调用外部 ASR。
- 验证：当前配置区凭据文件缺失；旧配置区凭据 JSON 存在、加密 Key 字段存在、模型为 `qwen3-asr-flash`；当前配置区 localStorage 在本轮运行时更新，旧配置区约 3.4 天未更新。代码确认所有非 success/no-text 结果都会保存统一占位文案。
- 问题解决：推荐用户在当前 DeskMate 的“设置与诊断 → 账户”重新粘贴自己的百炼 Key并“加密保存并启用”；不直接复制或解密旧密文。后续软件任务应让历史和胶囊显示脱敏后的真实 STT 错误类型，并为 app identity 迁移设计显式、用户确认的安全迁移。
- 下一步：用户重新保存 Key 后先做 1 次短语音验收；若仍失败，再查看脱敏诊断中的 `configuration/timeout/request-failed` 并运行不暴露密钥的连接测试。ASR 成功后继续 T03 的旋钮、断线重连与 20 次 S1；T04 仍关闭。

## 2026-08-25 · T03 normal boot and seven-key HIL confirmed; S8 current-unit hardware block recorded

- 做了什么：用户按板级合同完成关机再开机后，本机只从 Windows PnP 侧确认新固件正常枚举为 `VID 303A / PID 1006`，得到 Keyboard、Mouse 和两个 HIDClass 记录且状态全部正常，下载模式设备已消失；随后用不记录文字的专用窗口逐项验证 S1～S7 正确产生并释放冻结默认动作。
- 为什么：必须把“Flash 写入成功、应用正常启动、USB 枚举和实体输入真机行为”分层取证；同时用户补充当前测试实板的 S8 在烧录前即不亮、无响应，不能把它误记成 T03 回归或把当前单板缺陷扩大成所有 EasyInput 的八键设计变更。
- 怎么理解：当前固件确已运行，S1～S7 为真机通过；S8/GPIO48 的固件路径和产品八键合同继续保留，但当前实板无法提供 S8 HIL，状态为 `HIL_IN_PROGRESS_7_KEYS_PASS_S8_CURRENT_UNIT_HW_BLOCK`。原 EasyInput 0.1.26 只能继续使用依赖标准 HID 快捷键的部分；T03 明确拒绝 Vendor Feature，并未实现配置/NVS、Host Action、网络、板载音频、灯光或声音，因此不能声明原软件完整兼容。
- 产出路径：`docs/testing/t03-first-flash-authorization-card-2026-08-24.md`、`docs/architecture/deskmate-v1-hardware-baseline.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md`、`firmware/easyinput-controller/README.md`、局部 AGENTS/CLAUDE 与本记录；测试窗口只在 Git 外恢复目录，未记录输入正文或设备路径。
- 验证：`303A:1006` 应用枚举 PASS，4 个接口记录、0 个非 OK、下载设备不存在；用户观察和截图确认 S1=`Ctrl+Shift+Space`、S2=`Enter`、S3=`Ctrl+Shift+E`、S4=`Backspace`、S5=`Ctrl+A`、S6=`Ctrl+C`、S7=`Ctrl+V` 均完成按下/释放，S8 无电气响应。
- 问题解决：卡在 S8 的临时验收窗口已停止；S8 记录为“当前测试单元已知硬件阻断”，不改全局 GPIO/八键合同，也不阻塞 S1～S7、旋钮和断线恢复继续验收。是否把量产目标降为七键属于另一个产品决策，本轮不擅自修改。
- 下一步：继续验证旋钮纵向双向、按压切换横向、快速旋转、断线/重连和 20 次 S1；随后启动 DeskMate 做语音/焦点/历史复制回归。全部可测项通过后再决定 S8 采用修板复测还是当前原型硬件豁免；T04 仍关闭。

## 2026-08-25 · T03 three-range first flash verified, pending normal boot and HIL

- 做了什么：在用户对最终三段清单再次明确确认后，重新枚举唯一 EasyInput 下载端口，私下复核其 ESP32-S3 身份与备份对象一致，复验完整恢复备份、三份镜像哈希、干净源码提交和远端主线，然后只写入 bootloader、既有布局的分区表和 T03 app 三段；写后在下载模式再次私下核对同一硬件身份。
- 为什么：首次写入必须把“授权对象、可恢复证据、候选镜像、真实写入范围和写后对象”闭合，不能因用户已经按过 BOOT 就跳过身份与哈希门禁，也不能把烧录工具成功冒充应用/HIL 已通过。
- 怎么理解：三段写入和 esptool 数据校验已经完成；NVS、PHY、双声音 bank、整片擦除、eFuse、分区迁移和小智均未触及。当前板仍在手动下载模式，状态仅为 `FLASH_VERIFIED_PENDING_NORMAL_BOOT_HIL`，还不是 `HIL_CONFIRMED`。
- 产出路径：`docs/testing/t03-first-flash-authorization-card-2026-08-24.md`、`docs/reviews/t03-first-flash-prewrite-audit-2026-08-25.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md` 与本记录；完整 Flash/NVS 备份、私有身份、写入日志和写后 session 继续只保存在 Git 外恢复目录，不提交、不上传。
- 验证：目标数量 1、芯片 ESP32-S3、写前/写后私有身份一致；三份镜像 SHA-256 与最终 manifest 一致；写入 `0x0..0x515F`、`0x8000..0x8BFF`、`0x10000..0x4660F`，三段均获 esptool `Hash of data verified`；未执行 erase-all 或 eFuse 写入。
- 问题解决：本轮没有新的代码、结构、架构或视觉变更；预写阶段发现并修复的分区风险已由既有 D023 和回归覆盖，因此不新增决策或 lessons。
- 下一步：用户用板上电源开关“关机 → 等 2～3 秒 → 正常开机”，不要再按 BOOT。恢复正常启动后，本机先验证 Windows 枚举 `VID 303A / PID 1006`，再逐项执行八键、旋钮、断线重连、20 次语音键和 DeskMate 回归；全部通过前不启动 T04。

## 2026-08-25 · T03 first-flash recovery gate and partition correction completed

- 做了什么：收到用户 T03 首次烧录卡授权后，只识别当前 EasyInput，确认单一 ESP32-S3/16 MB Flash，完成 16,777,216 字节整片 Flash/NVS 备份、可读性和重复 SHA-256 校验；烧录前解析实板分区表，发现 T03 默认 1 MiB factory 表会删除现有 3 MiB factory 与 `sound_a/sound_b`，因此保持零次写入并在本机修正分区合同。
- 为什么：构建通过和应用空间充足不能证明可安全烧录；用户授权明确禁止改分区，且声音 bank 是后续 EasyInput 功能的既有存储合同，不能由当前输入包静默删除。
- 怎么理解：T03 仍只实现实体输入到 USB HID；新增 `partitions.csv` 只是保持现有 Flash 布局，不初始化或改写 NVS/声音资源。首次烧录必须同时满足“完整可恢复备份、候选分区表与实板逐字节一致、写入范围不碰持久数据、最终用户确认”。
- 产出路径：`firmware/easyinput-controller/partitions.csv`、CMake/sdkconfig/Host 分区保护、`docs/reviews/t03-first-flash-prewrite-audit-2026-08-25.md`、`docs/testing/t03-first-flash-authorization-card-2026-08-24.md`、`docs/architecture/deskmate-v1-hardware-baseline.md`、`flow/decisions.md` D023 与本记录；私有备份只在 Git 外恢复目录，不提交、不上传。
- 验证：完整备份 SHA-256 `51B0ECAD795E077FCB8F3964459733CA817FD68B4ACDD755E136549C5CE8C991`；安全修正提交 `2d2f867dba95835f19af35cd0fd872b96748c2db`；Host CTest 3/3；ESP-IDF v5.5.5/ESP32-S3 干净提交构建，app `0x36610`、3 MiB app 余量 93%；最终分区表 SHA-256 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278` 且与实板备份逐字节一致；板级扫描 1 PASS/1 已知 constexpr WARN/0 FAIL。设备写入次数仍为 0。
- 问题解决：首次低速整片读取在执行上限前未完成，终止后遗留读取进程占用端口；仅结束与本次恢复路径、COM 口和 esptool 同时匹配的进程，重新核对相同硬件身份后以 921600 完整读取。另发现换 build 目录仍复用源码根生成 sdkconfig，改用隔离 `SDKCONFIG` 后构建保护生效，两项经验已写入 `flow/lessons.md`。
- 下一步：向用户展示最终三段写入范围与哈希并取得最后一次确认；随后 fresh 复核同一私有身份，只写 `0x0..0x515F`、`0x8000..0x8BFF`、`0x10000..0x4660F`，关机再开机恢复正常启动，执行八键/旋钮/断线重连/20 次语音键及 DeskMate 回归。HIL 通过前不启动 T04。

## 2026-08-25 · T03 merge closure self-check completed

- 做了什么：按根级 `AGENTS.md` 与 Project Flow 收工 Hook 复核 T03 合并后的仓库状态、最新交接、稳定决策、踩坑记录、模块入口、任务卡和首次烧录授权卡；确认 `main@fb9a17573a8cf4be76db6aadc8ce4e67fa8c0bd9` 已与远程一致，并修正模块文档中仍残留的“等待合并”状态。
- 为什么：上一轮代码、审计与主线推送已完成，但 `firmware/easyinput-controller/AGENTS.md`、`CLAUDE.md`、`README.md` 和 T03 任务卡仍写成 `READY_FOR_MAIN_MERGE_PENDING_HIL_AUTHORIZATION`，会让下一会话误以为还要再次合并。
- 怎么理解：T03 当前唯一真实状态是 `MERGED_PENDING_HIL_AUTHORIZATION`；代码门已经关闭，硬件门尚未打开。`CODE_REVIEW_CONFIRMED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED` 不能冒充 `HIL_CONFIRMED`，也不授权识别设备、读取 Flash/NVS 或烧录。
- 产出路径：`firmware/easyinput-controller/AGENTS.md`、`firmware/easyinput-controller/CLAUDE.md`、`firmware/easyinput-controller/README.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md`、`flow/plan.md` 与本记录；审计证据继续见 `docs/reviews/t03-easyinput-usb-input-runtime-third-audit-2026-08-24.md`，下一门见 `docs/testing/t03-first-flash-authorization-card-2026-08-24.md`。
- 问题解决：稳定流程决策已在 `flow/decisions.md` D022，生命周期队列/epoch 经验已在 `flow/lessons.md`，本轮没有新的结构、架构、视觉方向或外部资料，不需要改根级 `AGENTS.md`、`DESIGN.md`，也不重复新增决策或踩坑条目。
- 下一步：等待用户明确授权 T03 首次烧录卡；授权后也必须先只识别目标 EasyInput、备份并校验 Flash/NVS、展示目标和写入范围，再进行首次写入与 T03 HIL。授权前不启动 T04，不操作小智。

## 2026-08-24 · T03 third audit fixed locally and merged to main

- 做了什么：审计另一台电脑的第三轮候选 `dbf621fc2ba3dcaf64ab2794708186f5ad8150a0`；确认描述符完整黄金向量与有序生命周期实现有效，并按用户“局部小问题本机直接修”的原则，在原分支直接修复重复 mount epoch 与生命周期队列溢出，提交 `aac2ec9` 后合入 `main`。
- 为什么：重复 `tud_mount_cb` 原先会推进 callback epoch、但 runtime 会忽略重复 mount，后续完成回调因此无法匹配；声明容量 16 的环形队列实际只有 15 个可用槽，且发布失败被静默忽略。这两项都属于边界清楚、可由 Host 回归证明的局部缺陷，无需再跨电脑往返。
- 怎么理解：callback 生命周期状态现为 Host 可测的单一实现；重复 mount 保持同一 epoch，真实 remount 才推进。队列提供完整 16 个槽，第 17 条会饱和计数；owner 检测溢出后丢弃不可信序列、清除在途报告、按 callback 快照恢复并等待实体键释放，避免粘键与旧滚轮重放。
- 产出路径：`firmware/easyinput-controller/`、`docs/provenance/t03-easyinput-usb-input-runtime.md`、`docs/reviews/t03-easyinput-usb-input-runtime-third-audit-2026-08-24.md`、`docs/testing/t03-first-flash-authorization-card-2026-08-24.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md` 与 `flow/plan.md`。
- 验证：CMake 3.30.2 / MSVC Host CTest 3/3；ESP-IDF v5.5.5、target `esp32s3`、Minimal build ON，应用镜像 `0x36610`、最小 app 分区余量 `0xc99f0`（79%）；板级扫描 1 PASS / 1 已知 constexpr WARN / 0 FAIL，人工复核 S1～S8=`2,47,38,41,1,6,7,48`、编码器=`17/16/18`、USB=`19/20`；范围、来源、密钥、ASCII、规则一致、构建产物与 `git diff --check` 均通过。
- 问题解决与下一步：T03 达到 `CODE_REVIEW_CONFIRMED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED`，但尚未 `HIL_CONFIRMED`。本轮未连接/识别设备、未扫描端口、未读取 Flash、未执行 flash/erase/monitor。Maker 没有已确认的独立恢复 `.bin`，因此首次写入前必须先取得用户对“只识别目标设备并备份 Flash/NVS、校验备份、随后烧录 T03”的明确授权；T03 真机矩阵通过前不启动 T04。

## 2026-08-24 · T03 第二轮独立审计继续退回修改

- 做了什么：拉取并在隔离 worktree 审计 `origin/codex/easyinput-usb-input-runtime@24bf3e776c34290c85fc68916513971be970894e`，复核首轮修复、USB 生命周期适配、描述符测试、来源与范围；在本机显式加载冻结工具链重跑 Host 与 ESP-IDF 构建。
- 为什么：首轮两处阻断虽已修正，但进入第一次烧录前必须证明 callback 顺序和完整描述符都受冻结测试保护，不能只依赖另一台电脑的 3/3 与构建结论。
- 怎么理解：旧 key-down 重放和 interface 字符串索引已经关闭，Host 3/3、ESP-IDF v5.5.5 / esp32s3 构建可复现；但独立 mount/unmount 布尔标志会合并并颠倒快速生命周期事件，且所谓“精确黄金向量”只有 device 全量比较，configuration/string/report 仍是局部或语义抽查。T03 保持 `REVIEW_CHANGES_REQUIRED`，不合并、不烧录、不开始 T04。
- 产出路径：`docs/reviews/t03-easyinput-usb-input-runtime-second-audit-2026-08-24.md`、`docs/handoffs/second-computer-easyinput-usb-input-runtime-second-rework-2026-08-24.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md`、`flow/lessons.md`。
- 问题解决：确认返工新增的 ring 全丢弃及 held/released 回归有效，`iInterface=0` 与 `managed_components/` 忽略正确；新发现的生命周期顺序丢失和黄金向量不完整已给出精确返工边界。裸 PowerShell 中 `cmake` 不在 PATH，按冻结规则在同一进程加载 v5.5.5 profile 后验证成功。
- 验证：Host CTest 3/3；ESP-IDF v5.5.5、target esp32s3、Minimal build 成功，镜像 `0x362a0`（221,856 字节），app 余量 `0xc9d60`（79%）；板级扫描 1 PASS/1 已知 constexpr WARN/0 FAIL，人工引脚复核通过；范围、来源、ASCII、AGENTS/CLAUDE、忽略产物与 `git diff --check` 通过。未连接/识别设备，未扫描端口，未读 Flash，未运行 flash/erase/monitor/HIL；隔离 worktree 与产物已删除。
- 下一步：另一台电脑继续原 T03 分支只修生命周期有序传递和四组完整描述符黄金向量，推送新 HEAD 后停止；本机第三轮独立审计通过前不合并 main、不准备烧录授权卡、不开始 T04。

## 2026-08-24 · T03 首轮独立审计退回修改

- 做了什么：拉取并在隔离 worktree 审计 `origin/codex/easyinput-usb-input-runtime@b57d6671a921877835723eebee4252fcdc5c9b92`，核对来源、范围、板级引脚、USB/HID 生命周期、测试、依赖和仓库卫生；用本机精确工具链重跑 Host 与 IDF 构建，并增加临时溢出回归验证恢复语义。
- 为什么：另一台电脑的 3/3 测试与构建通过只能证明现有测试覆盖内成立；第一次烧录前必须独立证明断线、溢出和描述符不会产生粘键或枚举隐患。
- 怎么理解：T03 主体方向正确、原有 Host 3/3 和 ESP-IDF v5.5.5 构建均可重现，但还不是可烧录候选。输入事件 ring 丢 Release 后，owner 先恢复又继续 drain 旧 Press，会重新发出 key-down；HID interface 使用字符串索引 4，而固件只注册 0～2。状态改为 `REVIEW_CHANGES_REQUIRED`，不合并、不烧录、不开始 T04。
- 产出路径：`docs/reviews/t03-easyinput-usb-input-runtime-audit-2026-08-24.md`、`docs/handoffs/second-computer-easyinput-usb-input-runtime-rework-2026-08-24.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md` 和 `flow/lessons.md`。
- 问题→解决：新增临时回归按“S1 Press + 31 个 detent 填满 ring + Release 被丢弃 + 当前 mask=0”稳定复现恢复全零后仍有旧报告，现有 `input_runtime_tests` 因新断言失败；审计临时改动未写回候选分支。另确认 `TUD_HID_DESCRIPTOR` 的 iInterface=4 悬空，并要求补完整描述符黄金向量与 `managed_components/` 忽略项。
- 验证：原候选 Host CTest 3/3 通过；精确 ESP-IDF v5.5.5 / esp32s3 / Minimal build 成功，镜像 `0x36200`、app 余量 `0xc9e00`（79%）。板级扫描 1 PASS、1 WARN、0 FAIL，WARN 是扫描器不识别 `constexpr`；人工引脚复核通过。范围、ASCII、来源、密钥、构建产物、AGENTS/CLAUDE 和 `git diff --check` 通过。本轮未连接/识别设备，未扫描端口，未读 Flash，未运行 flash/erase/monitor/HIL；隔离审计 worktree 及生成产物已删除。
- 下一步：另一台电脑继续原分支按返工提示修复并推送新 HEAD 后停止；本机进行第二轮独立审计。只有回归、描述符、Host 测试和精确 IDF 构建全部通过，才准备 Maker 恢复方案并向用户提交首次烧录授权卡。

## 2026-08-24 · T03 输入合同、任务卡与第二电脑交接已就绪

- 做了什么：把下一功能包正式定义为 T03“实体输入 → USB HID 最小闭环”，冻结 `INPUT_V1_FROZEN` 合同切片，建立另一台电脑可执行的任务卡与复制提示词，并同步项目计划、三端指导书、模块入口及 Codex/Claude 两端规则。
- 为什么：T02 只证明了输入纯逻辑和构建基础，当前固件仍丢弃事件；直接烧录既没有可观察验证价值，也会覆盖现有可用固件。T03 必须先补齐实体采集、默认动作路由、TinyUSB 生命周期、断线防粘键和诊断快照。
- 怎么理解：完整 EasyInput 固件尚未完成。现在只允许另一台电脑在 `codex/easyinput-usb-input-runtime` 实现 `INPUT_V1_FROZEN`；配置/NVS、Host Action/打开应用、BLE/Wi-Fi、音频、GPIO8、DeskMate Link、小智及桌面代码全部继续关闭。合同采用逐切片冻结，不把未讨论能力伪装成已定稿。
- 产出路径：`contracts/deskmate-host/easyinput-input-v1.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md`、`docs/handoffs/second-computer-easyinput-usb-input-runtime-2026-08-24.md`、`flow/plan.md`、`flow/decisions.md` D021、`firmware/easyinput-controller/` 局部入口和 `docs/README.md`。
- 问题→解决：根级 `CLAUDE.md` 落后于 `AGENTS.md`，已补齐三端边界、安全与双电脑规则并恢复逐字一致；模块 AGENTS/CLAUDE 也同步切换到 T03。文档检查通过：ASCII 路径、Markdown 本地链接、根级/模块级规则一致、敏感信息扫描和 `git diff --check` 均通过。本轮没有连接、识别、读取或烧录硬件，未运行 flash/erase/monitor。
- 下一步：把本记录和 T03 准备提交推送到 `main`；另一台电脑从最新 `origin/main` 创建 `codex/easyinput-usb-input-runtime` 严格执行 T03，完成后推送并停止。本机随后独立审计与重建，准备原 Maker 恢复方案，再单独向用户申请首次烧录/HIL 授权；T03 锁定前不开始 T04。

## 2026-08-24 · T02 合并收工自检完成

- 做了什么：按根级 `AGENTS.md` 和 Project Flow 收工规范复核 T02 第二轮审计、合并提交 `216616d`、远程同步、文档分层、仓库卫生及全部验证证据；确认本地 `main` 与 `origin/main` 一致。
- 为什么：把“另一台电脑返工、本机独立复审、主线合并”收束为可供下一会话直接接力的单一事实，避免把代码/构建通过误解为真机已经可用。
- 怎么理解：T02 只锁定 EasyInput 的输入纯逻辑、held-key HID 内部表示和 ESP-IDF 构建基线；当前固件入口仍丢弃采集事件，没有真实 USB 输出或诊断通道，所以 `CODE_REVIEW_CONFIRMED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED` 不等于可烧录或 HIL 通过。
- 产出路径：`firmware/easyinput-controller/`、`flow/tasks/T02-easyinput-input-foundation.md`、`docs/reviews/t02-easyinput-input-foundation-second-audit-2026-08-24.md`、`docs/provenance/t02-easyinput-input-foundation.md`。
- 问题→解决：纠正了返工记录中“板级扫描全部 PASS”的表述为 1 PASS、1 WARN、0 FAIL并人工复核引脚；确认新 PowerShell 进程必须先激活 ESP-IDF v5.5.5 环境，随后 Host 2/2、IDF build、桌面 66/66 与桌面打包均通过。未连接、读取或烧录硬件。
- 下一步：建立单独的下一功能包，先实现边沿安全的按键/旋钮硬件适配与可观察诊断出口；另一台电脑做短分支代码、host test 和无硬件构建，本机复审后再单独准备恢复证据并申请首次烧录/HIL 授权。

## 2026-08-24 · T02 返工独立复审通过并合入主线

- 做了什么：在隔离 worktree 独立审计 `origin/codex/easyinput-input-foundation@7edb0a66187a1e02c26d64aa1470595f659a44ad`，复核首轮问题的修复、任务范围、来源记录和仓库卫生，并在本机精确工具链重新执行 host test 与固件构建。
- 结果：CMake/CTest 3.30.2、MSVC 19.44 下 2/2 host test 通过；ESP-IDF v5.5.5、target `esp32s3`、`Minimal build - ON` 构建成功，镜像 `167216` 字节（`0x28d30`）。T02 达到 `CODE_REVIEW_CONFIRMED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED`。
- 修复确认：`esp_driver_gpio`/`esp_timer` 依赖明确；计时改用单调毫秒且每轮至少让出一个 FreeRTOS tick；held-key 报告覆盖 modifiers、六 usage、并发、幂等、释放与 fail-closed 溢出；测试失败不再弹出 MSVC 模态窗口；来源文件移到根级 `docs/provenance/`，局部规则重新一致。
- 板级检查：自动扫描实际为 1 PASS、1 WARN、0 FAIL，不是“全部 PASS”；WARN 仅因扫描器不识别 C++ `constexpr` 引脚声明。人工复核 S1～S8=`2,47,38,41,1,6,7,48`、编码器=`17/16/18`、USB 声明=`19/20` 正确，GPIO0/GPIO8 未使用。
- 安全边界：本轮未连接、识别或读取设备，未扫描端口，未执行 flash、erase 或 monitor。当前 `main` 只采样并丢弃输入事件，尚无可观察诊断输出，因此该结论不是可烧录、HIL 或真机功能通过。
- 产出：`docs/reviews/t02-easyinput-input-foundation-second-audit-2026-08-24.md`；返工代码与来源记录合入 `main`。下一包应先建立边沿安全的输入适配与可观察诊断出口，再申请独立恢复/烧录/HIL 任务。

## 2026-08-24 · 默认硬件验收主机确认

- 决策：EasyInput 与小智默认连接当前运行 `F:\Codex\deskmate` 主会话的电脑；另一台电脑默认负责短分支代码、host test、模拟器和无硬件构建。
- 例外：用户外出或明确指定临时换机时，才把当轮硬件验收切到另一台；恢复、设备身份、烧录授权和 HIL 门禁保持不变。
- 产出：`flow/decisions.md` D020 与 `flow/plan.md` 双电脑职责已同步。
- 下一步：另一台电脑继续修复 T02；新提交推送后由本机复审、重建，代码门通过后再单独讨论本机真机验收。

## 2026-08-24 · T02 首轮独立审计退回修改

- 做了什么：拉取并只读审计 `origin/codex/easyinput-input-foundation@315e7e2bb2d9298aec3a12cac849445973eb956d`，在隔离 worktree 使用本机精确 ESP-IDF v5.5.5、MSVC、CMake/CTest 重跑候选代码；形成审计报告和另一台电脑返工提示词。
- 结果：原有 host test 1/1 通过，但加入“松键必须清除 modifiers”断言后稳定失败；`idf.py build` 因 `main` 未声明 `esp_driver_gpio` 依赖而失败，因此 T02 当前为 `REVIEW_CHANGES_REQUIRED`，不得合并或烧录。
- 其他问题：主循环以 `tick++` 冒充毫秒，而生成配置为 `CONFIG_FREERTOS_HZ=100`、`pdMS_TO_TICKS(1)=0`；HID 仅能表达单 usage，尚未覆盖并发 held state；MSVC 原始 assert 会弹模态框；模块内误建 `docs/`；AGENTS/CLAUDE 已漂移。
- 板级与安全：静态板级扫描 1 PASS、1 WARN、0 FAIL；WARN 是扫描器不能识别 C++ constexpr，引脚由人工复核正确，GPIO0/GPIO8 未使用。远端提交无密钥、用户数据或构建产物。本轮未连接/识别设备，未读取或写入 Flash，未烧录、erase、monitor。
- 产出：`docs/reviews/t02-easyinput-input-foundation-audit-2026-08-24.md`、`docs/handoffs/second-computer-easyinput-rework-2026-08-24.md`；审计临时 worktree 和生成产物已删除。
- 下一步：另一台电脑继续原分支，安装/激活精确 ESP-IDF v5.5.5，修复审计项并真实通过 host test/build 后推送新提交；本机再次独立审计。任一电脑都可在后续承担 HIL，但必须在代码门通过后另行确认恢复与烧录授权。

## 2026-08-24 · T02 audit rework confirmed

- 状态：`TEST_CONFIRMED` / `BUILD_CONFIRMED`。候选提交 `315e7e2` 的审计问题已在原分支修复；证据仅限无硬件测试与构建，等待另一台电脑再次独立复审。
- 修复：`main` 精确依赖 `esp_driver_gpio`/`esp_timer` 并启用 IDF `MINIMAL_BUILD`；GPIO 配置错误 fail fast；采样改用 `esp_timer_get_time()` 单调毫秒与 `vTaskDelay(1)`。HID 改为平台无关的 held-key 状态，支持 modifiers、最多六 usage、并发/幂等/单键释放/全释放与 fail-closed 溢出。
- 测试：使用 CMake/CTest 3.30.2、MSVC 19.44 运行 `cmake -S firmware/easyinput-controller/host_test -B firmware/easyinput-controller/host_test/build -DCMAKE_BUILD_TYPE=Debug`、`cmake --build firmware/easyinput-controller/host_test/build --config Debug`、`ctest --test-dir firmware/easyinput-controller/host_test/build -C Debug --output-on-failure`，2/2 通过；测试失败通过 stderr 与非零退出报告，不使用会弹窗的原始 `assert`。
- 构建：EIM 已有环境真实报告 `ESP-IDF v5.5.5`；运行 `idf.py -C firmware/easyinput-controller build` 成功，target `esp32s3`，日志为 `Minimal build - ON`，镜像 `0x28d30` 字节，1 MiB app 分区余量 84%。生成的 `dependencies.lock` 固定 IDF 5.5.5/esp32s3；build、sdkconfig、bin、elf、map 未提交。
- 静态检查：返工电脑报告板级扫描 PASS；后续独立复审确认实际输出为 1 PASS、1 WARN、0 FAIL，WARN 是扫描器不识别 C++ `constexpr`。S1～S8=`2,47,38,41,1,6,7,48`、编码器=`17/16/18`、USB 声明=`19/20` 经人工复核正确；GPIO0/GPIO8 未使用，USB 运行时未配置。`git diff --check`、密钥、范围、ASCII 路径与构建产物检查通过；`AGENTS.md`/`CLAUDE.md` 逐字一致；来源记录移至 `docs/provenance/t02-easyinput-input-foundation.md`。
- 安全：未连接、识别或读取设备，未扫描端口，未执行 flash、erase、monitor；两个外部参考目录未修改或复制。下一步只由另一台电脑复审本分支；复审通过后仍须单独建立恢复、烧录与 HIL 授权任务。

## 2026-08-24 · T02 EasyInput input foundation implementation

- 做了什么：在分支 `codex/easyinput-input-foundation` 的 `firmware/easyinput-controller/` 建立 ESP-IDF 5.5.5 / ESP32-S3 工程骨架；实现八个独立低有效按键、20 ms 防抖、多键事件、编码器 Gray-code 四相 detent/非法跳变丢弃/按压防抖，以及平台无关的 8 字节 Boot Keyboard HID 内部表示。
- 为什么：完成 T02 的无硬件可审计代码包，为有硬件电脑独立重跑和审查提供最小输入基础；本轮没有打开配置、音频、BLE/Wi-Fi、NVS、分区、DeskMate Link 或其他功能包。
- 产出：`firmware/easyinput-controller/CMakeLists.txt`、`sdkconfig.defaults`、`main/idf_component.yml`、`components/input_core/`、`main/main.cpp`、`host_test/`、`.gitignore`、`docs/provenance.md` 和更新后的模块 `README.md`。
- GPIO 合同：S1～S8 为 `2,47,38,41,1,6,7,48`；编码器 A/B/按压为 `17/16/18`；USB D-/D+ 仅记录 `19/20`；GPIO0、GPIO8 未使用。未配置 GPIO19/20 外设驱动，未初始化共享音频/LED 电源域。
- 来源：全部代码为按 T02 合同的独立重实现；逐文件来源、参考固定提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`、许可证和采用方式见 `firmware/easyinput-controller/docs/provenance.md`。外部参考目录未修改、未复制、未使用其 build 产物。
- 验证：已执行 `cmake -S host_test -B host_test/build -DCMAKE_BUILD_TYPE=Debug`、`cmake --build host_test/build --config Debug`、`ctest --test-dir host_test/build -C Debug --output-on-failure`，但本机均因命令不存在而未运行；`idf.py --version` 同样不可用，故本轮不能声明 `TEST_CONFIRMED` 或 `BUILD_CONFIRMED`。无设备访问、无端口扫描、无烧录/读取/monitor。
- 状态：代码待工具链可用环境重跑 host test 和精确 ESP-IDF 5.5.5 `idf.py build`；本记录不把未执行结果冒充通过。下一步由有硬件电脑安装/激活冻结工具链后独立审查、重跑并决定是否申请真机验收。

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
