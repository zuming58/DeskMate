# T40B Style Studio wheel feedback contract v1

Status: `STYLE_STUDIO_WHEEL_FEEDBACK_V1_FROZEN`

Date: 2026-09-14

## Scope

This slice corrects compact-window wheel ownership and adds local audible detent feedback on `#/style-studio`. It does not change the Image 2 request, upload consent, result storage, another route, VoiceWorkflow, firmware, board configuration or HID output.

## Wheel ownership

- While the focused Style Studio lease is active, a source-identified EasyInput Raw Input wheel event changes the current Studio selection everywhere on the page; it never scrolls the document.
- Chromium may emit a legacy DOM wheel event for the same physical detent. The renderer pairs native and DOM events within a bounded window and applies exactly one selection step.
- A coarse DOM wheel event (at least 40 CSS pixels, or a line/page wheel event) also selects on the whole Studio page and is prevented from moving the document. This preserves a mouse-wheel fallback when Raw Input is unavailable.
- Fine pixel movement remains unclaimed so a touchpad can scroll a compact page. Inputs, text areas and dialogs retain their own wheel behavior.
- Blur, route leave and renderer teardown cancel pending fallback events and release the existing input lease.

## Audible detent

- Each accepted style-selection step plays one original locally synthesized two-tone mechanical/glass detent.
- The sound is at most 58 ms with a maximum Web Audio gain of 0.034. It is not an Apple sound, a copied system sound or a downloaded asset.
- Strength adjustment and reveal-effect selection do not play the style detent. No sound plays on initial render.
- Audio is best-effort under the browser activation policy, uses the Windows output selected by the application/OS and closes its AudioContext on route leave.

## Hardware truth boundary

No firmware, Flash, device configuration or HID write is authorized. Raw Input remains read-only. The physical encoder press limitation in `t40a-style-studio-dial-press-v1.md` remains unchanged.
