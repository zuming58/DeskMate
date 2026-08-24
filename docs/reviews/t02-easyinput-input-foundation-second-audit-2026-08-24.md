# T02 EasyInput input foundation second audit · 2026-08-24

- 审计对象：`origin/codex/easyinput-input-foundation`
- 返工提交：`7edb0a66187a1e02c26d64aa1470595f659a44ad`
- 基线提交：`315e7e2bb2d9298aec3a12cac849445973eb956d`
- 结论：`CODE_REVIEW_CONFIRMED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED`；可以合入主线，但不等于可烧录、HIL 或真机功能通过。

## 独立复审结果

- 返工提交严格落在 T02 允许范围：正式 EasyInput 固件模块、根级来源记录、任务与进展记录；没有修改两个外部参考目录。
- `main` 明确依赖 `esp_driver_gpio` 与 `esp_timer`，根工程启用 IDF `MINIMAL_BUILD`。
- GPIO 初始化错误使用 `ESP_ERROR_CHECK` fail fast；采样时钟改为 `esp_timer_get_time()` 的单调毫秒，并使用 `vTaskDelay(1)` 至少让出一个 FreeRTOS tick。
- HID held-key 状态支持 modifiers、最多六个 usage、并发、幂等、单键释放、全释放和 fail-closed 溢出。
- Host test 使用 stderr 与非零退出报告失败，不再使用会触发 MSVC Debug 模态窗口的原始 `assert`。
- 来源记录已移至根级 `docs/provenance/t02-easyinput-input-foundation.md`；模块未保留第二套 `docs/`；局部 `AGENTS.md` 与 `CLAUDE.md` 逐字一致。

## 独立验证证据

在隔离 worktree、返工提交的干净检出上执行：

```powershell
cmake -S firmware/easyinput-controller/host_test -B firmware/easyinput-controller/host_test/build -DCMAKE_BUILD_TYPE=Debug
cmake --build firmware/easyinput-controller/host_test/build --config Debug
ctest --test-dir firmware/easyinput-controller/host_test/build -C Debug --output-on-failure
```

- CMake/CTest 3.30.2、MSVC 19.44：2/2 通过。
- 测试项：`input_core_tests`、`firmware_source_contract_tests`。
- Visual Studio 多配置生成器只报告 `CMAKE_BUILD_TYPE` 未使用的非阻断警告；无 Debug Error 弹窗。

随后激活 `C:\Espressif\tools\Microsoft.v5.5.5.PowerShell_profile.ps1` 并执行：

```powershell
idf.py --version
idf.py -C firmware/easyinput-controller build
```

- 版本：ESP-IDF v5.5.5。
- target：`esp32s3`。
- 构建模式：`Minimal build - ON`。
- 构建成功；应用镜像 `167216` 字节（`0x28d30`），1 MiB app 分区余量约 84%。

## 静态检查与证据修正

- `git diff --check` 通过。
- 未跟踪提交 `build/`、`sdkconfig`、`.bin`、`.elf`、`.map`、密钥、用户数据或本机设备路径。
- ASCII 路径、任务范围、来源记录和局部规则检查通过。
- 板级只读扫描实际输出为 **1 PASS、1 WARN、0 FAIL**，不是“全部 PASS”。WARN 是扫描器不能识别 C++ `constexpr` 引脚声明；人工复核 S1～S8=`2,47,38,41,1,6,7,48`、编码器 A/B/按压=`17/16/18`、USB D-/D+=`19/20` 正确，GPIO0/GPIO8 未使用。

## 尚未通过的门

- 本轮没有连接、识别或读取设备，没有扫描端口，没有执行 flash、erase 或 monitor。
- 当前 `main` 采样后会丢弃 `InputEvent`，没有真实 USB 输出或可观察的诊断通道；因此该镜像不应被描述成“可用固件”或直接进入按键真机验收。
- 轮询每一 FreeRTOS tick 在默认 100 Hz 下约为 10 ms；正式旋钮事件路径仍需边沿安全的采集策略和压力测试，不能仅凭纯逻辑测试断言不会漏边沿。

## 下一步建议

建立独立的小任务包：增加边沿安全的输入硬件适配与确定性的诊断出口，在不启用产品配置写回、音频、网络或小智通信的前提下先完成 host test、构建和审计。准备恢复证据并取得用户单独授权后，再在默认硬件电脑执行首次单板 HIL。
