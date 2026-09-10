# T22 Prompt workbench and scene routing

## User contract (2026-09-10)

With the recommended assignment, KEY4 opens **the existing DeskMate main window** on `#/prompts`, not a separate popup. A second press copies the selected prompt, hides DeskMate and returns focus to the captured work window. Enter confirms. **Tab/Shift+Tab cycles scenes; KEY8 defaults to the existing firmware paste action, with no contextual second role. T22B allows the user to reassign shared keys explicitly; the defaults are not immutable bindings.** Escape cancels without touching clipboard and hides only a shortcut-invoked transient page; ordinary browsing stays visible. During voice activity (including its cancellation transition), Escape remains voice-only. In a prompt editor Escape closes the editor first. KEY5–7 route locally by active scene. **The recommended KEY3 assignment is the existing companion-call action, replacing voice editing; filling the recommendation preserves KEY1–2 and encoder settings.** Encoder wheel/cursor events are consumed by the foreground prompt page only, never by a background hook. Editing and IME composition suspend page shortcuts. Clipboard copy never sends Enter.

Switching scenes does not rewrite device NVS. An explicitly previewed and confirmed `easyinput-config-v1` patch installs reserved UUID host routes on KEY5–7 under the existing `HOST_ACTION_V1_FROZEN` slice and only the shared-key/encoder changes the user made. The optional recommendation fills KEY3 `companion-call`, KEY4 `prompt-key-4` and KEY8 `paste` locally before confirmation. Its entry lives only in the existing Key mapping page. No firmware/protocol change or flash operation. KEY5–7 can be validated keyboard chords, copy-only fixed prompts or disabled actions.

## T22D compact keycaps and truthful sync feedback (current)

- The user's KEY4 screenshot still says `待同步`, consistent with the old physical companion action. No evidence of a failed write was supplied. T22C staged local changes but did not commit them; a green device-read badge was too easy to mistake for sync success.
- Only the keycap uses `弹出/收起`; full action labels and the existing host UUID remain unchanged. Key names are single-line with overflow ellipsis and a full title/accessible label, instead of stretching the keyboard row.
- The top badge now distinguishes neutral device-read evidence, amber pending local changes and green verified commit. Busy/review/failure/readback-pending states take precedence. Saving a draft, cancelling, or receiving an unverified saved response cannot claim verified synchronization or clear pending keys.
- Regression checks trace the migrated KEY3/4 through the sparse merge/readback projection, preserve unrelated keys/encoder, and exercise the real UI preview/cancel/confirm flow with an isolated configuration sink. Physical writes still require the existing user confirmation; no host/firmware protocol changed.

## T22C keyboard-page Tab and legacy key migration

The user's real T22B screenshot confirmed two remaining gaps: Tab traversed individual controls on Key mapping, and the actual legacy KEY3 voice-edit / KEY4 companion pair remained unchanged. The already-working foreground Tab handler in `src/PromptWorkbenchPage.jsx` is the fixed local behavior reference: explicit main-owned cycle, reverse with Shift, skip editing/IME and do not rewrite hardware. T22B only shared scene buttons/state, not the keyboard event itself.

- Key mapping now owns Tab/Shift+Tab at the page level, including native focus temporarily landing on body while busy buttons are disabled. It calls the same controller cycle as prompts and saves the current scene draft first. After React re-enables the buttons it restores focus to the active scene, not an arbitrary next button. Busy/repeated/composing/modified events do not start another cycle.
- Right-hand key/rotary editing, text fields, native shortcut recording and modal dialogs retain ordinary Tab semantics. This allows Tab itself to be recorded as a shortcut. The handler exists only while the Key mapping page is mounted and focused; other pages and voice Escape keep their existing ownership.
- `prepareCompanionPromptKeys` recognizes the old local voice-edit/companion pair (or the old safe default voice-edit/Backspace pair) once, staging KEY3 companion-call and KEY4 prompt-page/copy-hide in `keyboardPending`. A persisted `keyboardLayoutVersion=1` prevents later user reassignments from being reverted. Other/custom assignments and explicit pending KEY3/4 edits are preserved; KEY1/2/5–8 and encoder are unchanged. Individual changed keycaps say `待同步`.
- This migration is a local software draft, never an automatic device commit. Fresh board readback cannot erase it; the existing confirmed patch still performs capability checks, fresh read, approved-path merge and verified readback. The user need not select the two functions manually, but must still approve `同步到键盘` before physical keys change. No firmware/protocol work.
- Regression vectors include complete forward wrap/reverse, unchanged selected physical key, normal editor Tab, recording Tab, modal focus loop, one-time migration, custom/pending preservation and old readback retention. These supplement rather than replace later physical acceptance.

