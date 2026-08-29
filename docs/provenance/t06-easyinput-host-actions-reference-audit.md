# T06 EasyInput host actions reference audit

## Fixed reference

- Repository: `F:\Codex\easyinput-wzm\easy-input-maker`（只读参考，不进入产品仓）
- Commit: `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- License: PolyForm Noncommercial License 1.0.0
- Required notices: Copyright 2026 深圳物启万相人工智能有限公司；Original author: CY-CHENYUE；EasyInput Maker is a WaytoAGI community project.
- Adoption: 仅通过 `git show <commit>:<path>` 阅读固定提交，依据冻结 wire behavior 做 DeskMate 清晰重实现；未复制 Maker runtime、未读取脏工作树、未使用 build 产物。

## Per-file evidence

| Reference path | Evidence adopted | DeskMate target | Adoption/change |
| --- | --- | --- | --- |
| `components/keyboard/include/keyboard/host_action_protocol.h` | `host_action:`、36 字节规范小写 UUID、Report `0x11`/kind `0x05`/单块 | `contracts/deskmate-host/easyinput-host-action-v1.md`, firmware input core | 保留 wire constants，增加 DeskMate epoch、busy、失败关闭合同 |
| `components/keyboard/src/host_action_protocol.cpp` | UUID 逐字符校验与零填充 | firmware Host Action codec | 行为重实现，不复制实现文本 |
| `components/keyboard/include/keyboard/fixed_text_protocol.h` | Report `0x11`/kind `0x01`、59 字节块、960 UTF-8 字节上限 | firmware Host Action stream, native bridge | 保留 wire compatibility，增加严格 UTF-8、控制字符和 3 秒进度期限 |
| `components/keyboard/include/keyboard/usb_hid_endpoint_arbiter.h` | keyboard/mouse/AppCommand 共享一个 TinyUSB IN endpoint | firmware input owner | 采用单一 owner/transfer credit 原则，不复制完整 Maker transport |
| `main/platform/usb_hid.cpp`, `.h` | transfer-complete 前不前进、epoch 取消、固定文字分块、Host Action dispatch | firmware `input_runtime.*`, `main.cpp` | 最小接入现有 T03 队列和 T05 config transfer，不建立第二套输入状态机 |
| `host_test/host_action_protocol_tests.cpp` | UUID 黄金向量、非规范输入不修改输出 | firmware Host tests | 转成 stderr/非零失败的本仓测试风格 |
| `host_test/host_action_key_bindings_tests.cpp` | 八键每个 press 周期仅一次，release 不发 | firmware runtime tests | 扩展到旋钮按压、busy 和断线 |
| `host_test/host_action_capability_status_tests.cpp` | `host_action_v1` 能力声明 | config status and desktop capability gate | 同时增加 `fixed_text_v1` |
| `host_test/ble_fixed_text_stream_tests.cpp` | 分块边界、owner 变化取消、队列压力 | firmware/native Host tests | 仅采用 USB 相关通用向量，不实现 BLE |
| `host_test/usb_hid_endpoint_arbiter_tests.cpp` | busy endpoint 不前进、accepted 后轮转 | firmware endpoint lifecycle tests | 适配现有唯一 owner，释放安全保持最高优先级 |

## Deliberate differences

- DeskMate 不复制 Maker 的 BLE、音频、speaker asset、完整 transport/runtime 或 AppCommand 扩展。
- 固定文字不降级为固件键盘逐字符 tap；统一交给 Windows 主进程授权的原生注入边界，以支持完整 UTF-8。
- 打开应用只接受本地主进程 UUID 白名单，不在固件保存路径，不允许 URL/参数/提升。
- Host Action 与固定文字失败不会改变 T04 灯效，也不会通过 DeskMate Link 路由。
