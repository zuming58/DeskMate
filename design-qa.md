# T15D motion-page compact UX design QA

- Source visual truth: `C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-571d29fc-d3a5-4f99-b4ed-280eb0294eda.png`
- Implementation capture: `D:\CodexData\home\visualizations\2026\09\02\t15d-motion-compact-v2.png`
- Source pixels: `2439 × 1302`; annotated AI Companion embedded-motion view.
- Implementation pixels and CSS viewport: `1440 × 1024` at device scale factor `1`; standalone `#/motion` view.
- Normalization: compared the shared motion status, preview and fixed-action card rather than the differing outer route and the unrelated spreadsheet visible at the source edge.
- State: unavailable physical action chain, `attention`, repeat `1`, idle software preview.

## Full-view comparison

- The large full-width primary action no longer dominates the card. Start, stop/center and emergency stop share one compact 40 px action row.
- The former default-count, preview-boundary and automation Notice cards no longer consume three large vertical regions. They are now one short default line and two low-emphasis boundary footnotes.
- Card padding, type hierarchy, border radii, blue emphasis and semantic danger color remain aligned with the existing DeskMate design system.
- The condensed layout keeps the complete fixed-action path above the fold and reveals the custom choreography entry at the bottom of the 1440 × 1024 viewport.

## Focused-region comparison

The fixed-action card was inspected at readable scale because it contains the reported P1/P2 issues. The control sequence remains clear: choose action, choose count, then use the adjacent action row. Safety controls retain labels and contrast without competing with the primary action.

## Comparison history

### Iteration 1 findings

- P1: primary action occupied the full card width and visually overwhelmed all other controls.
- P2: three explanatory Notice cards repeated boundaries and consumed excessive vertical space.
- P2: numbered labels and long button copy made a small fixed-action form feel like a multi-step wizard.

### Fixes and post-fix evidence

- Replaced the 54 px full-width button with a normal-height, 170 px minimum primary action in a shared action row.
- Replaced repeated cards with a compact status strip, one-line default summary, preview caption and automation footnote.
- Shortened the title, descriptions and labels without removing Link/HIL truthfulness.
- Applied the same hierarchy to T15D preview/entity controls so the next section does not reintroduce oversized buttons.
- Post-fix evidence is the implementation capture above; no actionable P0/P1/P2 visual issue remains in the compared region.

## Required fidelity surfaces

- Fonts and typography: existing Inter/system stack, weights and compact 9–12 px helper hierarchy retained; no new font introduced.
- Spacing and layout rhythm: status height and vertical gaps reduced; action controls align on one baseline; 1440 × 1024 and the existing mobile wrap rules remain supported.
- Colors and tokens: existing blue primary, white secondary, red danger, border and muted-text tokens retained.
- Image quality and assets: existing checked-in companion face asset and Tabler icons retained without replacement or CSS-drawn substitutes.
- Copy and content: safety meaning remains explicit while repeated instructions are shortened.

## Verification

- Focused UI tests: `9/9` passed.
- Full Desktop regression: `359/359` passed.
- Windows package and packaged native bridge self-test passed.
- Responsive fallback keeps actions full-width only below 640 px, where stacking is necessary for touch and label fit.

final result: passed
