# T22 Prompt workbench and scene routing

## User contract (2026-09-10)

KEY4 opens **the existing DeskMate main window** on `#/prompts`, not a separate popup. A second press copies the selected prompt, hides DeskMate and returns focus to the captured work window. Enter confirms. **Final user clarification: Tab/Shift+Tab cycles scenes; KEY8 ALWAYS pastes via the existing firmware paste action, no contextual second role.** Escape cancels without touching clipboard and hides only a KEY4-invoked transient page; ordinary browsing stays visible. During voice activity (including its cancellation transition), Escape remains voice-only. In a prompt editor Escape closes the editor first. KEY5–7 route locally by active scene. KEY1–3 and encoder settings are preserved. Encoder wheel/cursor events are consumed by the foreground prompt page only, never by a background hook. Editing and IME composition suspend page shortcuts. Clipboard copy never sends Enter.

Switching scenes does not rewrite device NVS. A one-time, explicitly previewed and confirmed `easyinput-config-v1` patch maps KEY4–7 to reserved UUID host actions under the existing `HOST_ACTION_V1_FROZEN` slice and KEY8 to firmware `paste`. No firmware/protocol change or flash operation. KEY5–7 can be validated keyboard chords or copy-only fixed prompts; KEY8 explicitly pastes the latter.

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

Keep DeskMate's graphite navigation and light workspace. Add restrained frosted scene rail/toolbar with fine borders and soft shadow. Prompt body/editor remains opaque and high-contrast. Use the supplied Frost screenshot for scene/list hierarchy, not a second sidebar competing with app navigation or a whole-app glass redesign.

## Required verification

Domain tests: seed integrity/count, literal copy, forks/trash/restore, search, favorites/recent, persisted scene, rejected import, optimistic conflicts, clipboard failure, target restoration, contextual routing and editor protection. Build native and desktop; inspect 1440×1024 and 960×680. Hardware acceptance remains separate: preview patch, confirm KEY4–8, rotary selection, KEY4 copy/return, KEY8 paste, scene switching and KEY1–3/voice regression.
