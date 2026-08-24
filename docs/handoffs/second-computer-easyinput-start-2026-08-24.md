# Second-computer start prompt · EasyInput input foundation

把下面整段复制到另一台电脑的 Codex。开始前确保三个目录分别位于 `F:\Codex\deskmate`、`F:\Codex\easyinput-wzm\easy-input-maker`、`F:\Codex\xiaozhi-yuntai`。

```text
你现在在无硬件电脑上开发 DeskMate。正式产品仓是 F:\Codex\deskmate；EasyInput 只读参考是 F:\Codex\easyinput-wzm\easy-input-maker；小智只读参考是 F:\Codex\xiaozhi-yuntai。后两个目录不得修改、清理、提交或复制进产品仓，也不要使用它们的 build 产物。

先在 F:\Codex\deskmate 执行只读核对：确认当前分支来自最新 origin/main、git status 干净；确认 EasyInput 参考 HEAD 为 7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01。然后依次完整阅读根 AGENTS.md、flow/charter.md、flow/plan.md、flow/progress.md 顶部最新记录、firmware/easyinput-controller/AGENTS.md 和 flow/tasks/T02-easyinput-input-foundation.md。

本轮只执行 T02：在 firmware/easyinput-controller/ 建立 ESP-IDF 5.5.5 / ESP32-S3 构建骨架，实现八个独立低有效按键、旋钮正交解码与按压、防抖、USB HID 内部表示和不依赖真机的 host test。严格使用任务卡中的 GPIO；GPIO0 不是 S5，GPIO8 是共享音频/LED 电源域，本轮不得使用。

创建并切换分支 codex/easyinput-input-foundation。不得修改 Windows 软件、小智固件、DeskMate Link、配置、音频、BLE/Wi-Fi、分区、NVS 或外部参考目录。不得扫描端口、烧录、monitor、读取设备或声称真机通过。不要提交 build、bin、elf、map、密钥、Wi-Fi、录音或本机路径。

完成代码后运行全部 host test 和 ESP-IDF 5.5.5 idf.py build，记录精确版本、命令和结果；逐文件记录参考来源、提交、许可证、采用方式和目标路径。更新 flow/progress.md 顶部，提交并推送该独立分支，然后停止，不开始第二功能包。最终只可声明 TEST_CONFIRMED / BUILD_CONFIRMED，等待有硬件电脑审计。
```
