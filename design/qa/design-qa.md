# T07D companion UI design QA

final result: passed

## Visual truth

- Existing product shell: `design/qa/t07d-t06-baseline.png`
- Selected expression language: `design/concepts/companion-expression-elastic-language.png`
- Implementation: `design/qa/t07d-companion-pass1.png`
- Screenshot dimensions: baseline and implementation are both 1778×1263.
- Browser target: requested 1440×1024 viewport; selected Edge rendered at 1600×1138 because of browser scaling. Both shell screenshots use the same capture dimensions and scaling.
- State: AI 陪伴 → 陪伴与记忆 → 默认 expression, EasyInput waiting, Xiaozhi pending.

## Comparison result

- P0: none. The primary companion flow is visible and interactive.
- P1: none. The T06 graphite sidebar, pale workspace, blue/cyan accents, spacing, card treatment and typography remain intact.
- P2: none requiring another pass. The large face uses the selected fixed shell and large-eye language; all seven expression tiles use matching raster assets rather than icon substitutes.
- P3: none recorded.

The page intentionally combines two references: the T06 screenshot is the shell and density truth, while the expression board is the face/state truth. It is not expected to reproduce the expression board's documentation layout.

## Interaction QA

- All eight primary navigation entries opened their intended route.
- Companion preview changed to listening state and stopped without starting a microphone.
- All seven expression tiles were present; selecting 生气 updated the main image to `angry.png`.
- Expression search reduced “思考” to one result.
- Motion presets and software preview ran with an explicit “未发送到小智舵机” notice.
- AI 联动 displayed four retained adapter cards and simulation disclosure.
- Small-window check showed no horizontal document overflow.
- The current reload produced no new console error. Two older Vite hot-reload errors were timestamped during the intermediate addition of `CompanionPage`; the final module build and clean reload succeeded.

## Verification history

1. Captured the accepted T06 shell before editing.
2. Implemented the eight-entry navigation and embedded companion sections.
3. Generated and inserted the seven full-face raster expressions.
4. Ran browser interaction and responsive checks.
5. Compared the source board, T06 baseline and implementation in one visual review.
6. Ran 105 automated tests and the packaged desktop build.

