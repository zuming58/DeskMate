# DeskMate EasyInput controller firmware

这是 DeskMate 正式 EasyInput 总控固件的产品目录，不是 Maker 参考工程的副本。

当前状态：`CODE_REVIEW_CONFIRMED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED` / `HIL_REWORK_READY_PENDING_APP_ONLY_REFLASH`。首次写入、正常启动、`VID 303A / PID 1006` 枚举、S1～S7、旋钮纵向/横向和 DeskMate 基础回归已有真机证据；当前测试实板 S8 是烧录前已知的单板硬件阻断，不改八键/GPIO48 产品合同。断线测试发现按住 modifier 组合键拔线后 Windows 可能保留旧 modifier；`main@dd7bb69` 已让每次 USB mount 先发送全释放报告并通过 Host CTest 3/3 与 ESP-IDF v5.5.5 构建，尚未补刷，不能声明 HIL 修复通过。

第一项实现见 [`T02-easyinput-input-foundation.md`](../../flow/tasks/T02-easyinput-input-foundation.md)：建立 ESP-IDF 5.5.5 构建骨架、八键/旋钮纯逻辑、USB HID 兼容层和 host test。T02 已完成代码、测试与构建门。

当前唯一开放任务是 [`T03-easyinput-usb-input-runtime.md`](../../flow/tasks/T03-easyinput-usb-input-runtime.md)，按冻结的 [`INPUT_V1_FROZEN`](../../contracts/deskmate-host/easyinput-input-v1.md) 建立“实体输入 → USB HID”最小闭环。配置、音频、DeskMate Link 和真机阶段仍由后续独立任务逐包推进；T03 完成并经当前电脑复审前不烧录。

所有 DeskMate EasyInput 构建必须使用仓内 `partitions.csv`，逐项保留现有板载合同：24 KiB NVS、4 KiB PHY、3 MiB factory app，以及两个 576 KiB 的 `sound_a` / `sound_b` bank。T03 不使用声音 bank，但不得为了最小构建退回 ESP-IDF 默认 1 MiB 分区表；CMake 和 Host source-contract test 会对该布局 fail closed。

参考资料：

- [V1 hardware baseline](../../docs/architecture/deskmate-v1-hardware-baseline.md)
- [EasyInput Maker technical map](../../docs/handoffs/easyinput-maker-technical-map-2026-08-23.md)
- [Reference baselines](../../docs/provenance/reference-baselines-2026-08-24.md)
- 本机只读参考：`F:\Codex\easyinput-wzm\easy-input-maker`

不要把外部参考目录、其 `build/`、固件镜像、NVS、录音或本机设备信息复制到本目录。

## Verification

Host test (no device required):

```powershell
cmake -S firmware/easyinput-controller/host_test -B firmware/easyinput-controller/host_test/build -DCMAKE_BUILD_TYPE=Debug
cmake --build firmware/easyinput-controller/host_test/build --config Debug
ctest --test-dir firmware/easyinput-controller/host_test/build -C Debug --output-on-failure
```

Firmware build (ESP-IDF 5.5.5, ESP32-S3; no `flash` or `monitor`):

```powershell
idf.py -C firmware/easyinput-controller build
```

Evidence is limited to `TEST_CONFIRMED` and `BUILD_CONFIRMED`; recovery preparation, independent code audit and any later hardware authorization remain pending.
