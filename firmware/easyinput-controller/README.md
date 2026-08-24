# DeskMate EasyInput controller firmware

这是 DeskMate 正式 EasyInput 总控固件的产品目录，不是 Maker 参考工程的副本。

当前状态：`T02_IMPLEMENTED`。本包提供 ESP-IDF 5.5.5 / ESP32-S3 骨架、平台无关输入核心和 host test；无硬件电脑未执行真机操作。

第一项实现见 [`T02-easyinput-input-foundation.md`](../../flow/tasks/T02-easyinput-input-foundation.md)：建立 ESP-IDF 5.5.5 构建骨架、八键/旋钮纯逻辑、USB HID 兼容层和 host test。第一包完成并经有硬件电脑审计前，不进入配置、音频、DeskMate Link 或真机阶段。

参考资料：

- [V1 hardware baseline](../../docs/architecture/deskmate-v1-hardware-baseline.md)
- [EasyInput Maker technical map](../../docs/handoffs/easyinput-maker-technical-map-2026-08-23.md)
- [Reference baselines](../../docs/provenance/reference-baselines-2026-08-24.md)
- 本机只读参考：`F:\Codex\easyinput-wzm\easy-input-maker`

不要把外部参考目录、其 `build/`、固件镜像、NVS、录音或本机设备信息复制到本目录。

## Verification

Host test (no device required):

```powershell
cmake -S host_test -B host_test/build -DCMAKE_BUILD_TYPE=Debug
cmake --build host_test/build --config Debug
ctest --test-dir host_test/build -C Debug --output-on-failure
```

Firmware build (ESP-IDF 5.5.5, ESP32-S3; no `flash` or `monitor`):

```powershell
idf.py set-target esp32s3
idf.py build
```

Evidence is limited to `TEST_CONFIRMED` and `BUILD_CONFIRMED`; hardware audit is pending.
