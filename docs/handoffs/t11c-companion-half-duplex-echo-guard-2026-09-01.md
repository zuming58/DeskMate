# T11C companion half-duplex echo guard handoff

Date: 2026-09-01

Follow-up: the subsequent user-present run completed several real turns but rejected the network-only `tts.end` release point and stop/capsule details. See `docs/testing/t11c-companion-followup-hil-2026-09-01.md` and the T11D contract.

## Delivery identity

- Branch: `codex/t11c-companion-layout-echo-guard`
- Exact base: `e77195edc4743fdd461860e9999acf60a30be95d`
- Implementation commit: `9f23b3a325cb66d75f5433ec61cb873c3120477e`
- Status: `TEST_CONFIRMED / BUILD_CONFIRMED / MAIN_CHAIN_HIL_CONFIRMED / ECHO_GUARD_HIL_PENDING`

## Live evidence and repair

The user confirmed that the T11B repair shows the fixed protocol App Key and supports real spoken input plus an audible answer. This accepts the real handshake, selected computer microphone, Doubao session and computer speaker. The remaining failure was an answer that could interrupt itself before completion.

T11C keeps the one controller and freezes `computer-speaker-echo-guard-v1`:

- computer capture requests echo cancellation, noise suppression, automatic gain control and mono while preserving the exact selected device inside the media request;
- actual playback maps to `speaking` and the existing Agent state `working`;
- during playback microphone chunks are counted and dropped before provider upload, while ASR partial/final events are counted and ignored before UI, persistence or interruption;
- the original T11C implementation returned directly on `tts.end`; T11D supersedes that rejected release point with bounded AudioSink drain;
- **打断回答并继续听** immediately clears playback, returns to `listening` and restores upload;
- diagnostics expose only a policy enum, active flag and two integer counters.

## Companion layout

The realtime face and its real lifecycle are the first visual. Companion/device evidence remains beside it, and the full-width Xiaozhi work-state test follows the whole overview. The conflicting Companion expression-library segment and local-preview callout are removed without deleting expression assets or hardware mappings. Playback copy now says **回答中 · 防回声** and explains the manual interruption boundary.

## Verification

- `npm ci --include=dev`: passed.
- Targeted controller/audio/UI/diagnostic tests: `42/42` passed.
- Full `npm test`: `216/216` passed, zero failure/skip/todo.
- `npm run build:desktop -- --config.directories.output=release-t11c-companion-echo-guard-verify`: passed native InputBridge publish, Vite production build and Windows Electron directory packaging.
- Package: `F:\Codex\deskmate-t11c-companion-ux-echo-guard\release-t11c-companion-echo-guard-verify\win-unpacked\DeskMate.exe`.
- Package size: 202,690,560 bytes.
- Package SHA-256: `4AFD80B0386FB0E850549A55FD194AE1E01B31AF5EED1B694CEAF7A854DCB27C`.
- `git diff --check`, ASCII changed paths, differential secret scan, ignored generated-output check and firmware-directory boundary passed.

No application was launched, closed or controlled. No device, port, user audio, credential, transcript, Flash, firmware, OLED or servo was accessed.

## Minimal user-present acceptance

1. Manually close the old DeskMate package and open the package above.
2. Open **AI 陪伴**. Confirm the realtime face is first, no Companion expression-library segment is shown, and **小智工作状态测试** is below the whole overview.
3. Select the already accepted computer microphone and start the companion from the page button. The existing EasyInput KEY1 remains text dictation and is not rebound by this slice.
4. Speak one sentence. Confirm the face/Xiaozhi path follows `listening -> thinking -> working -> listening` and the page says **回答中 · 防回声** only while the answer plays.
5. Let a longer answer finish without speaking. Pass when it is not interrupted by its own speaker output and returns to listening.
6. During another answer click **打断回答并继续听**, then speak again. Pass when playback stops immediately, listening resumes and a new answer completes.
7. Repeat for two complete turns. Natural automatic spoken barge-in is not an acceptance item for V1.
