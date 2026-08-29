# Companion UI integration after T06

## Scope

This integration starts from the accepted T06 desktop baseline at `619d85347499545e9af11488bb5d141296ae1dd3`. It changes the information architecture and companion presentation only. T06 voice output, fixed text, application launch, key mapping, configuration readback, diagnostics and Electron security boundaries remain the functional baseline.

## Primary navigation

The left navigation has seven product-level destinations:

1. 工作台
2. 语音输入
3. AI 陪伴
4. 历史记录
5. 词库
6. 按键配置
7. 设备与诊断

The former standalone 设备连接、AI 联动、表情库、表情编辑、动作编排 and 环境感知 entries are no longer primary navigation. 设备连接 is embedded in 设备与诊断. AI 联动、表情库、动作编排 and 记忆管理 are embedded in AI 陪伴. Legacy internal routes remain available in code for compatibility, but are not advertised as product destinations. Environment sensing remains out of the active product surface.

## AI Companion sections

- 陪伴与记忆: software-only interaction preview, reminder examples, and honest service readiness.
- 记忆管理: a real local SQLite WAL repository status, daily-summary/candidate/long-term-memory views and candidate approval controls. Conversation ingestion, automatic summarization and embeddings remain pending until the shared companion voice pipeline is connected.
- 表情库: seven built-in raster expressions plus a temporary local import preview. Import does not persist and is not sent to Xiaozhi.
- 动作编排: software-only previews for attentive, nod, search and dance. No servo command is emitted.
- AI 联动: preserves the T06 adapter simulation, status mapping and per-agent expression mapping.

The “开始陪伴对话” control does not start a microphone or create a second voice workflow. It only demonstrates the future listening state and explicitly marks the real-time voice bridge as pending. The production implementation must reuse the versioned shared voice state machine so text voice input can interrupt companion chat without microphone contention.

## Expression system

The built-in library uses real raster assets with one fixed dark shell and seven eye states:

| Product id | Label | Asset |
| --- | --- | --- |
| `focus` | 默认 | `idle.png` |
| `sleep` | 眨眼 | `blink.png` |
| `happy` | 开心 | `happy.png` |
| `sad` | 难过 | `sad.png` |
| `alert` | 生气 | `angry.png` |
| `think` | 思考 | `thinking.png` |
| `listen` | 聆听 | `listening.png` |

The same renderer is used by the brand mark, sidebar device card, Workbench face, Companion stage, expression tiles and motion preview. Normal states blink naturally every 4.2–7.8 seconds for 150 ms; explicit blink and reduced-motion mode disable the automatic cycle.

The selected visual source is `design/concepts/companion-expression-elastic-language.png`. Production assets live in `public/assets/expressions/`.

## Truthful state boundary

- EasyInput status comes from the existing input bridge.
- Xiaozhi, real-time companion voice, automatic memory summarization/embedding, reminders, expression upload persistence and servo output remain `待接入` or `待开发`.
- The Windows memory database and review schema are real and local; an empty database is shown as empty rather than populated with demonstration memories.
- No simulated state may be presented as a physical connection or hardware action.
- This package performs no port scan, device identification, Flash/NVS read or write, burn, erase, monitor or eFuse operation.

## Verification

- `npm test`: 112/112 passed for this follow-up implementation.
- `npm run build:desktop`: passed.
- Browser navigation smoke: all seven primary destinations opened; 设备连接 opened inside 设备与诊断.
- Companion interaction smoke: start/stop preview, seven expressions, search, motion preview and AI adapter section opened.
- Responsive check: requested 900×800 override rendered at 1000×889 under the selected Edge scaling; document width stayed within the viewport.
- Visual comparison: `design/qa/design-qa.md`.
