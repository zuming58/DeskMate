# Development plan

## Current stage: integrated product foundation

目标：按已冻结的 V1 硬件基线启动正式实现：先完成 EasyInput 总控的小功能包和软件闭环，再冻结 DeskMate Link 并开发小智执行端，最后进行三端联调。

### Current execution point

- T11E-A EasyInput 本地扬声器硬件底座已按 [`EASYINPUT_SPEAKER_OUTPUT_V1_FROZEN`](../docs/contracts/easyinput-speaker-output-v1.md) 完成代码与构建门：I2S1 固定 GPIO14/13/15、48 kHz/16-bit/mono-left，复用 GPIO8 `Speaker` 租约，以一次低音量合成开机双提示音作为后续真机门，并用 generation 仲裁保证 T10E 麦克风绝对优先。Host 12/12 与 ESP-IDF v5.5.5 固定 16 MiB 分区构建通过；当前仍为 `HIL_NOT_AUTHORIZED`，实时桌面扬声器下行仍未冻结。
- T10E EasyInput 板载麦克风已按 [`EASYINPUT_AUDIO_CAPTURE_V1_FROZEN`](../docs/contracts/easyinput-audio-capture-v1.md) 完成并经真机验证。电脑麦克风按 D054 作为软件默认输入，EasyInput LAN 麦克风作为可选来源；当前集成不触发新烧录。

- T11D.4 Windows dialog-error root diagnostics supersedes the rejected T11D.3 reconnect workaround. Official evidence keeps event `359` as a same-WebSocket/session TTS-turn boundary and defines event `599` as `DialogCommonError`; DeskMate now drains directly back to listening on the current provider and fails closed on `599`. The repeated welcome root was the local new-session workaround, while the upstream `599` cause remains unknown until one exact-package run yields its new privacy-safe status class. Contract: [`T11D4_DIALOG_ERROR_ROOT_DIAGNOSTICS_V1_FROZEN`](../docs/contracts/t11d4-dialog-error-root-diagnostics-v1.md); audit: [`t11d4-dialog-error-root-cause-audit-2026-09-01.md`](../docs/reviews/t11d4-dialog-error-root-cause-audit-2026-09-01.md).

- T11C companion half-duplex echo guard is implemented on `codex/t11c-companion-layout-echo-guard`. User-present T11B evidence already accepts the real Doubao/computer-microphone/computer-speaker main chain, while natural automatic barge-in remains rejected. The default pauses microphone upload and ignores ASR during actual playback, maps playback to `working`, resumes on manual interruption, requests browser AEC/noise/AGC/mono, and makes the realtime face the first Companion visual. T11D supersedes only its original network-only `tts.end` release point with a played/drain boundary. Contract: [`T11C_COMPANION_HALF_DUPLEX_ECHO_GUARD_V1_FROZEN`](../docs/contracts/t11c-companion-half-duplex-echo-guard-v1.md).

- T11B Doubao live-frame interoperability repair is implemented on `codex/t11b-doubao-real-frame-repair`: the adapter supplies the official fixed App Key, waits for the connection acknowledgement before starting a session, decodes all documented bounded flag/identifier/gzip/error layouts, and surfaces only enumerated redacted failure stages. Official StartConnection/StartSession arrays are external golden tests. The user-present real conversation passed the handshake/capture/session/playback main chain; its acoustic self-interruption finding is handled by T11C. No firmware or hardware behavior changes in this repair.

- T11B Windows computer-audio companion is complete on `codex/t11b-desktop-computer-audio-companion` with implementation commit `371f1189765aecebc198a655c9a6425b1469390a`. It keeps the one T11 controller, uses the selected computer/EasyInput microphone plus computer speaker, locks one source per session, visibly falls back only before start, bounds renderer PCM and playback backlog, supports continuous turns and interruption, and never guesses the still-unfrozen EasyInput speaker downlink. Full regression is `211/211` and Windows packaging passes; user-present real credential/audio HIL remains open. Contract: [`T11B_DESKTOP_COMPUTER_AUDIO_COMPANION_V1_FROZEN`](../docs/contracts/t11b-desktop-computer-audio-companion-v1.md). Handoff: [`t11b-desktop-computer-audio-companion-2026-09-01.md`](../docs/handoffs/t11b-desktop-computer-audio-companion-2026-09-01.md).

