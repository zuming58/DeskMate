# T04 EasyInput input LED feedback reference audit

- 审计日期：2026-08-27
- 只读参考仓：`F:\Codex\easyinput-wzm\easy-input-maker`
- 固定提交：`7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- 上游项目许可证：PolyForm Noncommercial 1.0.0；第三方 ESP-IDF/RMT 代码仍按各自许可证
- 结论：原 Maker 已完整覆盖用户观察到的按键灯效，不应从零猜测。DeskMate T04 采用行为合同与测试向量，按本仓现有 T03 架构清晰重实现，不复制整个 Maker 运行时。

## Evidence map

| 参考文件 | 已确认行为 | DeskMate 采用方式 |
| --- | --- | --- |
| `components/keyboard/include/keyboard/board_pins.h` | V2 为 GPIO12、5 颗 WS2812 | 固化板级常量和 Host source-contract test |
| `components/keyboard/src/input_feedback.cpp` | S1～S8 八种低亮度颜色；140/35 ms 波纹；旋钮方向流和按压脉冲 | 冻结为 `INPUT_LED_V1_FROZEN` 黄金向量 |
| `host_test/input_feedback_tests.cpp` | 唯一颜色、亮度上限、释放静默、旋钮方向/时限 | 在 DeskMate Host tests 中重建等价覆盖 |
| `main/platform/led_strip_status.cpp/.h` | 5 像素 GRB RMT、灯效帧、输入后异步显示、空闲黑帧 | 只实现输入相关子集；不带入 Boot、BLE、Agent、配置灯效 |
| `main/platform/peripheral_power.cpp/.h` | GPIO8 唯一写入口；安全预装；共享域保持；50 ms 当前策略 | 建立最小共享电源控制器，保留未来音频扩展边界 |
| `components/keyboard/src/peripheral_power_lease.cpp` 及测试 | LED、麦克风、扬声器和 DeviceAwake 独立租约 | 采用单一共享所有权模型；T04 仅启用 Awake/LED 所需子集 |
| `docs/hardware/easyinput-v2-safety.md` | GPIO8 不是灯开关；黑帧和共享掉电不同 | 写入合同和源码静态门禁 |

## Deliberately excluded

- 冷启动灯光自检、彩虹动画和提示音联动；
- USB/BLE 连接、配置保存、平台和 Agent 状态灯效；
- 深睡、麦克风、扬声器、Wi-Fi、BLE、NVS 和电池策略；
- Maker 完整 `AppContext`、调度器、配置和音频运行时。

这些能力与“按下是否被硬件识别”的当前目标无关，混入 T04 会扩大故障面。后续若采用，必须再次固定来源、建立独立合同和回归门。
