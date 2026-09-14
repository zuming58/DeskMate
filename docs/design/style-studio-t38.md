# T38 — Style Studio functional slice

## Product result

T38 keeps the user-approved T37 screen intact and turns its honest preview into a bounded working feature. The existing DeskMate shell, Logo, navigation and every other page remain unchanged. 风格映像 stays immediately below AI 陪伴.

The page now owns a persistent local material/output library and can submit a selected local source to Alibaba Bailian Qwen Image 3.0 only after a per-generation confirmation. Provider credentials and local paths remain in the Electron main process. A returned temporary provider URL is validated, downloaded immediately and stored under the application-managed library; the renderer receives only public metadata and bytes.

## Frozen behavior

- Source import: PNG/JPEG/WebP, at most 10 MiB and 40 million pixels; up to eight local sources; content-addressed deduplication.
- Results: up to 24 managed images, at most 25 MiB each. Each result records the source, style, intensity and optional brief. Explicit deletion removes its managed file. A source with linked results is protected until those results are deleted.
- Generate: one active request, immutable source/style/intensity/brief, explicit one-time upload consent, visible waiting state and cancellation. Opening or previewing a source does not upload it.
- Security: `nodeIntegration: false`, `contextIsolation: true`, narrow IPC, trusted sender checks, credentials/paths/provider URLs excluded from renderer state. Library metadata is atomically written and asset bytes are checked against SHA-256 before use.
- Existing sample path stays visibly marked as local sample behavior. It never pretends that a user photo was transformed.

Contract: `docs/contracts/t38-style-studio-v1.md`.

## Page-scoped input ownership

The main process grants an input lease only while the focused and visible main window is on `#/style-studio`; route change, blur, reload, renderer crash or close releases it. While leased, EasyInput wheel events select the previous/next style, the proven `VoiceInput` raw trigger enters strength adjustment and `VoiceEdit` requests save. Custom host actions are rejected for this page. There are no HID writes and no firmware changes.

The renderer also accepts the existing Maker keyboard chords only while the page has focus: Backspace close, Ctrl+A compare, Ctrl+C inspiration, Ctrl+V reset and Ctrl+Z mode. Editable fields and IME composition are excluded. The current bridge does not prove distinct physical raw identities for S2/S4/S5–S8, so full eight-key physical acceptance remains pending rather than inferred.

## Explicit limits

- No real user photo was uploaded during automated verification; the provider adapter was tested with mocks and the official request/response contract only.
- Camera capture, text-to-image, model-driven inspiration, free-position spring physics and advanced reveal export are not part of T38.
- Hardware acceptance remains user-present work. Software tests do not prove that every physical key is distinguishable on the currently installed firmware.
- The teacher screenshots and course notes establish behavior references only. No teacher source code or binaries were copied.

## Verification surface

`tests/t38-style-studio-functional.test.mjs` covers presets, content validation, deduplication, persistence, tamper detection, linked deletion, consent, request cancellation, provider URL restrictions and input lease release. `scripts/probe-style-studio-functional.cjs` uses the production renderer with a fake configured bridge in an isolated temporary profile to inspect consent, generated result, deletion and route-leave restoration. `scripts/probe-style-studio.cjs` continues the T37 navigation, responsive and interaction regression. Exact packaged main/preload/adapter/store/assets/native bridge are checked by `scripts/verify-prompt-package.cjs`.
