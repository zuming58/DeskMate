# T52 reminder and listening repair

Date: 2026-09-15. Base: `4cd98aabc583599ffceaeb62f4e82a71be6ebcbe`. Branch: `codex/t52-reminder-listening-reliability`.

## Implemented scope

- Local Chinese hour/minute normalization and a two-minute main-process reminder draft. A morning/afternoon-only answer, a complete replacement time/day, or a missing purpose can finish creation. Cancellation and expiry discard unfinished drafts; actual persistence controls save confirmation.
- Playback-drain captures the accepted PCM upload boundary. A newly dated ASR speech start after that boundary clears residual item/text echo protection; missing timing and delayed pre-boundary echo retain protection. T49 explicit-stop and ordinary-final interruption evidence are unchanged.
- Durable `delivering` and attempt-checked completion replace T51's early `notified`. Busy attempts queue; playback failures retry with separate timing and stop after three failures. Manual snooze renews the retry budget, and restart recovers interrupted attempts. Concurrent completion/snooze is not overwritten or spoken later from an already claimed queue.
- Existing conversations wait for accepted audio and sink drain, then retain listening and restore volume. Empty audio, timeout, rejection, interruption, disconnection and failed drain cannot confirm a notification. Standalone reminders use the shared controller with only TTS, not microphone/ASR/model; a connection loss ends that attempt rather than accidentally opening capture on reconnect.
- Workbench failure and in-flight feedback remain actionable. Diagnostics add allowlisted reminder outcomes/delivery counts and fresh-start/item/text-echo counters, without titles, utterances, media timestamps, identifiers, audio or credentials. Legacy version-one reminder records and backup validation stay compatible. Corrupt records cannot start a zero-delay cleanup/delivery loop or be overwritten with defaults.

The frozen slice is `docs/contracts/t52-reminder-listening-reliability-v1.md`; decisions are D159/D160. The earlier diagnostic evidence and uncertainty remain in `t51-reminder-listening-diagnosis-2026-09-15.md`.

## Verification

- Initial seven new regression cases failed before implementation; all passed afterward. Final new T52 suite: 21 cases. Final full `npm test`: 760/760, zero failure/skip. An earlier full run passed 757 before the final rejection/privacy/corruption cases were added.
- `npm run build:desktop` passed including native InputBridge publish, Vite and Windows directory packaging. The Vite chunk-size and packaging dependency-dedup notices remain non-blocking.
- `node scripts/verify-prompt-package.cjs release-t52` passed exact packaged source, renderer/native/resource checks. `node scripts/verify-t52-reminder-package.cjs release-t52` independently loaded final-ASAR modules and passed Chinese time, draft date completion, TTS-only factories, no microphone capture and no false empty-audio success.
- Isolated native UI: 29/29 passed at 1440×1024 and 960×680. Final synthetic report/screenshots: `C:/Users/Administrator/AppData/Local/Temp/deskmate-workbench-qa-JaQTqL`; failure controls were visually inspected in the scrolled compact viewport. UI uses the real React build/preload with a temporary profile and denied network/device permissions; it is not a production app or hardware acceptance. Fixture-only storage warnings do not describe the user's profile.
- Candidate: `release-t52/win-unpacked`. EXE SHA-256 `815C606430F33AE58D501568388E23294E6F964545DAFAAA7FD4155B94BBE76B`; ASAR `4CA06CCFC83C76AD03F77675F59B6736EB8A58A512A1C15BE4C402FD192C0912`; native bridge `B67A3C9A985EC620F8C9E8A068085F843663EE9B6C2BEA4FBA4B79F4D853B2CE`. The original T51 process PID 32568 remained responsive with HWND 133810; no production restart occurred.

## User acceptance order

1. Start the T52 candidate, verify its build identity in diagnostics, and retain the existing profile. The running T51 app is not automatically replaced by the build process.
2. Say `明天下午六点二十分提醒我开会`; check Workbench title and tomorrow 18:20. Complete this test reminder afterward.
3. Say `明天六点提醒我取快递`, wait for the clarification, then answer only `下午`. Check tomorrow 18:00 and exactly one saved item. Also try `明天下午七点提醒我` followed by `去取快递`, plus cancellation/expiry of a draft.
4. After 小岚 finishes, immediately ask a complete new question; repeat a phrase from its last answer. Check continuous listening, including several short back-to-back turns. Keep quiet during speech to check unchanged false-interruption protection; separately test `停下`/`别讲话`.
5. On the Workbench manually set a short reminder for approximately two minutes ahead using the current local time. End the conversation and confirm direct 小岚 speech and post-playback status, with no alarm. Repeat while dictation is active to check queuing; repeat in an existing conversation to check volume/listening restoration.
6. If speech service/network is temporarily unavailable, confirm no false `已提醒`, bounded retry/failure feedback, and recovery via `稍后 10 分钟`. Do not clear credentials for this test. Export diagnostics if listening is still missed.

## Limits and remaining work

No real microphone, paid ASR/model/TTS, firmware, Flash, HID, servo, new credentials, user-record reset or KnowledgeOS submission is used by these automated checks. Accepted audio and sink completion are delivery evidence, not proof a muted physical speaker was heard. A crash after speech but before durable completion may repeat a reminder after restart (at-least-once). Missing ASR start timing cannot safely clear echo protection. T52 does not promise every missed utterance in the older report was this fault, and does not add reminder editing, recurrence or natural-language relative minutes.
