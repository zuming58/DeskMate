# T15D Windows choreography editor handoff

Date: 2026-09-02

## Exact delivery

- Branch: `codex/t15d-desktop-choreography-editor`
- Start baseline: `codex/t15-t16-integration@5d0e0cea95a25a8366e5bd1374d3ce6bb28f3e69`
- Main-Agent documentation baseline incorporated before implementation: `32c55409efdb0d10aa8cd157836b0345272c78fc`
- Implementation commit: `26b8321`
- Final HEAD: the documentation commit containing this handoff

## Delivered Windows scope

- The four existing T15 presets remain available and are labelled `快速动作`.
- A separate `自定义舞蹈` editor provides:
  - 2–8 aligned beat columns, six by default;
  - Yaw `hold/left/center/right`;
  - Pitch `hold/up/center/down`;
  - Expression `hold/idle/listening/thinking/working/waiting/completed/error`;
  - 400/600/800/1000 ms beat time;
  - 1–3 repeats;
  - 1–20 visible-character names;
  - at most eight saved programs;
  - save, copy, delete and software preview.
- The preview uses one active-column cursor, applies all three values in a column together and advances columns sequentially. Stop and normal completion return the local head preview to center and release the temporary expression so the latest external Agent expression is shown again.
- Electron main owns the exact-schema compiler and an atomic `userData/choreographies.json` store. Renderer-facing APIs expose sanitized programs and bounded errors, never a filesystem path.
- The entity adapter is deliberately pending: `ready=false`, `state=not-ready`, `reason=choreography-transport-not-frozen`. The real execute action cannot call a fixed preset, manual step, angle, PWM, pulse width, duty cycle or GPIO fallback.
- Existing stop/center and emergency-stop controls continue to use the accepted T15/T10D coordinators; this implementation did not invoke either control.

## Verification

- `npm ci --include=dev`: passed.
- Focused T15D tests: `8/8` passed.
- Full `npm test`: `358/358` passed.
- `npm run build:desktop`: passed.
- Isolated `electron-builder --win --dir` package: passed at `release-t15d-choreography-editor/win-unpacked`.
- Packaged native input bridge `--protocol-self-test`: exit `0`.
- `git diff --check`: passed.
- Secret-assignment scan: no matches.
- Tracked non-ASCII paths: none.
- `firmware/easyinput-controller` and `firmware/xiaozhi-yuntai`: no source diff.

Package evidence:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `DeskMate.exe` | 202690560 | `372FB38C031AF51810FE227952BE400A58CE472E10196BF63D4C5CD905BD1468` |
| `resources/input-bridge/DeskMate.InputBridge.exe` | 153516937 | `719BCB694887034EB7AF25ECFC17A46D71BC1F35A6FE333258A43258647AE4D5` |
| `resources/app.asar` | 112918905 | `C20CE2B740D4FDB9D6C9EE3B764EA261C3BF8ED0342D510F7EDE0441D989CFAC` |

## Unclosed gates

- `T15D Host/Link wire`: `NOT_FROZEN`.
- EasyInput forwarding and Xiaozhi choreography execution: not implemented in this Windows package.
- Entity execution, completion/stop expression restoration and physical movement: `HIL_NOT_RUN`.
- The four existing T15 quick presets must first pass their ordered physical HIL. The main Agent then owns additive contract/vector freezing, both firmware endpoints, integration and user-authorized hardware acceptance.

No application was launched or controlled. No device, port, firmware, Flash/NVS/eFuse, OLED, audio, PWM or servo operation occurred.
