# Xiaozhi companion preparation · 2026-08-29

状态：`PREPARATION_ONLY / NOT_FROZEN / NO_DEVICE_OPERATION`

本文件把小智参考固件、DeskMate 现有软件与公开开源项目的做法放在同一张准备图中，供下一次合同冻结讨论使用。它不是 DeskMate Link 合同、固件任务卡或烧录授权；任何消息字段、动作范围和按键映射都必须在后续任务中单独冻结。

## 1. 已读到的原始小智能力

只读参考为 `F:\Codex\xiaozhi-yuntai`，根许可证为 MIT。它没有 Git 身份，因此以下文件哈希、基线报告和路径共同组成来源证据；不能直接复制整套工程或构建产物到产品仓。

| 能力 | 参考实现事实 | DeskMate 采用方式 |
| --- | --- | --- |
| 云端/Web 入口 | 原项目经 Wi-Fi、MQTT/WebSocket 和其网页/云端会话工作；`Application::OnIncomingJson` 收到 `tts`、`stt`、`llm` emotion 与 MCP 后更新状态或显示。它没有可复用的本地 DeskMate 控制协议。 | DeskMate Windows 软件成为本地编排器；不复用云端会话、原唤醒词或本板音频。 |
| OLED/大眼睛 | `EmojiController` 提供眨眼、唤醒、睡眠、开心、伤心、愤怒、惊讶、困惑、思考、放松等动画，以及向左/右/上/下看。 | 新固件建立独立 `DisplaySceneManager`，先做少量稳定的状态场景，不复制原有随机动画/任务模型。 |
| 双舵机 | `ServoController` 在 GPIO11/12 以 50 Hz PWM 直接输出；参考值为中心 90°、水平 50..130°、垂直 70..110°、500..2500 us。支持左/右/上/下、回中、点头、摇头、转圈。 | 这些只是候选校准起点，不能当作实机安全限位。所有新动作只经 `MotionArbiter`，先模拟、再单轴 1..2° 校准。 |
| 情绪/动作 | `EmotionResponseController` 将云端 emotion 或中文关键词映射为表情、`nod`、`shake`、`spin`、`dance` 等。`dance` 实质为开心眼睛 + 点头 + 转圈。 | 不以模型输出文字或关键词直接触发机械动作。Windows 先把模型结果变成经过白名单与权限检查的高层意图；小智再验证能力和安全状态。 |

参考中的直接 PWM、阻塞式步进和表情/动作混合队列不能原样移植：它们缺少 DeskMate 所需的命令序列、去重、取消、超时、忙碌状态、回中和急停边界。

## 2. DeskMate 当前可接上的部分

- 已有统一 `VoiceWorkflow`、底部语音胶囊、历史、ASR、输入桥和 EasyInput K1 语音触发。它应继续只有一个版本化语音状态机。
- “AI 联动 / 表情库 / 表情编辑”已有 UI 与状态映射，但仍经 mock adapter 演示，尚未发送到小智，必须显示为模拟。
- T06 正在建立安全的固定文字/打开应用 Host Action；它的路径白名单、确认和主进程边界可以成为未来“执行工作”的第一类工具，不能由模型传递任意命令或路径。

## 3. 推荐的 V1 功能切片

### 3.1 先让小智成为可解释的状态化伙伴

Windows 只发送有限状态：`idle`、`listening`、`transcribing`、`thinking`、`working`、`waiting_user`、`speaking`、`completed`、`error`。小智把它们映射到 OLED 场景；初版不要求舵机动作。

语音输入的体验建议为：按住 K1 → `listening` 眼睛与轻微“注意”视觉效果 → 松开后 `transcribing` → 文本整理/Agent 执行时 `thinking` 或 `working` → 完成/失败回到可见结果后自动 `idle`。这样不依赖小智自己的麦克风，也不会误称为本板已听到声音。

### 3.2 再引入陪伴对话

`voice_input`（文字输入）和 `companion_conversation`（陪伴聊天）是同一 VoiceWorkflow 的两种模式，而不是两套录音控制器。后者将来可分配一个可配置的 `companion_talk_toggle` 按键：一次开始、一次结束或打断；小智只显示 listening/thinking/speaking，音频仍由 EasyInput 承担。

“改名字并语音唤醒”可做，但应分两步：先在 UI、角色提示词和 TTS 中采用用户选定的名字；真正的唤醒词检测等 EasyInput 音频链与功耗/误唤醒验收完成后，再作为独立音频功能包。V1 不使用小智原有云端唤醒词。

