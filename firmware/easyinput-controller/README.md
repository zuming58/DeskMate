# DeskMate EasyInput controller firmware

这是 DeskMate 正式 EasyInput 总控固件的产品目录，不是 Maker 参考工程的副本。

当前状态：`TEST_CONFIRMED / BUILD_CONFIRMED / HIL_CONFIRMED / T03_LOCKED`。2026-08-27 经用户确认，普通命令键 S2/S4/S5～S8 改为同一 USB FIFO 内原子 press→restore tap，S1/S3 语音键继续使用 held snapshot；实现以 Maker 固定提交的 synthetic tap 结构为只读参考并清晰重实现。Host 3/3、ESP-IDF v5.5.5 / esp32s3 构建、五次真机断线矩阵及原主电脑独立审计均通过。当前样机 S8 仍是烧录前已知硬件阻断，不改八键/GPIO48 产品合同。

第一项实现见 [`T02-easyinput-input-foundation.md`](../../flow/tasks/T02-easyinput-input-foundation.md)：建立 ESP-IDF 5.5.5 构建骨架、八键/旋钮纯逻辑、USB HID 兼容层和 host test。T02 已完成代码、测试与构建门。

T03 已锁定。T04 按冻结的 [`INPUT_LED_V1_FROZEN`](../../docs/contracts/easyinput-input-led-feedback-v1.md) 增加 5 颗 WS2812 的按键/旋钮异步反馈及 GPIO8 最小共享电源安全底座；LED 失败不影响 T03 HID。T04 当前仅有 Host 与构建证据，仍等待原主电脑独立审计和授权后的 HIL。配置/NVS 顺延为 T05，Host Action/打开应用顺延为 T06；任何新镜像仍须展示最终 HEAD、app SHA-256 和 app-only 写入范围并取得用户明确授权后才能烧录。

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

从干净 HEAD 构建后，可在已激活的 v5.5.5 环境生成不含本机路径或设备信息的发布清单；清单应写入被 Git 忽略的构建目录，不提交镜像或清单：

```powershell
firmware/easyinput-controller/tools/write-release-manifest.ps1 `
  -BuildDirectory firmware/easyinput-controller/build `
  -OutputPath firmware/easyinput-controller/build/release-manifest.json
```

当前 T03 证据为 `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_CONFIRMED / T03_LOCKED`。T04 只声明 `TEST_CONFIRMED / BUILD_CONFIRMED / PENDING_INDEPENDENT_AUDIT_AND_HIL`；T04 锁定前不开始 T05。
