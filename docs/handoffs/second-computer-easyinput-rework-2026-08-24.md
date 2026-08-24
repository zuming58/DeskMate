# Second-computer rework prompt · T02 EasyInput input foundation

把下面整段复制到另一台电脑的 Codex：

```text
继续处理 DeskMate T02，不要开始新功能包。正式仓库是 F:\Codex\deskmate，继续使用现有分支 codex/easyinput-input-foundation；EasyInput 参考目录 F:\Codex\easyinput-wzm\easy-input-maker 和小智目录 F:\Codex\xiaozhi-yuntai 仍然只读。

先执行 git fetch origin，确认当前分支包含候选提交 315e7e2bb2d9298aec3a12cac849445973eb956d、工作区干净。不要合并 main；用下面命令读取审计报告：
git show origin/main:docs/reviews/t02-easyinput-input-foundation-audit-2026-08-24.md
然后完整重读根 AGENTS.md、firmware/easyinput-controller/AGENTS.md、flow/tasks/T02-easyinput-input-foundation.md，并严格按审计报告返工。

必须修复：
1. 修正 ESP-IDF main 组件依赖，至少补齐 esp_driver_gpio；采用单调真实毫秒时钟时补齐 esp_timer。建议启用 MINIMAL_BUILD。
2. main.cpp 不得再用循环次数 tick++ 冒充毫秒；当前默认 FreeRTOS 100 Hz 下 pdMS_TO_TICKS(1) 为 0。使用真实单调毫秒和至少一个 tick 的有界让步，并检查 gpio_config 错误。
3. 修复 HID 松键仍保留 Ctrl/Shift 等 modifiers 的错误；松开后完整报告必须清零。
4. 把 HID 内部边界补成平台无关的 held-key 状态：modifiers + 最多六个 usage，支持并发键、幂等重复、单键释放、全释放和 fail-closed 溢出；不要实现真实 USB 传输。
5. 不再用会在 Windows Debug 弹模态框的原始 assert；测试失败应输出 stderr 并返回非零。
6. 补齐 HID 松键/modifier-only/并发/溢出，按键长按/释放抖动，编码器抖动/非法跳变清半步/reset 中断 detent，以及真实计时边界测试。
7. 把 firmware/easyinput-controller/docs/provenance.md 移到根级 docs/provenance/，删除模块内 docs；同步保持 firmware/easyinput-controller/AGENTS.md 与 CLAUDE.md 逐字一致。
8. 在测试和构建真正通过前，把 README、T02 和 progress 状态写成 REVIEW_CHANGES_REQUIRED，不得写完成、可烧录或真机通过。

这台电脑需要成为可独立构建的开发机：使用 esp-idf-cy 或乐鑫官方 EIM 检测/安装并激活精确 ESP-IDF v5.5.5，只安装 esp32s3 所需目标；同时准备 CMake、CTest 和 C++ 编译器。只做环境、host test 和 build，不访问设备。

修复后依次运行：
cmake -S firmware/easyinput-controller/host_test -B firmware/easyinput-controller/host_test/build -DCMAKE_BUILD_TYPE=Debug
cmake --build firmware/easyinput-controller/host_test/build --config Debug
ctest --test-dir firmware/easyinput-controller/host_test/build -C Debug --output-on-failure
在精确 ESP-IDF v5.5.5 环境运行 idf.py -C firmware/easyinput-controller build。
再运行 EasyInput 板级只读扫描、git diff --check、密钥与构建产物检查。dependencies.lock 可以作为可复现依赖元数据提交，但 build、sdkconfig、bin、elf、map 不得提交。

完成后把修复提交继续推到 codex/easyinput-input-foundation，报告新提交哈希、测试数量、ESP-IDF 精确版本、build 结果和静态检查结果，然后停止。不要连接板子，不要扫描端口，不要 flash/erase/monitor；硬件可以以后接到任一电脑，但必须等本轮代码复审通过，并另行建立恢复与烧录授权任务。
```
