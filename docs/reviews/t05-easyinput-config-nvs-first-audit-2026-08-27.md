# T05 EasyInput configuration/NVS · first independent audit

- 候选分支：`origin/codex/easyinput-t05-config-nvs`
- 候选提交：`a795d309cb88a3a740c25c159e132609e1583d73`
- 基线提交：`a2adc9818da07119e59a6f14d125fc23576696c9`
- 结论：`REVIEW_CHANGES_REQUIRED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED`

候选分支来源、固定参考、Host/桌面测试和 ESP-IDF 构建均可复现，但完整配置读取链路、用户确认写入边界、输入优先级、旋钮配置和异常输入处理存在阻断问题。当前提交不得合并、不得烧录，也不得开始 T06。

## 1. Blocking findings

### P0 · 配置快照无法抵达读取事务

`electron/input-bridge-protocol.cjs` 能解析 `config-snapshot`，但 `InputTriggerFilter.accept()` 只把 `host-action`、`config-write` 和 `config-ack` 作为控制事件返回；`config-snapshot` 被降级成 `diagnostic`。因此 `InputBridgeManager` 等待的 `result.kind === "config-snapshot"` 永远不能成立，`readConfig()` 会超时。

独立审计用真实 parser 与 filter 组合稳定复现：合法 `config-snapshot` 的结果为 `{"kind":"diagnostic", ...}`。原有 70 个桌面测试没有覆盖 manager 的完整读取闭环。

修复要求：把快照作为明确控制事件传递，并增加从 stdin 请求、原生桥分块、协议 parser/filter 到 `InputBridgeManager.readConfig()` 完成或失败的端到端测试。

### P0 · UI 仍绕过 T05 的读取、预览和确认 token

`src/pages.jsx` 的“同步到键盘”仍调用 `syncKeyboardConfig(config)`；`electron/main.cjs` 又把该 IPC 直接接到 `inputBridge.syncConfig(value)`。这让 renderer 生成整份原始配置并直接写板，绕过 `readKeyboardConfig()`、无损 merge、脱敏差异、60 秒 token、commit 前重读与回读确认，也会覆盖板上未进入 React 的网络、音频、未知字段和多 Profile。

修复要求：旧 `syncKeyboardConfig` 必须继续 fail closed 或移除 renderer 暴露；实际 UI 严格走“读取 → 脱敏编辑/预览 JSON Pointer 差异 → 明示确认 → commit”三接口。preview 前必须重新读取设备，不能只复用旧缓存；未支持动作明确显示 `T06 pending`。

### P0 · NVS 同步写入阻塞唯一输入 owner

`firmware/easyinput-controller/main/main.cpp` 在 `input_owner_task` 内直接执行 `config_store.save()`、两次 NVS commit、回读和重新 load。Flash/NVS 延迟期间该唯一 owner 不能继续处理按键、旋钮、USB 释放恢复和灯效事件，违反 `CONFIG_V1_FROZEN` 的输入优先级与“单一配置任务”边界。

修复要求：TinyUSB callback 只投递静态有界命令；独立的单一配置 owner 承担解析和 NVS 事务，通过有界消息把投影/ACK 交回输入 owner。必须用可控阻塞的假存储证明输入报告和 T04 灯效仍可继续。

### P1 · 旋钮配置被保存但没有按合同执行

`InputActionRouter` 保存了 `encoder_press_chord_` 和 `encoder_cursor_`，但 `EncoderPressed` 仍无条件切换横纵轴，两个字段没有参与行为；cursor mode 与配置的纯 HID 按压动作因此无效。配置更新时 `release_all()` 只清内部状态，没有先排队向 Windows 发送全释放报告，按键按住期间保存配置存在旧 modifier/usage 残留风险。

修复要求：冻结语义必须在唯一 router 中完整实现；配置切换先完成可观察的全释放，再原子替换投影，并覆盖按键按住、旋钮按压、cursor/scroll、方向、速度和反向回归。

### P1 · 原生读取组装不满足请求绑定和失败关闭

原生桥没有把发送的 numeric request ID 绑定到接收流，而是从第一个响应块重新采信 ID；旧响应可被标记成当前文本请求。相同最后一块没有幂等忽略，合法重复会重置事务；总 payload 超过声明长度时使用 `Take(_configLength)` 截断后仍可能接受；3 秒超时从请求开始固定计时而不是随有效进度刷新；设备断开也没有清理原生读取状态。

修复要求：请求开始时重置并保存文本/数值 ID 和 endpoint 生命周期；严格验证每块元数据、总字节数和零填充；只允许完全相同的最后块幂等忽略；有效进度刷新超时；断开、替换、乱序、冲突重复和超时都立即失败并清空状态。

### P1 · 固件边界和配置解析可能被异常报告破坏

Feature callback 对 `0x13` 只要求长度 `>=16`，随后按原长度复制到 63 字节数组，超长报告存在越界写入。配置投影使用手写字符串搜索和未经捕获的 `std::stoi`；非法 speed、嵌套同名字段或不完整 JSON 可能导致崩溃或错误投影，而不是失败关闭。现有 `config_core_tests` 只覆盖正常往返和一个存储路径，没有任务卡要求的乱序、重复、缺块、CRC、掉电阶段、坏 marker、旧配置导入和 NVS 故障矩阵。

修复要求：回调在复制前精确校验长度；采用有界且不会抛异常的 JSON/数字解析，或把完整严格解析放到可控任务中；补齐冻结任务卡的全部 malformed transport、事务中断和恢复测试。

## 2. Independent evidence reproduced

- 分支：候选精确基于 `a2adc9818da07119e59a6f14d125fc23576696c9`，最终 HEAD 与交接报告一致。
- 固件 Host：CMake 3.30.2 / MSVC 下 CTest 6/6 通过，但覆盖不足以命中上述阻断。
- 桌面：`npm ci --include=dev`、`npm test` 70/70、`npm run build:desktop` 通过。
- 固件构建：精确 ESP-IDF v5.5.5、target `esp32s3`、隔离 sdkconfig 构建通过；固定分区仍为 NVS 24 KiB、PHY 4 KiB、factory 3 MiB、sound A/B 各 576 KiB。审计镜像为 298432 字节，SHA-256 `4CDD04118F32AC1A0B0EE4F5606322B159AF41C80D088882A50345B61F15E022`；它仅是未烧录的本地审计产物。
- 静态：`git diff --check` 和固件 AGENTS/CLAUDE 一致性通过；构建产物均被忽略。
- 安全：未扫描端口、未识别设备、未读取或写入 Flash/NVS、未 flash/erase/monitor、未做 HIL。

## 3. Next gate

另一台电脑继续原分支完成上述返工并推送，保持 T05 范围，不开始 T06。本机第二轮独立审计必须新增能先红后绿的读取 manager、原生组装、UI 安全流程、输入优先级、旋钮投影和 NVS 故障测试。只有第二轮代码审计、Host/桌面/IDF 全部通过，才生成 app/NVS 备份与只读验收授权卡；T05 真机读取、明确 NVS 写入、重启恢复和 T03/T04 回归通过后，才能锁定 T05 并开放 T06。
