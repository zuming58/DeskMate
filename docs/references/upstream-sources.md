# Pinned upstream sources

| Repository | Purpose | Pinned commit |
| --- | --- | --- |
| [CY-CHENYUE/easy-input-maker](https://github.com/CY-CHENYUE/easy-input-maker) | EasyInput V2.0 reference firmware and host tests | current reference `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`; original protocol study `34087cd40d24d23579da0357973ebc1a37e7ce7c` |
| Local `F:\Codex\xiaozhi-yuntai` source copy | Xiaozhi ESP32-S3 OLED/servo/audio/network reference | no Git identity; build inputs and SHA-256 recorded in its `docs/xiaozhi-yuntai-baseline-report.md` |
| [CY-CHENYUE/easyinput-board-cy](https://github.com/CY-CHENYUE/easyinput-board-cy) | Board contract and hardware safety boundaries | `73973762515a6e86a7005b7ab12a8c6618fefdf8` |
| [CY-CHENYUE/project-flow-cy](https://github.com/CY-CHENYUE/project-flow-cy) | File-based multi-computer and multi-agent workflow | `7d3ad181f65e034b7b45cff916f15cfd8fc7db74` |

完整参考仓库、managed components 和构建产物不进入 DeskMate Git 历史。正式 DeskMate 固件只迁入经过选择、审计和来源记录的代码或重写实现：EasyInput Maker 项目自有代码受 PolyForm Noncommercial 1.0.0 约束；小智参考源码根许可证为 MIT；第三方组件、模型和资产继续按各自许可证处理。

## Desktop protocol implementation record

- 日期：2026-08-23。
- 证据源：本地只读参考 `F:\Codex\easyinput-wzm\easy-input-maker@7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`；读取时该参考工作区本身已有未提交修改，未从这些修改复制源码。
- 使用方式：依据公开的 `0x10` 配置分块、`0x11` App Command、`ai_keyboard.v1` 和 Host Action UUID 合同，在 DeskMate 中独立实现 Windows 侧 codec、严格校验、应用 UUID 注册表和输入桥事件；没有搬入外部固件文件或二进制。
- DeskMate 目标路径：`electron/easyinput-config.cjs`、`electron/app-actions.cjs`、`electron/input-bridge*.cjs`、`native/DeskMate.InputBridge/Program.cs`、`src/domain/keymap.js` 及对应测试。
- 安全门禁：当前 Maker 配置写入是整份覆盖。DeskMate 在能够先读取、校验并合并板上网络、音频和按键配置前，阻止从 UI 发起实际写入，避免局部按键设置清空既有配置。
