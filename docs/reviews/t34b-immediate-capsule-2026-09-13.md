# T34B immediate capsule feedback

User authorized startup feedback correction and switching the running software on 2026-09-13.

## Change

- Main-process accepted voice start immediately sends `preparing` to the pre-created non-focusable capsule, before awaited wake/companion/audio resource coordination. It says “正在准备录音…”; this is not a claim that microphone capture has begun.
- Existing VoiceSession reducer now includes preparing; UI starts enter it before microphone acquisition. Recording timer and recording waveform still wait for actual capture success. Floating-disabled and existing single presenter terminal timer rules remain intact.
- Duplicate starts during preparation are rejected. Main target-capture generation invalidates cancelled startup. Renderer generations cancel late device starts; computer microphone tracks acquired after cancellation are released before a MediaRecorder is created. Fallback microphone acquisition is not started after cancellation.
- Resource failure exits preparation visibly. Existing foreground target capture, output adapter, native bridge, provider configuration and T34A whole-recording finalization remain unchanged.
- This makes feedback earlier; it does not eliminate microphone initialization or claim a measured physical button-to-pixel latency. Diagnostic startup timing instrumentation remains a possible follow-up, not implemented in this slice.

## Validation

- Seven new T34B tests execute the actual extracted main start function with delayed coordination, cancellation and failure; existing reducer/presenter tests and delayed microphone acquisition exercise readiness/cancel semantics. T34A10 tests remain passing.
- Full `npm test`: **665/665**, no failed/skipped tests. Native publish, Vite build, Windows directory packaging and exact packaged-resource checks passed. `git diff --check` passed.
- Final candidate ASAR checked with stock Electron36.9.5 in isolated synthetic profiles: scene manager, real backup worker/UI, data-safety/draft/cancel probes all passed. No real microphone, paste, hardware or cloud actions used for automated verification.
- Build ID `t34b-immediate-capsule`, candidate `release-t34b/win-unpacked/DeskMate.exe`.
- SHA256 exe `851792B284030F9809D740273281D1AE921EF5E2696867A852642F7BF33E0BB4`; asar `FC308A8C1C2A8EF2934997478588F513403C71B01CF8B0F371F4F272A6C64DFA`.

## Authorized adoption

Old live application was T32B main PID21584. Its tray menu showed “开始语音输入”, not “停止语音输入”. User was told to pause speech and save drafts. Invoked its own “退出” menu and waited for normal exit; no force-kill. Started T34B at11:40 local, main PID41756. A second launch used the existing single-instance showMain path to bring it onscreen; verified one main T34B process, responsive visible main window HWND525814. Existing data/profile retained; no manual restore, cleanup activation, credential changes or firmware writes.

Next user checks: press once and verify preparation feedback appears promptly; speak when recording starts; confirm complete dictation and single insertion; press Escape while preparing and ensure recording does not reappear later. Keep the T34 ordered page acceptance checklist for other features. Previous T32B successful dictation reports are not T34A/B live acceptance evidence.
