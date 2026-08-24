# Second-computer prompt · T03 first-audit rework

把下面整段复制到另一台电脑的 Codex。本轮继续原分支，不创建新分支，不接硬件。

```text
继续 DeskMate T03 原分支 codex/easyinput-usb-input-runtime，当前被审计的提交是 b57d6671a921877835723eebee4252fcdc5c9b92。先在 F:\Codex\deskmate 执行 git fetch origin，确认当前分支和工作区干净；不要合并 main，不要开始 T04。用下面命令读取主线上的审计报告：
git show origin/main:docs/reviews/t03-easyinput-usb-input-runtime-audit-2026-08-24.md

然后重新阅读：
1. AGENTS.md
2. firmware/easyinput-controller/AGENTS.md
3. contracts/deskmate-host/easyinput-input-v1.md
4. flow/tasks/T03-easyinput-usb-input-runtime.md

本轮只修复以下审计项：

1. 输入事件 ring 溢出后不得继续消费旧事件。当前 main.cpp 先 recover_after_input_drop(key_mask)，随后仍 drain InputCore 旧 ring；当旧 S1 Press 留在队列、当前实体键已松开且 Release 被丢弃时，会在全零恢复报告之后重新发出旧 key-down，造成粘键。为 InputCore 建立明确的 pending-event discard/reset 入口；检测到 event_drops 后由 owner task 先丢弃整个不完整事件序列，再按当前 key_mask 做 release/suppress 恢复。

2. 增加端到端回归：初始化 S1 → S1 Press 入 ring → 用 31 个编码器 detent 填满 32 项 ring → 当前 S1 松开且 Release 被丢弃 → recover_after_input_drop(0)。发送完恢复的全零键盘报告后，队列必须为空，不得再出现旧 S1 key-down。同时保留并验证“溢出时实体键仍按住，必须等全部释放后才接受新 chord”的用例。

3. 修复 USB HID interface 字符串索引。当前 TUD_HID_DESCRIPTOR(0, 4, ...) 使用索引 4，但 string_descriptors 只有 0～2。要么提供真实的索引 4 接口字符串，要么把 iInterface 明确设为 0；不能保留悬空索引。

4. 把 USB device/configuration/string/report descriptor 做成可由 Host 测试读取的黄金向量。测试必须精确覆盖 VID/PID、配置总长度、有效 iInterface、Keyboard 0x01、Mouse 0x02、Vendor 0x10～0x15 的方向和 payload 长度，以及默认按键/滚轮序列化 bytes；不能只用 has(pattern) 搜几个 Report ID。

5. 补同向滚轮合并、正负边界、队列溢出后滚轮不重放测试。在 firmware/easyinput-controller/.gitignore 增加 managed_components/，保证标准 IDF 构建后不会留下可误提交的依赖源码目录。

不得修改 Windows、小智、DeskMate Link、冻结合同或外部参考目录；不得实现配置/NVS、Host Action、打开应用、BLE/Wi-Fi、音频、GPIO8、LED、电池、睡眠、分区或 OTA。不得扫描端口、识别设备、flash、erase、monitor、读取 Flash 或声称真机通过。

完成后在精确 ESP-IDF v5.5.5 / esp32s3 环境运行全部 Host 测试和 idf.py build，并执行板级只读扫描、git diff --check、范围、AGENTS/CLAUDE、来源、密钥、ASCII 路径和构建产物检查。更新 flow/progress.md 顶部与 T03 状态，提交并推送同一分支，报告新 HEAD、Host 测试数量、精确 IDF、镜像大小和未执行的硬件操作，然后立即停止，等待本机第二轮独立审计。
```
