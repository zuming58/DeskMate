# T47 Style Studio pointer-drop contract

## Problem

On the packaged Windows Electron renderer, a Material card can enter native HTML drag state and light the machine receiving target, but Chromium may omit the terminal `drop` event. Retaining `DataTransfer` identity alone cannot finish an event that never arrives.

## Frozen behavior

- Material cards use a page-owned primary-mouse gesture; movement of six pixels or less remains a click.
- Once dragging starts, one non-interactive card ghost follows the pointer.
- Releasing inside either the upper inlet or the complete machine loads that exact Material as the current source and runs the existing insert pulse/sound/status.
- Releasing inside the Material canvas preserves free placement; releasing over the Material trash invokes the existing protected deletion path.
- Releasing elsewhere returns the original card and reports the valid targets.
- Explorer PNG/JPEG/WebP drops remain native file drops. Result cards, ejected work, Works placement and Works trash retain their existing behavior.
- No provider request starts from insertion. No key, media bytes, device path or persistent keymap enters the pointer state.

## Acceptance

- A real Electron mouse-input probe must move a persisted Material card to the machine without emitting `dragstart`/`drop`, yet finish with that exact card in the inlet and `素材已插入进片槽。` status.
- Existing synthetic provider generation and complete Style Studio regression must still pass.
