# Decisions

## D001 · One standalone product repository

- 日期：2026-08-23
- 决策：DeskMate 使用独立仓库 `zuming58/DeskMate`，应用代码位于仓库根目录。
- 原因：它是一个产品和发布边界；再保留 `` 套壳只会增加路径和交接成本。

## D002 · English directory names

- 日期：2026-08-23
- 决策：所有目录使用英文 ASCII 名称，文件名优先英文 kebab-case，正文允许中文。
- 原因：避免 Windows、脚本、终端编码和跨电脑协作中的路径问题。
- 说明：Project Flow 原模板的中文文件名映射为 `progress.md`、`lessons.md` 和 `guides/`，语义保持一致。

## D003 · External repositories are pinned, not vendored

- 日期：2026-08-23
- 决策：`easy-input-maker`、`easyinput-board-cy` 和 `project-flow-cy` 不完整复制到本仓库，只记录 URL、固定提交、许可证和必要合同。
- 原因：保持产品仓库纯净，同时保留可复现的来源依据。

## D004 · Computer microphone remains default

- 日期：2026-08-23
- 决策：在板载音频完成真机验收前，电脑麦克风仍是默认录音源；板载麦克风作为显式选择的第二适配器。
- 原因：现有语音闭环已经可用，新增协议不能破坏稳定路径。

## D005 · No speculative hardware writes

- 日期：2026-08-23
- 决策：未知 HID 不写；厂商报告只按固定合同实现。烧录、擦除、分区和 eFuse 操作必须另行授权。
- 原因：保护用户现有可用产品和固件。
