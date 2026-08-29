# DeskMate EasyInput controller firmware

这是 DeskMate 正式 EasyInput 总控固件的产品目录，不是 Maker 参考工程的副本。

当前锁定状态：`T03_LOCKED / T04_LOCKED / T05_USER_ACCEPTED_FOR_NEXT_STAGE`。T03 的 held PTT、atomic tap 和断线安全已锁定；T04 的 GPIO12 五灯输入反馈与 GPIO8 唯一共享电源底座已经原主电脑独立审计、授权烧录和完整真机矩阵；T05 核心配置读取、编辑和 K1 语音触发已完成获授权真机确认。当前样机 S8 仍是烧录前已知硬件阻断，不改八键/GPIO48 产品合同。

第一项实现见 [`T02-easyinput-input-foundation.md`](../../flow/tasks/T02-easyinput-input-foundation.md)：建立 ESP-IDF 5.5.5 构建骨架、八键/旋钮纯逻辑、USB HID 兼容层和 host test。T02 已完成代码、测试与构建门。

当前 T06 代码已达到 `TEST_CONFIRMED / BUILD_CONFIRMED / HOST_ACTION_V1_FROZEN / HIL_NOT_AUTHORIZED`：按冻结合同实现固定文字与 UUID 打开应用闭环，同时保留 T03 输入安全、T04 灯效和 T05 配置事务。这里的状态只代表本机测试与构建证据，尚未获得 T06 烧录或 HIL 授权。

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

当前 T03/T04 已锁定，T05 核心功能已获用户允许进入下一阶段。T06 完成后必须推送独立分支并停止，由原主电脑独立审计；只有展示最终 HEAD、app SHA-256、精确 app-only 范围并重新取得明确授权后才可烧录或执行 HIL。
