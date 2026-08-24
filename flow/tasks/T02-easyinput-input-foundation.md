# T02 · EasyInput input foundation

- 状态：`CODE_REVIEW_CONFIRMED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED`。首轮审计问题已由提交 `7edb0a6` 修复，并由本机独立复审、重跑 2 项 host test 与精确 ESP-IDF v5.5.5 最小构建；详见 `../../docs/reviews/t02-easyinput-input-foundation-second-audit-2026-08-24.md`。未做设备访问、烧录或 HIL，不代表真机通过。
- 背景：DeskMate 已冻结 V1 硬件职责，但正式 EasyInput 固件目录目前只有骨架。需要先建立一包可独立测试、可构建、可审计的输入基础，再申请任何真机操作。
- 目标：在 `firmware/easyinput-controller/` 建立 ESP-IDF 5.5.5 / ESP32-S3 构建骨架，实现八键、旋钮和 USB HID 的纯逻辑与 host test；完成后停下，交给有硬件电脑审计。

## Required reading

1. `AGENTS.md`
2. `flow/charter.md`
3. `flow/plan.md`
4. `flow/progress.md` 顶部最新记录
5. `firmware/easyinput-controller/AGENTS.md`
6. `docs/architecture/deskmate-v1-hardware-baseline.md`
7. `docs/handoffs/easyinput-maker-technical-map-2026-08-23.md`
8. `docs/provenance/reference-baselines-2026-08-24.md`

## External read-only reference

- 路径：`F:\Codex\easyinput-wzm\easy-input-maker`
- 必须核对提交：`7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- 该目录已有未提交内容，只能查阅，禁止修改、清理、提交、复制 build 产物或直接在其中开发正式固件。

## Frozen board facts

- EasyInput V2.0 / 固件别名 `v2` / PCB 丝印 AI Keyboard V2.1；ESP32-S3R8，16 MB Flash。
- S1～S8：GPIO `2,47,38,41,1,6,7,48`，低有效、内部上拉；GPIO0 不是 S5。
- 编码器 A/B/按压：GPIO `17/16/18`；A/B 是正交相位，不按两个普通按键实现。
- USB D-/D+：GPIO19/20。
- 本任务不得配置或切换 GPIO8；它是 LED、麦克风和扬声器共享电源域。

## Allowed changes

- `firmware/easyinput-controller/**`
- 必要的 `docs/provenance/**` 来源记录
- 完成时更新 `flow/progress.md` 顶部
- 仅在发现稳定新决策时更新 `flow/decisions.md`

## Required implementation

1. 创建最小 ESP-IDF 5.5.5 工程与 `esp32s3` target 声明，不引入外部构建产物。
2. 把板级 GPIO 声明与按键/编码器纯逻辑分层；host test 不依赖 ESP-IDF GPIO 驱动。
3. 实现八键独立按下/释放、多键同时按下和防抖状态机。
4. 实现编码器合法 Gray-code 转移、顺/逆时针完整 detent、按压防抖，并忽略非法跳变。
5. 建立 USB HID 键盘动作的内部中立表示和编码边界；第一包不实现产品配置写回。
6. 为正常、抖动、长按、重复采样、多键、旋钮正反转、非法相位、启动初态和重启复位写确定性 host test。
7. 更新本模块 README/AGENTS 中真实可用的 host-test 和 build 命令。
8. 记录所有参考文件的来源、固定提交、许可证、采用方式和目标路径；优先按公开合同重新实现，复制/派生必须逐文件说明。

## Forbidden scope

- 不修改 Windows 桌面代码、`firmware/xiaozhi-yuntai/`、DeskMate Link 或现有 Maker 参考目录。
- 不实现配置读写、Host Action、BLE、Wi-Fi、LED、音频、GPIO8、电池、睡眠、NVS、分区、OTA 或小智通信。
- 不扫描串口，不执行 flash、erase、monitor，不生成自动烧录入口，不访问设备。
- 不提交 `build/`、`.bin`、`.elf`、`.map`、sdk 本机路径、密钥、Wi-Fi、录音或用户数据。
- 不把 `BUILD_CONFIRMED` 写成真机通过。

## Verification gate

- host test 全部通过，错误/非法输入 fail closed。
- 使用 ESP-IDF 5.5.5 完成一次干净 `idf.py build`；记录精确版本和命令。
- 板级常量与本任务冻结事实一致；GPIO0、GPIO8、GPIO19/20 没有误用。
- `git diff --check`、密钥/构建产物检查通过。
- 分支只包含本任务范围，提交小且来源记录完整。
- 证据最高标记为 `TEST_CONFIRMED`、`BUILD_CONFIRMED`。

## Delivery

- 分支：`codex/easyinput-input-foundation`
- 完成后更新 `flow/progress.md` 顶部，提交并推送分支，然后停止；不要继续第二功能包。
- 有硬件电脑将独立审查、重跑 host test 和 IDF build；审查通过后才讨论单板烧录授权。
