# T37 — Style Studio / 风格映像

## Accepted scope, 2026-09-14

One sidebar entry **风格映像** immediately after **AI 陪伴**. Keep the existing D/M brand, sidebar, header, navigation behavior and all other pages. New route `#/style-studio`; module CSS is scoped. Do not integrate by replacing the application with a rendered screenshot or an isolated visible fixture.

Visual reference: user attachment `codex-clipboard-5246aa38-a287-4225-8426-72989bf0106b.png`, the selected light horizontal printer concept. Explicit later corrections take precedence: pure white workspace, no environmental plants/books outside photos, use existing app typography and shell, compact strength above dial; S1 focuses strength mode. Style cards follow an elliptical arc around the dial area with depth/scale and selection motion. Main target 1440×1024; smaller windows scroll vertically without horizontal overflow.

## This slice

- Real React controls: five generated/provenanced style examples, directional/drag/wheel dial, S1 strength and confirm, material upload and inlet drag/drop, clearly marked sample print sequence, enlarge/compare/save, prompt editing/copy, organize, six local canvas reveal effects.
- Source and result zones remain separate. Result drops cannot silently replace the source. Uploaded photos are blob URLs in this page's memory only; PNG/JPEG/WebP, ≤15 MB, ≤40 MP, maximum eight sources, serialized imports. Navigation guard covers uploads and custom brief; URLs and timers are released on unmount. Images are not sent to a service.
- Template intensity changes the future generation prompt, **not** the pre-generated sample pixels. Print button says 演示出片; uploaded photo action explicitly reports AI pending and never returns an unrelated canned result.
- Ordinary keyboard preview: Left/Right select, Enter confirm/print; 1 strength, 2 view, 3 save sample, 4 close, 5 compare (keyup/blur releases), 6 local inspiration template, 7 reset parameters, 8 toggle mode. Editable fields, composing text, modifier chords and repeated action keys are excluded. No global shortcut registrations, VoiceWorkflow, main/preload or HID changes.
- During printing, mode changes are disabled. Generation captures source/style/strength before timers; no API job is created.

## Reference behavior differences and outstanding work

The teacher's screenshots and course notes (revision 244) were inspected externally; no teacher source/test archive was available in the supplied documents. No external code was copied. Timing and easing here are independent UI implementations, not verified source-identical constants.

| Reference behavior | T37 evidence / remaining work |
| --- | --- |
| Source → inlet → printer → enlarged result | Working local sample flow; own photo stops honestly at AI pending |
| Rotary cards orbit | Elliptical card positions, depth scale, animated selection; mouse drag/wheel/arrows |
| S1 strength, rotary confirmation | Implemented with compact always-visible strength above dial |
| S3 save, S4 return, S5 compare | Sample file download; preview close; original/sample toggle |
| Camera, text-to-image, AI inspiration and provider | Not implemented; S6 explicitly supplies a local editable template |
| Results drag freely and spring between zones | Browser drag return / zone separation only; rich free-position drag physics remains |
| Creative reveal modes | Six local canvas treatments and adjustable circular reveal; advanced parameters/export remain |
| Persistent material/output library | Session-only preview with leave guard; managed persistence remains |
| Enter page takes over all hardware keys; leave restores | **Not implemented**. UI says 硬件接管待接入. Do not use the hardware for this slice's acceptance. Future main-process lease must arbitrate Raw Input, host actions and normal key events, not merely unregister keyboard voice shortcuts |

Do not claim real image-to-image, teacher-complete functionality or hardware acceptance for this UI slice. Future API integration must use a main-process adapter, keep keys out of React, freeze job inputs, handle cancel/retry and deduplicate results. Hardware routing requires separate tests and coordination with the existing voice owner.

## Files and integration

- `src/StyleStudioPage.jsx`, `src/style-studio.css`, `src/domain/styleStudio.js`.
- Existing-file edits only route/icon import/navigation/page class in `src/App.jsx`, one `src/appData.js` metadata entry and the navigation expectation in `tests/companion-ui-integration.test.mjs`.
- `public/assets/style-studio/manifest.json` records all generated raster assets; original course/user photos are not copied into the repository.
- `tests/t37-style-studio.test.mjs` and `scripts/probe-style-studio.cjs`.

The UI was developed in `F:/Codex/deskmate-t37-style-studio`, branch `codex/t37-style-studio`, then integrated after the user paused T36 acceptance. The formal integration branch is `codex/t37-integrated-style-studio`: commit `1625e45` is the recoverable T36 checkpoint, `367621f` is the T37 UI merge, and `fe82db3` promotes build `t37-style-studio-integrated`. Hidden QA still uses a fresh temp profile with no microphone, shortcuts, retained data, network or hardware; the final executable was separately launched with the retained profile only after package verification.

## Verification

`npm ci --include=dev`; `npm test`; native bridge publish; directory packaging with checksum-verified stock Electron 36.9.5 in ignored `build-qa-runtime`; `scripts/verify-prompt-package.cjs release-t37`; hidden renderer probe. The latter captures at CSS 1440×1024, 1024×768 and 800×768; capture density is normalized to CSS pixels. Only known existing Google Fonts CSP refusal is tracked as a baseline warning, not suppressed as a new runtime error. Full review details and evidence live in root `design-qa.md` and `flow/progress.md`.

The npm-installed Electron directory was incomplete; cached stock Electron 36.9.5 was extracted only for hidden renderer QA. Formal package `release-t37/win-unpacked` passed exact resource verification and was launched with `--show-style-studio` after the old T36 process was stopped at the user's request. The same retained DeskMate profile was reused; no settings or user data were reset.
