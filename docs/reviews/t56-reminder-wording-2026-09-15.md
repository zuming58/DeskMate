# T56 reminder purpose and spoken wording

## User evidence and scope

User explicitly confirmed that T55 saved a reminder and spoke at its due time. Screenshot shows one notified record whose title contains separated hesitation/request tokens. This is user acceptance of that observed reminder flow, not blanket acceptance of all phrase/date/audio combinations. User requests a clean purpose and natural owner-addressed speech. No new diagnostic was supplied.

Baseline `b542eac`, branch `codex/t56-reminder-wording`. T54 500 ms timing, T55 trusted routing, scheduler, persistence and audio-drain completion remain unchanged. No model call was added.

## Implementation

- Standalone hesitation tokens are stripped before extracting reminder purposes. Sequential optional 我/一下 replaces the old mutually exclusive regex alternative that left 一下 behind. Repeated “提醒，嗯，提醒我一下喝水” now yields 喝水.
- Retain action-internal 一下, negation, amounts and names; 看一下合同, 不要锁门, 喝200毫升水, 啊哈实验室 and 嗯哼 remain covered. Filler-only purposes require clarification rather than an invented task. Purpose-only follow-up is cleaned before durable creation and its saved confirmation.
- Main delivery uses exported deterministic `formatPersonalReminderAnnouncement`, reading current saved `companionPersonaStore.snapshot().persona.ownerName`. No name is hardcoded or changed based on the user's transcribed example. Missing address omits the name.
- Simple actions at their actual event time use “喝水时间到了。” Arbitrary purposes and early notifications use neutral “提醒时间到了：…” so a 13:00 notification for a 16:00 event does not claim the event has begun.
- Existing reminder records are not migrated or rewritten. The old separated title “嗯 一下 喝水” is cleaned for playback only. Raw dictation/history and manual reminder persistence semantics remain unchanged. Cleanup is intentionally bounded, not a general semantic rewrite of arbitrary titles.

## Verification record

Eight new T56 tests cover filler/request variants, content preservation, empty purpose, follow-up persistence confirmation, current address/fallback, advance-event wording, legacy record non-mutation and bounded control-free output. The existing T55 scheduler/controller end-to-end test now uses the production formatter.

Initial `npm test` encountered EPERM when T32's worker-history test removed its temporary directory; this is a test teardown failure, not a passing run. Full sequential rerun and desktop/package/UI results are recorded below after completion. No unrelated test or production history logic was changed to hide the failure.

Final `node --test --test-concurrency=1 tests/*.test.mjs`: 817/817 passed. Vite production build passed. Isolated UI: 29/29 at 1440×1024 and 960×680, no unhandled renderer errors; OS-temp report `deskmate-workbench-qa-Ncgw3N/report.json`. Injected IPC failure/history warning are deliberate synthetic fixtures. `git diff --check` passed. These results do not substitute for the user hearing the revised wording.

## Package and restart

`npm run build:desktop` and exact resource/T52/T53/T55/T56 final-ASAR verifiers passed. Existing bundle-size/dependency duplication warnings remain. Candidate `release-t56/win-unpacked`, build ID `t56-reminder-wording`.

| Artifact | SHA-256 |
| --- | --- |
| DeskMate.exe | 1E6753AB316677A169E2003A713E16A4F2BB960396D050FB8244D31B1D46B6AB |
| resources/app.asar | AA4EF075C94D8B673E9F9407931FF5D6617DC6E11ED743C54A111004BE5F6A2B |
| resources/input-bridge/DeskMate.InputBridge.exe | C53D26DCFAC1782D6D610D20BE3E62DD482ED6A61270B20579517EAF31AF6BD8 |

Restarted only exact revalidated T55 process paths into T56 with retained profile and `--show-companion`. Main PID 26784, responding, visible window handle 14946432; all observed application/input-bridge paths belong to T56. Saved endpoint remains 500 ms by read-only check. No reminder/title/name migration was applied.

## Acceptance

In the new build, say “一分钟后提醒，嗯，提醒我一下喝水。” Verify the new card is 喝水, then wait with the app running, computer awake and speaker audible. Expected delivery is “〔当前已保存称呼〕，喝水时间到了。” The old card text is deliberately retained; test with a new record. Existing notified records are not replayed automatically.

No developer-created real reminder, cloud speech generation, user-data rewrite or hardware/Flash/NVS/servo action. KnowledgeOS focused Wiki search returned no match; no work-memory submission.
