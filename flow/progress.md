# Progress log

> 最新记录置顶。这里是跨电脑、跨 Agent 的事实交接入口。

## 2026-08-23 · Standalone repository migration

- 做了什么：从旧的混合学习仓库抽取 DeskMate 最新 Phase 3D 可运行代码，迁移到 `F:\Codex\deskmate`；建立英文目录结构、Project Flow 控制面、产品/架构/协议/测试/设计索引和新 Git 历史。
- 为什么：旧工作区包含空格、中文目录、课程资料、参考仓库和多个阶段任务，容易把构建产物、学习资料与正式产品混在一起。
- 怎么理解：`DeskMate` 现在是唯一产品边界；课程资料留在旧区域，外部固件只通过固定提交与协议文档引用。
- 主要产出：根目录应用源码，`flow/`，`docs/`，`design/`，`AGENTS.md`，`DESIGN.md`，`README.md`。
- 已确认基线：旧源分支 `codex/easyinput-desktop-continue`，提交 `25b52540e0ec3e129760b15f3591d286be41d31b`；迁移前 `npm test` 60/60、桌面构建通过。
- 新仓库验证：Project Flow 上游 Stop Hook 测试通过；`npm ci --include=dev` 通过；`npm test` 60/60；`npm run build:desktop` 通过；打包程序 `--deskmate-smoke-test` 退出码 0；提交候选不存在中文路径或常见密钥值。
- 外部事实：Maker 固件固定提交已公开板载麦克风 UDP 与厂商 HID 合同；当前产品仍默认电脑麦克风，真实 Agent 与未来硬件仍是模拟/待接入。
- 问题与解决：Windows tar 对中文路径解码失败，改用临时 Git worktree；Project Flow 测试缺少 jq，使用临时固定版本 jq 1.7.1 完成测试，不把工具带入仓库。
- 下一步：按 `flow/plan.md` 实现 Phase 3E 协议编解码和模拟板；有硬件的电脑最后做真机验收。
