# Lessons learned

## Cross-task lifecycle callbacks must preserve order

- 现象：用多个独立布尔 pending 标志把 mount/unmount 等 callback 交给 owner task，会把同一消费周期内的不同先后序列压成同一个集合；固定处理顺序可能让最终状态与最后一个真实事件相反。
- 做法：跨 task 的生命周期变化使用有界有序事件、单调序列或可证明等价的状态机；测试必须同时覆盖 A→B 与 B→A、重复事件和旧 lifetime 完成回调，不能只分别调用单个 callback。

## Golden vectors must compare the complete artifact

- 现象：抽查少量 descriptor 索引或只解析 Report ID/长度，无法阻止 endpoint、attributes、usage、logical range、flags 和顺序在未覆盖位置漂移，却容易被误称为“精确黄金向量”。
- 做法：黄金向量先对生产使用的完整 bytes 做逐字节比较，再增加语义解析作为第二层断言；两层证据分别回答“是否完全相同”和“为何符合合同”。

## Windows paths and archives

- 现象：包含中文路径的 Git tar 在 Windows `tar.exe` 解包时可能出现乱码和损坏提示。
- 做法：正式项目使用英文目录；需要读取旧提交时优先使用临时 Git worktree，而不是经 PowerShell 管道传输二进制 tar。

## Build directory locks

- 现象：运行中的 `DeskMate.exe` 会锁住 `release/win-unpacked`，导致 electron-builder 报 EBUSY。
- 做法：打包前关闭正在运行的 DeskMate，再重试构建；不要把它误判为源码错误。

## ESP-IDF toolchain activation is process-local

- 现象：新的 PowerShell 工具进程中直接运行 `cmake`、`ctest` 或 `idf.py` 可能提示命令不存在，即使此前另一个终端已经激活过 ESP-IDF；PowerShell 的 `$LASTEXITCODE` 也不能可靠代表“命令未找到”这一类调用失败。
- 做法：每个执行 ESP-IDF/Host 验证的新进程先显式加载冻结版本的环境入口，再检查工具版本；命令链同时检查 PowerShell 成功状态或直接抛错，不凭陈旧的 `$LASTEXITCODE` 宣称测试通过。

## Overflow recovery must discard incomplete event history

- 现象：输入 ring 已满时，如果只发送全释放报告、随后继续消费 ring 中旧事件，被丢弃的 Release 之前残留的 Press 会再次生成 key-down，造成粘键。
- 做法：任何输入事件丢弃都会让剩余事件序列失去完整性；owner 必须先丢弃整个 pending ring，再用当前实体采样重建 suppress/release 状态，并以“松开事件被丢弃”的端到端测试锁定。

## npm production defaults

- 现象：部分电脑的 npm 全局配置偏向 production，导致缺少开发依赖。
- 做法：使用 `npm ci --include=dev`。

## Hardware evidence

- 现象：Windows 枚举到 HID 或网络可用，不等于板载麦克风或厂商协议已经连接。
- 做法：界面分别展示 HID、电脑麦克风、板载音频、千问和输出状态；只有协议握手成功才声明真实连接。

## Clipboard success must be observed

- 现象：渲染进程直接调用 `navigator.clipboard` 并吞掉异常，会在系统拒绝写入时仍提示“已复制”。
- 做法：通过受控 Electron 剪贴板桥执行写入，只在返回成功后显示成功；失败保留原文并给出可见错误。

## Global workflows cannot be page-owned

- 现象：VoiceWorkflow 只在语音页挂载时，全局按键不得不先切页，既抢焦点又可能丢事件。
- 做法：全局控制器在应用生命周期内保持单例挂载，页面只决定内容是否可见，底部胶囊独立展示实时状态。

## Whole-document device configuration needs read-modify-write

- 现象：把“同步当前按键”误当成局部 patch，可能通过整份配置报告清空板上的 Wi-Fi 或音频设置。
- 做法：先读取完整配置并验证版本，再只替换用户确认的字段、展示差异、写入并核对保存确认；闭环未完成前阻止写入。

## Three-end work needs feature-package gates

- 现象：桌面、总控和云台若同时改十个无关功能，失败后无法判断是状态机、传输、路由还是执行端回归。
- 做法：按相似能力组成小包；每包立刻跑定向测试、连通测试和旧功能全量回归，证据完整后锁定。失败就留在当前包修复，不把新功能叠上去。
