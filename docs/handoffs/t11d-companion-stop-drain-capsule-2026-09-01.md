# T11D companion stop, drain and capsule handoff

Date: 2026-09-01

## Delivery identity

- Branch: `codex/t11d-companion-stop-drain-capsule`
- Exact base: `fb17123f01f812de0ef2d3fe6b5fdd06c429898c`
- Implementation and documentation commit: `7a138e53c3d8c017a8f54eec9efd1267866af98e`
- Status: `TEST_CONFIRMED / BUILD_CONFIRMED / MAIN_CHAIN_HIL_CONFIRMED / T11D_HIL_PENDING`

## User-present evidence and cause

The T11C package completed several real turns, preserving acceptance of the Doubao handshake, selected computer microphone, continuous session and computer speaker. The same run rejected three details: one answer ended early, explicit stop stayed connected in `listening`, and the in-app global voice bar was too wide. The desktop overview also left the realtime card above the bottom of the right stack.

Code evidence showed that provider `tts.end` immediately released the echo guard even while Web Audio nodes remained scheduled, and that stop awaited adapter teardown without bounds. The renderer/main bridge had no played/drain acknowledgement.

## Delivered behavior

- `sink.drain` snapshots scheduled playback nodes; `sink.drained` returns only after that request's nodes end and carries its request sequence.
- `speaking`, Agent `working`, microphone suppression and reflected-ASR suppression remain active through the last played sample.
- Main-process drain is capped at four seconds. Timeout clears playback and fails soft to listening; late acknowledgements cannot satisfy another request.
- Stop immediately enters `stopping`, shares one in-flight operation across repeated clicks, disables repeat controls and bounds source, sink, provider and terminal Agent-state teardown. It always emits idle and releases ownership.
- Session/token checks keep late provider events from reviving a stopped conversation.
- The in-app live bar is a short, bottom-centred single-line capsule with narrow-window contraction.
- At desktop width the realtime card fills the same grid row as the right stack. Added height expands the face stage without distorting the expression asset; single-column layouts return to natural height.
- Sanitized diagnostics add counts only for drain and teardown timeouts.

## Verification

- `npm ci --include=dev`: passed.
- Targeted controller/computer-audio/UI tests: `32/32` passed.
- Final `npm test`: `222/222` passed, zero failure/skip/todo.
- `npm run build:desktop -- --config.directories.output=release-t11d-stop-drain-capsule-verify`: passed native InputBridge publish, Vite production build and Windows Electron directory packaging.
- Package: `F:\Codex\deskmate-t11d-companion-stop-drain-capsule\release-t11d-stop-drain-capsule-verify\win-unpacked\DeskMate.exe`.
- Package size: 202,690,560 bytes.
- Package SHA-256: `45480D7E2C624B0449E6E962FB8550109BC8B2020D70C75C5633CEEA069E279B`.
- `git diff --check`, ASCII changed paths, differential secret scan, ignored-output check and firmware/native-source boundary passed.

No application was launched, closed or controlled. No user audio, credential, transcript, window title, port, device, Flash, firmware, OLED or servo was accessed.

## Minimal user-present acceptance

1. Manually close the old package and open the `DeskMate.exe` above. At the normal desktop width, confirm the realtime card and right companion stack end on the same line and the larger face is not stretched. Narrow the window and confirm the page becomes a natural-height single column.
2. Start a conversation with the already accepted computer microphone. Confirm the bottom bar is a short centred capsule and remains one line.
3. Ask for a longer answer and do not interrupt. The face/Xiaozhi state must remain `working` until the final audible sample, then return once to `listening`.
4. While listening, click **结束陪伴对话**. The control must immediately say **正在结束…**, reject repeat clicks, reach idle within a few seconds and remove the live capsule/session ownership.
5. Start again and click **结束陪伴对话** during an answer. Playback must stop, the session must reach idle, and no late provider event may restore listening or working.
6. Start once more, click **打断回答并继续听** during an answer and speak a new sentence. Playback must stop immediately, listening/upload must resume, and the next answer must complete.

Natural spoken barge-in remains outside V1; EasyInput KEY1 remains text VoiceWorkflow and is not a companion toggle.