- T11A companion/Agent status closure is complete on `codex/t11a-companion-agent-status-closure@cbb9097`: Windows preview and real Xiaozhi state testing are separated, Companion/Connections/Diagnostics share one bounded capability truth model, and `codex-hook-v1` is versioned and explicitly disableable. Automatic Codex evidence covers idle/thinking/working/waiting/completed; `error` remains manual because the official lifecycle has no general failure event and private content inference is forbidden. Full regression is `202/202` and Windows packaging passes. Handoff: [`t11a-companion-agent-status-closure-2026-09-01.md`](../docs/handoffs/t11a-companion-agent-status-closure-2026-09-01.md).

- T12A Windows local-memory controls are complete on `codex/t12a-desktop-memory-controls` with implementation commit `99ecbf6e4f0b5cb2d58113788aa7ba583d675465`. The memory page now supports candidate correction, one-way accept/reject review, reviewed-only export, revision-bound permanent deletion, complete transactional forgetting and an encrypted user-selected knowledge-base location. SQLite remains authoritative; the selected folder is not scanned or written in this package. Full regression is `198/198` and Windows packaging passes. Next software-only slices are T12B deterministic Markdown projection with stable IDs and `[[double links]]`, followed by T12C versioned chunking, embeddings, rebuild and hybrid retrieval. Handoff: [`t12a-desktop-memory-controls-2026-09-01.md`](../docs/handoffs/t12a-desktop-memory-controls-2026-09-01.md).

- T11A Workbench truthfulness hardening is complete on `codex/t11a-desktop-status-truthfulness` with implementation commit `de105c0`. The main dashboard now uses the existing sanitized Link diagnostic, separates local face preview from hardware state, removes fabricated sensor/pose/sync readings, migrates the exact legacy demo task to idle, and derives the header date from local time. Full regression is `192/192` and Windows packaging passes; physical Link confirmation remains a later user-present acceptance. Handoff: [`t11a-desktop-status-truthfulness-2026-09-01.md`](../docs/handoffs/t11a-desktop-status-truthfulness-2026-09-01.md).
- T11A Windows software scope is locked on `codex/t11a-desktop-finalize`, based on cumulative T11A HEAD `d95860b9d1ffe22ae5cee80a1ccd28cd413f49e8`. The final audit covers LAN microphone uplink, persisted source selection and source locking, ordinary-keyboard trigger suppression, Link diagnostics/recovery, and the separated software-preview/hardware-state UX. Full regression is `187/187` and the Windows package builds successfully. Only packaged-app and physical hardware acceptance remain open; EasyInput speaker downlink belongs to the separate T11B/T11E package. Handoff: [`t11a-desktop-software-final-2026-09-01.md`](../docs/handoffs/t11a-desktop-software-final-2026-09-01.md).
- T11A Windows expression/Link UX is implemented on `codex/t11a-expression-link-ux`: the companion page now separates Windows-only expression preview from the real seven-state Xiaozhi test, reuses the one Agent State publisher, and presents EasyInput ACK and Link health as separate evidence. Software code/build gates are closed; the loose physical Link and OLED observations remain `HIL_NOT_RUN` until the user repairs the wiring. Handoff: [`t11a-expression-link-ux-2026-08-31.md`](../docs/handoffs/t11a-expression-link-ux-2026-08-31.md).
- T11A Windows EasyInput audio uplink is implemented on `codex/t11a-desktop-easyinput-audio-uplink`: strict `EIHB/EICC/EICA/EIAU` UDP reception, production `EasyInputLanAudioSource`, a sandboxed four-field T05 configuration transaction and a no-recording microphone-level diagnostic. The main renderer receives no credentials, IP or PCM. Software tests/build may close the code gate, but T10E hardware capture and the later EasyInput speaker downlink remain required before full realtime conversation can be accepted.
- T11A text dictation source selection is implemented on `codex/t11a-desktop-microphone-source-selection`: computer microphone remains the persisted default, EasyInput is an explicit option, every recording locks one source, and only a pre-start board failure may visibly fall back to the selected Windows microphone. Ordinary global keyboard shortcuts default off; EasyInput KEY1/KEY3 continue through VID/PID-scoped Raw Input. T10E capture is hardware-accepted, while this packaged Windows integration and the future speaker sink still require separate acceptance.

