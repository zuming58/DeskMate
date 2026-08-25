# T03 · EasyInput USB input runtime

- 状态：`T03_COLD_BOOT_FIX_READY_FOR_AUTHORIZED_APP_ONLY_HIL`。首次三段写入与正常启动完成；S1～S7、旋钮纵向/横向、DeskMate 语音输入、历史复制和快捷键捕获已有上一轮真机证据。当前测试实板 S8 是烧录前已知硬件阻断，固件仍保留 S8/GPIO48 与八键合同。上一版 mount 首帧全释放仍在 MCU 冷启动且 S6 已按住时复现 Ctrl 粘连；本分支已在唯一 runtime 中增加防抖实体快照和释放确认屏障，并覆盖 HID ready/延迟、发送拒绝、transfer complete/failure、重复 mount、释放早于 mount 首帧完成和旧滚轮不重放。Host 3/3 与 ESP-IDF v5.5.5 / ESP32-S3 构建通过；尚未获得本修复的 app-only 补刷授权，也未执行连续五次真机断线复测。T03 真机通过前不得开始 T04。
- 背景：T02 已完成输入纯逻辑和构建基线，但固件入口仍轮询编码器并丢弃全部 `InputEvent`，没有真实 USB HID 闭环，当前镜像没有烧录验收价值。
- 目标：建立“实体八键/旋钮 → 边沿安全采集 → 唯一默认动作路由 → TinyUSB HID”最小纵向闭环，并提供不含用户数据的只读运行诊断快照。
- 分支：`codex/easyinput-usb-input-runtime`

## Required reading

1. `AGENTS.md`
2. `flow/charter.md`
3. `flow/plan.md`
4. `flow/progress.md` 顶部最新记录
5. `firmware/easyinput-controller/AGENTS.md`
6. `contracts/deskmate-host/README.md`
7. `contracts/deskmate-host/easyinput-input-v1.md`
8. `docs/contracts/easyinput-maker-protocol.md`
9. `docs/architecture/deskmate-v1-hardware-baseline.md`
10. `docs/provenance/reference-baselines-2026-08-24.md`
11. `docs/reviews/t02-easyinput-input-foundation-second-audit-2026-08-24.md`

## External read-only reference

