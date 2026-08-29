# T08 EasyInput Link controller

Status: `T08_OPEN / DESKMATE_LINK_V1_NOT_FROZEN / HARDWARE_NOT_AUTHORIZED`

## Objective

在不改动 T07 桌面冻结基线、也不修改小智固件的前提下，让 EasyInput 成为 DeskMate Link v1 的唯一总控端：先冻结共享协议和黄金向量，再实现有界 UART 传输、严格解析、请求路由、状态与诊断，为首次两板只读握手准备代码门。

精确基线：`origin/main@3e2a046f49260ead422da4c295c3321de13dca5d`。

开发分支：`codex/easyinput-t08-link-controller`。

## Ownership

- 本任务可修改：`contracts/deskmate-link/`、`firmware/easyinput-controller/`、本任务卡、EasyInput 相关测试/来源/交接文档。
- 本任务不得修改：`firmware/xiaozhi-yuntai/`、桌面 `src/`、`electron/`、`native/`、T07 导航/VoiceWorkflow、外部参考工程。
- 小智窗口只消费冻结合同和黄金向量，不与本任务共同编辑 EasyInput 源码。

## Phase 0: freeze the shared contract first

在任何一端写入 UART framing 常量之前，先产出并单独提交：

1. `DESKMATE_LINK_V1_FROZEN` 合同：物理层、帧格式、版本、长度、CRC、序列、请求/响应、ACK/NACK、错误、超时、重试、去重、重启和兼容策略。
2. 第一批只读/无机械风险语义：`HELLO`、`GET_CAPABILITIES`、`GET_STATUS`、`SET_AGENT_STATE`。数值 ID 只在冻结合同中定义一次。
3. 语言无关黄金向量：完整帧、截断、坏 magic、坏版本、坏长度、坏 CRC、未知命令、重复序列、乱序、超时、重连和 epoch 变化。
4. UART 所有权：EasyInput J4 使用 `TXD0/GPIO43`、`RXD0/GPIO44`、`GND`；J4 `3V3` 不接小智。UART0 变为 Link 后，日志不得混入协议字节，调试输出必须迁移到经验证的 USB 路径或关闭。

合同提交推送后，另一窗口才允许把 framing 常量和黄金向量接入小智实现。

## Phase 1: EasyInput endpoint

1. 建立唯一 Link transport owner；ISR/驱动回调只搬运字节到静态有界队列，单一任务负责解析与发送。
2. 实现流式解析器：可从噪声中重新同步，严格检查版本、长度、CRC、消息方向和 payload 上限；未知或畸形输入失败关闭。
3. 实现请求表和生命周期：有限在途数量、序列去重、确定超时、有限重试、USB/UART epoch 改变时取消旧请求，重连不重放旧动作。
4. 实现 controller router：只路由冻结的能力、状态和 Agent 状态；不得复用 Host Action `0x05`，不得直接写 OLED/PWM，也不得执行舵机动作。
5. 增加脱敏只读诊断：link epoch、收发帧计数、CRC/长度/版本错误、队列溢出、超时、重试和 peer 状态；不记录正文、密钥、设备身份、路径或网络信息。
6. 保持 T03 输入释放安全、T04 灯效/GPIO8 唯一所有权、T05 配置/NVS、T06 Host Action 和固定分区不变。

## Explicit exclusions

- 不修改小智固件、桌面软件或 UI。
- 不开发 BLE、Wi-Fi、音频、电池、睡眠、OLED、舵机、摄像头或传感器。
- 不接线、不扫描端口、不识别设备、不读写 Flash/NVS、不烧录、不 erase、不 monitor、不写 eFuse。
- 合同冻结前不得猜测帧格式、UART 参数、消息 ID 或兼容行为。

## Verification

1. Shared codec/golden-vector tests cover success and every fail-closed vector above.
2. EasyInput Host CTest full regression, including all T02-T06 tests.
3. Exact ESP-IDF v5.5.5, target `esp32s3`, fixed 16 MB partition build.
4. UART source-contract checks prove there is one owner and no console/log bytes can enter Link.
5. `git diff --check`, AGENTS/CLAUDE consistency, source/license, secrets/privacy, ASCII paths and build-artifact checks.

## Stop gate

推送分支并报告准确 HEAD、合同提交、测试数量、镜像大小和 SHA-256 后停止。不得合并 `main`，不得开始 OLED/舵机，不得执行硬件操作。首次两板连接必须等待小智同合同实现也通过 Host/build，并另行完成电平、独立供电、共地、TX/RX 方向和恢复方案验收。
