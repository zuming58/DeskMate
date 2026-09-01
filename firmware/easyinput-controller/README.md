# DeskMate EasyInput controller firmware

这是 DeskMate 正式 EasyInput 总控固件的产品目录，不是 Maker 参考工程的副本。

当前基线状态：`T03_LOCKED / T04_LOCKED / T05_USER_ACCEPTED / T06_LOCKED / T08_LINK_HIL_CONFIRMED / T09_THREE_END_INTEGRATED / EASYINPUT_APP_FLASH_CONFIRMED / EASYINPUT_NORMAL_BOOT_CONFIRMED / EIGHT_KEY_ENCODER_LED_REGRESSION_CONFIRMED`。T03 的 held PTT、atomic tap 和断线安全已锁定；T04 的 GPIO12 五灯输入反馈与 GPIO8 唯一共享电源底座已经独立审计、授权烧录和完整真机矩阵；T05 配置、T06 Host Action 与桌面链路已完成人工验收。当前更换后的新开发板 S1～S8、旋钮旋转/按压和灯效均已通过；S8 无响应只属于已换下旧板的历史硬件问题，不改八键/GPIO48 产品合同。

第一项实现见 [`T02-easyinput-input-foundation.md`](../../flow/tasks/T02-easyinput-input-foundation.md)：建立 ESP-IDF 5.5.5 构建骨架、八键/旋钮纯逻辑、USB HID 兼容层和 host test。T02 已完成代码、测试与构建门。

T08 EasyInput Link 总控已经完成双板握手、双向信号断开、重连和对端重启真机验收：UART0 使用 GPIO43/44，只有一个 owner 任务；UART 初始化失败只将 Link 标为 faulted，不影响既有输入、灯效、配置或 Host Action。T09 在该基线上增加冻结的 HID `0x12` 状态接收与 `SET_AGENT_STATE` 转发桥；EasyInput T09 app 已完成 app-only 烧录、精确回读、正常 HID 启动和八键/旋钮/灯效回归，小智 T09 OLED app 与完整三端状态链仍待单独烧录和真机验收。

T10E 在三端 T09 验收基线上增加 EasyInput 板载麦克风上行：完整配置只投影 `wifi_ssid`、`wifi_password`、`audio_host`、`audio_port`，使用 I2S0 `GPIO9/10/11`、既有 GPIO8 `KeyboardMic` 租约、64 帧 PSRAM 队列和冻结的 `EIHB/EICC/EICA/EIAU` LAN 合同。S1/S3 只准备网络，录音必须由合法 `EICC start` 发起；音频失败保持 fail-soft。T10E 已完成真实收音与语音输入验收，电脑麦克风仍是桌面默认，板载麦克风保留为可选能力。

T11E-A 冻结并实现本地扬声器硬件底座：I2S1 使用 `GPIO14/13/15`、48 kHz/16-bit/mono-left、既有 GPIO8 `Speaker` 租约，并由 generation 仲裁保证麦克风绝对优先。当前只有一次低音量合成开机双提示音用于后续真机门；没有桌面实时下行协议，不读取或写入声音 bank，也不触碰 BLE、小智音频或舵机。Host/构建通过不等于扬声器真机通过。

T10D-A 冻结并实现手动校准转发桥：Windows 通过 Feature `0x16` 提交一个有 CRC、确认 ID 和单调请求 ID 的 63-byte 请求，EasyInput 通过 Input `0x17` 分别报告已接收与小智终态。总控只逐字节转发既有 T10C `0x20/0x21`，保持 250 ms/三次发送、断线/重启清空和单请求门禁。它没有角度、PWM、脉宽、GPIO 或实体舵机 adapter；生产小智 `MOTION` 仍关闭，所以代码/构建通过不是运动真机通过。

所有 DeskMate EasyInput 构建必须使用仓内 `partitions.csv`，逐项保留现有板载合同：24 KiB NVS、4 KiB PHY、3 MiB factory app，以及两个 576 KiB 的 `sound_a` / `sound_b` bank。T03 不使用声音 bank，但不得为了最小构建退回 ESP-IDF 默认 1 MiB 分区表；CMake 和 Host source-contract test 会对该布局 fail closed。

参考资料：

- [V1 hardware baseline](../../docs/architecture/deskmate-v1-hardware-baseline.md)
- [EasyInput Maker technical map](../../docs/handoffs/easyinput-maker-technical-map-2026-08-23.md)
- [Reference baselines](../../docs/provenance/reference-baselines-2026-08-24.md)
- [T10E audio capture contract](../../docs/contracts/easyinput-audio-capture-v1.md)
- [T10E Maker reference audit](../../docs/provenance/t10e-easyinput-audio-capture-reference-audit.md)
- [T11E-A speaker output contract](../../docs/contracts/easyinput-speaker-output-v1.md)
- [T11E-A Maker reference audit](../../docs/provenance/t11e-a-easyinput-speaker-reference-audit.md)
- [T10D-A manual calibration host transport](../../contracts/deskmate-host/easyinput-manual-calibration-v1.md)
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

T09 三端候选必须在最终 HEAD 干净重建并列出两块板各自的 app 地址、大小、SHA-256、写入与扇区范围后，逐板取得明确授权。T09 只允许点亮 OLED 和传递七种状态；不得驱动舵机或初始化小智音频。
