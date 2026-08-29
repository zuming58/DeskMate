# Development plan

## Current stage: integrated product foundation

目标：按已冻结的 V1 硬件基线启动正式实现：先完成 EasyInput 总控的小功能包和软件闭环，再冻结 DeskMate Link 并开发小智执行端，最后进行三端联调。

### Current execution point

- T04 已由另一台笔记本实现、原主电脑独立审计并完成授权 app-only 烧录和完整压力矩阵；已验收固件源码 HEAD 为 `75c65788524523325a4526718ad865ddf9f7a072`，app SHA-256 为 `578A73E8E5FEB675096DAC88F4A512D3EF5CAFE2604D4ED869F457648E45813C`。S1～S7、旋钮灯效、长按、50 次输入、五轮断线、20 次语音键及 DeskMate 回归通过；当前样机 S8 保持既有单板硬件阻断，健康替换板到货后补测。T04 状态为 `T04_LOCKED`。
- T05 [`CONFIG_V1_FROZEN`](../contracts/deskmate-host/easyinput-config-v1.md) 的代码、Host、桌面和 ESP-IDF 构建通过；最终 app-only 镜像已按精确授权烧录并完成配置读取、核心配置编辑、中文/单键界面和 K1 语音触发真机确认。语音识别服务因本机 API 未配置未做端到端转写，重启回读/恢复与完整压力矩阵仍须如实保留为回归项。用户已接受核心功能并明确允许进入下一阶段。
- 当前开放 T06：从 T05 最终交接提交创建 `codex/easyinput-t06-host-actions`，先读取任务卡、冻结/核对 Host Action 合同，再实现固定文字和安全打开应用闭环；不得提前开发 BLE、音频、DeskMate Link 或小智。
- 用户已明确授权与 T06 并行启动受限的 T07A：仅实现 Windows 纯领域层 `ForegroundSessionArbiter` 与 host test，合同为 `FOREGROUND_SESSION_V1_FROZEN`；不得修改 T06 路径、既有 VoiceWorkflow、Electron/React 集成、Host Action、任何硬件或 DeskMate Link。T07B 记忆持久化仍为 `NOT_FROZEN`，等待独立合同。
- T07A 已作为独立分支实现并通过 host/full regression；T07B1 的 `MEMORY_OUTBOX_V1_FROZEN` 纯领域队列也已实现并通过定向、全量和桌面构建验证。数据库、加密、提醒、embedding、Wiki 运行时写入和现有 VoiceWorkflow/UI 集成仍属于后续未冻结切片。
- T07C 已实现软件端陪伴外壳：左栏冻结为工作台、语音输入、陪伴、历史记录、词库、按键配置六个高频入口；设备、AI 联动、表情/动作、环境、设置与诊断保留原页面并收敛到陪伴页管理入口。陪伴聆听、提醒、记忆和小智动作当前均明确标为软件预览/待接入，不改变 T06、VoiceWorkflow、持久化或硬件合同。
- T03 已完成五次真机断线矩阵并由原主电脑完成独立代码、Host、IDF 和桌面组合审计：最终 atomic tap 镜像在正常断电重启后均得到 `123abc`，未出现全选或残留 Ctrl。S1～S7、旋钮纵向/横向、DeskMate 语音输入、历史复制和快捷键捕获继续保留通过证据；当前测试实板的 S8 在烧录前即不亮、无输入，记录为单板硬件阻断而不修改全局八键/GPIO48 合同。T03 状态为 `T03_LOCKED`。
- T03 的历史失败候选和验证过程保留在 `flow/progress.md` 与 `docs/handoffs/`；最终 atomic tap 提交已推送并完成授权 app-only 烧录及五次断线 HIL。旧候选只作为审计历史，不代表当前状态。

- T02 已锁定：工程骨架、八键/旋钮纯逻辑、held-key HID 内部状态、Host 测试和 ESP-IDF v5.5.5 构建通过；未做硬件访问或真机验收。
- T03 [`T03-easyinput-usb-input-runtime.md`](tasks/T03-easyinput-usb-input-runtime.md) 的代码、测试、构建、五次真机 HIL 和原主电脑独立审计门均已关闭。
- T03 只允许实现 [`INPUT_V1_FROZEN`](../contracts/deskmate-host/easyinput-input-v1.md) 切片；完整 DeskMate host contract 仍未冻结，配置、NVS、Host Action、BLE、音频和 DeskMate Link 不得提前实现。
- 代码开发继续放在另一台笔记本，原主电脑负责逐包独立审计、重建和组合回归。T04 已锁定；当前 T05 只实现配置/NVS 与纯 HID 映射，固定文字、Host Action/打开应用等 Windows 主机动作归入 T06，不堆叠未经独立审计的功能包。

1. 冻结单仓三模块目录、来源/许可证、恢复基线和 V1 硬件职责；不整仓复制两个参考工程。
2. V1 使用方案 A：EasyInput 是唯一启用的麦克风/扬声器端点；小智只做 OLED、表情、状态和安全动作，本板音频不初始化。
3. 另一台电脑默认按小功能包开发 EasyInput 新固件、host test、模拟器和无硬件构建；当前主会话电脑默认连接硬件，对每包独立审查与重建，不等待整套固件完成。只有用户明确指定时才临时交换硬件职责。
   - 2026-08-27 恢复默认职责：T03/T04 已完成另一台实现、原主电脑审计与真机锁定。后续另一台笔记本一次只开发一个包并推送，原主电脑逐包审计；当前只开放 [`T05-easyinput-config-nvs.md`](tasks/T05-easyinput-config-nvs.md)，T05 锁定前不开始 T06。
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
- 保留语音键、标准键盘、F22 兼容、板载麦克风、灯光、音效、设备状态和用户需要的 EasyInput 能力。
- 当前小包顺序为：T04 实体输入灯效与共享电源底座（已锁定）→ T05 完整配置/NVS 与纯 HID 映射（当前）→ T06 Windows 主机动作/打开应用；后续 BLE、音频、电源深化和总控冻结按同样门禁逐包编号。
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
