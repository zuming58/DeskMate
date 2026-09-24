# T68 asynchronous clipboard compatibility

## Evidence and scope

The 2026-09-22 T67 diagnostic identifies installed version 0.1.2. User reports KEY4 opens prompts but a second press says copy failed and retains the page. T66 changed Electron 36.9.5 to 44.4.3. The installed dependency's `electron.d.ts` declares `readText(): Promise<string>` and `writeText(): Promise<void>`; the old immediate strict comparison of the read Promise against a string always fails. This is a release compatibility regression, not evidence of a hardware mapping failure.

Reference: [Electron clipboard API](https://www.electronjs.org/docs/latest/api/clipboard). T22's original copy/verify/hide contract remains in force. This change does not modify firmware, bindings, prompt contents, stored configuration, or API credentials.

## Behavior

- A main-owned clipboard adapter awaits write completion and exact text readback. No trimming, template expansion or newline rewriting. Failures retain the prompt page and do not record usage; successful verification permits hide and focus return. The existing controller busy guard prevents duplicate KEY4 work.
- Scene fixed-prompt copies use the same awaited adapter.
- Voice output awaits verified clipboard delivery before injecting paste. A failed write never pastes stale clipboard content. Clipboard-only IPC reports success only after delivery, and returns a bounded error on failure.
- Voice-edit capture awaits a fully materialized MIME clipboard snapshot before writing its marker. All asynchronous text reads and restoration are awaited; removed Electron `readHTML`/`readRTF`/`readImage` APIs and the legacy object-form `write` are replaced by ClipboardItem arrays. Snapshot failure leaves the clipboard untouched. Read/write/restore failures do not send text for editing.
- No clipboard/prompt contents are logged or added to diagnostics.

## Verification and release

Use delayed Promise fixtures for write/read, negative mismatch/rejection, KEY4 busy/hide/usage ordering, literal whitespace, voice paste sequencing and mixed-format snapshot restoration. Run a standalone Electron 44 probe with temporary userData and no application bootstrap, hardware, or cloud calls; preserve and restore the pre-existing clipboard. The package check compares the adapter and its consumers byte-for-byte with source.

Canonical source remains `F:\Codex\deskmate\build-t10dc-work`. Version 0.1.3 / build `t68-async-clipboard` is built there, then installed through NSIS to `D:\DeskMate` after user-approved restart. D is not an editing workspace. Real KEY4/KEY8 acceptance remains user-present even after isolated runtime tests pass.
