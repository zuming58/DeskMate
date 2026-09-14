# T40A Style Studio dial-press contract v1

Status: `STYLE_STUDIO_DIAL_PRESS_V1_FROZEN`

Date: 2026-09-14

## Scope

This slice changes only the foreground `#/style-studio` interaction. It does not change firmware, device configuration, other routes, VoiceWorkflow, Image 2 request shape, result storage, or upload consent.

## UI semantics

- Dial movement selects the highlighted style and may open the transient orbit.
- Confirm while generating starts the existing generation path on the first press, whether the orbit is open or closed.
- Confirm while S1 strength adjustment is active saves the current strength and does not generate.
- The visible cue is `按压旋钮生图`; Image 2 configuration language stays out of the primary action.
- Real uploaded material still requires the existing explicit one-generation upload confirmation.

## Input ownership

- A valid page lease requires the visible, focused main window on `#/style-studio`.
- During that lease, an EasyInput-origin `F22` or `VoiceInput` trigger becomes `confirm`; `VoiceEdit` retains the bounded `save` action.
- Ordinary keyboard-origin triggers, background events and events after lease release are not consumed.
- Blur, route leave, reload, crash and window close release ownership through the existing lease lifecycle.

## Hardware truth boundary

No firmware or HID write is authorized by this slice. The compiled safe EasyInput encoder press remains `scroll_axis_toggle`, which changes axis inside the firmware and produces no distinguishable Windows event. Therefore automated software evidence proves page routing only; physical encoder press is accepted only when the user's existing board mapping emits a host-visible EasyInput trigger and a manual test confirms one generation action with no voice toggle.
