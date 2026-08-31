# T11A expression and Link UX handoff

## Scope and baseline

- Branch: `codex/t11a-expression-link-ux`
- Exact base: `93a2d71efca6dd5297a3f654d3ebeacdeb8215eb`
- Scope: Windows desktop software only.
- Status: `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`

The Xiaozhi wiring fault reported before this package is a physical issue and remains deferred. This package did not start DeskMate, scan ports, identify devices, read or write Flash/NVS, or operate EasyInput, Xiaozhi, OLED, servo, microphone, speaker, BLE or firmware.

## Product behavior

The companion page now presents two visibly separate controls:

1. **Windows software expression preview** — default, blink, happy, sad, angry, thinking and listening update only the local DeskMate face. The section title, helper copy and success notice all state that no Agent State was sent to Xiaozhi.
2. **Xiaozhi work-state test** — idle, listening, thinking, working, waiting, completed and error use the existing manual Agent State publisher. Clicking the selected state again creates another explicit request for reconnect verification.

No local expression is guessed into a hardware state. In particular, blink and angry are not silently mapped onto the frozen seven-state protocol.

## Delivery evidence

The hardware-state panel shows four independent facts:

- the currently selected real Agent State;
- the latest EasyInput write request/ACK/failure;
- Xiaozhi DeskMate Link `connected`, `waiting`, `faulted`, `disabled` or `unavailable`;
- whether a physical screen observation is still required.

An EasyInput ACK is explicitly described as acceptance by the controller, not proof that Xiaozhi rendered the expression. A disconnected or unavailable Link is never presented as Xiaozhi success. The direct **View system diagnostics** entry opens the existing diagnostics section; it adds no device or protocol path.

The implementation reuses `voiceAdapters.desktop.setManualAgentState`, Electron's one `AgentStatePublisher`, and the existing reconnect recovery gate. It does not create a second Agent state machine. Existing recovery continues to reissue only a current unexpired state; expired listening, completed and error states are not replayed.

## Verification

- `npm ci --include=dev`: passed.
- `npm test`: 187/187 passed.
- `npm run build:desktop`: passed, including native InputBridge Release publish and Windows Electron packaging.
- `git diff --check`: passed.
- Firmware scope, changed-path ASCII, differential secret and ignored build-output checks: passed.

New tests prove that preview does not call the hardware sender, all seven UI states use the frozen transport values, same-state clicks issue a new request, ACK and Link evidence remain separate, and waiting/faulted/unavailable never imply Xiaozhi display success. Existing microphone selection, VoiceWorkflow, key configuration, diagnostics, Codex recovery and desktop build tests remain green.

## Remaining user-present acceptance

After the physical three-wire connection is repaired:

1. Open **AI Companion → Companion and memory** and confirm the two control regions cannot be mistaken for each other.
2. Click every local preview expression and confirm only the Windows face changes.
3. Click all seven Xiaozhi work states and compare the EasyInput ACK, Link status/counters and the real OLED.
4. Click the selected hardware state twice and confirm a fresh request/forward is visible.
5. Restart Xiaozhi and confirm only the still-valid state is restored; an expired transient state falls back to idle.
6. Confirm waiting/faulted/unavailable never displays Xiaozhi success.

These are HIL items only; none is claimed by this software build.
