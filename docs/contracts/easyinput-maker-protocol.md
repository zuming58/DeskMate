# EasyInput Maker protocol contract

原始协议研究固定为 `CY-CHENYUE/easy-input-maker@34087cd40d24d23579da0357973ebc1a37e7ce7c`；2026-08-23 桌面实现复核到本地参考 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`。详细研究见 [firmware study](../references/easyinput-maker-firmware-study.md)，实现来源记录见 [upstream sources](../references/upstream-sources.md)。

## Device identity

- Product：EasyInput AI / ESP32-S3。
- VID/PID：`0x303A / 0x1006`。
- 默认语音：`Ctrl+Shift+Space`；语音编辑：`Ctrl+Shift+E`。
- 旧固件或旧配置可能发送 F22，DeskMate 必须保留兼容入口。

## Vendor HID reports

| Report | Direction | Purpose |
| --- | --- | --- |
| `0x10` | Host → Board Feature | 分块 JSON 配置，最大 2048 bytes，CRC16-CCITT |
| `0x11` | Board → Host Input | AppCommand、配置确认和状态响应 |
| `0x12` | Host → Board Feature | Agent 状态，16-byte payload |
| `0x13` | Host → Board Feature | 请求设备状态快照 |
| `0x14` | Host → Board Feature | 扬声器资源请求 |
| `0x15` | Board → Host Input | 扬声器资源响应 |

实现要求：严格校验版本、长度、分块、总长度和 CRC；未知报告不写入。

DeskMate 的 Windows 侧已实现 `0x10` 分块编码、`0x11` 配置确认/Host Action 解码和厂商 HID 报告长度校验。配置写入当前保持安全门禁：Maker 会用一份 JSON 覆盖完整板载配置，而 DeskMate 尚未取得可无损合并的完整现有配置，因此 UI 只保存本机设置并明确拒绝实际写入。完成“读取当前配置 → 保留网络/音频字段 → 用户确认 → 写入 → 校验确认”闭环后才开放。

## Host Action

- 固件只发送规范的小写 UUID，不携带 Windows 路径或命令行。
- 应用搜索、文件选择、UUID 到 `.exe`/`.lnk` 的映射和启动全部在 Electron 主进程内完成。
- React 渲染进程只看到显示名、短期选择 token 和 UUID；未知 UUID、非规范 UUID 或未注册目标一律拒绝。
- Host Action 是 Windows 主机动作，不作为 EasyInput 与小智云台之间的板间协议。

## LAN audio

- 默认 UDP 端口：`17333`，由用户配置，不扫描局域网。
- `EIHB`：heartbeat，version 1。
- `EICC`：control，action 1 start / 2 stop / 3 keepalive。
- `EICA`：ack，status 0 OK / 1 unavailable / 2 bad request / 3 unauthorized。
- `EIAU`：audio version 2，PCM S16LE、16 kHz、mono、20 ms、320 samples、640-byte payload、672-byte datagram。
- 多字节整数小端；录音期间约 1 秒 keepalive；15 秒无控制自动停止；单次最长 300 秒。

## Security

- 协议 token 当前不是密码学认证，设备只应运行在可信局域网。
- 不暴露公网，不扫描访客网络，不记录 IP、SSID、MAC、token、音频或识别正文。
- 从数据报来源获取控制端点，但只接受符合当前显式会话和配置的包。
