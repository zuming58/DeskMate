# Companion T07C Design QA

- Visual target: `design/qa/companion-t07c-target.png`
- Implemented capture: `design/qa/companion-t07c-implementation.png`
- Viewport: 1440×1024 CSS pixels
- State: Companion idle software preview; EasyInput disconnected; Xiaozhi, realtime voice, durable memory and reminders pending

## Comparison

| Requirement | Result |
| --- | --- |
| Preserve the existing DeskMate visual system | Passed — graphite sidebar, restrained light workspace, blue/cyan accents, type scale, cards and controls reuse the current product styling. |
| Keep exactly six primary navigation entries | Passed — Workbench, Voice, Companion, History, Vocabulary and Key mapping are the only sidebar entries. |
| Consolidate device and desktop-pet management | Passed — device, AI links, environment, settings and diagnostics are available in the Companion right rail; expressions/actions retain their existing management route. |
| Use the selected fourth large-eye face consistently | Passed — brand mark, Companion hero, sidebar status and expression tiles share the checked-in large-eye asset. |
| Avoid implying unimplemented capability | Passed — listening is explicitly a software preview; reminders and memory are examples; Xiaozhi and hardware actions remain pending. |
| Match the 1440×1024 desktop composition | Passed — two-column layout measures about 711 px / 432 px with a 22 px gap and zero horizontal overflow. |
| Support smaller windows | Passed — at 900×800 the layout collapses to one column with zero horizontal overflow and keeps the primary action accessible. |
| Core interaction works | Passed — the listening preview toggles in-place; management links open retained routes; no browser console errors were observed. |

## Visible differences and disposition

- The implemented hero uses the user-selected dark, glossy large-eye asset instead of the lighter placeholder face in the visual target. This is intentional and is the final visual selection.
- Runtime statuses are more conservative than the target mock: disconnected or pending states replace optimistic connection labels. This is required by the product's truthful-state constraint.
- The 1440×1024 page has 37 px of vertical scroll because the retained app header and full management rail remain visible. This is a low-severity trade-off; there is no horizontal overflow or cropped control.

No P0, P1 or P2 visual defects remain.

final result: passed