- T11 Windows realtime companion core is implemented on `codex/t11-desktop-realtime-companion`: one foreground session controller, Doubao binary adapter, finite reconnect, explicit EasyInput audio source/sink boundary, compact live capsule, T09 expression ownership, and transactional exactly-once local turns. Contract: [`T11_DESKTOP_REALTIME_COMPANION_V1_FROZEN`](../docs/contracts/t11-desktop-realtime-companion-v1.md). Real audio/network/HIL remains blocked on the separate T10E EasyInput adapter and user-present acceptance; this software branch does not touch firmware or hardware.

- T10 Codex real status v1 is implemented as the first privacy-safe provider adapter: repository-local official lifecycle Hooks feed a bounded local named pipe; only the explicitly selected Codex provider can publish into the existing T09 state path, and active VoiceWorkflow remains higher priority. WorkBuddy, Hermes and Claude Code remain manual; no process/window guessing or transcript inspection is allowed. Contract: [`CODEX_REAL_STATUS_V1_FROZEN`](../docs/contracts/t10-codex-real-status-v1.md).

- T09 三端可见状态链已真机通过：七种冻结状态全部由用户确认，`thinking` TTL 自动回 idle，快速 `listening→thinking→working→completed` 由 latest-wins 收敛到开心表情，Link/Agent 计数无协议、断线或队列丢弃错误。证据见 [`t09-three-end-agent-state-acceptance-2026-08-31.md`](../docs/testing/t09-three-end-agent-state-acceptance-2026-08-31.md)。用户离开现场后，实体重启/断线不重放与可选 T03～T06 组合回归明确延期，不允许远程代做硬件操作。
- 当前开发进入 T10A：[`T10_MOTION_SAFETY_CORE_V1_FROZEN`](../docs/contracts/t10-motion-safety-core-v1.md) 只建立默认锁闭的纯 C++ 运动仲裁、校准门、回中、限速、软限位、过期/会话清空和急停/故障锁存。该切片没有 PWM、GPIO、DeskMate Link 动作消息或 `app_main` 入口；真实供电、中心、方向和机械限位仍未知，T10B 真机校准必须等用户在场。
- T08 共享合同已在 `c8b8a344a72a849640c8b19575768d6daf4d6667` 标记为 `DESKMATE_LINK_V1_FROZEN`，EasyInput 总控实现已落在 `codex/easyinput-t08-link-controller@697bffa0f372ef57e4b41fa3fa1d7b39bffbab0e`：完成 UART0 唯一 owner、帧编解码/流式恢复、HELLO/能力/状态生命周期、有限重试、对端重启识别、旧状态不重放和脱敏状态。固件 Host 8/8、ESP-IDF v5.5.5 固定分区构建、桌面 115/115 与打包通过，当前状态为 `HIL_NOT_AUTHORIZED`。小智窗口必须使用同一合同提交和黄金向量；两端代码/构建均通过前不接线，首次连接只读验收见 [`t08-first-read-only-link-acceptance.md`](../docs/testing/t08-first-read-only-link-acceptance.md)。
- T06 已按用户完整人工矩阵锁定。T07 Desktop UI V1 也已由用户确认智能整理与 KEY3 语音编辑后冻结，合同为 [`T07_DESKTOP_UI_V1_FROZEN`](../docs/contracts/t07-desktop-ui-v1.md)：从精确 T06 HEAD `619d85347499545e9af11488bb5d141296ae1dd3` 保留功能基线，主导航固定为七入口，设备连接并入设备与诊断，AI 陪伴统一表情/动作/联动/记忆管理。新增 KEY3 host 语音编辑、可配置文本模型、实时语音凭据安全入口和本地 SQLite 记忆底座；仍不接线、不写小智、不驱动 OLED/舵机、不实现未冻结 DeskMate Link，也不把尚未启用的实时语音/自动摘要伪装为可用。后续 EasyInput 与小智固件短分支都从包含该冻结桌面的最新 `origin/main` 建立，不再各自修改主导航。
- T04 已由另一台笔记本实现、原主电脑独立审计并完成授权 app-only 烧录和完整压力矩阵；已验收固件源码 HEAD 为 `75c65788524523325a4526718ad865ddf9f7a072`，app SHA-256 为 `578A73E8E5FEB675096DAC88F4A512D3EF5CAFE2604D4ED869F457648E45813C`。S1～S7、旋钮灯效、长按、50 次输入、五轮断线、20 次语音键及 DeskMate 回归通过；2026-08-30 更换后的新开发板已补测 S8 并确认正常，旧板 S8 故障仅保留为历史证据。T04 状态为 `T04_LOCKED`。
- T05 [`CONFIG_V1_FROZEN`](../contracts/deskmate-host/easyinput-config-v1.md) 的代码、Host、桌面和 ESP-IDF 构建通过；最终 app-only 镜像已按精确授权烧录并完成配置读取、核心配置编辑、中文/单键界面和 K1 语音触发真机确认。语音识别服务因本机 API 未配置未做端到端转写，重启回读/恢复与完整压力矩阵仍须如实保留为回归项。用户已接受核心功能并明确允许进入下一阶段。
- T06 Host Action 已锁定：固定文字、安全打开应用、配置回读和既有按键/语音能力保持为后续桌面包的回归基线；后续 UI 合并不得改写其 Electron/固件合同。
- T03 已完成五次真机断线矩阵并由原主电脑完成独立代码、Host、IDF 和桌面组合审计：最终 atomic tap 镜像在正常断电重启后均得到 `123abc`，未出现全选或残留 Ctrl。S1～S7、旋钮纵向/横向、DeskMate 语音输入、历史复制和快捷键捕获继续保留通过证据；更换后的新开发板已补测 S8/GPIO48 并确认正常，原 S8 无响应仅是已换下旧板的历史硬件缺陷。T03 状态为 `T03_LOCKED`。
- T03 的历史失败候选和验证过程保留在 `flow/progress.md` 与 `docs/handoffs/`；最终 atomic tap 提交已推送并完成授权 app-only 烧录及五次断线 HIL。旧候选只作为审计历史，不代表当前状态。

