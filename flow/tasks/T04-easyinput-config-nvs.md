# T04 · EasyInput configuration and NVS

- 状态：`READY_FOR_REFERENCE_AUDIT_AND_CONFIG_CONTRACT_FREEZE`
- 前置：T03 已在 2026-08-27 完成真机锁定与原主电脑独立审计。
- 计划分支：`codex/easyinput-t04-config-nvs`，从包含 T03 锁定审计的最新 `main` 创建，不从旧 T03 分支或旧 `main` 创建。
- 目标：建立“读取板上完整配置 → 校验 → 无损合并用户改动 → 明示差异 → 事务保存 → 重启恢复 → 回读确认”的 Windows↔EasyInput 闭环。

## Contract gate

T04 开始编码前必须先在 `contracts/deskmate-host/easyinput-config-v1.md` 提出并自审配置合同；只有显式标为 `CONFIG_V1_FROZEN` 后才能实现。

在起草合同前，先固定读取 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的配置 schema、分块/CRC、NVS 读写、启动恢复和相关 host tests，产出“可采用行为 / DeskMate 必须改写 / 明确不采用 / 缺失测试”差异表。不得脱离现有参考从零猜协议；首个 HIL 候选失败后必须回到差异表和缺失向量，不得直接提交第二个猜测性修复。

已知风险：固定 Maker 参考中的 `0x13` 返回 `ai_keyboard.config_status.v1` 状态和配置指纹，不等于返回完整 `ai_keyboard.v1` 配置 JSON。不得把 `bytes/crc16` 指纹伪装成完整读取，也不得沿用“先写再猜”的流程。

冻结合同至少定义：

- 能力发现、版本、请求 ID、完整配置读取、分块、最大长度、CRC、顺序、重复块、超时和错误；
- 当前配置 schema、未知字段保留、规范化规则和向前/向后兼容；
- 写入前差异、用户确认、整份配置的无损 read-modify-write；
- NVS 事务提交、掉电中断、CRC 错误、空配置、旧版本迁移、恢复默认和重启回读；
- 未实现/旧固件/未知报告 fail closed，不返回伪成功；
- 日志与诊断不包含 Wi-Fi、密钥、录音、用户正文、MAC、序列号或完整设备路径。

## Implementation scope after freeze

- EasyInput 固件中的完整配置读取、校验、暂存、事务提交、启动恢复和只读状态；
- Windows 主进程/输入桥中的版本化读取与写入适配器；React 只显示脱敏字段、差异、确认和结果；
- 在现有唯一配置与输入状态机上实现，不复制第二套 keymap/encoder 状态；
- 保存当前七个可测物理键和旋钮的映射；S8 软件字段继续保留，当前样机不提供 S8 HIL。

本包禁止 Host Action 执行、BLE、Wi-Fi 配网、音频、GPIO8/LED、小智和 DeskMate Link。

## Verification and HIL gate

- Host/desktop tests：分块乱序/重复/缺失、长度、CRC、版本、未知字段、无损合并、事务中断、坏 NVS、旧配置迁移、回读不一致和 fail-closed；
- 全量回归 T02/T03：S1～S7、组合键释放、五次断线、快速旋钮、USB 重连不重放；
- ESP-IDF v5.5.5 / `esp32s3` 构建与桌面完整基线；
- 首次形成待烧录候选前关闭 T03 记录的构建可复现性缺口：启用并验证可复现构建，或建立受控发布产物 manifest；同一提交的新构建哈希不得冒充先前真机镜像；
- 烧录必须另行展示 HEAD、镜像 SHA-256 和 app-only 清单并取得用户授权；
- 真机至少验证：读取当前配置、只改一个字段、其他字段逐项保持、重启恢复、CRC/失败提示和回读确认。

## Delivery

另一台开发笔记本完成参考差异表、合同冻结、实现、自审、Host/IDF/桌面构建和静态检查后，更新 `flow/progress.md`，推送 T04 分支并立即停止；不得扫描端口、访问硬件、烧录、合并 `main` 或开始 T05，也不得把模拟/构建证据声明为 HIL。

原主电脑随后独立审查完整 diff，重跑 Host/IDF/桌面组合回归；只有再次展示 HEAD、镜像 SHA-256、app-only 范围并获得用户明确授权后，才执行真机配置/NVS 验收。代码、构建和 HIL 全部通过后才锁定 T04，并允许从其锁定 HEAD 创建 T05。
