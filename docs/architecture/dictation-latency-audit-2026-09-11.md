# Dictation latency and overlay audit — 2026-09-11

Status: `DIAGNOSIS_ONLY / REPAIR_NOT_IMPLEMENTED`.

Historical audit status above describes September 11. The subsequently authorized
repair is implemented under [T29](../contracts/t29-voice-output-recovery-v1.md).

This is separate from the packaged T28 companion-turn optimization. The user reported overlay flicker, slow smart dictation, then confirmed that raw output is faster but still slower than their talktalk application. No dictation settings, microphone capture, clipboard, target-window input or other application were changed by this audit.

## Latest actual evidence

The user-exported diagnostic generated at `2026-09-11T15:48:56.406Z` records computer microphone input, successful `qwen3-asr-flash-realtime`, `stt.durationMs=267`, and successful `local-rules` organization with `durationMs=0` and no fallback. In the current renderer path the STT metric measures the post-recording result-resolution interval, not the whole utterance or mouth-stop-to-insert time. The raw organizer's zero is a declared local-path value, not a precise CPU measurement. It confirms that this result did not use a cloud text-organizer request. No output-duration field exists in this diagnostic, so an exact end-to-end duration cannot be reconstructed.

The earlier diagnostic's smart organizer took 5022 ms. That is a different sample and cannot be subtracted from this utterance as a controlled speed comparison.

## Fixed reference and behavior differences

Read-only reference: local `F:/Codex/talktalk`, HEAD `9d3f3e49b875d9c4aa419ae91c9b086817f2d396`. No reference source was copied or modified. The actual WPF UI path is `src/Zumingtalk.App/MainWindow.xaml.cs`, `FinishRecordingAsync` / `FinishRecognitionWithRetryAsync`, not the separate full-file coordinator helper. Tests/docs were inspected, not executed; old reference handoff documents also describe insertion failures, so the source review does not imply universal target-app acceptance.

| Stage | DeskMate current behavior | talktalk reference normal path |
| --- | --- | --- |
| Recognition | Computer realtime result reuse; when absent, bounded 1200 ms wait then full-recording fallback. Board input follows a separate whole-recording path. | PCM streams while recording; stop completes the existing Fun-ASR session. Full-file replay is a retry path. |
| Text cleanup | Raw uses local rules; smart/custom await a non-streaming model response. | Normal dictation goes from recognized text to insertion without another LLM rewrite. |
| Insertion | `electron/main.cjs:pasteIntoCapturedWindow` starts PowerShell on every dictation output; it compiles a foreground-check helper, loads WinForms, validates the captured window and sends Ctrl+V. | Existing in-process Windows insertion service with target validation and fallback. |
| Completion | Pipeline waits for history/audio persistence before returning its completed state, even after output acknowledges. Completion wording always mentions organizing. | Direct insertion result followed by history/stat/UI completion. |
| Overlay | Every state/level event replaces all DOM nodes, repositions and calls `showInactive`; terminal hide timers only compare state names. | Updates existing WPF controls and waveform bars. |

## Measured avoidable insertion startup

Three read-only local probes launched `powershell.exe -NoProfile -NonInteractive` and loaded the same kinds of `Add-Type` foreground helper and WinForms assembly, but did **not** query/capture a target, touch the clipboard, send keys or paste any text. Process-plus-component startup took **1382 / 1325 / 1317 ms**, all exit code 0.

This is a synthetic startup measurement, not a trace of the user's actual paste. It nevertheless demonstrates a roughly 1.3-second recurring cost in the mechanism used on every dictation write. The 3000 ms process timeout and the script's bounded 300 ms foreground check are failure ceilings, not mandatory sleeps. A native validated paste implementation already exists in `native/DeskMate.InputBridge/Program.cs:PasteActiveWindowInternal`; dictation currently does not use it.

## Confirmed presentation defects and remaining uncertainty

- `src/pages.jsx` uses `转写、整理和文字输出均已完成` for successful raw output too. The message does not prove another model invocation; the latest diagnostic confirms local rules only.
- `processVoiceRecording` starts history persistence in parallel with output, but awaits it before returning. If persistence finishes later, the floating bar still says it is writing even after insertion. Its actual contribution in this session is unmeasured.
- `electron/overlay-preload.cjs` replaces the entire capsule DOM for every level update, restarting its animated nodes. `updateVoiceState` repeatedly requests show/reposition and creates state-only terminal timers; recording text also changes around an unsmoothed level threshold. These are concrete flicker/reappearance risks, not yet a reproduced causal trace of every reported flash.
- Smart dictation awaits a complete model result. Unlike the T27 companion path, the organizer removes `enable_thinking` for non-Bailian providers without adding the official DeepSeek V4 non-thinking field. Exact reasoning overhead has not been measured here.
- The software disappearance during T28 packaging coincided with the agent intentionally stopping the old exact DeskMate release before replacement. That occurrence must not be presented as an independently verified application crash. The new release was started and verified responding; it was not restarted during this dictation audit.

## Proposed next repair, not yet implemented

1. Route dictation insertion through the existing main-owned native input bridge; retain captured-window validation, clipboard fallback and no focus theft. Test focus change, bridge outage, cancellation and late acknowledgement without duplicate paste. Do not shortcut by pasting into whichever window happens to be foreground.
2. Add content-free stop/result/organizer/insert/history/UI-completion durations. Distinguish acknowledged key injection from target-app receipt; only live acceptance can establish visible insertion latency.
3. Update the capsule incrementally, show/reposition only when needed, and bind terminal timers to the owning session/generation. Keep the single versioned voice workflow and non-activating window behavior.
4. Make completion wording match raw/smart/edit and actual output destination. Do not label background history work as target insertion; preserve reliable persistence and surfaced failures.
5. Keep the user's raw/smart choice. Optimize smart organizer requests separately rather than silently disabling cleanup or changing their model.

Real acceptance needs the user's normal target apps and microphone, including long speech, late ASR tail, stop/cancel/restart, raw versus smart, clipboard fallback and stable capsule visibility. No hardware writes or firmware changes are required for the proposed insertion/overlay slice.
