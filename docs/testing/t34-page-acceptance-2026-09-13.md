# T34D manual acceptance — recommended order

Current running build: `t34d-window-first-paint` (includes T34C punctuation stitching, T34A whole-recording correction and T34B immediate capsule feedback). The launch window now reveals only after the first renderer frame. User confirmed the capsule feedback in T34B; other checks below are not implicitly passed. Keep only one DeskMate instance. Record build, page, steps and expected/actual result; export redacted diagnostics after failure. Do not include private audio/text in shared diagnostics.

## 1. Dictation regression (highest priority)

- [ ] In an empty Codex or browser input, select raw input. Say “第一句，今天准备录制作业”，pause one second, then “第二句，需要制作三个视频”，pause, then “最后一句，记得检查字幕”。Stop immediately after the last sentence.
- [ ] Target field and history both contain all three sentences, each inserted once. Repeat three times, including one long uninterrupted utterance and one short utterance.
- [ ] At pauses, no DeskMate-added duplicate boundary marks such as `。 ，` or `， 。` appear. Raw mode may retain spoken fillers and repetitions; that is separate from punctuation stitching.
- [ ] Repeat with smart organization: content retained, only organization differs. Cancel during recognition: no late automatic insertion. Do not expect interruption simulation to prove actual network recovery.
- [ ] On failure note whether history is incomplete too (recognition) or only target text differs (output); export diagnostics immediately. New `stt.finalization` records completion/fallback and wait, without text. Exact ASR wording still requires human comparison.

## 2. Data safety before other changes

- [ ] Settings → data/backup: export default text/configuration backup to a user-chosen external folder; inspect it without restoring.
- [ ] Optionally export with recordings; verify preview count differs appropriately. Save a local recovery snapshot and preview it.
- [ ] Full restore is optional, destructive acceptance: first keep an external backup, stop voice/sync, read preview and native confirmation. After restart verify data and disabled automation/revalidation notices; confirm no automatic keyboard sync or KnowledgeOS replay. Do not overwrite the working profile just to check a button.

## 3. Scene manager and prompts

- [ ] Add a temporary scene, rename/description, up/down reorder; reopen and verify saved. Archive and restore it; prompts/bindings stay attached. Last available scene cannot be archived.
- [ ] Tab/Shift+Tab follow visible scene order in both prompt and keymap pages. In an editable form, Tab remains ordinary focus navigation.
- [ ] Change KEY5/6/7 in one scene only; KEY1/2/3/4/8 remain shared. Test preset action and custom Ctrl+B capture. Registered application action needs a valid local application.
- [ ] Prompt up/down sort, search, favorite, edit/cancel and copy. Hardware KEY4 pop/copy-hide, KEY8 paste, encoder select must be tested on the actual board; mouse scrolling must keep normal direction and stay in the list.

## 4. Memory and retention

- [ ] Results visible first; advanced connection/index/cleanup controls expand when needed. Unsaved edit blocks navigation; cancel restores saved values; failures keep drafts.
- [ ] Retention preview shows recording7/raw20day defaults, date-unknown/failed/pending-summary/sync holds. Confirm enabling only after reviewing actual candidates. Changing durations revokes consent. Do not force-delete held records.
- [ ] User-authorized daily/manual summary reviews both voice-input and companion sources, work/personal separate. Actual KnowledgeOS sync shows receipts; personal never associates a project. Raw cleanup must not delete summaries/confirmed memories or remote Raw.

## 5. Remaining software pages

- [ ] Workbench counts/routes and real connection labels; history play/copy/export/search; vocabulary edits/import/export. Confirm destructive dialogs can cancel.
- [ ] Settings/AI-service/companion drafts: save, cancel, navigate with unsaved edits, repeated click while busy. Secrets must not appear in exports/diagnostics. Check1440×1024 and smaller window.
- [ ] Continuous companion conversation, interruption and cancellation; morning first conversation does not replay yesterday as immediate context; explicit historical question retrieves both source types.

## 6. Real hardware (last)

- [ ] Voice key/input, keymap and encoder; LED status for idle/working/completed/error.
- [ ] Manual hardware testing must not change automatic Codex project status. Test Xiaozhi enabled/disabled, nod/dance only in clear mechanical space; keep emergency stop reachable.
- [ ] No new firmware or wiring is part of this acceptance. Music/sensor features remain cancelled.

Software simulations do not check these boxes. Record actual observations and remaining defects for follow-up.
