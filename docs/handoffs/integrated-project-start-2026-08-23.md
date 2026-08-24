# DeskMate integrated software and hardware project start · 2026-08-23

> 本文件记录用户对产品边界的最终澄清，并取代早期交接中“DeskMate 只开发 Windows companion、两套固件长期留在外部工程”的说法。

## Product boundary

`F:\Codex\deskmate` 是 DeskMate 唯一正式产品仓库。最终交付包含三部分：

1. Windows 桌面软件；
2. 运行在 EasyInput V2.0 / ESP32-S3 上的 DeskMate 总控固件；
3. 运行在小智云台 ESP32-S3 板上的 DeskMate 云台固件。

外部目录只作为现有实现、硬件事实和验证方法的参考源：

| 路径 | 身份 | 使用规则 |
| --- | --- | --- |
| `F:\Codex\deskmate` | 正式产品仓库 | 新软件、新固件、跨模块合同、测试和发布资料最终进入这里 |
| `F:\Codex\easyinput-wzm\easy-input-maker` | EasyInput Maker 参考固件 | 读取板级能力、协议、纯逻辑和测试；不整仓复制，不覆盖其未提交改动 |
| `F:\Codex\xiaozhi-yuntai` | 小智云台参考固件 | 读取 OLED、表情、双舵机、音频和网络实现；不把旧 build 当成正式产物 |
| `F:\Codex\ai hardware` | 历史课程与构思资料 | 只按需取证，不整目录回灌产品仓 |

本仓按单仓多子项目管理：根级只维护一套 `flow/`、`docs/` 和 hook；正式固件模块建立后各自补局部 `AGENTS.md`、构建和测试入口，不嵌套第二套 Git 或 Project Flow。

## Intended product topology

```text
DeskMate Windows software
        ↕ versioned host contract
EasyInput ESP32-S3 controller firmware
        ↕ DeskMate Link v1 (transport not yet selected)
Xiaozhi ESP32-S3 yuntai firmware
        → OLED / expressions / horizontal and vertical servos / local audio
```

EasyInput 板是外部硬件总控，不只是一个输入外设。它负责承接实体输入和本板能力、与桌面软件交换高层状态/命令，并与小智云台板通信。小智板是受控执行节点，负责安全执行表情、屏幕、双舵机和本板音频动作。

最终是否保留参考固件的云端能力、哪些功能由总控板拥有、两块板采用 UART/BLE/Wi-Fi/其他介质，均需在硬件证据和正式合同下决定；当前不能凭芯片通用能力猜测。

## Evidence now available

### DeskMate desktop baseline

- React/Vite + Electron + .NET Raw Input bridge 已迁入当前仓库。
- 自动化测试当前为 60/60；迁移记录中的桌面构建和冒烟通过仍需与用户人工复验分开记录。
- 当前正式录音源仍是电脑麦克风；Maker 板载音频和厂商 HID 尚待正式接入。

### EasyInput reference baseline

- 参考仓当前公开基线：`7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` / `v0.4.53`。
- Host Action v1 位于 `ff9f618`；`0x11/0x05` 只表示打开电脑应用，不能复用为板间协议。
- 协议/业务逻辑优先查 `components/keyboard/`，真实 ESP-IDF 适配查 `main/platform/`，预期行为查 `host_test/`。
- 板级 GPIO、BOOT、GPIO8、USB 和音频安全边界以 `easyinput-board-cy` 证据为上限。

完整地图见 [EasyInput Maker technical map](easyinput-maker-technical-map-2026-08-23.md)。

### Xiaozhi reference baseline

- 参考工程 `xiaozhi` 1.9.0，目标 `esp32s3`，当前板型 `esp32-s3n16r8-emoji`。
- 已在精确 ESP-IDF 5.5.3 下从当前路径完成 2,266/2,266 Ninja 步骤；这只是 `BUILD_CONFIRMED`。
- 内部复用入口为 `EmotionResponseController`、`EmojiController` 和 `ServoController`；桌面或总控固件不得绕过限幅/队列直接写 PWM。
- 当前没有表情/舵机 MCP、本地 UART 应用协议、USB CDC 应用协议、BLE GATT 或本地 HTTP/WebSocket 控制服务。
- 舵机供电、共地、机械零位/限位和可用板间物理接口仍为 `UNKNOWN`。

DeskMate 侧精简索引见 [Xiaozhi integration reference](../references/xiaozhi-yuntai-integration-reference.md)，完整五份地图保留在 `F:\Codex\xiaozhi-yuntai\docs`。

## Licensing and provenance

- EasyInput Maker 项目自有代码使用 PolyForm Noncommercial 1.0.0，并要求保留指定 notice；任何直接复制或派生必须逐文件记录来源、许可证与修改。
- 小智参考源码根许可证为 MIT；复制或派生的实质性代码必须保留版权和许可文本，并继续审计 managed components、模型、声音和图片的独立许可证。
- “参考思路后重写”与“复制/派生源码”要在评审中明确区分；来源不明的代码、二进制、模型和素材不得进入正式仓库。

## Development entry gates

开始正式实现前按以下顺序推进：

1. 用户人工复验迁移后的 DeskMate 桌面功能；
2. 冻结本仓的正式模块目录、构建入口、许可证清单和来源记录方式；
3. 依据两块实板的原理图、照片、供电和可用接口证据选择板间传输；
4. 冻结 DeskMate host contract 与 DeskMate Link v1，至少包含版本、能力、状态、序列、超时、错误、回中和急停；
5. 先在电脑上完成 codec、状态机、模拟总控板和模拟云台测试；
6. 依次完成只读能力查询、无机械风险表情、校准后的单轴小步动作，再进入完整闭环；
7. 烧录、读取 Flash、备份 NVS/分区或驱动舵机都需要单独授权，不能由“开始开发”自动扩权。

第一条完整产品链建议验证：

```text
EasyInput key
  → controller firmware event
  → DeskMate desktop intent
  → controller firmware command routing
  → yuntai expression/action
  → action result through controller
  → DeskMate visible status
```

具体动作应先选择无机械风险的 `get_capabilities/get_status` 或表情切换；`happy_nod` 只有在舵机供电、方向、中心和限位得到真机证据后才能进入硬件验收。
