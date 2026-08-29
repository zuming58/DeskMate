# T06 · EasyInput Windows host actions

- 状态：`SELF_AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / HOST_ACTION_V1_FROZEN / HIL_CONFIRMED / USER_ACCEPTED / T06_LOCKED`。2026-08-29 用户在当前打包版完成语音同窗写回、主动切窗安全回退、固定文字、打开应用、配置重启回读以及八键/旋钮/灯效/语音回归，并明确报告全部通过。验收详情见 `docs/testing/t06-host-actions-acceptance-2026-08-29.md`。
- 前置：T03～T05 均锁定，T05 已提供事务配置和重启回读。
- 计划分支：`codex/easyinput-t06-host-actions`，从 T05 锁定 HEAD 创建。
- 目标：统一接入必须由 Windows 执行的按键动作：固定文字、打开应用，以及经产品确认的历史/设置/Profile 等 AppCommand；先把 DeskMate 已有“选择应用/本地 UUID 映射/测试打开”与 EasyInput 实体键打通，并完成确认、失败、断线和重启恢复。

## Contract gate

合同已在 `contracts/deskmate-host/easyinput-host-action-v1.md` 自审并标记 `HOST_ACTION_V1_FROZEN`。固定 Maker 证据中的 `0x11` kind `0x01/0x05`、规范小写 UUID、59 字节固定文字分块和按下一次触发是实现边界。

合同至少定义 capability、版本、动作 kind、UUID/固定文字载荷、事件序列、按下/释放、分块、重复、断线、超时、确认；USB 唯一传输所有权；Windows 主进程独占路径映射与文字注入；非法/缺失映射 fail-closed；重启恢复；Host Action 不得复用为 DeskMate Link。

## Implementation scope after freeze

- 固件按冻结配置生成一次 Windows 主机动作事件并保持 T03 输入释放安全；
- Windows 输入桥和 Electron 主进程接收规范 UUID 或有界固定文字，分别执行本地映射安全启动或受控文字输入；
- React 提供固定文字编辑、应用搜索/选择/更换/测试、同步差异与确认状态；其他 AppCommand 只有经本任务再次冻结后才能开放；
- T05 事务配置保存 UUID，重启后回读一致；T04 输入灯效只表示实体输入已被识别，不冒充应用已经成功打开。

本包禁止任意命令/参数、相对路径、网络下载、管理员提升、BLE、音频、小智和 DeskMate Link。

## Verification and delivery

- 覆盖黄金向量、UUID 严格校验、一次触发、重复/断线不重放、安全失败和输入桥重启；
- 桌面覆盖渲染进程无路径、主进程白名单映射和安全启动；
- 回归 T02～T05、ESP-IDF v5.5.5 构建和桌面基线；烧录继续单独授权；
- 完成后推送 T06 分支并停止，不合并 `main`、不开始后续包，由原主电脑独立审计和真机验收。

本状态只表示本开发机的 Host/桌面测试和 ESP-IDF 构建证据；不表示真机通过、可烧录或 HIL 已授权。
