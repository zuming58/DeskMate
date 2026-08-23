# Lessons learned

## Windows paths and archives

- 现象：包含中文路径的 Git tar 在 Windows `tar.exe` 解包时可能出现乱码和损坏提示。
- 做法：正式项目使用英文目录；需要读取旧提交时优先使用临时 Git worktree，而不是经 PowerShell 管道传输二进制 tar。

## Build directory locks

- 现象：运行中的 `DeskMate.exe` 会锁住 `release/win-unpacked`，导致 electron-builder 报 EBUSY。
- 做法：打包前关闭正在运行的 DeskMate，再重试构建；不要把它误判为源码错误。

## npm production defaults

- 现象：部分电脑的 npm 全局配置偏向 production，导致缺少开发依赖。
- 做法：使用 `npm ci --include=dev`。

## Hardware evidence

- 现象：Windows 枚举到 HID 或网络可用，不等于板载麦克风或厂商协议已经连接。
- 做法：界面分别展示 HID、电脑麦克风、板载音频、千问和输出状态；只有协议握手成功才声明真实连接。
