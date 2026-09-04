# T18 software-closure acceptance

Use the exact internal Beta package recorded in the latest `flow/progress.md`.
This checklist does not authorize a firmware write. Keep the already accepted
EasyInput and Xiaozhi T15D V2 applications installed.

## 1. Baseline motion regression

1. Open **AI companion -> Motion** and leave automatic contextual motion off.
2. Run attention, nod twice, search and the activated custom dance once.
3. Confirm every action moves physically, finishes, and returns to center.
4. Run emergency stop during an action, explicitly recover, then confirm one
   manual direction and return to center.

## 2. T16 application and Codex control

1. Register one harmless application and enable **Allow companion voice to
   open**. Keep a second registered application disabled.
2. Say “打开 <enabled app>”; it must open once. Ask for the disabled target; it
   must be refused. A path, URL, argument or shell-style sentence must never be
   executed.
3. With DeskMate running, use the repository reporter documented in
   `docs/setup/codex-task-brief-reporter.md` to send `working`, `waiting` and
   `completed` for one test task.
4. Confirm the audible brief uses the configured Doubao voice rather than
   Windows/browser TTS. After playback, wait for the same companion session to
   show **Listening**, then directly say “Codex 进行到哪一步了” without saying a
   wake phrase; it must return the submitted task name and milestone.
5. Confirm start/ordinary progress is throttled and waiting/completed is
   immediate. While dictation or another voice owner is active, a report must
   remain visible without stealing the microphone or forcing speech.
6. Start two named active tasks and ask “Codex 进行到哪一步了” without a task
   name. DeskMate must read both trusted reports, ask which task instead of
   guessing, and must not answer with a generic explanation of Codex/Python.
   After it returns to **Listening**, say only one complete task name. Within
   60 seconds it must read that task's submitted state and milestone exactly.
   A shared or ambiguous project term must ask for the complete name.
7. Say “小智点点头 / 跳个舞 / 看看周围” and confirm the accepted semantic
   action path runs. Motion failure must remain visible and must not be described
   as success.

### Realtime Bridge repair check

1. Before speaking, open **Settings -> Diagnostics** and confirm **Realtime
   conversation Bridge** says started and **Codex task reporter** says listening.
   After submitting one report, its bounded task count must be one.
2. Submit one named `waiting` report, allow its Doubao announcement to finish,
   and speak directly while the same session shows **Listening**. No wake phrase
   is required inside that active session.
3. First say only “那现在怎么样了”, then repeat with “我的这个任务跑到哪一步了”
   and “Code S 进行到哪一步”.
   Both forms must return the trusted task label/state/milestone rather than a
   generic explanation of Codex, Python or the DeskMate development roadmap.
4. Ask one unrelated ordinary question. It must pass through to normal Doubao
   conversation after about five seconds of end silence. The configured
   60-second value means the whole quiet session remains listening for another
   utterance; it must not delay this answer.
5. Under **AI companion -> AI linkage -> Codex recent task briefs**, disable
   proactive voice. Submit a new report and confirm its status remains visible
   and queryable but silent. Re-enable the switch, submit `waiting`, `completed`
   or `error`, and confirm bounded Doubao speech.
6. Export sanitized diagnostics and confirm `bridgeChecks` advances for every
   accepted final while each turn increments either `bridgeOwnedTurns` or
   `bridgePassThroughTurns`. Do not export recognized text.

## 3. T17 dual-source memory

1. In **Memory management**, keep **Companion conversation** and **Voice input**
   enabled and choose an empty test knowledge-base folder.
2. Complete one real companion user/assistant turn and one successful real voice
   input. Voice edit, mock input, failed/cancelled input and audio bytes must not
   appear as source events.
3. Run **Process pending conversations**. Verify separate source counts and
   source/day summaries; the original SQLite events remain unchanged.
4. Review candidates: accept one, edit and accept one, reject one, then
   permanently delete a chosen item through the explicit confirmation flow.
5. Rebuild the local index, search for an accepted fact, export reviewed memory,
   and verify managed Markdown is written only below `DeskMate/` in the selected
   folder with source-specific daily paths.
6. Change the daily time to a nearby minute and verify one scheduled run. Close
   DeskMate across a due time and verify bounded catch-up on next start.
7. Use **Forget all** only with disposable test data. Confirm database counts,
   local index and managed projection are cleared without exposing secrets or
   full paths in diagnostics.

## 4. T15C automatic contextual motion

1. Enable **Automatic contextual motion**; leave idle search off.
2. Start companion mode: attention runs once. End and restart to prove one action
   per start rather than a loop.
3. Cause a thought lasting more than four seconds: search runs at most once in
   that thinking phase. A shorter thought must not move.
4. Complete an application-open or Codex-status answer: nod happens only after
   the answer ends. Complete a trusted Codex task: completed expression and one
   nod occur.
5. During manual control, explicit voice motion, emergency stop, fault or another
   running action, automatic context work must be skipped and never replay later.
6. Enable idle search separately, remain truly idle for 90 seconds, and confirm
   one light search. Speaking, listening or companion activity must suppress it.
7. Confirm no automatic condition triggers dance.

## 5. Companion and package regression

1. Save name, personality/boundaries, provider pause and no-speech timeout;
   start a new companion session and verify the saved values are frozen into it.
2. Verify a natural configured pause does not prematurely submit speech, and the
   no-speech timeout returns to idle.
3. Verify F22 and the mapped EasyInput companion-call entry do not create a
   second VoiceWorkflow or overlapping microphone owner.
4. Confirm the wake-phrase field says **not enabled** and does not start a
   background microphone.
5. Test fresh install, upgrade over the previous internal build, configuration
   retention, close-to-tray/restart recovery, export/delete, and sanitized
   diagnostics. The internal Beta is unsigned; SmartScreen presentation is not
   a functional failure.

Record pass/fail per section and attach only the exported sanitized diagnostic.
Do not attach recordings, recognized text, API credentials, network identifiers,
window titles or complete device paths.
