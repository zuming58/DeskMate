# T05 · EasyInput configuration and NVS

- 状态：`CONFIG_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / CONFIG_READ_HIL_FAILED_AFTER_TWO_APP_FIXES / ROOT_CAUSE_EVIDENCE_REQUIRED / T06_BLOCKED`
- 恢复提交 `348b22828158b9c1ff5faf1ae8ac1bf93d1193ec` 在另一台电脑有代码审计与构建报告；当前电脑必须独立重跑验证后，才能更新为 `AUDIT_CONFIRMED`。
- 前置：T04 已在原主电脑完成独立审计、构建、烧录、完整真机矩阵并锁定；当前样机 S8 为既有单板硬件阻断，八键/GPIO48 产品合同不变。
- 计划分支：`codex/easyinput-t05-config-nvs`，从本任务交接时用户收到的准确 `origin/main` 哈希创建。
- 目标：建立“读取板上完整配置 → 校验 → 无损合并用户改动 → 明示差异 → 事务保存 → 重启恢复 → 回读确认”的 Windows↔EasyInput 闭环。

## Contract gate

T05 必须严格实现 [`CONFIG_V1_FROZEN`](../../contracts/deskmate-host/easyinput-config-v1.md)，不得在开发分支重新解释或扩展 wire/NVS/renderer 合同。合同变更须停止编码并返回原主电脑重新冻结。

编码前先固定读取 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的配置 schema、分块/CRC、NVS 读写、启动恢复和相关 Host tests，并逐项核对 [`T05 reference audit`](../../docs/provenance/t05-easyinput-config-nvs-reference-audit.md)。不得脱离现有参考从零猜协议；首个 HIL 候选失败后必须回到差异表和缺失向量，不得直接提交第二个猜测性修复。

已知风险：固定 Maker 参考中的 `0x13` 返回 `ai_keyboard.config_status.v1` 状态和配置指纹，不等于返回完整 `ai_keyboard.v1` 配置 JSON。不得把 `bytes/crc16` 指纹伪装成完整读取，也不得沿用“先写再猜”的流程。

2026-08-28 真机补充：Windows 可能把 Feature Report ID 放入 TinyUSB callback 的 `buffer[0]`，也可能通过独立 `report_id` 参数给出。`0x10/0x13` 接收边界必须像固定 Maker 状态请求适配器一样归一化两种形态，并拒绝冲突 ID、未知 ID、越界长度和非零填充；配置读取 HIL 通过前不得关闭 T05。

2026-08-28 第二次真机补充：`fac1fa8` 的 Feature Report 归一化和 `e10211f` 的 `0x04` transfer-complete 修复均已 app-only 烧录，但完整重启 DeskMate 后仍超时；独立原生桥也只观察到设备连接，没有第一条 `config-progress`。下一轮必须按 [T05 HIL blocker handoff](../../docs/handoffs/second-computer-t05-config-read-hil-blocker-2026-08-28.md) 分别观测 `0x13` 接收、首个 `0x11` 发送和 Windows Raw Input 实际形态，不得重复烧录或继续猜测。

冻结合同已定义能力、版本、请求 ID、`0x13` flag `0x02` 完整读取、`0x11` kind `0x06` 分块响应、2048 字节/CRC/顺序/重复/超时；未知字段保留；脱敏差异与 60 秒确认 token；双槽 NVS、掉电恢复、只读 Maker 迁移、恢复默认与回读。实现只能引用该合同，不在代码中另建隐式格式。

## Implementation scope after freeze

- 固件完整配置读取、校验、静态有界暂存、双槽事务提交、启动恢复、来源和只读状态；TinyUSB callback 不做 JSON/NVS，输入报告优先于配置响应；
- Windows 原生输入桥和 Electron 主进程的版本化适配器；完整配置只以 Base64 在桥与主进程之间传递，协议行上限 4096 字符；React 只显示脱敏字段、差异、确认和结果；
- preload 只增加 `readKeyboardConfig()`、`previewKeyboardConfigPatch(patch)`、`commitKeyboardConfig(token)`，原始 JSON、网络/音频字段和设备路径不得进入 renderer；
- 复用唯一配置、输入路由和 USB owner，保存 S1～S8 纯 HID 动作与旋钮配置；当前样机不提供 S8 HIL；
- 保持 T04 灯效和 GPIO8 唯一共享电源所有权，不让配置写入阻塞或重置输入反馈。

T05 可执行动作仅为语音输入/编辑、Enter、Backspace、Select All、Copy、Paste、Undo、合法组合快捷键、Disabled，以及冻结合同内的旋钮纯 HID 行为。固定文字、Host Action/打开应用、历史、设置和 Profile 指令只做原值保留并显示 `T06 pending`，不得发送或伪装成功。

本包禁止 Host Action/固定文字执行、BLE、Wi-Fi 配网、音频、扩展灯效、GPIO8 策略变更、小智和 DeskMate Link。

## Verification and delivery

- 覆盖完整响应黄金向量、分块乱序/重复/缺失、长度、CRC、版本、超时、endpoint epoch、未知字段、多 Profile、无损合并、并发修改和过期 token；
- 覆盖双槽每个事务中断点、坏槽/坏 marker、NVS 初始化/容量/提交失败、只读 Maker `config_v2` 导入、默认恢复和回读不一致；
- 回归 T02～T04 全量 Host、桌面单测/构建和精确 ESP-IDF v5.5.5 `esp32s3` 构建；固定 16 MB 分区逐项不变；
- 烧录继续单独授权，真机验证读取、单字段修改、其他字段保持、重启恢复、失败提示和回读；
- 另一台电脑完成代码、自审、来源记录和无硬件证据后推送分支并停止；不得扫描端口、识别设备、读取 Flash/NVS、烧录、合并 `main` 或开始 T06。原主电脑独立审计并锁定 T05 后才开放 T06。
