# T03 EasyInput USB input runtime · first independent audit

- 候选分支：`origin/codex/easyinput-usb-input-runtime`
- 候选提交：`b57d6671a921877835723eebee4252fcdc5c9b92`
- 基线提交：`5bd5ba2b979e8e4f9eedd45060fab87526c4eefb`
- 结论：`REVIEW_CHANGES_REQUIRED`

候选分支来源、范围、依赖、基础测试与 ESP-IDF 构建均可复现，但输入事件队列溢出恢复存在确定性的旧事件重放风险，USB 配置描述符还引用了不存在的字符串索引。因此本提交不得合并、不得烧录，也不能进入 HIL。

## 1. Blocking findings

### P1 · Input-event overflow can replay a stale key-down

`firmware/easyinput-controller/main/main.cpp` 在检测到 `InputCore` 丢事件后调用 `recover_after_input_drop(key_mask)`，但随后仍把 ring 中已有的旧事件全部送入 `runtime.on_input()`。如果 ring 已装满旧的 S1 Press，当前实体键已经松开，而 S1 Release 恰好被丢弃，恢复先发全零键盘报告，紧接着旧 Press 又会生成非零键盘报告；之后没有 Release 可以清除，形成粘键。

独立审计用例按以下顺序稳定复现：初始化按键 → 生成 S1 Press → 生成 31 个编码器 detent 填满 32 项 ring → 实体 S1 松开且 Release 被丢弃 → `recover_after_input_drop(0)` → 继续 drain 旧 ring。原有 3/3 测试通过，但加入“恢复全零报告完成后不得再出现旧报告”的断言后 `input_runtime_tests` 稳定失败。

修复要求：输入事件一旦丢弃，必须在 owner task 内丢弃整个待处理旧 ring，再按当前实体键掩码执行 release/suppress 恢复；不得继续消费无法证明完整的事件序列。增加上述端到端回归，并同时覆盖“当前仍按住”和“当前已经松开”两种状态。

### P1 · HID interface references a missing string descriptor

`firmware/easyinput-controller/main/main.cpp` 的 `TUD_HID_DESCRIPTOR(0, 4, ...)` 把 HID `iInterface` 指向字符串索引 4，但 `string_descriptors` 只有索引 0～2。固定 Maker 参考之所以使用索引 4，是因为它提供了 0～4 共五个字符串。当前 `esp_tinyusb 1.7.6~2` 会把未填充的索引 4 视为 `NULL` 并拒绝该字符串请求。

修复要求：让 `iInterface` 指向真实存在的字符串，或明确设为 0；同时把 device/configuration/string/report descriptor 作为同一组黄金向量验证，不能只搜索若干 Report ID 字节片段。

## 2. Required test and hygiene completion

- 描述符黄金向量必须覆盖 VID/PID、device/configuration 总长度、HID interface 字符串索引、Keyboard/Mouse/Vendor Report ID、方向、payload 长度与默认动作序列化 bytes。
- 增加同向滚轮合并、正负方向边界以及溢出后滚轮不重放的明确断言。
- `firmware/easyinput-controller/.gitignore` 增加 `managed_components/`。本机按标准 IDF 构建后该目录成为未跟踪内容，容易污染后续交接；它不得提交。
- 保持 Vendor Feature fail closed、AGENTS/CLAUDE 一致和现有禁止范围；不得借返工进入 T04。

## 3. Independent evidence reproduced

- 来源与范围：候选确实从 `5bd5ba2` 创建；21 个改动路径全部在任务允许范围，ASCII 路径通过，无提交的 build/managed_components/sdkconfig/bin/elf/map。
- Host 基线：CMake 3.30.2、MSVC 19.43 下原有 CTest 3/3 通过。
- 新增审计回归：`input_runtime_tests` 失败，确认旧 Press 在恢复后仍留在 HID 队列；该临时测试仅用于隔离审计，没有改写候选分支。
- 固件构建：新 PowerShell 激活精确 `ESP-IDF v5.5.5`，target `esp32s3`、`Minimal build - ON`，构建成功；镜像 `0x36200`（221696 bytes），最小 app 分区余量 `0xc9e00`（79%）。
- 板级扫描：1 PASS、1 WARN、0 FAIL；WARN 为扫描器不能识别 C++ `constexpr` 引脚声明。人工复核 S1～S8=`2,47,38,41,1,6,7,48`、编码器=`17/16/18`、USB=`19/20` 正确，GPIO0/GPIO8/GPIO12/J4 UART 未初始化。
- 其他检查：`git diff --check`、AGENTS/CLAUDE 一致、任务范围、来源、敏感信息和提交产物检查通过。
- 安全：未连接或识别设备，未扫描端口，未读 Flash，未运行 flash/erase/monitor，未做 HIL。

## 4. Next gate

另一台电脑继续原分支完成返工并推送新提交后停止。本机将新增回归重新独立审计；只有第二轮代码审计、Host 测试与精确 IDF 构建全部通过，才准备原 Maker 恢复方案和首次烧录授权卡。
