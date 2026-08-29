# T07D voice-edit and Escape regression

## User evidence

- Smart organizer passed the user's real API test and removed redundant spoken wording as intended.
- Idle Escape incorrectly showed the floating “已取消当前语音输入” state.
- The physical KEY3 voice-edit key produced no visible recording response.

## Root cause and correction

- Escape from the read-only Windows input bridge was forwarded unconditionally. Electron now checks the shared voice state and emits cancellation only for recording, transcribing, organizing or outputting.
- `Ctrl+Shift+E` was handled on global-shortcut key-down, so selection capture could begin while Ctrl/Shift/E were still held. The resident native bridge now reports a privacy-safe `VoiceEdit` semantic event on full chord release. The main process cancels the delayed global-shortcut fallback when this release event arrives, captures the selection, and shows explicit progress or failure in the floating bar.
- The hook remains read-only and never suppresses ordinary Windows input. It emits only source, semantic key, action, time and sequence; it does not expose selected text, window title or device path.

## Automated evidence

- Targeted native/protocol/voice tests: 38/38 passed.
- Full desktop suite: 115/115 passed.
- `npm run build:desktop`: passed, including the self-contained native bridge and Windows directory package.
- Final candidate: `release/win-unpacked/DeskMate.exe`.
- `app.asar` SHA-256: `273942ADFF301D2AA36096DB9FE2C90F2578C17108CF8A86DC6D1C755AEC354E`.

## Manual regression still required

1. With no voice session active, press Escape several times; no cancellation bar should appear.
2. Select text in Notepad, tap KEY3 once, confirm the floating bar says it is reading the selection and then listening for an edit instruction.
3. Speak “翻译成英文” or “帮我精简”, tap KEY3 again to stop, and confirm only the selected text is replaced.
4. Press Escape during KEY1 and KEY3 recording, and separately during model processing; each active session should cancel without replacing source text.

No firmware, Flash, NVS or hardware configuration was changed for this correction. KEY3 remains `HIL_PENDING` until the user completes the matrix above.
