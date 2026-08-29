# T08 parallel firmware split handoff

## Shared baseline

- Baseline: `origin/main@3e2a046f49260ead422da4c295c3321de13dca5d`
- Coordination commit: `90585a6d23a448ad12433c112d451ddea8c737f5`
- EasyInput branch: `codex/easyinput-t08-link-controller`
- Xiaozhi branch: `codex/xiaozhi-t08-link-endpoint`
- Desktop baseline: `T07_DESKTOP_UI_V1_FROZEN`; neither firmware stream modifies desktop navigation or VoiceWorkflow.
- DeskMate Link state at task opening: `NOT_FROZEN`.

## Ownership rule

The EasyInput window owns the shared Link contract until it is frozen and committed. The Xiaozhi window may prepare its board-specific scaffold in parallel, but must not invent framing constants. After the exact contract commit is supplied, both endpoints consume the same contract and byte-for-byte golden vectors.

No window edits the other firmware module. Integration is performed later from two pushed short branches; it is not performed by copying directories.

## First physical-connect gate

Physical connection is allowed only after both endpoint branches pass Host tests and their exact ESP-IDF builds, the Link contract is frozen, the Xiaozhi UART/console allocation is evidence-backed, and a separate electrical/recovery checklist is accepted. The first connection uses independent power, common ground and crossed TX/RX; EasyInput J4 `3V3` remains disconnected. The first HIL is read-only `HELLO/capabilities/status`, with OLED, audio and servos disabled.

## Copyable prompt for the Xiaozhi window

```text
请在 F:\Codex\deskmate 开始 T08 小智 DeskMate Link 执行端的并行开发，但严格只负责小智固件，不修改 EasyInput 固件和桌面软件。

一、准确基线与分支
1. 先读取根 AGENTS.md、flow/charter.md、flow/plan.md、flow/progress.md 顶部、flow/guides/two-computer-handoff.md。
2. git fetch origin。
3. 确认 origin/main 精确为：
   3e2a046f49260ead422da4c295c3321de13dca5d
   不一致立即停止，不要猜测或覆盖工作树。
4. 确认本次协调提交存在：
   90585a6d23a448ad12433c112d451ddea8c737f5
   该提交只增加 T08 任务、分工和计划文档，不含 EasyInput 实现代码。
5. 从该协调提交建立独立短分支：
   codex/xiaozhi-t08-link-endpoint
6. 阅读 flow/tasks/T08-xiaozhi-link-endpoint.md、contracts/deskmate-link/README.md 和 T07_DESKTOP_UI_V1_FROZEN。

二、代码所有权
- 只允许修改 firmware/xiaozhi-yuntai/ 以及本任务对应的小智测试、来源和交接文档。
- 禁止修改 firmware/easyinput-controller/、src/、electron/、native/、T07 UI 和 VoiceWorkflow。
- contracts/deskmate-link/ 由 EasyInput 窗口在冻结前单点拥有；你不得自行发明或修改 framing、magic、版本、消息 ID、CRC、超时、重试和错误语义。

三、现在立即执行的 Phase A
1. 只读参考 F:\Codex\xiaozhi-yuntai，先核对固定提交、许可证和采用文件，不读取或依赖参考脏工作树和 build 产物。
2. 核对小智板可用于 DeskMate Link 的 UART、现有 UART0 控制台、USB Serial/JTAG、调试日志迁移和恢复路径；只写有证据的引脚/方向，无法确认的保持 UNKNOWN，禁止猜空闲 GPIO。
3. 建立 DeskMate 正式小智 ESP-IDF v5.5.3 / esp32s3 工程骨架、纯 C/C++ transport abstraction、fake UART 和 Host test 入口。
4. 建立只读 capability/status 数据模型；display/motion 必须标为 pending/locked，DeskMate V1 不初始化小智麦克风、功放和扬声器，本阶段也不初始化 OLED 或舵机。
5. 合同冻结前不得写真实 framing 常量、真实 UART pin 配置或板间通信业务代码。

四、验证与交付
- 运行小智 Host tests 和 ESP-IDF v5.5.3 / esp32s3 构建。
- 执行 git diff --check、AGENTS/CLAUDE、来源/许可证、密钥隐私、ASCII 路径和构建产物检查。
- 更新 flow/progress.md 顶部，提交并推送 codex/xiaozhi-t08-link-endpoint，报告准确 HEAD、测试数量、镜像大小、SHA-256、UART/控制台结论和所有 UNKNOWN。
- 然后停止，等待 EasyInput 窗口提供 DESKMATE_LINK_V1_FROZEN 的准确提交，再进入 Phase B。

禁止接线、扫描端口、识别设备、读写 Flash、烧录、erase、monitor、初始化 OLED/音频或驱动舵机。不得开始表情或动作开发。
```