- T02 已锁定：工程骨架、八键/旋钮纯逻辑、held-key HID 内部状态、Host 测试和 ESP-IDF v5.5.5 构建通过；未做硬件访问或真机验收。
- T03 [`T03-easyinput-usb-input-runtime.md`](tasks/T03-easyinput-usb-input-runtime.md) 的代码、测试、构建、五次真机 HIL 和原主电脑独立审计门均已关闭。
- T03 只允许实现 [`INPUT_V1_FROZEN`](../contracts/deskmate-host/easyinput-input-v1.md) 切片；完整 DeskMate host contract 仍未冻结，配置、NVS、Host Action、BLE、音频和 DeskMate Link 不得提前实现。
- 代码开发继续放在另一台笔记本，原主电脑负责逐包独立审计、重建和组合回归。T04 已锁定；当前 T05 只实现配置/NVS 与纯 HID 映射，固定文字、Host Action/打开应用等 Windows 主机动作归入 T06，不堆叠未经独立审计的功能包。

1. 冻结单仓三模块目录、来源/许可证、恢复基线和 V1 硬件职责；不整仓复制两个参考工程。
2. V1 使用方案 A：EasyInput 是唯一启用的麦克风/扬声器端点；小智只做 OLED、表情、状态和安全动作，本板音频不初始化。
3. 另一台电脑默认按小功能包开发 EasyInput 新固件、host test、模拟器和无硬件构建；当前主会话电脑默认连接硬件，对每包独立审查与重建，不等待整套固件完成。只有用户明确指定时才临时交换硬件职责。
   - 2026-08-27 恢复默认职责：T03/T04 已完成另一台实现、原主电脑审计与真机锁定。后续另一台笔记本一次只开发一个包并推送，原主电脑逐包审计；当前只开放 [`T05-easyinput-config-nvs.md`](tasks/T05-easyinput-config-nvs.md)。T05 第二轮独立审计仍有合同级阻断，必须回原分支按固定 Maker 行为和失败向量返工；T05 代码门、真机门和锁定全部完成前不开始 T06。
4. 经用户单独授权后，硬件电脑逐包完成 EasyInput 真机验收；再用新固件调通桌面语音、按键映射、配置同步和打开应用闭环。
5. 冻结 DeskMate host contract 与 DeskMate Link v1：版本、能力、命令、状态、序列、幂等、超时、错误、回中、急停和兼容策略。
6. 无硬件笔记本开发小智执行端和模拟器，硬件电脑逐包审查与 HIL；随后才按三线 3.3 V TTL UART 门禁进行首次接线与三端联调。

## Development gate

- 相似功能组成一个小功能包；同一轮不并行打开无关功能包。
- 两台电脑只通过 GitHub 短分支交换产品代码与证据；构建产物、密钥、录音和用户数据不交换、不提交。
- 每包完成后固定执行：定向测试 → 两端或三端连通测试 → 所有已锁定能力全量回归 → 记录证据并锁定。
- 任一步失败就停留在当前包修复，不叠加下一个功能；每完成 2～3 个小功能再跑模块全量测试和关键真机矩阵。
- 摄像头、温湿度和其他扩展设备在控制链、语音链、记忆链和动作链稳定后才进入。

