# T03 final independent audit - 2026-08-27

## Verdict

`ACCEPTED / T03_LOCKED`.

原主电脑独立复核 `origin/main@39ac64e2dbd099f9de076a019e456f822c683aef` 到 `origin/codex/easyinput-t03-cold-boot-reconnect@ed842aadf255f8f64bdeb88bd13091dc30e416d9`，未发现阻断 T03 的代码、合同、来源或范围问题。最终行为代码提交为 `5c0988097c44194269bb1c7b23fa24277fae6680`；`ed842aa` 只补充交接和验收文档。

## What was independently checked

- 审查 28 个变更文件，确认没有进入桌面实现、小智、配置/NVS、Host Action、BLE、Wi-Fi、音频、GPIO8、DeskMate Link 或分区迁移。
- 核对 `INPUT_V1_FROZEN` 修订：S1/S3 保留 held PTT；S2/S4/S5～S8 使用稳定 Press 触发的原子 press→restore，Release 只 rearm。
- 代码确认 press/restore 在同一 16 项 FIFO 中先检查两个空槽，再连续写入；容量不足、发送失败、lifetime 变化和队列恢复均 fail closed。
- 固定读取 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的 `HidTap`、snapshot delivery、FIFO 和对应 host tests。DeskMate 采用的是 synthetic tap 的行为结构，仍保留自己的单一 `InputActionRouter`、USB owner、描述符和队列；来源与 PolyForm Noncommercial 1.0.0 已记录。
- 手工核对 GPIO `2,47,38,41,1,6,7,48`、编码器 `17/16/18`、USB `19/20`、低有效 SEN_VIN `40`；GPIO0、GPIO8、音频和 J4 UART 未进入 T03 初始化。
- 用户对已烧录 `5c09880` 镜像完成五次断线矩阵，五次均得到 `123abc`；前两次有只读 Raw Input/PnP 辅助证据，后三次是用户连续观察。既有 S1～S7、旋钮、DeskMate 语音、历史复制和快捷键回归证据继续有效。S8 是当前样机在烧录前已知的物理阻断，不降级八键软件合同。

## Independent verification

- 精确 `5c09880` 干净工作树：Host CTest 3/3 通过；ESP-IDF v5.5.5、target `esp32s3` 构建通过；app 大小 `0x37310`，3 MiB factory 余量 93%。
- 交接 HEAD `ed842aa`：Host CTest 3/3 和 ESP-IDF v5.5.5/esp32s3 构建再次通过。
- 分区表 SHA-256 为 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`，内容仍是 24 KiB NVS、4 KiB PHY、3 MiB factory、两个 576 KiB sound bank。
- 桌面组合回归：`npm ci --include=dev`、`npm test` 68/68、`npm run build:desktop` 通过。
- 板级扫描：1 PASS、1 个静态声明识别 WARN、0 FAIL；该 WARN 由扫描器未识别 `inline constexpr` 引脚声明引起，已手工核对实际声明。
- `git diff --check`、AGENTS/CLAUDE 逐字一致、ASCII 路径、范围、来源、密钥和跟踪构建产物检查通过。
- 本次审计没有扫描端口、读取或写入 Flash、烧录、擦除、monitor、eFuse 或操作小智。

## Non-blocking corrections and follow-up

返回交接曾把测试端口和 MAC 后缀写进 Git；本次已脱敏，具体身份只允许保存在 Git 外私有恢复记录。

精确 `5c09880` 的新构建与真机镜像大小相同，但 SHA-256 不同。原因是当前生成配置启用 `CONFIG_APP_COMPILE_TIME_DATE=y` 且未启用 `CONFIG_APP_REPRODUCIBLE_BUILD`。因此，本审计确认“固定源码可在精确工具链构建”，不冒充“已烧录二进制逐字节复现”。该问题不否定已经记录的真机镜像哈希和五次 HIL，但必须在下一次烧录前通过可复现构建或受控发布产物 manifest 关闭。

## Next gate

T04 由另一台笔记本从包含本审计的最新 `main` 创建 `codex/easyinput-t04-config-nvs`。编码前必须先提交 Maker 配置/NVS 参考差异表和 `CONFIG_V1_FROZEN` 合同；T04 完成后推送并停止，由原主电脑独立审计。T04 锁定前不得开始 T05。
