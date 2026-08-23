# Phase 3：EasyInput 真机语音闭环验收

## 构建产物

- 应用：`release/win-unpacked/DeskMate.exe`
- 自包含输入桥：打包后位于 `resources/input-bridge/DeskMate.InputBridge.exe`
- 输入桥只读监听 Raw Input，不需要用户安装 .NET 运行库。

## 自动化结果

- `npm test`：覆盖 F22 按下/释放、防抖、重复事件、无按下的释放、断线复位、右 Alt 开关、Escape 取消、辅助进程重启、状态机、历史优先和剪贴板回退。
- `npm run build`：Web 构建和 Sites 产物。
- `npm run build:desktop`：自包含输入桥和 Windows Electron 包。
- 打包版烟测：模拟语音切换后生成历史与剪贴板文字，退出码 0。
- 真机只读枚举：当前电脑已返回 `boardConnected: true`。

## 用户真机验收

1. 连接 EasyInput 板子，打开 DeskMate 的“设备与连接”。
2. 确认“EasyInput HID”为“已连接”，“Windows 输入桥”为“运行中”。
3. 打开记事本或 Codex 输入框，保持输入焦点，不要点回 DeskMate。
4. 按一次板子语音键（当前真机已确认为 `Ctrl+Shift+Space`；F22 为兼容路径）：悬浮窗应显示“正在录音”，且不抢焦点。
5. 说一句话，再按一次语音键：状态依次进入转写、输出、完成。
6. 确认历史新增，文字进入原输入框；若焦点变化，确认文字已在剪贴板。
7. 连续完成 10 次，确认无重复触发、无残留 F22 状态、历史不丢失。
8. 录音时拔掉板子或麦克风，确认当前会话安全结束且软件不崩溃。
9. 验证板子的回车、退格、全选、复制、粘贴、撤销仍由 Windows 正常执行。

## 若语音键不是 F22

当前资料与历史故障报告指向 F22，但物理按压仍是最终证据。如果设备显示已连接而语音键无触发，开启“按键诊断”，记录不含文字的键名/动作/时间，并补充厂商按键组合资料；不要向 `COL03` 自定义 HID 接口发送猜测数据。