## T22B unified keyboard editor amendment

- The existing eight-key/rotary diagram is the primary editor, directly under large scene buttons and a small scope legend. Select a scene, click a key, edit it in the single right-hand panel. Remove the independent scene dropdown and three parallel KEY5–7 forms. Existing rounded controls, physical-key selection styling and graphite/light app shell remain.
- KEY1, KEY2, KEY3, KEY4 and KEY8 share one `appStore.keymap` configuration across all scenes; the rotary also remains shared. KEY5–7 display and edit only the selected scene's bindings from the main-owned prompt store. Default assignments are recommendations, not a reason to silently overwrite custom or device settings.
- Scene buttons in Key mapping activate the same main-owned `activeScene` used by prompt-page Tab; the new UI does not have T22A's separate editing-scene dropdown. Editing a key alone does not activate another scene. Valid drafts save before changing keys/scenes; invalid drafts remain visible and block that change. New scenes inherit shared keys without copying them.
- Shared-key/rotary edits persist as bounded `keyboardPending` deltas. Initial device reads, navigation and app restarts do not silently erase them. Board synchronization merges only these deltas plus missing KEY5–7 host routes into a freshly read device configuration, through the existing preview/token/confirmation/readback path. Per-scene names, text and chords never go into a board patch. Once routes are installed, changing a scene requires no repeated hardware write.
- The controller permits explicit scene changes from focused `#/keymap` as well as `#/prompts`, but copy/hide remains prompt-only. Scene shortcut injection is rejected while editing either DeskMate page, so a hardware shortcut cannot type into its own settings.
- Scene announcements, prompt selection polarity, optional recommended assignments, longer safety text and key diagnostics are collapsed under `更多设置与诊断`. The top-level sync action stays visible and explicit. `--show-keymap` opens only the known built-in route for inspecting the exact package; it does not accept arbitrary URLs.

## T22A ownership, scrolling and direction amendment

- Prompt page: scenes, search/quick selection, prompt editing and reading/copying only. Key binding configuration, hardware patch preview/confirmation, scene announcements and selection polarity belong to the existing Key mapping page. T22B supersedes the independent editing-scene control with one shared active-scene rail.
- Fixed viewport: approximately 45% quick list / 55% full-height preview. Scene/search/filter controls remain stationary. List and preview own their vertical scroll separately; revealing a selected row adjusts only list.scrollTop, never scrollIntoView on scrollable ancestors. Other application pages retain normal page scrolling.
- The user observed the current physical knob direction was reversed. Default page-local reverseSelection=true corrects the observed path and is user-adjustable; old T22 stores lacking this optional field migrate without resetting personal prompts. This is not an encoder NVS patch or a universal claim about every mouse/encoder axis.

| Fixed reference / evidence | Behavior | T22A boundary |
| --- | --- | --- |
| Official firmware input_runtime.cpp and input_core_tests.cpp | Encoder +1 maps cursor to Down/Right; wheel Y and X have different HID signs, then per-axis reverse flags apply. Quadrature tests prove decoder sign, not physical right direction. | Preserve firmware and board encoder settings; normalize only foreground prompt wheel selection. Real right/down and left/up remain a user-present gate. |
| Maker reference config_state.cpp | Windows encoder reverse flags are independently configured. | Do not infer physical direction from browser delta alone or change outside-app behavior. |
| User scroll screenshot and old prompt scrollIntoView | Selection may scroll both the list and application ancestor. | Explicit list-relative reveal, constrained flex heights and overscroll containment; assert the outer page position remains unchanged. |

## Reference comparison and provenance (before implementation)

