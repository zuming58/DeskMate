# T40 Style Studio Image 2 and instant-print output

Date: 2026-09-14

## Accepted visual boundary

T40 keeps the already selected DeskMate Style Studio surface: the existing graphite navigation and D/M identity, white work area, upper material canvas, central horizontal machine and lower works canvas. It does not replace the shell or restyle any other route.

The style set now contains nine coherent robot treatments: paper cut, yarn, glass garden, clay, pixel, ink wash, chrome future, storybook and translucent jelly. Jelly is a true raster reference with aqua gummy material, internal bubbles, refraction and soft highlights; it is not a CSS color overlay.

The dial-driven style orbit remains transient. At rest it is hidden. Wheel, arrow or dial movement opens the cards around the dial, with the selected item strongest and distant items smaller/fainter. Strength stays compact above the dial and S1 enters the dedicated adjustment state.

## Generation and security boundary

- Generation uses a dedicated main-process Image 2 adapter with fixed model `gpt-image-2`, default OpenAI-compatible base URL `https://metajing.cn/v1`, 1024×1024 output and a 20-minute overall deadline.
- The Image 2 API key is stored separately from other providers using Windows Electron `safeStorage`. React receives only public configuration/status and never receives the key, local paths or temporary provider URLs.
- The adapter makes one explicit request and never automatically retries an uncertain submission. This prevents an invisible duplicate paid generation.
- The current material, style, strength and optional brief are frozen for the request. Provider/download responses are bounded and validated before entering the managed result library.
- A sanitized local journal retains only allowlisted job metadata and failure class. It excludes prompt text, image content, credentials, paths and result URLs.
- No key was copied from the read-only Yiyuan reference audit. No real paid call was made during implementation or verification.

The frozen contract is `docs/contracts/t40-style-studio-image2-v1.md`. The read-only compatibility audit is `docs/references/yiyuan-image2-adapter-audit-2026-09-14.md`.

## Instant-camera output interaction

Submitting a job changes the machine to a long-running print state with elapsed time and an honest “up to 20 minutes” message. Completion does not silently place the work in the lower canvas or open a modal. Instead, the generated photo emerges from the machine's lower slot and remains visibly held there.

The user drags that ejected card downward into the Works area to complete placement. The lower canvas highlights as a valid target. Until the held output is placed, another generation is blocked so no finished work is hidden or overwritten. After placement it follows the existing free-position behavior; `整理` aligns works once, and moving a work returns the canvas to free layout.

## Verification

- Full automated software suite: 705/705 passed.
- Native input bridge publish and production renderer build passed.
- Independent Windows directory package `release-t40` and exact package verifier passed.
- Functional native probe completed consent, synthetic Image 2 completion, ejection, drag into Works, delete and input-lease release with zero renderer errors.
- Source and packaged-ASAR UI probes passed nine-style orbit, ejection/drag, free placement, organize, upload, prompt/reveal, route reentry and 1440×1024 / 1024×768 / 800×768 layouts without horizontal overflow.
- Same-input comparison is recorded in root `design-qa.md`.

Automated provider responses were local synthetic fixtures. Real account compatibility, paid generation quality and physical dial/key acceptance remain user-authorized acceptance steps. No retained profile, microphone, firmware, Flash, HID write or hardware state was changed.
