# Two-computer handoff

本项目允许两台电脑交替开发，但 GitHub 是唯一代码交换通道；不得再用整目录覆盖工作树。

每次换电脑前必须完成一条可审计交接：

1. 从最新 `origin/main` 或交接指定提交建立一个 `codex/` 短分支，一次只开发任务卡允许的一个功能包。
2. 完成代码、自审和本机有资格声明的验证；未连接硬件的电脑不得声明 HIL，未获授权不得扫描、读取或写入设备。
3. 在 `flow/progress.md` 顶部写明日期、电脑角色、分支、HEAD、做了什么、验证、未做什么、问题和接手方第一个动作。
4. 影响未来实现的结论写入 `flow/decisions.md`，可复用故障经验写入 `flow/lessons.md`；大体积构建目录、密钥、录音和用户数据不得提交。
5. 提交并推送短分支，确认远端 HEAD 后停止。接手电脑先 `git fetch`，核对准确 HEAD，再审计或继续；不得用截图、口述或复制回来的整目录代替 Git 提交。
6. 若网络暂时失败，保留本地提交并明确写成“未推送”；恢复网络后推送。不得为赶进度把两个来源目录互相覆盖。

交接记录最少包含：`role`、`branch`、`HEAD`、`base`、`scope`、`changed paths`、`verification`、`hardware operations`、`open risks`、`next action`。
