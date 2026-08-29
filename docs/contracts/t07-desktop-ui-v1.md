# T07 Desktop UI V1 freeze

Status: `T07_DESKTOP_UI_V1_FROZEN`

This contract freezes the accepted DeskMate Windows shell that both the EasyInput and Xiaozhi firmware streams use as their common desktop baseline. Future firmware work may add capability/status data behind these surfaces, but must not independently redesign the primary shell.

## Frozen primary navigation

The left navigation contains exactly these seven product entries, in this order:

1. 工作台
2. 语音输入
3. AI 陪伴
4. 历史记录
5. 词库
6. 按键配置
7. 设备与诊断

设备连接 remains an internal page of 设备与诊断. 表情库、动作编排、AI 联动 and 记忆管理 remain internal pages of AI 陪伴. 表情编辑 and 环境感知 are not primary entries.

## Frozen visual language

- Deep graphite navigation, light workspace, cyan/cobalt emphasis, restrained cards and shadows.
- One shared `CompanionFace` renderer and the seven accepted raster states: idle, blink, happy, sad, angry, thinking and listening.
- The same face source is used for the brand mark, sidebar device card, workbench, companion preview, expression library and action preview.
- The bottom voice overlay remains compact, single-line, non-focus-stealing and continuously shows the latest recognition fragment.

## Accepted functional baseline

- All T06-locked capabilities remain available: voice workflow, history, vocabulary, complete keyboard read/merge/write/readback, fixed text, safe UUID application actions, device connection and diagnostics.
- Smart organizer is user-confirmed against the configured real text-model API.
- KEY3 voice edit is user-confirmed: select text, trigger `Ctrl+Shift+E`, speak an instruction and replace only the validated original target.
- Idle Escape does nothing; Escape cancels only an active recording, transcription, organization or output session.
- The in-app keyboard change confirmation dialog replaces the native Windows confirmation box.
- AI service credentials are configured through Electron and encrypted at rest; React and diagnostics never receive secrets.

## Honest pending surfaces

The following are not frozen as implemented capabilities and must remain labeled pending, simulated or preview until their own contracts and tests are complete:

- realtime companion voice and interruption Bridge;
- automatic conversation ingestion, daily summaries, embeddings and reminders;
- Xiaozhi OLED, expression transport, servo movement and DeskMate Link;
- any new sensor or third-party Agent integration.

## Change gate

Bug fixes, accessibility corrections, responsive fixes and wiring already-frozen capability/status data into existing surfaces are allowed. Changing the seven-entry navigation, moving the internal ownership above, replacing the shared face system, creating a second VoiceWorkflow, or removing a T06 capability requires a new explicit UI version decision and full desktop regression.
