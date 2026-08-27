# Second-computer T04 input LED feedback handoff

- 状态：`READY_FOR_IMPLEMENTATION / INPUT_LED_V1_FROZEN`
- 开放任务：T04 only
- 分支：`codex/easyinput-t04-input-led-feedback`
- 硬件职责：另一台笔记本本包不访问硬件；原主电脑后续独立审计、授权烧录和 HIL

## Context

T03 已由原主电脑独立审计并锁定。用户新增的明确需求是：实体按键/旋钮被固件识别时，板载 5 颗灯提供可见反馈，以便区分“按键电路没有事件”和“软件动作没有执行”。当前样机 S8 在烧录前就没有输入，T04 不修改 GPIO48 或伪造 S8，只让真实稳定输入产生灯效。

原 Maker 固定提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 已证明完整行为：S1～S8 八色 140 ms 波纹、旋钮方向流和按压确认脉冲；GPIO12 驱动 5 颗 GRB WS2812；GPIO8 是 LED/麦克风/扬声器共享电源，不能当作灯开关。参考审计和冻结合同已经在主线准备好，不要再从零猜测。

原计划的配置/NVS 已顺延为 T05，Host Action/打开应用顺延为 T06。T04 锁定前不得开始两者。

## Required actions

1. 拉取 GitHub 最新 `main`，确认包含：
   - `flow/tasks/T04-easyinput-input-led-feedback.md`
   - `docs/contracts/easyinput-input-led-feedback-v1.md`
   - `docs/provenance/t04-easyinput-input-led-feedback-reference-audit.md`
2. 从最新 `origin/main` 创建 `codex/easyinput-t04-input-led-feedback`。
3. 先完整阅读根级与固件局部规则、T04 任务卡、冻结合同和参考审计，再固定读取 Maker 提交中列出的源码/测试。
4. 只实现 T04：最小共享电源控制器、GPIO12/5×WS2812 RMT、八键/旋钮反馈、异步有界运行时、诊断和 Host/source-contract tests。
5. 保持 T03 的 held PTT、atomic tap、USB 描述符、队列和断线恢复逐项不变；LED 失败必须 fail-soft。
6. 运行全部 Host tests、精确 ESP-IDF v5.5.5 `esp32s3` 构建和静态检查，补齐 provenance 与 `flow/progress.md`。
7. 提交、推送该分支，报告最终 HEAD、测试/构建、镜像大小和未执行的硬件操作，然后立即停止。

## Stop conditions

- 不合并 `main`，不开始 T05/T06。
- 不扫描端口、不识别设备、不读写 Flash/NVS、不 flash/erase/monitor、不做 HIL。
- 不实现音频、BLE、Wi-Fi、配置、Host Action、Boot/连接/Agent 灯效、小智或 DeskMate Link。
- 如果固定参考与冻结合同冲突，或必须改变 GPIO8/GPIO12、T03 输入合同、分区或架构，记录证据并停止，不猜测。

## Copy-ready prompt

```text
请在 F:\Codex\deskmate 执行 T04，先读取当前路径生效的 AGENTS.md、firmware/easyinput-controller/AGENTS.md、flow/charter.md、flow/plan.md 和 flow/progress.md 顶部最新记录。拉取最新 origin/main，确认存在 flow/tasks/T04-easyinput-input-led-feedback.md、docs/contracts/easyinput-input-led-feedback-v1.md、docs/provenance/t04-easyinput-input-led-feedback-reference-audit.md 和 docs/handoffs/second-computer-t04-input-led-feedback-2026-08-27.md，然后从最新 origin/main 创建 codex/easyinput-t04-input-led-feedback。

严格只做 T04：按 INPUT_LED_V1_FROZEN 为 EasyInput 的 GPIO12/5 颗 GRB WS2812 实现 S1～S8 八色 140 ms 波纹、旋钮左右方向流和旋钮按压确认脉冲，并建立 GPIO8 的唯一最小共享电源控制器与安全上电顺序。必须先固定读取 F:\Codex\easyinput-wzm\easy-input-maker 的提交 7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01 中任务卡列出的 input_feedback、led_strip_status、peripheral_power 及 Host tests；参考优先，不从零猜测，不读取或依赖参考仓脏工作树。

必须保持 T03 的 S1/S3 held PTT、S2/S4/S5～S8 atomic tap、输入扫描、防抖、旋钮解码、USB 描述符、队列和断线恢复不变。LED 只能消费已确认语义输入，异步、有界、fail-soft；GPIO ISR/输入热路径不得做 RMT、等待或日志。GPIO8 不是灯开关，Awake 期间保持共享域开启，灯灭发黑帧；本包不初始化音频。当前样机 S8 是既有硬件故障，保留 S8/GPIO48 合同，不做特殊绕过。

补齐任务卡要求的 Host/source-contract tests、provenance、精确 ESP-IDF v5.5.5 esp32s3 构建、固定 16 MB 分区与全部静态检查。不得做配置/NVS（已顺延 T05）、Host Action/打开应用（已顺延 T06）、BLE、Wi-Fi、音频、Boot/连接/Agent 灯效、桌面业务、小智或 DeskMate Link；不得扫描端口、识别设备、读取 Flash/NVS、flash、erase、monitor 或 HIL。

完成后更新 flow/progress.md 顶部，提交并推送 codex/easyinput-t04-input-led-feedback，回复最终 HEAD、测试、构建、镜像大小、来源记录和所有未执行的硬件操作，然后立即停止：不合并 main，不开始 T05。原主电脑将独立审计、重建并在另行取得授权后烧录/HIL。
```
