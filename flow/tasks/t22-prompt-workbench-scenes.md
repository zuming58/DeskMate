# T22 Prompt workbench and scene keyboard routing

## Objective

Make the eight-key EasyInput board useful for daily work without adding firmware: prompt selection in the existing DeskMate application and locally switched context keys.

## Frozen user interaction

- KEY1 voice, KEY2 Enter, KEY3 voice editing: preserve existing board configuration.
- KEY4: show the existing main window at the last prompt scene; again copy selected text, hide to background and return to the work window. Enter also confirms.
- Tab / Shift+Tab: next / previous scene; list and KEY5–7 change together, optionally one short Doubao announcement.
- Knob: select a prompt while that page is foreground, without changing the board's encoder configuration outside the page.
- KEY5–7: editable per-scene shortcut or copy-only fixed prompt.
- KEY8: existing firmware paste only, never a scene switch.
- Escape: cancel transient invocation without copying. Do not hide normal main-window browsing or the main window during shared voice cancellation. Close an editor before leaving the page.

## Scope and boundary

80 user-supplied original templates; immutable builtin/fork/save-as, search, favorites, recent, personal/trash, scene editing and local backup import/export. Main-owned versioned store, validated native chords and main-window ownership. No user-controlled shell/executable, auto-submit, prompt execution, firmware update or new HID protocol.

Read/preview/confirm/readback the existing configuration patch once. Preserve first three keys, encoder and unknown device fields. A scene switch changes local routing only, not device NVS.

## Acceptance still requiring the user

1. Connect EasyInput, click “配置到 EasyInput…”, inspect KEY4–8 changes and confirm.
2. From a disposable editor, KEY4 → rotate → KEY4 → KEY8: correct literal prompt, app returns to background, no automatic Enter.
3. KEY4 → Tab: scene/list and KEY5–7 change together; rapid Tab announces only the final scene when voice is idle. Close and reopen: scene remains.
4. Test KEY5–7 in each intended application and edit defaults if that application's shortcuts differ.
5. KEY4 → Escape cancels with clipboard unchanged. Normal DeskMate browsing + Escape stays visible. Active voice Escape still cancels only voice.
6. Verify KEY1–3, rotary behavior outside DeskMate, disconnect/reconnect, and no accidental send.

Implementation, source comparison and safety: `docs/architecture/prompt-workbench-scenes.md`. Results belong in `flow/progress.md`; automated tests do not close physical acceptance.
