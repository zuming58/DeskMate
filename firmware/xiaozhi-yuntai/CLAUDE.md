# Xiaozhi yuntai firmware · local rules

> 本文件只适用于 `firmware/xiaozhi-yuntai/`。总体规则见 `../../AGENTS.md`；总体计划与文档见 `../../flow/`、`../../docs/`。

## Responsibility

- 负责 DeskMate 小智执行固件：DeskMate Link 严格解析、OLED 场景、唯一动作仲裁器、双舵机限幅/队列/回中/急停。
- DeskMate V1 不初始化小智 INMP441、MAX98357A、扬声器或原云端对话；EasyInput 是唯一启用的音频端点。
- 不负责 Windows 编排、长期记忆、EasyInput 输入或桌面直接 PWM。

## Development and safety

- 目标工具链由项目冻结为 ESP-IDF 5.5.3；当前状态为 `T08_PHASE_A_SCAFFOLD`，协议实现必须等待 `DESKMATE_LINK_V1_FROZEN` 的准确提交。
- 无硬件电脑只能做 parser、场景、模拟舵机、host test 和 build，不得声称 OLED、音频或舵机真机通过。
- 不扫描端口、不烧录、不读取 Flash、不驱动舵机；机械动作始终需要单独授权。
- 外部参考 `F:\Codex\xiaozhi-yuntai` 只读使用；复制或派生必须记录来源清单/哈希、许可证、修改与目标路径。
- 不在本模块建立第二套 `flow/`、`docs/`、hook 或嵌套 Git。
- Phase A 不得配置真实 UART 控制器/引脚，也不得写 magic、framing、版本、消息 ID、CRC、超时、重试或错误语义；USB Serial/JTAG 仅作为应用日志迁移候选，不能冒充已完成真机恢复验收。

## Module entry points

- 说明：`README.md`
- 参考基线：`../../docs/provenance/reference-baselines-2026-08-24.md`
- DeskMate Link：`../../contracts/deskmate-link/README.md`
- Host tests：`cmake -S firmware/xiaozhi-yuntai/host_test -B firmware/xiaozhi-yuntai/host_test/build -DCMAKE_BUILD_TYPE=Debug`，随后 `cmake --build ... --config Debug` 与 `ctest --test-dir ... -C Debug --output-on-failure`。
- 固件构建：在精确 ESP-IDF 5.5.3 环境执行 `idf.py -C firmware/xiaozhi-yuntai build`；不得追加 `flash` 或 `monitor`。
