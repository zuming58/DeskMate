# T22 Prompt workbench and scene keyboard routing

## Objective

Make the eight-key EasyInput board useful for daily work without adding firmware: prompt selection in the existing DeskMate application and locally switched context keys.

## Frozen user interaction

- KEY1, KEY2, KEY3, KEY4, KEY8 are globally shared and explicitly editable; KEY5–7 are per-scene. The optional recommendation preserves existing KEY1/KEY2, fills KEY3 companion call, KEY4 prompts and KEY8 paste locally before board confirmation. Existing custom assignments are not silently overwritten.
- KEY4: show the existing main window at the last prompt scene; again copy selected text, hide to background and return to the work window. Enter also confirms.
- Tab / Shift+Tab: next / previous scene; list and KEY5–7 change together, optionally one short Doubao announcement.
- Knob: select a prompt while that page is foreground, without changing the board's encoder configuration outside the page.
- KEY5–7: editable per-scene shortcut or copy-only fixed prompt.
- KEY8: recommended firmware paste, never a contextual scene switch; any explicit reassignment is global.
- Escape: cancel transient invocation without copying. Do not hide normal main-window browsing or the main window during shared voice cancellation. Close an editor before leaving the page.

## Scope and boundary

80 user-supplied original templates; immutable builtin/fork/save-as, search, favorites, recent, personal/trash, scene editing and local backup import/export. Main-owned versioned store, validated native chords and main-window ownership. No user-controlled shell/executable, auto-submit, prompt execution, firmware update or new HID protocol.

Read/preview/confirm/readback configuration patches from the existing Key mapping page. Preserve untouched shared keys, encoder and unknown device fields. Install only host routes for KEY5–7; scene text/chords stay local and switching never rewrites NVS. The page starts with large scene buttons, then the original eight-key/rotary diagram and one contextual right-hand editor. No separate scene dropdown or three duplicate binding forms. Scene selection and prompt Tab share activeScene; global pending edits survive navigation/restart/device reads. Announcement/polarity/recommendation/diagnostics are collapsed below. The prompt page keeps its fixed-height 45/55 quick-list/reading layout.

## Acceptance still requiring the user

0. First let the user inspect the layout and single-editor interaction; the current request explicitly prioritizes UI before hardware function testing.
1. Later connect EasyInput. If desired, open “更多设置与诊断” → “填入推荐方案”, then “同步到键盘” and inspect/confirm exact changes including KEY5–7 host routes. The recommendation only fills local drafts; the software does not silently apply a board patch.
2. From a disposable editor, KEY4 → rotate → KEY4 → KEY8: correct literal prompt, app returns to background, no automatic Enter.
3. KEY4 → Tab: scene/list and KEY5–7 change together; rapid Tab announces only the final scene when voice is idle. Close and reopen: scene remains.
4. Test KEY5–7 in each intended application and edit defaults if that application's shortcuts differ.
5. KEY4 → Escape cancels with clipboard unchanged. Normal DeskMate browsing + Escape stays visible. Active voice Escape still cancels only voice.
6. Verify KEY1–2 unchanged, KEY3 calls AI companion, right-turn selects down / left-turn selects up inside prompts, unchanged rotary behavior outside DeskMate, disconnect/reconnect, and no accidental send. Adjust only “反转提示词选词方向” if the actual input axis differs.

Implementation, source comparison and safety: `docs/architecture/prompt-workbench-scenes.md`. Results belong in `flow/progress.md`; automated tests do not close physical acceptance.
