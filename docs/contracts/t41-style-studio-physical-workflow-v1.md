# T41 Style Studio physical workflow v1 — FROZEN

Date: 2026-09-14

## Scope

This slice completes the camera-like interaction and the course S1–S8 state model on `#/style-studio`. It preserves the existing DeskMate shell, Image 2 request/storage boundary, voice state machine and all other routes. It does not change firmware, Flash, device configuration, Raw Input identity or HID output.

## Generate surface

- The complete central machine and its upper inlet accept a source card or a local PNG/JPEG/WebP drop. A valid drop visibly opens/seats the source and plays one short original local insert sound. The first file in a multi-file machine drop becomes the loaded source; remaining valid files enter Materials without replacing it.
- The loaded source remains visibly tucked into the top slot with its subject readable. Materials remain a bounded free canvas.
- A completed result ejects below the machine. Another generation is blocked while an ejected result is waiting.
- Pull begins only from the ejected photo. Before a 42 px downward threshold it resists; after the threshold it detaches, plays one short original local pop, follows the pointer above the Works target and stays at the bounded release position. Releasing elsewhere returns it to the slot. Works remains freely arranged until `整理` is pressed.
- Style choices are absent at rest. Wheel/dial movement opens the transient orbit. Ten presets are available: paper, yarn, glass, clay, pixel, ink, chrome, storybook, jelly and blocks. `blocks` is the only new course-derived preset in this slice; no unobserved course preset is claimed.

## S1–S8 state model

- S1 toggles the current intensity editor: generation strength in Generate, display blend in Reveal. Rotate changes by five points; press confirms.
- S2 first opens the current result. Pressing S2 again while enlarged closes the result view and enters Reveal.
- S3 exports the current result, or the current 1000×1000 Reveal canvas, and stays in Style Studio with the current state intact. S4 is the only close/return key. This sentence was corrected by T45 after physical observation clarified the intended interaction.
- S4 closes the active transient state. From an enlarged result it returns to the workbench; otherwise it leaves Style Studio.
- S5 compares original and result side-by-side in the enlarged view. In Reveal it exchanges the circular inside/outside sources.
- S6 supplies one editable local inspiration sentence. It never submits a provider request by itself.
- S7 resets style and Reveal controls while preserving Materials, Works and managed media.
- S8 opens Generate/Reveal choice. Rotate selects; press confirms.

## Reveal sequence

1. Rotate to choose one of six effects: original/work, colored dots, pixel slicing, ASCII poem, duotone or line echo.
2. Press to confirm the effect; rotate changes circular window size.
3. For effects with a secondary granularity, press again; rotate changes point, pixel, character, tone or line size.
4. Press again to reselect the effect. Equivalent on-screen controls remain available.

## Input and hardware truth

- Page-scoped software routing remains limited to host-visible EasyInput events while the focused route lease is active. Digit1–Digit8, coarse wheel and Enter remain keyboard fallbacks.
- The current compiled EasyInput encoder press action is `scroll_axis_toggle`; it changes firmware state without a distinguishable Windows event. Renderer code cannot convert an event that Windows never receives. Physical press acceptance therefore remains pending a separately authorized host-visible mapping/firmware contract and user-present HIL.
- No firmware write, Flash read/write, device configuration change or HID output is authorized by T41.

## Provider and test boundary

- Existing `gpt-image-2`, explicit per-generation consent, encrypted main-process credential, bounded wait, immediate local result persistence and no uncertain retry remain unchanged.
- Automated UI verification uses repository-generated samples or a synthetic provider in isolated profiles. It must not send a paid request or access retained private images/keys.
