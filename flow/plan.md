# Development plan

## Current stage: Phase 3E protocol implementation

目标：依据公开 Maker 固件固定提交，在不依赖真机的电脑上完成协议层和模拟板，再在有硬件的电脑上验收。

1. 实现 `EIHB/EICC/EICA/EIAU` UDP 编解码、会话、keepalive、乱序与丢包统计。
2. 建立模拟板和确定性协议测试，不扫描局域网、不猜测地址。
3. 实现厂商 HID `0x10/0x11/0x12/0x13` 的纯编解码与边界校验。
4. 将板载麦克风作为用户主动选择的第二录音源，电脑麦克风继续作为默认和回退。
5. 在有板子的电脑完成防火墙、同局域网、音质、断线和配置同步验收。

## Next stages

### Phase 4A: real AI providers

- 接入 Codex、Claude Code、Hermes、Workbody 的真实运行状态。
- 统一映射 idle/listening/thinking/working/waiting/completed/error。
- 所有来源保留权限、断线和模拟标签。

### Phase 4B: pet and hardware output

- 表情库、动作编排和屏幕预览。
- Agent 状态通过正式 HID `0x12` 驱动支持的灯效。
- 未来屏幕、舵机、光照、温湿度和朝向传感器按独立合同接入。

### Release hardening

- 安装包、自动更新、签名、崩溃恢复、隐私说明和数据导出/删除。
- Windows 100%–200% 缩放与浅色/深色主题可用性测试。
