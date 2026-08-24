# DeskMate EasyInput controller firmware

这是 DeskMate 正式 EasyInput 总控固件的产品目录，不是 Maker 参考工程的副本。

当前状态：`CODE_REVIEW_CONFIRMED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED`。审计返工后的 2 项 host test 与精确 ESP-IDF v5.5.5 最小构建已由另一台电脑独立重跑通过；仍未连接或访问硬件，不代表可烧录、HIL 或真机通过。

第一项实现见 [`T02-easyinput-input-foundation.md`](../../flow/tasks/T02-easyinput-input-foundation.md)：建立 ESP-IDF 5.5.5 构建骨架、八键/旋钮纯逻辑、USB HID 兼容层和 host test。T02 已完成代码、测试与构建门。

当前唯一开放任务是 [`T03-easyinput-usb-input-runtime.md`](../../flow/tasks/T03-easyinput-usb-input-runtime.md)，按冻结的 [`INPUT_V1_FROZEN`](../../contracts/deskmate-host/easyinput-input-v1.md) 建立“实体输入 → USB HID”最小闭环。配置、音频、DeskMate Link 和真机阶段仍由后续独立任务逐包推进；T03 完成并经当前电脑复审前不烧录。

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

Evidence is limited to `CODE_REVIEW_CONFIRMED`, `TEST_CONFIRMED` and `BUILD_CONFIRMED`; recovery preparation and any later hardware authorization remain pending.
