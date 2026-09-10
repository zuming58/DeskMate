# T22A prompt reading layout and key-settings ownership QA — 2026-09-10

- User amendments: narrow the mostly-empty quick list, enlarge the actual prompt reading area, remove duplicate keyboard settings from prompts, keep scrolling inside fixed boxes and correct the observed knob selection direction.
- References: `C:/Users/Administrator/AppData/Local/Temp/codex-clipboard-3e5f3385-12bb-4fa8-820a-6ccf09a4fcd7.png` (reading width), `codex-clipboard-74d212ab-5c68-4c81-b4f5-478056259a19.png` (configuration ownership), and `codex-clipboard-d787912f-fcdc-4b54-b590-cd7dac60fb02.png` (nested scrolling), all from the same supplied temporary directory.
- Final capture/report directory: `C:/Users/Administrator/AppData/Local/Temp/deskmate-prompt-qa-rXqXAi/`: `prompts-1440.png`, `prompts-video-1440.png`, `prompts-scrolled-1440.png`, `prompts-960.png`, `prompt-keys-1440.png`, editor captures and `report.json`. Native Electron logical viewports 1440×1024 and 960×680; device scale factor 1.5.
- References and resulting video-scene/full-scroll captures were inspected together. Left quick list is approximately 45%, right preview 55%, aligned and full-height. Prompt body is 14 px with stronger contrast (13 px compact), its own overflow and a fixed copy action. No configuration card interrupts reading. Scene/search/filter controls stay stationary; outer prompt page has no vertical or horizontal overflow at either viewport.
- The isolated production renderer/preload/controller/store harness passed **33/33** assertions, including page ownership, viewport bounds, preview width, list-only end-row reveal, key-settings rendering and saving a non-active scene without activating it. Small-window list/preview retain at least 160 px usable content height. Prompt editor, search, favorite/trash, Tab, Enter and contextual Escape tests remain covered.
- Exact production package separately launched at build ID `t22a-prompt-layout-key3`; scoped native capture `C:/Users/Administrator/AppData/Local/Temp/deskmate-t22a-running-package.png` confirms the real video prompt page uses the new split and no outer scrollbar. This is not the isolated test window.
- Full software tests **496/496**, desktop build and packaged-resource check passed. Test clipboard/native/speech sinks did not write system clipboard or hardware. Real KEY3 call, physical knob direction, focus/paste and scene audio still require user observation after explicitly applying the key scheme.
- No blocking P0/P1/P2 issue remains in the tested UI scope. Existing CSP-blocked Google Fonts import and Vite chunk-size warning remain non-blocking; fallback fonts render and CSP was not relaxed.
- Result: **passed for scoped visual and automated interaction QA; hardware/audio acceptance pending**.

---

# T22 prompt workbench and scene routing design QA — 2026-09-10

- Scope: adapt the user-supplied Frost scene/list reference inside the real DeskMate application, not a separate prototype or pixel-identical standalone clone. Preserve graphite navigation and existing typography/tokens; restrained glass is limited to the scene rail, while prompt text/editors remain opaque.
- Reference: `C:/Users/Administrator/AppData/Local/Temp/codex-clipboard-1edc48ac-b1f6-499a-a59d-ab007bcaabed.png`.
- Verified captures and report: `C:/Users/Administrator/AppData/Local/Temp/deskmate-prompt-qa-YQmBk8/` — `prompts-1440.png`, `prompts-960.png`, `prompt-editor-1440.png`, `prompt-scene-editor.png`, `report.json`. Logical viewports 1440×1024 and 960×680; Windows device scale factor 1.5.
- Actual packaged-app launch was separately verified by a scoped native window capture: `C:/Users/Administrator/AppData/Local/Temp/deskmate-t22-running-package.png`. It shows the real DeskMate prompt page and office-scene list, not the isolated QA window. No device write or user-data edit was performed to obtain that capture.
- The reference and implementation captures were inspected together. Scene grouping, pastel library icons, cobalt selected row, fine borders and readable white list follow the reference. A horizontal scene rail avoids nesting a second sidebar. No prompt-region horizontal overflow at either viewport; the existing compact-window nav remains scrollable. Editor fields/buttons use consistent rounded borders and a focus loop.
- `scripts/verify-prompt-workbench.cjs` passed 23 native Electron interaction assertions: persisted 80-item data, scene Tab/reverse/KEY5–7 changes, wheel selection, form Tab isolation, editor save, mine/favorite/trash/restore, search/all library, smaller layout, KEY4 re-entry focus, transient Escape without copy, and second KEY4 exact-copy/hide. Ordinary browsing Escape stays visible. Domain tests separately exercise voice cancellation protection and failure paths.
- This harness uses the production renderer/preload/controller/store with isolated temporary user data. Native keyboard, speech, hardware and clipboard are explicit test sinks; physical buttons, focus recovery to the user's editor, real paste and Doubao announcement quality remain user-present acceptance, not claimed passed.
- P0/P1/P2: no remaining blocking issue in the tested prompt UI scope. P3: existing Google Fonts import is rejected by the application CSP; installed fallback fonts render correctly. CSP was not weakened. Existing Vite chunk-size warning is non-blocking.
- Result: **passed for scoped visual and automated interaction QA; hardware/audio acceptance pending**.

