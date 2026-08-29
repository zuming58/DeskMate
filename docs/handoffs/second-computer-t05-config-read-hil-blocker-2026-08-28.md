# Second-computer handoff: T05 configuration-read HIL blocker

## Exact handoff state

- Active branch: `codex/easyinput-t05-config-read-fix`.
- The receiving computer must fetch GitHub and verify the exact handoff HEAD recorded at the top of `flow/progress.md`; do not copy or overwrite the whole working tree.
- T03 and T04 remain locked. Keys, encoder, LED feedback and device enumeration still work.
- T05 is **not** locked. T06 must not start until the read/write/reboot HIL gate below passes.
- Current board has received app-only image from code commit `e10211ffedd1a27e6ec1608be9b38872a70d72ae`:
  - size: 325,408 bytes (`0x4F720`)
  - SHA-256: `3074B78E6A4AD3688291E542BCA3298239BBD164427CAD925C18D9134B49D3ED`
  - data range: `0x010000..0x05F71F`
  - erased sector coverage: `0x010000..0x05FFFF`
  - no NVS, partition, eFuse or Xiaozhi operation was performed.

## Reproduced facts

1. DeskMate and the native input bridge both report the EasyInput as connected.
2. A clean app-only flash of `fac1fa8` still returned `config-read-timeout`.
3. A second app-only flash of `e10211f` also returned `config-read-timeout`.
4. DeskMate was completely terminated, including `DeskMate.InputBridge.exe`; an independent bridge process was then started from `release/win-unpacked/resources/input-bridge/DeskMate.InputBridge.exe`.
5. The independent bridge reported `boardConnected=true`, accepted the Windows `HidD_SetFeature` request, but emitted no `config-progress`, `config-capabilities` or `config-snapshot` event before timeout.
6. Therefore this is not a stale renderer, page cache or an Electron restart problem. Do not burn the same image again.

## Fixes already tried and why they were insufficient

- `fac1fa8`: normalized the two TinyUSB Feature Report forms used by Windows: report ID supplied separately or embedded in `buffer[0]`. Host tests passed, but HIL still timed out.
- `e10211f`: allowed report `0x11` response kind `0x04` in transfer-completion identity and added a completion-state regression test. Host CTest `6/6` and ESP-IDF v5.5.5 build passed, but the real bridge still observed no first progress event.
- Conclusion: the failure is earlier than, or outside, the tested multi-chunk completion transition. The next change must be evidence-driven, not another blind flash.

## Highest-value investigation order

1. **Observe the first response without relying on the current Raw Input parser.** Use a bounded, read-only diagnostic or temporary firmware counters to determine separately:
   - whether `tud_hid_set_report_cb` receives report `0x13`;
   - the real callback `report_id`, `report_type`, `length`, first bytes and zero-padding shape (do not log user configuration);
   - whether `decode_config_read_request` succeeds and `config_command_queue` accepts the command;
   - whether `ConfigStatusStream::replace` becomes pending;
   - whether the first `tud_hid_report(0x11, ..., 63)` is accepted;
   - the real `tud_hid_report_complete_cb` length and report-ID shape.
2. **Check the Windows receive boundary.** The native bridge currently requires Raw Input `SizeHid == 64` and `report[0] == 0x11`. Verify the actual Windows Raw Input bytes/length. If Windows supplies a 63-byte payload or separates/omits the report ID, normalize that boundary just as the Feature Report boundary is normalized.
3. **Compare the fixed Maker implementation before changing either side.** Use only pinned commit `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`, especially its status request adapter, input-report descriptor, Windows receive/parser path and tests. Record the behavioral difference before implementation.
4. Add an integration test that uses the exact observed Windows/TinyUSB callback and Raw Input shapes. Existing synthetic tests that manufacture a 64-byte report are not sufficient evidence.

Do not expose MAC, device path, configuration JSON, Wi-Fi/audio fields or user data in logs. Hardware monitor/flash/NVS operations still require explicit user authorization. If a diagnostic firmware is needed, show its exact HEAD, SHA-256 and app-only range before requesting authorization.

## T05 closure gate

After the root fix passes code review/build, perform in order:

1. Read-only: capability read succeeds and full configuration read succeeds.
2. Obtain explicit NVS-write authorization.
3. Preview and commit one field only: change S7 from Paste to Undo; verify unrelated fields are unchanged.
4. Verify S7 behavior, reboot, read back and confirm persistence.
5. Restore S7 to Paste and verify again.
6. Regress T03/T04 keys, encoder, disconnect recovery, LED feedback and DeskMate voice input.
7. Record evidence and mark T05 locked before opening T06.

## T06 immediately after T05

Read `flow/tasks/T06-easyinput-host-actions.md`. Freeze `HOST_ACTION_V1_FROZEN`, then implement the first new user-visible functions:

- fixed text;
- open application through a local UUID-to-path mapping owned only by the Electron main process;
- application search/select/change/test UI;
- device event acknowledgement, disconnect/restart recovery and fail-closed behavior.

Do not allow arbitrary command lines, arguments, relative paths, elevation or network downloads. Do not reuse Host Action as DeskMate Link. After T06 HIL, stop and prepare the EasyInput-to-Xiaozhi UART/DeskMate Link contract package; do not guess the board-to-board protocol.

## Copy to the second computer

```text
请在 F:\Codex\deskmate 接手 T05 配置读取真机阻断，并在通过后继续 T06。

1. 不要复制整个目录覆盖工作树。执行 git fetch origin，读取根 AGENTS.md、flow/charter.md、flow/plan.md、flow/progress.md 顶部，以及 docs/handoffs/second-computer-t05-config-read-hil-blocker-2026-08-28.md。
2. 确认 origin/codex/easyinput-t05-config-read-fix 精确等于 progress 顶部记录的 HANDOFF HEAD，然后切到并跟踪该分支；不一致立即停止。
3. 当前 e10211f 已烧录但真机仍 config-read-timeout。DeskMate 完整重启和独立原生桥复现证明不是页面缓存；不要重复烧同一镜像。
4. 严格按交接文档的调查顺序，先取得 0x13 接收、首个 0x11 发送以及 Windows Raw Input 实际长度/Report ID 形态的证据，再做最小修复。先对照 Maker 固定提交 7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01，不得继续猜测性补丁。
5. 运行固件全部 Host CTest、ESP-IDF v5.5.5 esp32s3 构建、npm test、npm run build:desktop 和 git diff --check。任何硬件 monitor、读取、烧录或 NVS 写入仍先取得用户明确授权。
6. 按交接中的 T05 真机门完成只读配置、单字段 NVS 往返、重启回读、恢复和 T03/T04 回归后锁定 T05。
7. T05 锁定后从锁定 HEAD 创建 codex/easyinput-t06-host-actions，读取 flow/tasks/T06-easyinput-host-actions.md，先冻结 HOST_ACTION_V1_FROZEN，再开发固定文字和打开应用。不得开发 BLE、音频、小智固件或猜测 DeskMate Link。
8. 每个阶段完成后更新 flow/progress.md 顶部，提交并推送准确分支/HEAD/验证/硬件操作；GitHub 是唯一交换通道。
```
