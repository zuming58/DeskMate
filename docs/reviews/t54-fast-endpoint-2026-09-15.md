# T54 fast companion endpoint completion

## Change and rationale

User explicitly requested 0.5-second companion silence because 1.5 seconds felt slow. Main/renderer defaults now agree at 500 ms; existing custom saved values are not globally migrated. This computer's validated preference store was changed from 1500 to 500 ms while DeskMate was stopped. Strict raw validation, atomic save/readback and equality of every other preference field passed. No preference contents or credentials are copied into this repository.

The preceding T53 diagnostic and synthetic reproduction identified a separate post-interruption wait: resetting ASR speech evidence on playback interruption lost ownership of the subsequent stop event, while duplicate partials restarted a five-second recovery timer. T54 preserves accepted speech evidence through interruption/drain, retains matching stop timing, uses a 600 ms post-stop final grace, and defaults missing-stop recovery to 2500 ms. Duplicate partials/stops do not rearm. Real progress can rearm; resumed/new items invalidate stale completion. Only the complete provider-confirmed current hypothesis can be recovered. An unconfirmed suffix is neither promoted nor silently truncated.

Ordinary dictation, T53 early-barge acceptance, local wake and hardware contracts are unchanged. No extra model call or fake thinking label was added. Contract: `docs/contracts/t54-fast-endpoint-v1.md`; decision D162.

## Verification

- Full `npm test`: 794/794 passed, including ten new T54 tests. The first full run exposed three old default-1500 expectations; those were updated to the explicitly requested 500 default, then the full suite passed. Explicitly saved 1500 remains covered and preserved.
- `npm run build:desktop`: passed. Existing bundle-size and dependency-deduplication warnings remain; no build errors.
- Final `release-t54` resources: `verify-prompt-package.cjs`, `verify-t52-reminder-package.cjs`, and `verify-t54-endpoint-package.cjs` passed. T54's final-ASAR probe also executes T53 behavioral coverage before exercising 500 ms defaults, stopped-event ownership, 600 ms recovery and duplicate suppression.
- Isolated Electron UI: 29/29, no unhandled renderer errors, 1440×1024 and 960×680. Report `deskmate-workbench-qa-iVc5lr/report.json` under the OS temporary directory; compact synthetic screenshot visually inspected. Injected IPC failure and the synthetic history warning are deliberate test fixtures, not production evidence.
- `git diff --check` passed. No real cloud speech, reminder delivery, microphone/speaker or physical board acceptance was performed.

## Delivered build and launch

Branch `codex/t54-fast-endpoint`, based on T53 `24d3fe665cccf8f5abd969237eb7c871cd791083`. Build ID `t54-fast-endpoint`; candidate directory `release-t54/win-unpacked` (ignored build output).

| File | SHA-256 |
| --- | --- |
| DeskMate.exe | 8CE8D401A139FA5155EAD5A6B9A5FB244C923891A57CFFBE319546C2DF67716B |
| resources/app.asar | 0567BDEDA3184DD5EC0DE5F034251AF5DC773338F786FF7DCCE8C95AC3921212 |
| resources/input-bridge/DeskMate.InputBridge.exe | 606E2C4AB708687503CD661920360C3C9FDCF89AC6010D1318E20F02AF1B02E2 |

No old DeskMate process was running, so none was forcibly stopped. Started this exact candidate with `--show-companion`, retained user profile, main PID 36944, responding, window handle 2429146. All observed DeskMate/InputBridge executable paths belong to T54. No firmware/Flash/NVS/servo operations were performed.

## Remaining acceptance

500 ms is the silence endpoint, not an end-to-end audible-response guarantee. Model/TTS time remains, and more aggressive endpointing can split hesitant speech sooner. Test normal speech, immediate silence, continued speech after a brief hesitation, ordinary interruption and explicit stop over several turns. Verify no truncated tail or duplicate reply. If still delayed, export a fresh diagnostic after the affected turn. Actual provider-applied session timing and acoustic behavior remain for user acceptance.

The reminder refusal/unsaved item from the preceding diagnostic remains unresolved in this package: the report had a past-time clarification and no stored item, but the exact utterance was unavailable. Passing existing reminder regressions does not prove that reported real interaction is fixed. KnowledgeOS focused Wiki search returned no match; no work-memory submission was made.
