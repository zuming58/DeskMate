# DeskMate EasyInput controller firmware

这是 DeskMate 正式 EasyInput 总控固件的产品目录，不是 Maker 参考工程的副本。

当前状态：`TEST_CONFIRMED` / `BUILD_CONFIRMED` / `T03_USB_DCD_RECONNECT_PENDING_HIL`。冷启动候选 `a97d85e`、`dd7bb69`、`8ce5712` 和 `16bad4f` 均在指定断线矩阵第二次再次发生 Ctrl 粘连，已被真机证据否决。当前返工针对电池供电时拔 USB 不会复位的事实：V2 GPIO40 低有效 USB 物理存在信号经 25 ms 确认后显式驱动 TinyUSB DCD 软断开/软连接，真实 mount 继续建立新 epoch；mount、恢复和无 Press owner 的实体释放在首份全零报告完成后还会做 500 ms 有界重申。在途 HID 完成/失败仍匹配 epoch、Report ID、长度和 payload。Host 3/3 与 ESP-IDF v5.5.5 / `esp32s3` 构建已通过，尚未烧录或真机验证。当前样机 S8 仍是烧录前已知硬件阻断，不改八键/GPIO48 产品合同。T03 保持开放，禁止进入 T04。

第一项实现见 [`T02-easyinput-input-foundation.md`](../../flow/tasks/T02-easyinput-input-foundation.md)：建立 ESP-IDF 5.5.5 构建骨架、八键/旋钮纯逻辑、USB HID 兼容层和 host test。T02 已完成代码、测试与构建门。

当前唯一开放任务是 [`T03-easyinput-usb-input-runtime.md`](../../flow/tasks/T03-easyinput-usb-input-runtime.md)，按冻结的 [`INPUT_V1_FROZEN`](../../contracts/deskmate-host/easyinput-input-v1.md) 建立“实体输入 → USB HID”最小闭环。配置、音频和 DeskMate Link 仍由后续独立任务逐包推进；当前只允许在展示最终 HEAD、app SHA-256 和 app-only 写入范围并取得用户明确授权后补刷 T03。

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
