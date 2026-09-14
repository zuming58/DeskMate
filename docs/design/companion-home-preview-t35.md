# T35 — Selected home companion and transparent sidebar

## T35A correction after user review

2026-09-13: Keep the original dark rounded sidebar container (`#2d3541`, 16px radius, 1px `#3b4655` border); remove only the inner white image backing and secondary text. The user rejected the portrait's two-frame blink. It is disabled by default and its second frame is not loaded; retain the approved still until user-supplied video arrives. Sidebar cyan face continues its own natural blink. Earlier animation details below describe the rejected optional prototype, not accepted motion. Deliver the full packaged application with its real preload/profile, not the disabled-control isolated preview that showed default 小言 instead of the user's 小岚.

Date: 2026-09-13. User approved the blue-shirt rainy-day desk portrait and requested an in-app animated preview. This replaces only the software Companion portrait; the D/M brand, voice pipeline and physical Xiaozhi display remain unchanged.

## Presentation contract

- Companion keeps its existing 3:2 slot, up to 570×380 CSS pixels. Runtime portraits are 1152×768, suitable for the current 150% Windows display scale. The entire approved scene remains visible with proportional scaling, no facial crop or new background.
- The selected open frame is the immutable base. An Image Gen closed-eye frame is registered over the eyelid rectangle only; the scene, hands and body never swap. Natural idle blink: 3.8–7 seconds apart, 160 ms closed. This is a lightweight two-frame visual preview, **not video, speech-synchronized lipsync or a complete animated avatar**.
- Portrait animation pauses for hidden documents, offscreen elements and reduced-motion preference; leaving the Companion overview unmounts it and cancels timers. Failed blink assets leave the still image. Failed base assets show a bounded fallback without disabling voice controls. No network, audio or hardware API is called by the portrait component.
- Sidebar uses genuine-alpha cyan robot assets directly on graphite. Only the real EasyInput connection label remains; USB/HID/hotkey/ready details remain available in diagnostics, not in this card. The collapsed face retains a connection tooltip. Connection evidence is unchanged, never synthesized from animation.

## Asset provenance and reproduction

All four masters in `design/characters/t35/` were generated with the built-in Image Gen tool from user-approved generated artwork. No unknown third-party binary/model or external experimental project was copied. `scripts/build-companion-preview-assets.ps1` performs only deterministic raster resizing, preserving alpha; it does not synthesize or retouch artwork. Runtime assets are `public/assets/companion/home-desk/{open,blink}.png` and `public/assets/expressions/soft/transparent-{open,closed}.png` (256×256).

| Master | Source generation | SHA256 |
|---|---|---|
| home-desk-open-source.png | exec-6d30b18f-c24d-49a4-a540-4c92dc385c8e.png, selected by user | 8475354D9D8161F1C139F3BFDC9191278D8A9FFA73B10FBC865F6DBF2A3252AE |
| home-desk-blink-source.png | exec-0728c59c-6aad-4d8c-8b30-bd17f4927c4b.png | AF35DD1107139E1BFEC70841A100E285F8D25B4F68436093F0F316ECD011EC28 |
| sidebar-open-source.png | exec-c98598f9-31f1-473c-a2c9-9e563237ddda.png | B7D64FC92CD81E26F607D5264329F91510980D16EFD170A3BDA738EDEDFCBC41 |
| sidebar-closed-source.png | exec-44f588d0-aea7-4892-a00d-e27f55132ac2.png | 235B669C35C1A8AD0CA519BCD94CEFD0675EC631F97CB233CD47E414800D8D77 |

Portrait edit instruction: preserve the approved woman, identity, blue shirt, desk, laptop, rain window, lighting and full 1536×1024 composition; change only both eyelids to a relaxed blink. Sidebar edit instruction: retain the cyan soft robot and dark-teal eyes, remove white canvas/shadow to genuine transparency, derive a closed-eye variant without a painted checkerboard. First invalid closed transparency candidate was rejected. Minor edge specks on source masters disappear at normal sidebar scale; source frames are not a fully registered video sequence.

## Verification

- Full `npm test`: 677/677, zero failures/skips; native input bridge publish passed.
- Native stock Electron probe `scripts/probe-companion-visual.cjs`: actual production React renderer, isolated temporary profile, network/permissions disabled; actual natural blink observed, both image pairs loaded, transparent computed backgrounds, status-only copy, 3:2 layout at 1440×1024 and 1024×768, collapse, hidden/reduced-motion pause, navigation cleanup and missing-image fallback passed.
- Source/implementation were reviewed together, including actual open and naturally closed captures. Evidence: `%TEMP%/deskmate-t35-ui-6uhHHg/`. See root `design-qa.md`.
- Package verification explicitly compares the four added nested PNG files in ASAR, in addition to existing code, renderer, bridge, voice and memory resources.
- Real speech accuracy, latency, microphone/speaker, board light/motion, KnowledgeOS and realtime lipsync are **not** tested or claimed by this visual slice.

Next: user views the live app and approves portrait size/blink feel. Only after that, consider a separate approved motion/lipsync adapter tied to actual audio playback, with latency and hardware budgets measured separately.
