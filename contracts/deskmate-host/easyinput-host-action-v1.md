# EasyInput host action v1

状态：`HOST_ACTION_V1_FROZEN`

本切片冻结 EasyInput 固件向 DeskMate Windows 主进程发送固定文字和打开应用请求的最小合同。它不冻结 BLE、音频、DeskMate Link、小智动作或其他 AppCommand。

## Capability and ownership

- 配置状态能力必须同时声明 `host_action_v1: true` 和 `fixed_text_v1: true`；缺失或为 `false` 时桌面端不得提交对应动作。
- 固件只有一个输入 owner，TinyUSB 只有一个 HID IN endpoint owner。键盘释放报告、键盘/滚轮、Host Action、固定文字、配置 ACK/读取响应共享同一传输完成生命周期。任何类别都不得在已有传输完成或失败前调用下一次 `tud_hid_report`。
- T03 键盘释放安全优先于 Host Action；Host Action 队列满、断线或发送失败必须丢弃当前主机动作，不得延迟或替代全释放报告。T04 灯效只表示实体输入已确认，不表示 Windows 动作成功。

## Configuration actions

- 固定文字保持 Maker `ai_keyboard.v1` 形式：`{"text":"..."}`。UTF-8 编码后长度必须为 `1..960` 字节，必须是严格 UTF-8，不允许 NUL 或除 TAB/CR/LF 外的 C0 控制字符。
- 打开应用保持 Maker 形式：`host_action:<uuid>`。UUID 必须是 36 个 ASCII 字符、`8-4-4-4-12` 连字符位置固定、十六进制只能为小写；前缀只存在于配置，不进入 USB payload。
- S1-S8 和旋钮按压均可配置上述动作。每个物理按压周期只在已确认的 Press 产生一次；重复 Press 和 Release 不产生报告。配置切换仍先完成 T05 的可观察全释放，再替换投影。

## USB AppCommand reports

HID Input Report ID 固定为 `0x11`，payload 固定 63 字节。payload 布局：

| Offset | Bytes | Meaning |
| --- | ---: | --- |
| 0 | 1 | kind |
| 1 | 1 | zero-based chunk index |
| 2 | 1 | total chunks |
| 3 | 1 | data length in this chunk |
| 4 | 59 | data followed by zero padding |

所有未使用字节必须为零；`total_chunks` 不得为零；`index < total_chunks`；`length <= 59`。

### Fixed text

- kind `0x01`，总 UTF-8 长度 `1..960`，总块数 `ceil(bytes/59)`，即 `1..17`。
- 固件严格按 index 递增发送；只有上一块收到匹配 transfer-complete 后才前进。transfer-failed、USB epoch 变化、unmount、物理断线、超时或配置替换立即取消未发送尾部。新连接不得重放旧文字。
- Windows 原生桥只接受同一设备生命周期内从 index 0 开始、元数据稳定、严格递增的序列；完全相同的最后一块只允许幂等忽略一次。乱序、缺块、冲突重复、非零 padding、非法 UTF-8、超长或超过 3 秒无有效进度均清空并失败关闭。

### Open application

- kind `0x05`，`index=0`、`total_chunks=1`、`length=36`；data 为不含 `host_action:` 前缀的规范小写 UUID。
- 黄金向量开头为 `11 05 00 01 24`，随后为 UUID ASCII，余下 23 字节为零。
- 同一设备生命周期内同 UUID 的重复 Raw Input 投递在 250 ms 窗口内只执行一次；真实的新按压超过该窗口可再次执行。

## Windows execution boundary

- 原生桥只校验、重组并向 Electron 主进程发送控制事件；不得记录固定文字、窗口标题、完整设备路径或应用路径。渲染进程只接收动作结果和脱敏显示名，永远拿不到固定文字内容、UUID 到路径映射或完整设备路径。
- 固定文字由唯一原生桥进程在 Electron 主进程发出单次、带 3 秒期限的注入命令后执行。仅允许当前可见的非 DeskMate 前台窗口；严格限制 UTF-8 长度和控制字符。无前台窗口、目标为 DeskMate、自身桥进程、命令过期、桥重启或 `SendInput` 部分失败均报告失败，不能伪装成功。
- 打开应用只能由 Electron 主进程的 UUID 白名单执行。映射目标必须是本机盘符下的绝对 `.exe` 或 `.lnk`；拒绝 UNC、设备路径、相对路径、URL、命令行、参数、网络下载和管理员提升。执行前重新检查存在性和扩展名；快捷方式若带参数、目标不是本机绝对 `.exe` 或要求提升则拒绝。未知 UUID 或文件丢失失败关闭。
- 主进程串行执行同一 Host Action。桥重启、断线或应用重启不得自动重放任何已完成或未确认动作；UUID 映射可以从主进程私有存储恢复。

## Bounded state and failure confirmation

- 固件同时最多保存一个尚未完成的 Host Action/固定文字流；第二个动作到达时增加脱敏 drop 计数并丢弃，不覆盖正在传输的流。
- Electron 同时最多一个固定文字注入请求；第二个请求返回 `fixed-text-busy`。注入结果只包含 `ok/reason/bytes`，不回显文字。
- 主机执行成功是 Windows 侧结果，不回写固件，也不驱动 T04 灯效。本切片没有设备侧成功 ACK；传输完成只证明报告被 USB host 接收。

## Golden vectors and verification

- Host tests逐字节比较单块 UUID、1/59/60/960 字节固定文字、末块 padding 和 Report ID。
- 覆盖规范/非规范 UUID、严格 UTF-8、按下一次/释放不发、busy overflow、transfer failure、旧 epoch、断线不重放、配置切换全释放以及 T03/T04/T05 回归。
- Windows 测试覆盖分块重组、重复/乱序/超时/断线、桥重启、主进程唯一执行、无映射、丢失文件、非法/网络路径、带参数快捷方式、渲染进程无路径和固定文字不出现在结果/诊断。

## Explicit exclusions

本合同不得复用为 DeskMate Link，不允许任意 AppCommand、命令行、脚本、URL、管理员提升、BLE、Wi-Fi、音频、GPIO8/LED 新行为、小智固件或桌面直接舵机控制。
