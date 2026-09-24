# DeskMate · AI 工作台伙伴

语音输入、AI 陪伴小岚、个人提醒、提示词快选、风格映像与本地记忆管理，放在同一个 Windows 桌面工作台。可配合 EasyInput 按键/旋钮和小智屏幕云台；没有硬件时也能使用电脑音频与软件页面。

**个人非商业免费使用，源码可查看；不允许未经授权修改、套壳或商用。** 本项目不是 MIT/Apache 等宽松开源项目，完整条款见 [LICENSE](LICENSE)。第三方组件仍遵守[各自许可](THIRD_PARTY_NOTICES.md)。

## 下载与安装

**[前往官方下载页](https://github.com/zuming58/DeskMate/releases/latest)**

在 Assets 中选 `DeskMate-<版本>-setup.exe`。`Source code.zip` 是源码，不是安装器。Windows 10/11 x64 是当前发布目标；macOS 尚未完成适配与真机验收，暂不提供正式 Mac 安装包。

- 安装器提供中文向导、安装位置选择和桌面快捷方式；升级前从托盘完整退出旧版。
- 当前安装包未代码签名，请核对官方来源与 Release 中的 SHA-256。不要为了安装未知副本关闭安全软件。
- 不附带作者的 API Key、配置、个人资料、录音或记忆；需要使用者自行配置服务。
- 软件免费不等于云服务免费，模型/语音/生图费用由使用者自己的账户承担。
- KnowledgeOS 是可选的独立服务，不随本安装器安装。

完整说明见 [社区版安装、隐私与许可](docs/setup/community-release.md)。分享时直接发官方下载页链接即可。

有 EasyInput V2.0 按键板的用户，可另行下载 [EasyInput 固件升级包](https://github.com/zuming58/DeskMate/releases/download/v0.1.7/DeskMate-EasyInput-V2-T43A-app-only.zip)。这是分区匹配设备专用的 app-only 包，不适合空白板或未知分区；先读[固件适用范围与说明](docs/setup/easyinput-firmware-download.md)。无需小智云台，软件安装器不会自动刷机。

## 主要功能

| 页面 | 功能 |
| --- | --- |
| 工作台 | 使用概览、连接状态、个人提醒与重要事项 |
| 语音输入 | 录音、转写、整理、热词纠错、剪贴板/目标窗口输出 |
| AI 陪伴 | 连续语音对话、个人资料与人设、提醒、可选实体动作 |
| 风格映像 | 素材管理、风格生图与显影；生成使用自己配置的服务 |
| 历史、词库、提示词 | 历史检索、确定性替换、场景与快捷提示词 |
| 记忆管理 | 本地原文与摘要、授权后自动整理、疑问核对与可选 KnowledgeOS 同步 |
| 按键配置、设备与诊断 | 硬件映射、服务设置、备份与脱敏诊断 |

语音、提醒、模型费用和硬件能力以实际配置与状态为准。模拟预览、服务受理、封存回执和硬件执行不是同一件事，不将未验收能力描述为可用。

## 源码与构建

此源码供许可范围内阅读和构建未经修改的个人非商业版本；修改、再分发、商用需另行授权。开发要求 Node.js 22+、npm、.NET 8 SDK；官方桌面构建当前在 Windows 验证。

```powershell
npm ci --include=dev
npm test
npm run build:beta
```

安装器位于 `release/`。产品源码在本仓，用户数据在系统独立用户目录；不要把本机用户目录或整个开发工作区打包发送给他人。

```text
electron/       Electron 主进程、适配器、IPC 与安全存储
src/            React 页面与领域模型
native/         Windows 输入桥
firmware/       EasyInput 与小智正式固件源码（不随安装器烧录）
contracts/      三端版本化合同
tests/          回归测试
docs/           说明、架构、来源与验收记录
flow/           开发计划、决定与事实交接
```

开始维护前阅读 [AGENTS.md](AGENTS.md)、[当前进度](flow/progress.md) 和 [文档索引](docs/README.md)。未经明确确认不烧录、不改 Flash/分区/eFuse，不向未知 HID 接口写数据。

## 反馈与授权

[提交问题或请求授权](https://github.com/zuming58/DeskMate/issues)。请勿在公开 Issue 上传 API Key、原始对话、数据库、个人资料或完整诊断目录。商用许可须取得作者明确书面同意，提交请求本身不是授权。
