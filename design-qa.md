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