- 路径：`F:\Codex\easyinput-wzm\easy-input-maker`
- 固定提交：`7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- 参考工作区已脏。读取源文件必须使用 `git -C F:\Codex\easyinput-wzm\easy-input-maker show 7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01:<path>` 或隔离 worktree，不能把当前未提交内容当成固定来源。
- 优先核对 `main/platform/usb_hid.cpp`/`.h`、`components/keyboard/` 中的 transport/lifetime/queue 逻辑和相关 host tests；不得修改、清理或提交参考目录，不得复制 build 产物。

## Allowed changes

- `firmware/easyinput-controller/**`
- 新建 `docs/provenance/t03-easyinput-usb-input-runtime.md`
- 完成时更新 `flow/progress.md` 顶部和本任务状态
- 只有发现本合同无法实现的硬冲突时才停下报告；不得在实现分支自行改写冻结合同

## Required implementation

1. 把 `InputCore` 的按键、编码器相位、旋钮按压采样入口拆开；保留 20 ms 防抖和现有合法 Gray-code 语义。
2. 编码器 A/B 配置 any-edge ISR。ISR 把相位和 `esp_timer_get_time()` 单调时间写入 64 项有界队列；owner task 每 tick 采样八键和旋钮按压、顺序消费相位边沿。
3. 实现 raw-edge overflow resync：记录丢弃、清半步、用当前相位重建，不生成虚假 detent；不得在 ISR 中日志、分配或调用 TinyUSB。
4. 建立唯一 `InputActionRouter`，按冻结默认表把物理来源转换为 `KeyboardSnapshot`/`MouseWheelSnapshot`；held chord 由物理来源拥有，重复按下幂等，单来源释放不误伤其他来源。
5. 修订键盘报告内部布局为 modifier + apple_fn + 6 usages；第七 usage fail closed。旋钮按压只在稳定 pressed edge 切换轴一次。
6. 加入 TinyUSB HID transport，保持冻结 VID/PID、Keyboard/Mouse/Vendor Report descriptor；通过受管依赖声明 `espressif/esp_tinyusb` 并提交解析后的 `dependencies.lock`，不得提交 managed components 或 build。
7. 实现 16 项 USB report queue 与单 task owner；mount/unmount/transfer callback 只发布 lifetime/完成状态和通知 owner。
8. 实现断线/重连、queue overflow 和发送失败的防粘键语义；滚轮位移在断线/溢出时丢弃，绝不重放。
9. Vendor `0x10～0x15` 只出现在兼容描述符；T03 的 Feature callback 必须拒绝/忽略，不解析、不保存、不 ACK，Input callback 不发送 `0x11`/`0x15`。
10. 实现只读 `RuntimeDiagnosticsSnapshot`，使用冻结字段；日志保持有界、分类化和脱敏。
11. 更新模块 README/AGENTS/CLAUDE 与真实依赖、测试、构建和“未真机”状态；AGENTS/CLAUDE 必须逐字一致。
12. 逐文件记录独立重实现或派生来源、固定提交、许可证、修改和目标路径。

## Forbidden scope

- 不修改 Windows/Electron/React、`firmware/xiaozhi-yuntai/`、DeskMate Link、冻结合同或外部参考目录。
- 不实现配置/NVS、Host Action/打开应用、BLE、Wi-Fi、音频、LED、GPIO8、GPIO12、电池、睡眠、分区、OTA 或小智通信。
- 不增加自定义诊断线协议，不向 Vendor HID 返回伪成功，不生成自动烧录入口。
- 不扫描端口、不识别设备、不运行 flash/erase/monitor、不读写 Flash，不声明 HIL/真机通过。
- 不提交 build、managed_components、sdkconfig、bin、elf、map、密钥、Wi-Fi、录音、用户数据或本机设备信息。

首次烧录门的唯一分区相关例外不是新功能：必须采用仓内 `partitions.csv` 原样保留已记录的 NVS/PHY/3 MiB factory/双声音 bank 布局，并以 Host 测试、CMake fail-closed 检查和实板备份二进制比较证明没有改变分区。不得初始化或改写 NVS、声音 bank，也不得借此进入 T04/T08/T09。

## Host test gate

- 八键默认动作黄金向量，包含 S1/S3 快捷键和 S5～S8 modifier chord。
- 多键、重复按下、重复释放、相同 usage 不同来源、第七 usage、全释放和 reset。
- 编码器顺/逆、快速合法边沿、抖动、非法跳变、半步 reset、raw queue overflow/resync、旋钮按压防抖与单次轴切换。
- USB 未挂载不排队；mount epoch、unmount、resume、断开时 held chord、重连不重放、全部释放后新 chord 可用。
- HID queue 满、发送失败、release 优先、滚轮 coalesce/丢弃边界和诊断计数。
- USB descriptor 黄金向量：VID/PID、Report ID、方向、payload 长度及默认动作报告 bytes。
- Vendor Feature 输入在 T03 fail closed，且不会改变运行状态或生成 ACK。
- 固件源码合同测试证明 GPIO0/GPIO8/音频/J4 UART 未初始化，ISR 不执行业务或日志，所有队列有界。

## Verification gate

从仓库根运行：

```powershell
cmake -S firmware/easyinput-controller/host_test -B firmware/easyinput-controller/host_test/build -DCMAKE_BUILD_TYPE=Debug
cmake --build firmware/easyinput-controller/host_test/build --config Debug
ctest --test-dir firmware/easyinput-controller/host_test/build -C Debug --output-on-failure
```

在每个新 PowerShell 进程中先激活精确 ESP-IDF v5.5.5，再运行：

```powershell
idf.py --version
idf.py -C firmware/easyinput-controller build
```

同时完成板级只读扫描、`git diff --check`、任务范围、AGENTS/CLAUDE 一致、来源、密钥、ASCII 路径和构建产物检查。只能声明 `TEST_CONFIRMED` / `BUILD_CONFIRMED`。

## Delivery and stop condition

1. 从最新 `origin/main` 创建 `codex/easyinput-usb-input-runtime`，不得从 T02 旧分支继续堆代码。
2. 提交应小而可审计；最终 `git status` 干净。
3. 更新 `flow/progress.md` 顶部，写明测试数量、精确 IDF、镜像大小、静态检查、来源和未执行的硬件操作。
4. 推送该分支，报告 HEAD 哈希，然后停止；不要开始 T04，不要合并 main。
5. 当前硬件电脑将独立审计和重建；只有复审通过、恢复方案准备完毕并取得用户单独授权后，才建立首次烧录/HIL 任务。
