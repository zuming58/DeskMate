# T39 — Style Studio free canvas and transient style orbit

## Product result

T39 corrects the Style Studio interaction without changing the DeskMate shell, navigation, provider adapter, managed library or input lease.

- The upper material region accepts PNG/JPEG/WebP files dropped directly from Windows Explorer. Imported cards appear at the drop location and remain bounded inside the material region.
- Material cards and result cards can be moved freely inside their own regions. A material dropped on the inlet becomes the current source. Cross-region drops do not move or reclassify a card; the browser drag returns it to its original region and the page explains why.
- Results start in a deliberately loose composition. **整理** aligns every result into one row. Dragging any aligned result returns the result region to free layout.
- Style cards are not persistent decoration. They are absent while the dial is idle, appear only when the wheel, arrows or dial drag changes style, and close after a choice or a short idle timeout. The selected card sits closest to the left side of the dial at full opacity; cards progressing around the upper arc become smaller and more transparent.
- Strength remains compact above the dial. S1 enters strength adjustment and does not open the style orbit.

## Boundaries

Free card coordinates are page-session presentation state; the application-managed source/result images remain persistent under the T38 contract. T39 does not add cloud calls, paths or credentials to React and does not modify VoiceWorkflow, other routes, firmware, Flash or HID writes.

## Verification

`tests/t37-style-studio.test.mjs` covers bounded scatter, drop clamping and transient-orbit source structure. `scripts/probe-style-studio.cjs` exercises the default-hidden orbit, wheel reveal, selection close, Explorer-style file drop, result organization, return to free placement, navigation re-entry and 1440×1024 / 1024×768 / 800×768 overflow checks.
