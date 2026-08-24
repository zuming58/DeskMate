# Second-computer handoff — T03 second-audit rework

在 `F:\Codex\deskmate` 继续原分支 `codex/easyinput-usb-input-runtime`，只修复 T03 第二轮审计问题。不要创建新分支，不要合并 main，不要开始 T04。

## 开工前

1. 读取当前路径生效的 `AGENTS.md`。
2. 读取 `flow/charter.md`、`flow/plan.md`、`flow/progress.md` 顶部最新记录。
3. 读取 `flow/tasks/T03-easyinput-usb-input-runtime.md`、`contracts/deskmate-host/easyinput-input-v1.md`。
4. 读取 `docs/reviews/t03-easyinput-usb-input-runtime-second-audit-2026-08-24.md`。
5. 拉取远程并确认当前分支 HEAD 至少包含 `24bf3e776c34290c85fc68916513971be970894e`；工作区必须干净。

## 只做两项返工

### 1. 保留 TinyUSB 生命周期事件顺序

- 移除无法表达顺序的独立 `mount_pending` / `unmount_pending` 布尔合并方式。
- 使用有界、有顺序的生命周期事件队列，或用单调序列/epoch 加最终状态实现等价且可证明的顺序语义。
- owner 必须区分 mount→unmount 与 unmount→mount；最终 mounted、mount epoch、HID queue 和 held-key suppression 必须与最后一个真实事件一致。
- 把 ESP 适配逻辑中可纯化的部分抽到 Host 可测组件；覆盖两种同 tick 顺序、重复 callback、旧 lifetime transfer complete/fail、断线不重放和重连等待释放。
- callback 只发布状态并唤醒 owner，不得 drain 输入、发送 HID、分配业务对象或执行输入动作。

### 2. 完成真正的完整描述符黄金向量

- 对生产使用的 device、configuration、language/string、HID report descriptor 建立完整逐字节预期并比较，不得只抽查索引或只解析长度。
- 保留当前 Report ID/方向/bit 长度解析断言，形成“完整 bytes + 语义解析”两层测试。
- 明确锁定 VID/PID、配置总长度、interface string index、属性、电流、endpoint、Report ID、方向、payload 长度、usage、logical range、flags 和报告顺序。
- 默认键盘/鼠标序列化 bytes 测试继续保留。

## 禁止范围

- 不改冻结合同，不做配置/NVS、Host Action、打开应用、BLE、Wi-Fi、音频、LED/GPIO8、DeskMate Link、小智或桌面代码。
- 不扫描端口、不识别设备、不读取 Flash，不运行 flash/erase/monitor/HIL。
- 不提交 `build/`、`managed_components/`、`sdkconfig`、bin/elf/map、密钥或用户数据。

## 验证与交接

1. 运行完整 Host CMake/CTest，必须 3/3 通过，并明确列出新增生命周期与完整黄金向量用例。
2. 在精确 ESP-IDF v5.5.5、target `esp32s3` 下运行 `idf.py -C firmware/easyinput-controller build`。
3. 运行板级只读扫描、`git diff --check`、范围、来源、AGENTS/CLAUDE、ASCII、密钥和构建产物检查。
4. 更新 `flow/progress.md` 顶部和 T03 状态，提交并推送原分支。
5. 回复新 HEAD、测试、构建、镜像大小和未执行的硬件操作，然后立即停止；不要合并 main，不要开始 T04。

## 可直接复制给另一台电脑的文字

```text
请在 F:\Codex\deskmate 继续原分支 codex/easyinput-usb-input-runtime 完成 T03 第二轮返工。先读取当前路径生效的 AGENTS.md，再依次读取 flow/charter.md、flow/plan.md、flow/progress.md 顶部、flow/tasks/T03-easyinput-usb-input-runtime.md、contracts/deskmate-host/easyinput-input-v1.md、docs/reviews/t03-easyinput-usb-input-runtime-second-audit-2026-08-24.md 和 docs/handoffs/second-computer-easyinput-usb-input-runtime-second-rework-2026-08-24.md。拉取远程并确认分支至少包含 24bf3e776c34290c85fc68916513971be970894e，工作区干净。

本轮只修两项：第一，把 main.cpp 中会丢失 mount/unmount 先后顺序的独立布尔 pending 标志改成有序、可 Host 测试的生命周期传递，覆盖 mount→unmount、unmount→mount、重复 callback、旧 lifetime complete/fail、最终 mounted/epoch/queue 和 held-key suppression；callback 仍只发布状态并唤醒 owner。第二，把 device/configuration/language-string/HID report descriptor 全部做完整逐字节黄金向量比较，同时保留现有 Report ID、方向和长度语义解析断言，锁定 endpoint、attributes、usage、logical range、flags 和顺序。

不得改冻结合同，不做 T04，不做配置/NVS、Host Action、BLE、Wi-Fi、音频、GPIO8、DeskMate Link、小智或桌面代码；不得扫描端口、识别设备、读写 Flash、flash/erase/monitor/HIL。完成后重跑 Host 3/3、ESP-IDF v5.5.5 esp32s3 构建和全部静态检查，更新 flow/progress.md，提交并推送原分支，报告新 HEAD 后立即停止，不合并 main。
```
