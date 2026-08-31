# T10 Codex global status hook installation handoff

## Result

- Branch: `codex/t10-codex-global-status`
- DeskMate Codex adapter base: `ba7fda6761997a446028c8600e2aa5e17b0bfcdf`
- Global Codex hook file: `C:\Users\Administrator\.codex\hooks.json`
- DeskMate hook helper: `C:\Users\Administrator\.codex\hooks\deskmate-codex-status-hook.cjs`
- Pre-install backup: `C:\Users\Administrator\.codex\backups\hooks-before-deskmate-20260831-121308.json`
- Backup SHA-256: `E6B5060315421B4B895C06E68804FD650BE93599F9DEB8813C13EFCBE986FE58`

The global Codex configuration now forwards the seven supported lifecycle events to the local DeskMate named pipe. The existing EasyInput executable handlers remain the first handler in every event group and are byte-for-byte unchanged. DeskMate is appended as a second synchronous, bounded handler for `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, and `Stop`. `SubagentStart` and `SubagentStop` were not changed.

## Safety and privacy boundary

- The helper forwards only protocol version, the fixed provider name `codex`, the event name, and a bounded tool name for tool-related events.
- Prompt text, model output, tool arguments/results, session or turn identifiers, transcript path, working directory, device paths and user data are not forwarded.
- The helper has a 1 MiB stdin ceiling, a 128-byte tool-name ceiling, and a 150 ms named-pipe timeout.
- Invalid input, unsupported events, an unavailable DeskMate process, or a missing pipe all fail closed with exit code zero and no output, so DeskMate cannot block Codex work.
- Handlers remain synchronous to preserve lifecycle order. The Codex configuration timeout is two seconds, while the helper itself stops waiting after 150 ms.
- No firmware, hardware, port, Flash, NVS, OLED, servo or audio operation was performed.

## Validation

- The helper passed `node --check`.
- `hooks.json` parsed successfully after installation.
- All nine original EasyInput handler objects were compared against the verified backup; none changed.
- Exactly seven DeskMate handlers are present and no DeskMate handler exists under the two subagent events.
- The exact Windows helper command exited with code zero, no stdout/stderr, and completed in 188 ms while the packaged DeskMate process was running.
- Packaged process used for the pipe-path check: `F:\Codex\deskmate-t09-integration\release\win-unpacked\DeskMate.exe`.

## Activation behavior

Codex loads and trusts hooks when a task starts. Existing tasks do not hot-reload this installation. Close and reopen a Codex task once, approve the hook trust prompt if shown, and keep the latest DeskMate application running. This does not require creating a special DeskMate-only Codex task; every subsequently opened Codex task can publish lifecycle events through the same global hook.

The current first version uses the most recent accepted event as the visible state. If several Codex tasks run concurrently, their events can therefore replace one another. Per-task aggregation is deliberately deferred until a privacy-safe ownership contract is frozen.

## Rollback

If the global integration causes any unexpected Codex behavior:

1. Close newly opened Codex tasks.
2. Restore `C:\Users\Administrator\.codex\hooks.json` from `C:\Users\Administrator\.codex\backups\hooks-before-deskmate-20260831-121308.json`.
3. Verify the restored file SHA-256 is `E6B5060315421B4B895C06E68804FD650BE93599F9DEB8813C13EFCBE986FE58`.
4. Reopen Codex. The helper file can remain unused or be deleted later after the configuration has been restored.

Official behavior reference: [Codex Hooks documentation](https://learn.chatgpt.com/docs/hooks).
