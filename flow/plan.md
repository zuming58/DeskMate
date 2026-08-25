# Development plan

## Current stage: integrated product foundation

目标：按已冻结的 V1 硬件基线启动正式实现：先完成 EasyInput 总控的小功能包和软件闭环，再冻结 DeskMate Link 并开发小智执行端，最后进行三端联调。

### Current execution point

- T03 首次写入、正常启动、S1～S7、旋钮纵向/横向、DeskMate 语音输入、历史复制和快捷键捕获均已取得真机通过证据；当前测试实板的 S8 在烧录前即不亮、无输入，继续记录为单板硬件阻断而不修改全局八键/GPIO48 合同。断线压力测试发现“按住 S6 拔线、重新连接后 Windows 残留 Ctrl”；`dd7bb69` 的 mount 首帧全释放修复经 app-only 补刷、完整关机/开机后，同一场景仍复现。当前状态为 `T03_HIL_FAILED_CTRL_STICKY_AFTER_APP_REFLASH`，已交接另一台硬件笔记本继续 T03 冷启动模型修复；T04/T05 继续关闭。
- T03 首次写入基线已推送 `main@fb9a17573a8cf4be76db6aadc8ce4e67fa8c0bd9`；断线修复候选为本机提交 `dd7bb69`，尚未推送、尚未补刷。该候选 Host CTest 3/3、ESP-IDF v5.5.5 / ESP32-S3 构建、桌面 68/68、桌面打包和打包烟测通过，只声明 `TEST_CONFIRMED` / `BUILD_CONFIRMED`，不冒充补刷后的 HIL。

- T02 已锁定：工程骨架、八键/旋钮纯逻辑、held-key HID 内部状态、Host 测试和 ESP-IDF v5.5.5 构建通过；未做硬件访问或真机验收。
- 当前唯一开放任务仍是 [`T03-easyinput-usb-input-runtime.md`](tasks/T03-easyinput-usb-input-runtime.md)，代码门和首次写入门已关闭；下一道门是正常启动、HID 枚举与完整真机 HIL。T03 真机锁定前不进入 T04。
- T03 只允许实现 [`INPUT_V1_FROZEN`](../contracts/deskmate-host/easyinput-input-v1.md) 切片；完整 DeskMate host contract 仍未冻结，配置、NVS、Host Action、BLE、音频和 DeskMate Link 不得提前实现。
- T03 分支推送后由当前电脑独立审计与重建。只有代码门通过、原 Maker 恢复方案准备完毕并获得用户单独授权后，才执行 EasyInput 第一次烧录和 HIL。

1. 冻结单仓三模块目录、来源/许可证、恢复基线和 V1 硬件职责；不整仓复制两个参考工程。
2. V1 使用方案 A：EasyInput 是唯一启用的麦克风/扬声器端点；小智只做 OLED、表情、状态和安全动作，本板音频不初始化。
3. 另一台电脑默认按小功能包开发 EasyInput 新固件、host test、模拟器和无硬件构建；当前主会话电脑默认连接硬件，对每包独立审查与重建，不等待整套固件完成。只有用户明确指定时才临时交换硬件职责。
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
