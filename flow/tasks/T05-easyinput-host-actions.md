# T05 · EasyInput Host Action and open application

- 状态：`BLOCKED_BY_T04_HOST_ACTION_CONTRACT_NOT_FROZEN`
- 前置：T03、T04 均经另一台电脑自审、真机锁定并推送。
- 计划分支：`codex/easyinput-t05-host-actions`，从 T04 最终 HEAD 创建。
- 目标：把 DeskMate 已有“选择应用/本地 UUID 映射/测试打开”与 EasyInput 实体键打通，并完成确认、失败、断线和重启恢复。

## Contract gate

编码前在 `contracts/deskmate-host/easyinput-host-action-v1.md` 提出并自审合同；只有显式标为 `HOST_ACTION_V1_FROZEN` 后才能实现。固定 Maker 证据中的 `0x11` kind `0x05`、规范小写 UUID 和按下一次触发可作为兼容起点，但不能直接等同于 DeskMate 已冻结合同。

冻结合同至少定义：

- capability、版本、规范 UUID、事件序列、按下/释放、重复、断线、超时和确认语义；
- USB V1 的唯一传输所有权；BLE 留到 T06，不在本包双发或失败后跨通道补发；
- UUID 到 `.exe`/`.lnk` 的映射只保存在 Windows 主进程，渲染进程和固件不得看到原始路径或命令行；
- 未知 UUID、非规范 UUID、映射已删除、应用不存在、启动失败和重复事件全部 fail closed；
- 重启后板上配置与 Windows 本地映射如何恢复、如何显示“板上已配置但本机缺少映射”；
- Host Action 仅是 Windows 主机动作，不得复用为 DeskMate Link 或小智控制。

## Implementation scope after freeze

- EasyInput 固件按冻结配置生成一次 Host Action 事件，并保留 T03 输入释放安全；
- Windows 输入桥与 Electron 主进程接收脱敏 UUID、查找本地映射并安全启动；
- React 提供应用搜索/选择、更换、测试、同步差异、成功/失败和板上确认状态；
- T04 配置事务保存 Host Action UUID，重启后回读一致。

本包禁止任意命令/参数执行、相对路径、网络下载、管理员提升、BLE、音频、小智和 DeskMate Link。

## Verification and HIL gate

- 黄金向量、UUID 严格校验、按下一次/释放不发、重复和断线不重放；
- 未注册、被删除、非法路径、启动失败和输入桥重启均可恢复且不伪报成功；
- 桌面测试覆盖渲染进程无路径、主进程白名单映射和安全启动；
- 回归 T02～T04 全量测试、ESP-IDF v5.5.5 构建和桌面构建；
- 烧录继续单独授权；真机选择一个无副作用应用，验证同步、实体键打开、只打开一次、重启恢复和删除映射后的安全失败。

## Delivery

完成后自行审计、真机回归并更新 `flow/progress.md`，推送 T05 分支；不得合并 `main`、不得开始 T06。用户回到原主电脑后，由原主电脑依次审查 main→T03、T03→T04、T04→T05，再做三包组合回归和必要真机复验。
