# Workbench overview — T26

Date: 2026-09-11. Scope: Windows software only; no hardware commands or firmware changes.

## Intent and design audit

用户在外通过远程桌面使用 DeskMate，需要首页回答“软件是否可用、今天用了多少、记忆处理到哪里、现在是哪种工作场景、哪些项目需要关注”。旧首页主要空间被桌宠大脸、重复表情选择和没有真实依据的任务百分比占据，不能承担综合看板职责。

保留现有深石墨导航、浅灰工作区、白卡片与青蓝强调色。首页保留 68px 的陪伴标识，不再放大脸、传感器占位或表情编辑。AI 陪伴的会话形象及原有功能不变。此轮产品设计审查依据用户原始首页截图和真实数据源，未引入新一套视觉风格。

## Information architecture

1. 四项概览：相伴时光、今日语音输入、今日陪伴交流、已确认长期记忆。
2. 连接与服务：DeskMate 本地核心、EasyInput USB、小智扩展、三段式 AI 服务配置、KnowledgeOS 配置。
3. 最近 7 天：听写与用户陪伴发言的分日堆叠图，显示确切条数而非估计节省时间。
4. 记忆流程：小时整理、整天总结、KnowledgeOS 分别提交 work/personal；显示已完成日终数、待同步数和候选审核入口。
5. 当前场景：场景名、有效提示词数、第 5–7 键当前功能；跳转提示词和按键配置，不新增第二套编辑器。
6. Codex 项目：按现有可信项目标签汇总最近任务，优先显示错误、等待确认、工作中；显示最近上报时间，无百分比和预计完成时间。
7. 底部快捷入口：AI 陪伴、语音输入、词库。只导航，不直接开麦、启动外部应用或驱动硬件。

1440×1024 时主体使用两列，主要卡片均在首屏；较窄窗口改为单列并允许普通纵向滚动，不横向溢出。主要卡片信息不为凑齐首屏而删减。

## Data definitions

| Display | Source and boundary |
| --- | --- |
| 相伴第 N 天 | SQLite 最早保留的 companion 用户最终回合，或有来源回合的 companion 日期摘要；按本地日历日含首日计算。不是连续在线时长，不凭安装日期猜测。旧记录/摘要全部删除后会重置。 |
| 今日输入次数/字数 | 本地自然日已落盘的 dictation 用户最终记录；SQLite Unicode 字符长度含标点，不计算中间识别片段和助手回答。未进入记忆库的失败/模拟/语音编辑不计数。 |
| 今日陪伴交流 | 同一自然日已落盘 companion 用户最终发言数。助手回答不重复累计。 |
| 最近 7 天 | 同一数据源，按本地自然日补齐无记录的日期；只代表保留记录。不会读取前端演示历史。 |
| 长期记忆 | memory_candidates 中 accepted；pending 单独显示，rejected 不计入。仅本地已确认库，不冒充 KnowledgeOS 全部记忆数。 |
| 日终总结 | memory_daily_journals 中 completed 的天数；closing 不计已完成。自然日统计和提前封账后的工作日归属是不同概念。 |
| 待同步 | outbox 中 pending/sending/failed 全部尚未受理项。accepted 不计待同步；受理时间来自 accepted_at。受理不是完成知识提炼或正式知识发布。 |
| 当前场景 | PromptWorkbenchStore 中 activeScene、有效条数和第 5–7 键标签；不返回提示词正文、应用路径或执行动作。 |
| 项目状态 | 已有 Codex 可信任务上报按 taskLabel 聚合；仅表示最后一次上报，不据此断言离线任务仍然运行。 |

## Architecture and refresh

- Main-owned `createWorkbenchOverview` 通过 `workbench:get-overview` 提供版本化只读投影，沿用 `handleTrusted` 和最小 preload。
- `CompanionMemoryStore.dashboardSummary()` 在 SQLite 聚合，不调用会改变工作日边界的 `workdayStatus()`，不返回文本、密钥、Credential ID、项目 ID、设备标识或原始路径。
- 数据首次载入、页面可见时每 15 秒、重新聚焦、场景状态事件及手动刷新时更新；同一页面不并发重复读取。离开首页清理监听与定时器。
- 首次读取失败显示未知值 `—` 和错误提示，不能把失败当成零；后续失败保留上次数据及更新时间，允许重试。
- EasyInput USB 连通不等于小智 Link 连通。禁用小智是中性产品模式，不是故障。远程没有设备时电脑端功能仍可使用。
- AI/KOS 凭据配置只显示“已配置”，不主动发起云服务探测，不声称网络/身份验证刚刚成功；连接测试仍在原设置页。
- “任务联动”深链到 AI 陪伴的智能控制分区；没有增加新导航页。

## Verification and exclusions

`npm test` 包含本地日界、去重、角色/来源隔离、保留摘要后的相伴天数、忘记后归零、真实 store 投影、只读性、同步状态边界、字段脱敏和项目聚合测试。

`scripts/verify-workbench-overview.cjs` 使用生产 React 构建/preload 和真实投影函数，在临时 Electron profile 中注入合成记录；1440×1024、960×680、空库/设备未连接、小智关闭、首次/后续 IPC 失败均有检查和截图。拒绝录音权限与外部 HTTP/WebSocket，请勿把这些截图里的示例数字或设备状态当成用户实测。

本切片不修改语音、按键、固件、调度时间、记忆审核、同步或删除策略。T25 设置保存/身份连接已获用户截图确认；AI 陪伴真实知识检索、日终两类同步和硬件行为仍需要各自验收。
