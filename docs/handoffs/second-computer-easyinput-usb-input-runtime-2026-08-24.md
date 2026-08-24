# Second-computer prompt · T03 EasyInput USB input runtime

把下面整段复制到另一台电脑的 Codex。三个目录应分别位于 `F:\Codex\deskmate`、`F:\Codex\easyinput-wzm\easy-input-maker`、`F:\Codex\xiaozhi-yuntai`。

```text
你现在在另一台无硬件电脑上执行 DeskMate T03。正式产品仓是 F:\Codex\deskmate；EasyInput 只读参考是 F:\Codex\easyinput-wzm\easy-input-maker；小智只读参考是 F:\Codex\xiaozhi-yuntai。后两个目录不得修改、清理、提交或复制进产品仓，也不得使用其 build 产物。

先在 F:\Codex\deskmate 执行 git fetch origin，确认工作区干净，从最新 origin/main 创建并切换分支 codex/easyinput-usb-input-runtime；不得从 codex/easyinput-input-foundation 旧分支继续开发。然后依次完整阅读：
1. AGENTS.md
2. flow/charter.md
3. flow/plan.md
4. flow/progress.md 顶部最新记录
5. firmware/easyinput-controller/AGENTS.md
6. contracts/deskmate-host/README.md
7. contracts/deskmate-host/easyinput-input-v1.md
8. flow/tasks/T03-easyinput-usb-input-runtime.md
9. docs/contracts/easyinput-maker-protocol.md
10. docs/provenance/reference-baselines-2026-08-24.md

本轮只执行 T03：完成八键/旋钮的边沿安全采集、唯一默认动作路由、Maker 兼容 TinyUSB HID 描述符和传输生命周期、断线/溢出防粘键，以及只读脱敏 RuntimeDiagnosticsSnapshot。所有精确行为、队列容量、默认按键、滚动方向、USB VID/PID、Report ID、测试矩阵和禁止范围都以 flow/tasks/T03-easyinput-usb-input-runtime.md 与 contracts/deskmate-host/easyinput-input-v1.md 为准，不要自行改合同。

EasyInput 参考工作区可能有未提交内容，不能直接把工作区文件当固定来源。读取参考实现时使用：
git -C F:\Codex\easyinput-wzm\easy-input-maker show 7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01:<path>
或建立隔离 worktree。重点只读核对 main/platform/usb_hid.cpp/.h、components/keyboard 的 transport/lifetime/queue 代码和相关 host tests；逐文件记录来源、固定提交、许可证、采用方式、修改和目标路径。优先清晰重实现，不整段搬运复杂 Maker 运行时。

禁止修改 Windows 软件、小智固件、DeskMate Link、冻结合同和两个参考目录；禁止实现配置/NVS、Host Action、打开应用、BLE/Wi-Fi、音频、LED/GPIO8、电池、睡眠、分区或 OTA。禁止扫描端口、识别设备、flash、erase、monitor、读取 Flash 或声称真机通过。不得提交 build、managed_components、sdkconfig、bin、elf、map、密钥、录音、用户数据或本机设备信息。

开发环境必须精确使用 ESP-IDF v5.5.5 / esp32s3。每个新 PowerShell 进程先激活该环境并真实检查 idf.py --version。完成后运行任务卡规定的全部 Host 测试、idf.py build、EasyInput 板级只读扫描、git diff --check、范围/来源/密钥/ASCII 路径/构建产物检查，并确认 firmware/easyinput-controller/AGENTS.md 与 CLAUDE.md 逐字一致。

完成后更新 flow/progress.md 顶部，提交并推送 codex/easyinput-usb-input-runtime，报告 HEAD 哈希、Host 测试数量、ESP-IDF 精确版本、镜像大小、静态检查和未执行的硬件操作，然后立即停止。不要开始 T04，不要合并 main；等待当前硬件电脑独立审计。
```
