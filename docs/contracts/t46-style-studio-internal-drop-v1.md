# T46 Style Studio internal-drop contract

Status: `DESKTOP_IMPLEMENTED`, physical pointer confirmation pending  
Date: 2026-09-14

## Behavior

- Dragging any existing Material card onto either the visible inlet or the central machine selects that exact item as the current source and runs the insert feedback.
- The drop remains valid when Chromium does not expose custom MIME data during the event or when Electron also exposes the dragged image through `DataTransfer.files`.
- A computer file dropped onto the machine still follows the existing validated import-and-insert path when no internal card drag is active.
- Result and ejected-work cards remain invalid machine inputs.

## Boundary

The renderer stores only one bounded `{ kind, id }` drag identity, validates it on every read, and clears it on drag end or successful insertion. No image bytes, local path, keymap, credential, provider request, firmware or device state is added to this fallback.

## Verification

Automated tests cover missing/corrupt custom drag data, valid transferred data precedence, internal-card-before-file ordering and retained Style Studio routing. Physical acceptance is to add a new photo, drag its Material card onto the middle machine, release, and observe the selected border, seated source card, insert pulse and status message.
