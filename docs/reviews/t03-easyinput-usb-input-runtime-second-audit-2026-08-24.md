# T03 EasyInput USB input runtime — second independent audit

- 候选分支：`origin/codex/easyinput-usb-input-runtime`
- 候选提交：`24bf3e776c34290c85fc68916513971be970894e`
- 基线提交：`5bd5ba2b979e8e4f9eedd45060fab87526c4eefb`
- 结论：`REVIEW_CHANGES_REQUIRED`

返工已正确关闭首轮审计发现的“事件溢出后重放旧 key-down”和 HID interface 悬空字符串索引；本机 Host 3/3 与 ESP-IDF v5.5.5 / ESP32-S3 构建也可复现。但 USB 生命周期适配仍会丢失 callback 顺序，且提交所称的完整描述符精确黄金向量并未真正覆盖完整字节，因此本提交仍不得合并、烧录或进入 HIL，也不得开始 T04。

## 1. Blocking findings

### P1 — mount/unmount callback coalescing loses lifecycle order

`firmware/easyinput-controller/main/main.cpp` 用独立的 `mount_pending` 和 `unmount_pending` 布尔标志跨任务传递 TinyUSB 生命周期事件。若 TinyUSB task 在 owner task 消费前连续发布 mount 后 unmount，两个标志都会为真；`publish_callback_work()` 固定先调用 `on_unmount()`、再调用 `on_mount()`，最终把实际已经断开的 endpoint 错记为 mounted，并错误增加 mount epoch。反向顺序也被压成同一个状态，因而无法满足冻结合同的“每次真实 mount 建立新 lifetime、unmount 立即使 lifetime 失效”。

返工要求：用有界、有顺序的生命周期事件传递，或使用单调序列/epoch 加最终状态的等价方案；owner 必须能区分 mount→unmount 与 unmount→mount。增加 host 可测的适配层回归，至少覆盖两种同 tick 顺序、重复 callback、旧 lifetime 的 transfer complete/fail 以及最终 mounted/epoch/queue 状态。callback 仍不得 drain 输入、发送 HID 或执行业务动作。

### P1 — descriptor “exact golden vectors” remain partial

`input_runtime_tests.cpp` 只对 device descriptor 做了完整数组相等；configuration descriptor 仅抽查少量索引，string descriptor 未校验语言字节，HID report descriptor 只解析 Report ID、方向和累计 bit 长度。这可以验证部分语义，却不能防止未被抽查的配置属性、endpoint 字段、usage、logical range、flags 或报告顺序漂移，与任务卡和首轮审计要求的完整 device/configuration/string/report descriptor 黄金向量不等价。

返工要求：把四组描述符的完整预期 bytes（字符串可按语言描述符 bytes 与 UTF-8 文本分别固定）与生产使用的描述符逐字节比较；保留现有语义解析测试作为第二层断言。黄金向量必须同时锁定 VID/PID、总长度、interface string index、endpoint、Report ID、方向、payload 长度、flags、usage 和顺序。

## 2. Confirmed fixes and reproduced evidence

- 事件 ring 溢出后先调用 `discard_pending_events()`，再按当前实体键掩码恢复；“当前已松开”和“当前仍按住”两条端到端回归均通过，旧 Press 不再重放。
- HID interface string index 已改为 `0`，不再引用不存在的索引 4；`managed_components/` 已加入忽略规则。
- Host：显式加载冻结工具链后，CMake 3.30.2 / MSVC 19.43，CTest 3/3 通过。
- 固件：ESP-IDF v5.5.5、target `esp32s3`、Minimal build 成功；镜像 `0x362a0`（221,856 字节），最小 app 分区余量 `0xc9d60`（79%）。依赖为 `esp_tinyusb 1.7.6~2`、`tinyusb 0.21.0~1`。
- 板级扫描：1 PASS、1 WARN、0 FAIL；WARN 仍为扫描器不能识别 C++ `constexpr`。人工复核 S1～S8=`2,47,38,41,1,6,7,48`、编码器=`17/16/18`、USB=`19/20` 正确。
- 范围、来源、ASCII 路径、AGENTS/CLAUDE 逐字一致、构建产物忽略和 `git diff --check` 通过。
- 本轮未连接或识别设备，未扫描端口，未读 Flash，未运行 flash/erase/monitor/HIL；隔离审计 worktree 与生成产物已删除。

## 3. Next gate

另一台电脑继续在原分支完成上述两项返工，重跑 Host 3/3 与精确 ESP-IDF v5.5.5 构建，推送新 HEAD 后停止。本机进行第三轮独立审计；通过前不合并 main、不准备烧录授权卡、不开始 T04。