### 3.3 最后开放机械动作

动作从低风险到高风险依次是：`center` → 单轴小步 `look_left/right/up/down` → `nod` / `shake` → 组合动作。`dance`、`spin` 和长动画在现场中心、方向、电流和真实限位完成后才评估，不进入第一轮机械闭环。

每个动作都有 `accepted`、`completed`、`rejected_busy`、`rejected_unsafe` 或 `failed` 结果；`stop_motion` 与 `center` 的优先级高于任何表情和动作。

## 4. “它还能帮我做工作”应怎样落地

模型只负责理解意图和选择已注册工具；桌面软件负责权限、执行和审计；小智只负责显示结果与安全动作。首批安全工具可以是：

1. `launch_approved_app`：只打开用户已在 DeskMate 设置中选择和启用的应用，由 Electron 主进程保存路径映射；模型、React 和固件只看到 UUID。
2. `start_music_in_approved_player`：第一版只打开用户选定的播放器或已授权入口，不承诺自动搜索、登录或播放第三方服务内容。
3. 后续只读工具：时间、待办、日历摘要、本地文件搜索等；任何发送消息、付款、删除文件、远程控制或第三方账号操作都应在执行时由用户确认。

这比把 OpenClaw 或任意 Agent 整体嵌入 DeskMate 更适合 V1：可先保持本地最小权限工具注册表，后续再把 OpenClaw、Codex、Claude、Workbody 等接成可选状态/工具适配器。

## 5. DeskMate Link V1 的准备性草案

物理层已选独立供电的 3.3 V TTL UART（EasyInput TX→小智 RX、EasyInput RX←小智 TX、GND 共地；J4 3V3 不接）。以下只是后续合同的候选消息集合：

| 切片 | 候选命令 | 初次效果 |
| --- | --- | --- |
| 发现 | `hello`、`get_capabilities`、`get_status` | 返回协议版本、屏幕/动作可用性、错误与忙碌状态；不动屏幕或舵机。 |
| 视觉 | `set_agent_state`、`set_scene` | 只切换 OLED 场景；坏包、重复包和超时不改变场景。 |
| 安全动作 | `center`、`play_action`、`stop_motion` | 仅在小智已报告机械校准能力后可接受。 |

无论最终二进制 framing 如何选择，合同必须冻结版本、长度上限、CRC、序列号、ACK/完成回报、幂等、超时、重启、未知版本、能力协商与错误码，并在 C/C++、JavaScript 与模拟 UART 中共享黄金向量。Host Action 绝不复用成 DeskMate Link。

## 6. 公开项目调研得到的产品边界

- [Open-LLM-VTuber 项目说明](https://open-llm-vtuber.github.io/en/docs/intro/) 将实时语音、视觉、工具调用、长期记忆和桌宠界面拆为可替换模块。这支持 DeskMate 继续把 ASR/LLM/TTS、记忆、视觉和硬件表现分开，而不是把它们塞进小智板。
- [OpenClaw 官网](https://openclaw.ai/) 展示了本地 Agent 执行邮件、日历和其他任务的方向，但也说明“能做事”的能力来自受控工具和本机权限，而不是语音模型本身。DeskMate 只吸收“工具注册 + 最小权限 + 明确确认”原则，不引入该项目代码或运行时。

## 7. 推荐的下一次可编码任务顺序

1. 完成并交接 T06，保住 Windows 主机动作的白名单边界。
2. 新建 DeskMate Link 任务：冻结 `get_capabilities/get_status` framing、错误、重试、黄金向量和两端 fake UART。
3. 创建小智正式模块构建骨架、严格 parser、能力/状态模型与 host test；仍不初始化音频、OLED 或 PWM。
4. 通过小智单板审计与授权烧录后，先验 OLED 静态状态场景。
5. 完成供电、中心、方向和限位校准后，再开放 `center` 与单轴小步；最后才讨论点头、摇头和跳舞。

## 8. 仍需用户选择的产品项

- 陪伴角色名称与正式唤醒短语。
- 哪个实体键将作为 `companion_talk_toggle`，以及它是否需要按住说话。
- V1 的第一批可执行工作工具：仅打开应用，还是同时包括音乐播放器入口。
- 角色表现倾向：更克制的工作伙伴，还是更主动/可爱/高频的桌宠。