| Reference | Existing behavior | Product implementation |
| --- | --- | --- |
| AI_Workbench_Frost core/instant and tests | 80 immutable templates, personalized fork, delete restores original, weighted search, recent/favorites, literal ready-to-copy text | Preserve data/behavior; independently implement Electron main-owned store and React UI. No Tauri shell or variable forms. |
| EasyInput Mode Router V1.4 | Global Ctrl+Alt+Shift+1–4 triggers; S4 scene, S5–7 actions; S8 ignored; native chord after trigger release | Existing HID UUID triggers; KEY4 page/confirm, Tab scene, KEY8 firmware paste; bounded native input with modifier-release and foreground checks; no old global hotkeys. |
| Lesson 5 workflow guidance | P4 daily-work efficiency; current local Jianying split Ctrl+K vs old router Ctrl+B | Coding / video / office defaults, editable bindings; Ctrl+K labeled as local default, no fabricated efficiency scores. |

User-supplied prompt pack: `C:/Users/Administrator/Desktop/DeskMate_内置提示词80条.json`, SHA-256 `AEF2B370D309064E9F918EF5BE0C902DB5A72DE771B53CA6D70FDB9BD8051363`; source project `F:/Codex/AI_Workbench_Frost`. The user expressly supplied it for integration. Source notices identify prompts as original, draft/unverified material, with no separate third-party prompt license. Preserve all content/IDs and quality metadata as data; do not execute it. Target: `electron/prompt-library.json` (not `electron/assets`, which electron-builder excludes from asar when copying extraResources). No FontAwesome assets/code copied; use DeskMate's existing Tabler icons.

Behavior references only, no source copying: `src/core.ts` SHA-256 `8052F0CB07FDC700DA78C7CAD245530BA9EDB19D73F397AB30964A90557762D3`; `src/instant.ts` SHA-256 `5AF79A21CBDBFAFA8ABA624B9ED537344ECCA31BB360824D552E9434ACE305A7`. Mode Router archive SHA-256 `8D5A0561135072A3AB37E96C309307EE968EDC9D0D1ABE6B98AF90D697CA3039`, user-authored course work, no independent license stated: behavior reference only. Course/reference projects stay outside this repository.

## Persistence and safety

Main-process JSON namespace `prompt-workbench-v1.json`: atomic rename, previous snapshot, monotonic revision, optimistic write conflicts. Builtins remain separate/read-only. User edits, favorites, usage, scenes and selected prompt persist. Imports validate before mutation and back up the prior store. Corrupt storage fails closed, never silently resets. No text, window identity or prompt contents in diagnostics. User-selected backup files may contain personal prompts and are labeled accordingly.

Native `workbench-input` is a local stdin/stdout bridge command, not a hardware protocol. Operations: remember foreground, restore it, or validated keyboard chord at the current foreground. No shell, path, arbitrary executable, or auto-submit. Capture/restore ownership stays native. Native waits at most 300 ms for held modifiers, rechecks target, and releases every injected key after partial output. Requests expire, no delayed replay.

## Visual direction

Keep DeskMate's graphite navigation and light workspace. Add restrained frosted scene rail/toolbar with fine borders and soft shadow. Prompt body/editor remains opaque and high-contrast. Use the supplied Frost screenshot for scene/list hierarchy, not a second sidebar competing with app navigation or a whole-app glass redesign. T22A removes the key card from the prompt page, widens the preview and increases its readable body type to 14 px (13 px at the compact viewport).

## Required verification

Domain tests: seed integrity/count, literal copy, forks/trash/restore, search, favorites/recent, persisted scene, rejected import, optimistic conflicts, clipboard failure, target restoration, contextual routing and editor protection; T22A adds polarity migration and list-only reveal; T22B adds shared-delta preservation, route-only hardware patches, per-scene isolation and focused-settings activation. Build native and desktop; inspect 1440×1024 and 960×680, including fixed prompt bounds and the keyboard diagram's single editor. First review the new UI with the user. Later hardware acceptance remains separate: optionally fill recommended shared keys, preview/confirm exact changes, then rotary direction/selection, KEY4 copy/return, KEY8 paste, scene switching, KEY1–2 preservation and KEY3 companion/voice regression.
