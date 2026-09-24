# Codex task brief reporter

DeskMate 的 `codex-task-brief-v1` 接收端只接受任务主动提交的脱敏里程碑。仓库脚本不会读取提示词、回复、窗口标题、命令、工具参数、工作目录或环境变量。

DeskMate 桌面程序运行后，在仓库根目录按任务使用一个不含个人信息的稳定键：

```powershell
npm run report:codex-task -- --task-key deskmate-t18 --task-label "DeskMate 软件闭环" --state thinking --milestone "开始核对当前实现"
npm run report:codex-task -- --task-key deskmate-t18 --state working --milestone "正在完成自动动作测试"
npm run report:codex-task -- --task-key deskmate-t18 --state waiting --milestone "等待人工验收"
npm run report:codex-task -- --task-key deskmate-t18 --state completed --milestone "软件构建与测试通过"
```

首次发送必须提供 `--task-label`，后续调用会从操作系统临时目录中的本地序号状态复用名称并递增序号。状态只允许 `thinking`、`working`、`waiting`、`completed`、`error`；名称最多 60 个字符，里程碑最多 80 个字符。发送失败时脚本返回非零退出码，但不会输出被拒绝的文字。

报告器只用于仓库内主动汇报。普通 `codex-hook-v1` 仍负责无正文的粗粒度生命周期；两者都不会安装或修改全局 Codex 配置。

## T69 通知边界

普通 PermissionRequest 仅表示正在处理权限检查，不证明需要人工回复，因此不再触发语音催促。真正阻塞式 `request_user_input` 和上述明确 `--state waiting` 报告仍可提醒。异步提问、父子任务和审批处理结果未包含在当前 Hook 合同中，不据项目名或模型名猜测；Codex 原生审批提示仍照常使用。

同一任务同类提醒在 15 秒内抑制重复候选，状态查询不延迟。任务通知等待 300 毫秒确认状态，连接语音后再复核；任务已继续或关闭就不发送旧文案。该窗口只影响任务通知，不影响陪伴对话的 0.5 秒收尾。已经发往 TTS 的话语不在本次改动中强行中断。诊断中的 notificationCounters 只表示权限检查、被抑制重复和播报候选数，不是实际成功播报次数。