## Implementation stages

### Controller firmware foundation

- 以 EasyInput V2.0 板级合同为硬边界，参考 Maker 的 `components/keyboard`、`main/platform` 和 `host_test`，建立 DeskMate 自己的总控固件模块。
- “重新开发”表示在 DeskMate 仓内按冻结产品合同独立实现，不表示忽略固定参考从零猜测。每个 Maker 已覆盖的子系统必须先完成源码/测试向量差异核对，再写产品实现；正常路径绿测不能替代畸形输入、断线、掉电和恢复失败向量。
- 保留语音键、标准键盘、F22 兼容、板载麦克风、灯光、音效、设备状态和用户需要的 EasyInput 能力。
- 当前小包顺序为：T04 实体输入灯效与共享电源底座（已锁定）→ T05 完整配置/NVS 与纯 HID 映射（已锁定）→ T06 Windows 主机动作/打开应用（已锁定）→ T07 软件陪伴界面候选；后续 BLE、音频、电源深化和总控冻结按同样门禁逐包编号。
- 实现桌面 host contract 与板间 DeskMate Link 路由；不复用 Host Action `0x05` 传送云台动作。
- 现有 Phase 3E 的 `EIHB/EICC/EICA/EIAU` 与厂商 HID codec/模拟板工作并入本阶段的软件—总控链路。

### Yuntai firmware foundation

- 以 `esp32-s3n16r8-emoji` 的硬件证据为起点，参考小智的 `EmotionResponseController`、`EmojiController`、`ServoController`、显示和音频实现，建立 DeskMate 自己的云台固件模块。
- 先实现只读能力/状态，再实现无机械风险表情；完成供电、中心、方向和限位验收后才开放双舵机动作。
- 所有动作经过限幅、队列、忙碌状态、回中和高优先级急停，不允许桌面或总控直接写 PWM。
- 小智云端、唤醒词、MCP 和本板音频链只作为外部参考/恢复基线；DeskMate V1 不初始化小智音频，也不依赖原云端对话。
- 建立唯一动作仲裁器，统一接收人脸连续跟随、对话离散动作、人工回中和待机动画；优先级为急停/故障 > 回中/恢复 > 对话动作 > 人脸跟随 > 待机动画。
- 首版视觉优先运行在电脑侧，输出归一化坐标、置信度与时间戳；当前没有已确认摄像头，不在小智板上猜接相机 GPIO。

### First end-to-end slice

1. `get_capabilities/get_status`：桌面软件经总控板读取云台能力与状态。
2. 表情切换：验证命令、确认、重复、超时、断线和恢复，无舵机动作。
3. 安全动作：真机校准后加入回中和单轴小步动作。
4. 完整闭环：EasyInput 实体键 → 总控事件 → DeskMate 意图 → 总控路由 → 云台动作 → 结果回传并在软件中可见。
5. 人脸跟随：电脑侧模拟/视觉目标 → DeskMate Link → 单一动作仲裁器 → 死区、滤波、限速、限位、丢脸回中；先用模拟舵机验证，再申请真机动作。

### Real AI providers and behavior mapping

- 接入 Codex、Claude Code、Hermes、Workbody 的真实运行状态。
- 统一映射 idle/listening/thinking/working/waiting/completed/error。
- 由 DeskMate 编排后向总控和云台发送高层意图，所有来源保留权限、断线和模拟标签。

### Local companion memory

- Windows 软件管理人物档案、情节/语义记忆、会话上下文、检索索引、备份、导出、纠正和彻底忘记；长期记忆不进入两块板的 NVS/Flash。
- 说话人识别采用显式登记、低置信度询问和本地加密；声纹只用于个性化与记忆归属，不作为高风险操作的唯一身份凭证。
- ASR、LLM 和 TTS 可以分别使用本地或云端适配器；使用云端时只发送本轮必要且经用户许可的最小上下文。

### Release hardening

- 三个模块分别建立测试、构建、版本、产物、许可证和回滚证据。
- Windows 安装包、自动更新、签名、崩溃恢复、隐私说明和数据导出/删除。
- 两套固件的安全升级、配置迁移、恢复流程与真机功能矩阵。
