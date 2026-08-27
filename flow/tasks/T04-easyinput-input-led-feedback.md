# T04 · EasyInput physical-input LED feedback

- 状态：`AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / PENDING_HIL / INPUT_LED_V1_FROZEN`
- 前置：T03 已在 2026-08-27 完成 Host、ESP-IDF、桌面、五次断线 HIL 和原主电脑独立审计，状态为 `T03_LOCKED`。
- 计划分支：`codex/easyinput-t04-input-led-feedback`，从包含本任务卡的最新 `origin/main` 创建。
- 目标：在不改变 T03 输入/HID 行为的前提下，让 5 颗板载 WS2812 对 S1～S8、旋钮左右转和旋钮按压提供明确、低亮度、短时反馈，并建立 GPIO8 共享电源域的唯一安全底座。

## Required reading and reference gate

开始编码前依次读取：

1. 根级和 `firmware/easyinput-controller/` 生效的 `AGENTS.md`；
2. [`INPUT_LED_V1_FROZEN`](../../docs/contracts/easyinput-input-led-feedback-v1.md)；
3. [`T04 reference audit`](../../docs/provenance/t04-easyinput-input-led-feedback-reference-audit.md)；
4. 固定 Maker 提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 中审计表列出的源文件和测试；只读固定提交，不读取或依赖参考仓脏工作树。

参考已证明该功能的行为和电源边界。不得重新发明另一套颜色、时序、GPIO8 所有权或输入触发逻辑；若 DeskMate 当前架构无法满足冻结合同，先记录差异并停下，不做猜测性实现。任何复制或实质派生必须更新来源、许可证、修改和目标路径记录。

## Implementation scope

### 1. Minimal shared-power foundation

- 建立 GPIO8 的唯一 `PeripheralPowerController`/租约所有者；源码中不得出现第二个 GPIO8 写入口。
- 严格实现冻结合同中的冷启动安全顺序：GPIO8 inactive latch → 共享命令引脚安全态 → GPIO8 output/high → 当前策略 50 ms 稳定屏障 → GPIO12 RMT 初始化。
- Awake 期间保持共享域开启；灯灭通过 5 像素黑帧完成，不按键级开关 GPIO8。
- 本包只为将来的麦克风/扬声器保留所有权接口和安全引脚状态，不初始化任何 I2S、音频任务或声音资源。

### 2. Input feedback semantics

- 直接复用 T03 已防抖的按键 Press、已确认的编码器 detent 和旋钮 Press 语义入口；禁止建立第二套扫描、防抖或 Gray-code 解码。
- 完整实现合同中的八键独立颜色、5 灯波纹、左右方向流和确认脉冲。
- 键保持按住只显示一次；Release 静默；S1/S3 held PTT 与其余 atomic tap 行为保持不变。
- 当前样机 S8 无电气输入时应自然没有灯效；不得为使 S8“亮起来”而伪造输入、改 GPIO48 或特殊绕过防抖。

### 3. Bounded LED runtime

- 5 像素按 GRB 顺序编码并使用 ESP-IDF 5.5.5 RMT TX；传输和完成等待均有界。
- HID/input 事件先入队，灯效后异步消费。GPIO ISR 和输入热路径不得发送 RMT、等待、分配堆内存或写日志。
- 使用静态有界队列或等价的单所有者最新反馈邮箱。新事件可以替换过时动画；灯效丢弃、初始化失败或发送失败不得影响按键、旋钮、USB 生命周期或全释放逻辑。
- 增加只读、脱敏诊断：至少包含 `led_feedback_dropped`、`led_init_failures`、`led_tx_failures`；不新增诊断线协议，不记录输入正文或设备身份。
- 启动完成与空闲时发送黑帧。本包不实现 Boot 彩虹、连接/平台/配置/Agent 灯效或 GPIO42 独立状态灯。

## Explicitly forbidden

- 修改 `INPUT_V1_FROZEN`、VID/PID、Report ID、默认键位、atomic tap/held PTT、输入队列容量或 T03 USB 生命周期；
- 配置/NVS、Host Action/打开应用、BLE、Wi-Fi、麦克风、扬声器、声音 bank、电池、睡眠、OTA、DeskMate Link、小智或桌面业务代码；
- 改分区、GPIO0、GPIO48、USB GPIO19/20、J4 UART；
- 扫描端口、识别设备、读取 Flash/NVS、flash、erase、monitor 或 HIL；另一台电脑只有代码、Host test 和构建授权。

## Verification gate on the development laptop

### Host and source-contract tests

- S1～S8 的颜色、140/35 ms 波纹和释放静默黄金向量；
- 旋钮左/右方向、160/40 ms，按压 300/60 ms；非法跳变不显示；
- 重复 Press、长按、Release、同时按键、动画替换、队列满和 `uint32_t` 时间回绕；
- 灯效队列溢出/初始化失败/传输失败时，T03 HID 快照、atomic tap、held PTT、滚轮和 USB 恢复完全不变；
- GPIO8 只有一个写入口，冷启动安全顺序可验证，GPIO11 保持禁用/浮空，音频未初始化；
- GPIO12=5 像素、GRB 字节顺序、RMT/reset 边界和最终黑帧黄金向量；
- 回归现有全部 Host tests，包括 T03 快转、溢出、断线重连、Vendor Report fail-closed 和精确 USB 描述符。

### Build and repository checks

- 使用精确 ESP-IDF v5.5.5、target `esp32s3` 构建；固定 16 MB 分区逐项不变；
- 关闭 T03 记录的构建可复现性缺口：建立受控 release manifest 或可复现构建证据，禁止把同提交的不同哈希冒充同一镜像；
- 执行 `git diff --check`、任务范围、来源/许可证、密钥、ASCII 路径、构建产物和 `AGENTS.md`/`CLAUDE.md` 逐字一致检查；
- 桌面代码未改时无需为 T04 新写桌面功能，但必须在交接中明确留待原主电脑做组合回归。

## Delivery and stop point

另一台开发笔记本完成实现、自审、Host tests、精确 IDF 构建和静态检查后：

1. 更新 `flow/progress.md` 顶部并补齐 T04 provenance；
2. 提交并推送 `codex/easyinput-t04-input-led-feedback`；
3. 报告最终 HEAD、测试、构建、镜像大小和所有未执行的硬件操作；
4. 立即停止，不合并 `main`、不开始 T05、不接触硬件。

原主电脑随后独立审查完整 diff、重跑 Host/IDF/桌面组合门。代码门通过后另行展示 HEAD、app SHA-256、app-only 写入范围和恢复方案，取得用户新授权才可烧录。

## Hardware acceptance on the original computer

- 正常冷启动不随机闪烁，初始化后空闲全黑；
- 当前可用 S1～S7 分别产生一次可辨识颜色波纹；S8 记录为当前样机硬件阻断，健康板仍需验证；
- 旋钮左转、右转和按压效果正确；长按 S1/S3 只触发一次灯效但 PTT 持续工作；
- 快速连续 50 次输入允许动画合并，但 HID 不漏、不粘、不乱序；
- 重跑 T03 五次 `123`/S6 断线/`abc` 矩阵、快速旋钮和连续 20 次语音键；
- 回归 DeskMate 语音输入、目标窗口、历史复制与快捷键捕获。

全部代码、构建和真机门通过后才标记 `T04_LOCKED`，再从其锁定 HEAD 开始 T05 配置/NVS。
