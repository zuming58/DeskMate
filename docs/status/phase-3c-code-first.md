# Phase 3C 无硬件代码先行状态

## 已完成

- 增加协议无关的 `EasyInputLanAudioAdapter`：状态、可注入传输、有限帧队列、序号/重复/乱序/丢帧统计、采样和大小边界、取消、幂等停止、指数退避重连。
- 默认没有已确认传输时返回 `protocol-unconfirmed`，不扫描 IP、端口或广播，不显示板载麦克风已连接。
- Electron 网络摘要只返回是否存在网络、`ethernet/wifi/unknown` 类别和 `sameLanPossible`，不暴露 IP、MAC、SSID、网关、接口名或路径。
- 增加版本化 AI 状态事件、乱序/重复/旧会话过滤、provider 断开和统一桌宠意图映射；Codex、Claude Code、Hermes、Workbody 仅提供 mock provider。
- AI 联动页标注模拟数据，意图只描述表情、动作、亮度和关注，不调用任何硬件。

## 未验证

- EasyInput 真机 F22/HID：待有键盘电脑验收。
- 板载麦克风真实局域网协议：未确认，当前仍使用电脑麦克风。
- 真实 AI provider：本阶段未接入。

## 下一步真机操作

1. 在有键盘电脑上导出脱敏诊断，确认 F22 来源和输入桥连接。
2. 在同一可达局域网中，依据用户自有 EasyInput 软件证据补充传输工厂；不要猜测端口或帧格式。
3. 仅用合成帧先验证采样参数、序号和重连，再接真实音频；确认后再替换录音源。
