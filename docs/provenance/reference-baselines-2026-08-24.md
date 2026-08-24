# DeskMate reference and recovery baselines · 2026-08-24

本文件只保存外部参考的路径、版本、哈希和恢复指针。外部源码、构建目录、固件镜像和用户数据不进入 DeskMate Git 仓库。

## DeskMate product baseline

- 产品仓：`F:\Codex\deskmate`
- 迁移起点：`7d7eabd6ddb40525bec42054ef3ecf5c49e73ec7`
- 桌面/三端基线提交：`dbae59e`（完整哈希可用 `git rev-parse dbae59e` 查询）
- 验证：`npm test` 66/66；`npm run build:desktop` 通过。

## EasyInput Maker read-only reference

- 预期路径：`F:\Codex\easyinput-wzm\easy-input-maker`
- Git 提交：`7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- 分支：`main`
- 状态：参考工作区存在未提交的 Project Flow、课程资料和 host-test 改动；它不是可直接合并的干净产品分支。
- 用途：查阅现有行为、协议、GPIO 使用和测试证据；DeskMate 正式固件只在 `firmware/easyinput-controller/` 开发。
- 恢复边界：当前没有在参考目录外确认一套独立 Maker 恢复 `.bin`；在有硬件电脑完成明确备份/恢复授权卡前，不烧录新固件。

## Xiaozhi read-only reference

- 预期路径：`F:\Codex\xiaozhi-yuntai`
- Git 身份：无；以技术地图、文件哈希和本地构建基线追溯。
- 最新交接：`docs/xiaozhi-yuntai-today-handoff-copy-2026-08-24.md`
  - SHA-256：`EFDC290798E3AF1AEB27269418B725E1368CE1363680C7B87B8720C451274F51`
- 硬件/后台地图：`docs/xiaozhi-yuntai-hardware-backend-control-map-2026-08-24.md`
  - SHA-256：`31662C52E0887B4A24160D83D8DCE0744555E5A5E11BBBA6B3DFEBA804DE630B`

### Local recovery candidates — do not upload

这些文件只作为本机恢复候选记录；尚未声明它们构成经过真机恢复验收的完整烧录集合。

| 外部路径（相对 `F:\Codex\xiaozhi-yuntai`） | 大小 | SHA-256 |
| --- | ---: | --- |
| `build-baseline-20260823/xiaozhi.bin` | 2,596,368 | `F76C7C28E87A8EF236D01CCEEAF2DC72908A6D78BC00CBCD4A97A7A859ED08EE` |
| `build-baseline-20260823/bootloader/bootloader.bin` | 16,256 | `CD281C5C2410A85033589E23E6FA3CF78F789F6FC61D09185262D200C2F90504` |
| `build-baseline-20260823/partition_table/partition-table.bin` | 3,072 | `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0` |
| `build-baseline-20260823/ota_data_initial.bin` | 8,192 | `7D2C7AC4888BFD75CD5F56E8D61F69595121183AFC81556C876732FD3782C62F` |
| `build-baseline-20260823/srmodels/srmodels.bin` | 291,042 | `7C87DD7ADB5A7623907B6354D49BEA7F9289371262E6A57F15458FB8908C5814` |

## Cross-computer rule

- 另一台电脑可在相同 `F:\Codex\...` 路径放置两个只读参考目录，但只通过 GitHub clone DeskMate 产品仓。
- 不上传或提交外部参考目录、`build/`、`.bin`、`.elf`、`.map`、NVS、录音、密钥、端口或设备标识。
- 参考路径缺失或哈希不一致时，任务停止在 `REFERENCE_UNVERIFIED`，不从网络或其他工程猜补。
