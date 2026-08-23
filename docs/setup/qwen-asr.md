# DeskMate 千问语音识别配置

## 当前方案

DeskMate 桌面版使用阿里云百炼 `qwen3-asr-flash`：录音停止后，将浏览器生成的 WebM 音频以 Base64 形式发送到百炼 OpenAI 兼容接口，取得文字后进入现有的词库纠错、历史保存和文字输出流程。

旧版“祖名闪电说”的 `fun-asr-realtime`、16 kHz PCM 和右 Alt 全局触发设计仍有参考价值，但它是实时流式链路，不能原样塞进 DeskMate 当前的录后处理流程。后续需要实时字幕或更低延迟时，再升级为 `qwen3-asr-flash-realtime` 或 Qwen Audio 实时模型。

## 用户配置

1. 登录阿里云百炼控制台，在华北 2（北京）创建 API Key。
2. 打开 DeskMate 桌面版的“设置与诊断 → 账户”。
3. 只粘贴百炼 API Key（`sk-...`）。不要填写或发送阿里云登录密码、AccessKey ID、AccessKey Secret。
4. 业务空间 ID 可留空；填写后使用北京地域的业务空间专属域名。
5. 点击“加密保存并启用”。
6. 在“语音”页录一段短音频，停止后确认文字进入历史；需要自动输入原窗口时，再启用“写入原输入窗口”。

## 安全边界

- API Key 只通过 Electron IPC 送到主进程。
- 使用 Electron `safeStorage` 调用 Windows 当前用户加密能力，密文保存在 DeskMate 用户数据目录。
- 渲染进程、localStorage、配置导出、诊断导出、日志和 Git 均不保存明文 Key。
- 旧软件 SQLite 中的 DPAPI 密钥不迁移、不解密；建议为 DeskMate 新建独立 Key，便于单独撤销和审计。
- 录音内容会发送到用户自己的阿里云百炼账户；未启用千问 ASR 时不会调用该服务。

## 限制

- `qwen3-asr-flash` 单次音频最多 5 分钟、源文件最多 10 MB。
- 当前是停止录音后识别，不提供逐字实时字幕。
- 没有真实 API Key 时只能完成构建、协议和安全存储测试，无法完成云端识别验收。
