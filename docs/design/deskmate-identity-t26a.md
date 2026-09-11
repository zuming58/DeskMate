# DeskMate identity and soft companion — T26A

## Accepted direction and scope

2026-09-11：用户选定蓝青折带 D/M，并经过方形底、大小和去玻璃版本比较后确认平面版本。品牌图标保留暖白圆角方形底，外侧真实透明，不再叠加黑色框。随后用户要求实时陪伴大脸和左下角动态形象采用提供的浅蓝柔和风格，可睁眼、闭眼，背景也不要黑色。

- 静态身份：侧栏顶部、工作台标题、favicon、Windows 窗口/托盘/EXE 使用 D/M。
- 动态身份：AI 陪伴主画面、侧栏底部设备卡使用浅蓝 soft 形象与浅灰蓝背景。
- 既有七张 classic 表情、动作预览及硬件表情标识继续保留。没有改动固件、VoiceWorkflow、收音、播放、打断、记忆和设备连接。
- 页面仍采用既有石墨导航、浅色工作区、字体和布局；侧栏深色导航不是本次要求去掉的脸部黑背景。

## Assets and provenance

All new artwork was created/edited with the built-in OpenAI image-generation tool in this task. User-supplied DeskMate screenshots and the supplied soft companion image were visual references; no external stock library, code or reference-engineering repository was copied. This is provenance, not a legal warranty of exclusivity. Generated originals remain preserved locally; rejected iterations are not product assets.

| Repository source | Purpose | SHA-256 |
| --- | --- | --- |
| `design/brand/t26a/dm-approved-preview.png` | User-approved flat direction | Preview only |
| `design/brand/t26a/dm-icon-source.png` | 1254×1254 RGBA, transparent outside tile | `61D77C9E0E7C9783C82BB1980FE14B27E2CA4A53119AB8E2114C6EE6ADE39258` |
| `design/brand/t26a/companion-open-source.png` | 1254×1254 open-eye source | `D0865898E81B6332C23991F0F80700283898F3CCF4F31F86388518A16C29F560` |
| `design/brand/t26a/companion-closed-source.png` | 1254×1254 smiling closed-eye source | `DE958D1D5A3EC12A5F04E8372D3025DE62AD02FEF733A848208011FE616C3217` |

Production outputs:

- `public/assets/branding/deskmate-logo.png`: 512×512 RGBA.
- `electron/assets/deskmate-dm.png`: 256×256 fallback; `deskmate-dm.ico`: PNG-backed frames at 16, 20, 24, 32, 40, 48, 64, 128 and 256 px.
- `public/assets/expressions/soft/open.png` and `closed.png`: 768×768, intentionally light opaque backgrounds.
- `scripts/build-brand-assets.ps1` performs deterministic resizing/encoding only, no redraw, generated background removal, masking or compositing. Original raster artwork remains the source of truth.

Rebuild on Windows:

```powershell
powershell -NoProfile -File scripts/build-brand-assets.ps1
npm test
npm run build:desktop
```

## Generation specifications

The following records the final instructions, normalized for reproducibility (not a claim that regeneration is pixel-identical).

1. Flat D/M: preserve the selected medium-size blue-to-cyan folded monogram, its dark fold and letter proportions. Replace the puffy frosted tile with a flat off-white `#FAFBFD` rounded square; no glass, rim, bevel or heavy shadow. Keep a neutral `#E8ECF1` presentation background outside the tile, no lettering or extra marks.
2. Production cutout: edit that approved preview; preserve the complete off-white tile and D/M exactly. Remove only the surrounding gray presentation background to true alpha transparency. No checkerboard or color fill, no redesign. Alpha corners are zero; the returned tile is near-opaque rather than every interior pixel being alpha 255.
3. Open companion: preserve the user's pale-blue rounded pebble body, soft matte aqua/cyan color and gentle ground shadow. Replace smiling eyes with two small dark-teal vertical capsules. Center on a very light `#F4F9FC`-family background; no black shell, metallic rim, glass, mouth or text.
4. Closed companion: edit the open frame, changing only the two eyes to friendly inverted-U smile arcs. Keep body geometry, scale, position and light background aligned so a two-frame transition is restrained.

## Software behavior

`companionVisualExpression` maps connecting/listening to open listening eyes; thinking and speaking stay open; completed replies show closed smiling eyes; stopping shows closed eyes; idle/error/unknown retain neutral open eyes. Precise functional state is still conveyed by existing text, not inferred from the drawing.

Natural blink: 4.2–7.8 s intervals, 150 ms closure, 70 ms opacity transition. Both real raster frames preload; no AI request occurs during animation. Happy/sleep visual states remain closed. Live reduced-motion preference and hidden-document changes clear timers; cleanup prevents stale closures after state changes. State-driven changes remain available with reduced motion. Two component instances may blink independently while following the same conversation state.

`CompanionFace` defaults to classic for historical previews. Only the two specified live software surfaces opt into soft. `BrandLogo` never blinks. This does not imply a connected physical screen and sends no hardware command.

## Verification boundary

- Unit coverage: mapping, PNG/ICO structure and dimensions, asset consumers, compatibility and timer safeguards.
- Isolated native Electron QA: real renderer/preload with temporary profile, synthetic states, external requests blocked and recording denied; natural blink, state changes, live reduced-motion, 1440×1024 / 960×680 layout and overview regressions.
- Package check compares the new UI assets and native icons with the built source.
- Visual review and residual polish are recorded in root `design-qa.md`. Synthetic screenshots do not establish microphone, firmware, servo or live-voice acceptance.
