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

## 2026-08-29 incremental UI follow-up

- Primary navigation now has seven entries; 设备连接 moved into 设备与诊断.
- AI 陪伴 gained 记忆管理 with real local database status and an honest empty state.
- 设置与诊断 gained a three-plane AI 服务 page for Bailian ASR, an OpenAI-compatible text model and pending realtime voice credentials.
- The native configuration confirmation was replaced with the shared DeskMate card, typography, blue/cyan action and shield treatment.
- Source/build checks passed with 112 automated tests. The final Windows package was produced at `D:\CodexData\home\visualizations\2026\08\29\01a04af3-3b1b-7843-9dcd-d8d26ef52e4c\deskmate-package\win-unpacked` because a local process held the repository `release` staging rename.
- Automated Edge capture stopped when the Windows helper could not confidently identify the current browser URL. No browser safety check was bypassed. The live preview is left open in the Codex browser panel for the user's visual pass; this incremental section does not claim a new automated visual-comparison pass.
