# DeskMate EasyInput controller firmware

这是 DeskMate 正式 EasyInput 总控固件的产品目录，不是 Maker 参考工程的副本。

当前状态：`TEST_CONFIRMED / BUILD_CONFIRMED / T03_ATOMIC_TAP_PENDING_CLEAN_HEAD_AND_HIL`。冷启动、mount 全释放、transfer identity、GPIO40 生命周期和 DCD 重连候选均在真实断线矩阵继续出现 Ctrl 粘连，不能作为修复。2026-08-27 经用户确认，普通命令键 S2/S4/S5～S8 改为同一 USB FIFO 内原子 press→restore tap，S1/S3 语音键继续使用 held snapshot；实现以 Maker 固定提交的 synthetic tap 结构为只读参考并清晰重实现。Host 3/3 与 ESP-IDF v5.5.5 / esp32s3 dirty-tree 构建通过，等待提交后干净 HEAD 重建、最终 SHA-256 和获授权 HIL。当前样机 S8 仍是烧录前已知硬件阻断，不改八键/GPIO48 产品合同。T03 保持开放，禁止进入 T04。

第一项实现见 [`T02-easyinput-input-foundation.md`](../../flow/tasks/T02-easyinput-input-foundation.md)：建立 ESP-IDF 5.5.5 构建骨架、八键/旋钮纯逻辑、USB HID 兼容层和 host test。T02 已完成代码、测试与构建门。

当前唯一开放任务仍是 T03；本轮执行 [`T03-easyinput-atomic-tap-rework.md`](../../flow/tasks/T03-easyinput-atomic-tap-rework.md)，按修订后的 [`INPUT_V1_FROZEN`](../../contracts/deskmate-host/easyinput-input-v1.md) 关闭普通命令键的断线 modifier 风险。配置、音频和 DeskMate Link 仍由后续独立任务逐包推进；当前只允许在展示最终 HEAD、app SHA-256 和 app-only 写入范围并取得用户明确授权后补刷 T03。

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

当前自动化证据为 `TEST_CONFIRMED` / `BUILD_CONFIRMED`；旧授权不适用于新镜像，必须重新展示最终 HEAD、app SHA-256 和 app-only 范围后才可补刷。不得关闭 T03 或进入 T04。
