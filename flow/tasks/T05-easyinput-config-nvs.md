# T05 · EasyInput configuration and NVS

- 状态：`BLOCKED_BY_T04 / CONFIG_CONTRACT_NOT_FROZEN`
- 前置：T04 输入灯效经另一台电脑开发、原主电脑独立审计和真机锁定。
- 计划分支：`codex/easyinput-t05-config-nvs`，从 T04 锁定后的最新 `main` 创建。
- 目标：建立“读取板上完整配置 → 校验 → 无损合并用户改动 → 明示差异 → 事务保存 → 重启恢复 → 回读确认”的 Windows↔EasyInput 闭环。

## Contract gate

T05 开始编码前必须先在 `contracts/deskmate-host/easyinput-config-v1.md` 提出并自审配置合同；只有显式标为 `CONFIG_V1_FROZEN` 后才能实现。

在起草合同前，先固定读取 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的配置 schema、分块/CRC、NVS 读写、启动恢复和相关 host tests，产出“可采用行为 / DeskMate 必须改写 / 明确不采用 / 缺失测试”差异表。不得脱离现有参考从零猜协议；首个 HIL 候选失败后必须回到差异表和缺失向量，不得直接提交第二个猜测性修复。

已知风险：固定 Maker 参考中的 `0x13` 返回 `ai_keyboard.config_status.v1` 状态和配置指纹，不等于返回完整 `ai_keyboard.v1` 配置 JSON。不得把 `bytes/crc16` 指纹伪装成完整读取，也不得沿用“先写再猜”的流程。

冻结合同至少定义：能力发现、版本、请求 ID、完整配置读取、分块、最大长度、CRC、顺序、重复块、超时和错误；schema、未知字段保留和兼容；写入前差异与确认；无损 read-modify-write；NVS 事务、掉电、坏配置、迁移、恢复默认与回读；fail-closed 和脱敏诊断。

## Implementation scope after freeze

- 固件完整配置读取、校验、暂存、事务提交、启动恢复和只读状态；
- Windows 主进程/输入桥的版本化适配器；React 只显示脱敏字段、差异、确认和结果；
- 复用唯一配置与输入状态机，保存 S1～S8 和旋钮映射；当前样机不提供 S8 HIL；
- 保持 T04 灯效和 GPIO8 唯一共享电源所有权，不让配置写入阻塞或重置输入反馈。

本包禁止 Host Action、BLE、Wi-Fi 配网、音频、扩展灯效、GPIO8 策略变更、小智和 DeskMate Link。

## Verification and delivery

- 覆盖分块乱序/重复/缺失、长度、CRC、版本、未知字段、无损合并、事务中断、坏 NVS、迁移、回读不一致与 fail-closed；
- 回归 T02～T04 全量 Host、ESP-IDF v5.5.5 构建、桌面基线和必要真机矩阵；
- 烧录继续单独授权，真机验证读取、单字段修改、其他字段保持、重启恢复、失败提示和回读；
- 另一台电脑完成代码、自审和无硬件证据后推送并停止；不得合并 `main` 或开始 T06。原主电脑独立审计并锁定 T05 后才开放 T06。
