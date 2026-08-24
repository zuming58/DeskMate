# T02 EasyInput input foundation audit · 2026-08-24

- 审计对象：`origin/codex/easyinput-input-foundation`
- 候选提交：`315e7e2bb2d9298aec3a12cac849445973eb956d`
- 当时结论：`CHANGES_REQUESTED`，不得合并、不得烧录。
- 后续状态：问题已由提交 `7edb0a6` 修复并通过独立复审；最新结论见 [`t02-easyinput-input-foundation-second-audit-2026-08-24.md`](t02-easyinput-input-foundation-second-audit-2026-08-24.md)。本文件保留首轮审计证据。

## 已确认的证据

- 原提交的 host test 在本机 MSVC Debug 下通过：1/1。
- ESP-IDF 环境精确为 v5.5.5，目标为 ESP32-S3。
- `idf.py build` 失败：`main/main.cpp` 使用 `driver/gpio.h`，但 `main/CMakeLists.txt` 没有声明 `esp_driver_gpio` 依赖。
- 板级扫描为 1 PASS、1 WARN、0 FAIL；扫描器不能识别当前 C++ `constexpr` 引脚声明，因此 GPIO 由人工复核。S1～S8、编码器和 USB 引脚值正确，GPIO0/GPIO8 未使用。
- `git diff --check` 通过；远端提交未包含 build、bin、elf、map、sdkconfig、密钥或用户数据。

## 必须修复

1. **ESP-IDF 构建依赖缺失**：为 `main` 精确声明 `esp_driver_gpio`，若改用 `esp_timer_get_time()` 同时声明 `esp_timer`；建议启用 `MINIMAL_BUILD`，避免把无关 IDF 组件全部拉入构建。
2. **真实防抖时间错误**：`main.cpp` 用循环次数 `tick++` 冒充毫秒，且当前默认 `CONFIG_FREERTOS_HZ=100` 时 `pdMS_TO_TICKS(1)` 为 0。改用单调时钟产生真实毫秒，并使用至少一个 FreeRTOS tick 的有界延时；不能靠循环次数计时。
3. **HID 松键残留修饰键**：`encode_boot_keyboard()` 在 `pressed=false` 时仍写入 modifiers。审计加入 `up[0] == 0` 后测试稳定失败，Ctrl/Shift 等可能保持按下。
4. **HID 多键状态不足**：当前编码器只表达单个 usage，不能形成八键并发所需的完整 held-key report。建立平台无关、状态化的 modifiers + 最多六 usage 表示；重复按下/释放应幂等，溢出必须 fail closed，最终全释放必须得到全零报告。
5. **测试失败会弹窗**：MSVC Debug 的原始 `assert` 触发了模态 Runtime Library 对话框。host test 必须使用非交互检查方式，失败时向 stderr 输出文件/行/表达式并返回非零，不能阻塞自动化。
6. **测试覆盖不足**：补齐 HID 修饰键释放、modifier-only、并发键、重复事件/溢出；按键长按与释放抖动；编码器抖动、非法跳变清除半步、reset 中断 detent；真实时间来源与调度假设的源码/边界测试。
7. **项目结构不合规**：把 `firmware/easyinput-controller/docs/provenance.md` 移到根级 `docs/provenance/`；本模块不得建立第二套 `docs/`。
8. **局部规则漂移**：修改了 `firmware/easyinput-controller/AGENTS.md` 却没有同步 `CLAUDE.md`，两者必须保持逐字一致。
9. **状态不得提前完成**：README、任务卡和进展在上述门通过前标记为 `REVIEW_CHANGES_REQUIRED`；不得声明 T02 完成、可烧录或真机通过。

## 返工验收门

- host test 全部通过，且失败测试不会弹 UI。
- 精确 ESP-IDF v5.5.5 `idf.py build` 成功。
- 重新运行板级扫描、`git diff --check`、密钥与构建产物检查。
- 只更新原分支并推送新提交；停止在代码/构建门，不连接设备、不烧录、不运行 monitor。
- 新提交由另一台电脑再次独立审计后，才创建单独的恢复/烧录/HIL 授权任务。