---

# T15E motion and memory UX design QA

- User reference: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-571d29fc-d3a5-4f99-b4ed-280eb0294eda.png`
- Current implementation capture: `D:\CodexData\home\visualizations\2026\09\02\t15d-motion-compact-v2.png`
- Same-input comparison: `D:\CodexData\home\visualizations\2026\09\03\t15e-motion-before-after.png`
- Target viewport: `1440 × 1024`, device scale factor `1`.

## User-reported problems

1. The fixed-motion start button dominated the whole card.
2. Explanatory Notice cards occupied more space than the controls.
3. The page felt like a large wizard instead of a compact control surface.

## Verified changes

- The start, stop-and-center, and emergency-stop controls now share one compact 40 px action row.
- The primary start control has a bounded minimum width instead of stretching to the card width.
- The default-repeat explanation is one short inline sentence.
- Preview and automation boundaries are low-emphasis captions, not large Notice cards.
- The custom choreography editor uses compact per-track choices and one wrapping action bar; it does not add another large face preview.
- The memory policy uses compact source tiles and three small status rows for next run and per-source results; it does not add another stack of Notice cards.

## Side-by-side review

The combined comparison was inspected as a single visual input. In the current implementation, the eye moves from preset, to repeat count, to one aligned action row. The earlier full-width CTA and two large helper panels no longer interrupt that path. Card radii, blue emphasis, danger color, typography, and spacing remain consistent with the existing DeskMate shell. No actionable P0/P1/P2 layout issue remains in the reported region.

## Responsive and truthfulness checks

- Buttons only expand to full width in the existing narrow-window fallback where stacking is required.
- Software preview, endpoint completion, and physical HIL remain distinct.
- Disabled real actions stay disabled until the endpoint reports availability.
- Existing raster face assets and Tabler icons are reused; no placeholder, emoji, CSS-drawn face, or handcrafted SVG was introduced.

final result: passed

---

# T15D dance activation visibility design QA

- User reference: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-72d2ebaa-313b-4e4d-876f-a52901c67290.png`
- Current 1440×1024 logical-window capture: `D:\CodexData\home\visualizations\2026\09\03\t15d-dance-activation-1440x1024-v2.png`
- Smaller-window capture: `D:\CodexData\home\visualizations\2026\09\03\t15d-dance-activation-900x800.png`
- Same-input comparison: `D:\CodexData\home\visualizations\2026\09\03\t15d-dance-activation-reference-vs-current.png`

## Reported problem and verified result

- The reference showed only the dance selector and `新建`; activation was pushed outside the visible toolbar, so the user could save and switch dances without seeing how quick/voice `跳舞` chooses one.
- The new first row always contains the selector, a bounded `当前跳舞动作` status and the activation control. Secondary library actions occupy their own compact row and no longer compete with activation for horizontal space.
- The current item is visible without opening the selector. Unsaved drafts state `保存后可激活`; active items state `当前已激活`; restoring the built-in dance remains an explicit operation.
- At the 1440×1024 target, the control is visible in one row. At the smaller capture it remains visible beside the selection/status group; the narrow fallback stacks it to full available width.
- Software preview, entity execution, editing and selection remain visually and behaviorally distinct from activation. No UI text claims that a preview or saved draft has changed Xiaozhi.
- Existing DeskMate type, spacing, border, blue emphasis, Tabler icons and card language are reused. No new visual asset or competing design system was introduced.

final result: passed

# Design QA

## T21L companion identity layout

- Reference: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-2cf084d4-dfbb-4c5b-a45c-76a674ad4c0f.png`
- Target viewport: existing DeskMate desktop layout at the user's current Windows scaling.
- Implemented: the previously empty wide area beneath the working-state test now contains one two-column identity card. “关于我” and “小岚人设” share one save action, use the existing light-card/blue-accent system and collapse to one column below 900 px.
- Functional checks: DOM/layout contract tests, responsive CSS assertions, production Vite build and Electron packaging passed.
- Visual comparison status: **BLOCKED**. This Codex session has no supported browser/computer screenshot connector for capturing the live Electron window, and the Product Design workflow does not permit introducing Playwright without the user's browser approval. The supplied reference screenshot was inspected at original resolution; final pixel/layout inspection remains a user-visible desktop acceptance step after launch.
