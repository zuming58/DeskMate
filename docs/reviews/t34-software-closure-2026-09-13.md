# T34 / T34A software closure

Date: 2026-09-13. Candidate: `t34a-dictation-completion`, `release-t34a/win-unpacked/DeskMate.exe`.

## Delivered software

- Backup restore is now accessible with validated staging, counts preview, expiring token, native confirmation and restart. Maintenance guards refuse recording/processing/sync/motion activity. Offline startup validates reconstructed databases; failed application rolls back. React waits for durable configuration handover and acknowledgement before mounting.
- Restore preserves local encrypted credentials but disables restored automatic triggers, KnowledgeOS access/sync, retention and application bindings until revalidation. Imported days are held out of automatic hourly/daily work and pending journal delivery; no keyboard synchronization or journal replay is initiated by restore.
- Backup includes text/configuration, vocabulary, prompts/scenes, local history and memory/provenance, pending binding intent, expression mappings, motion policy/choreography settings; recordings remain opt-in, secrets and device/application paths excluded. A manually requested verified local recovery snapshot is available. This is not an automatic continuous database snapshot service.
- T33's consent-gated 7-day recording / 20-day raw-text retention remains in place. T34 adds expiry of completed managed restore copies while protecting pending handover. User-exported backups and KnowledgeOS Raw are not scanned or deleted.
- Keymap page has one scene manager: add, rename, description, reorder, archive and restore. User names are separate from built-ins; archived scenes retain prompts/bindings, exit Tab circulation; at least one active remains. Both pages share active state/order; KEY1/2/3/4/8 global, KEY5/6/7 local. Revision conflicts fail visibly.
- Memory results lead the page; configuration/index/destructive maintenance are advanced. Key settings, memory edits, companion persona/preferences and AI service forms guard dirty drafts, provide cancellation and preserve failed saves. Busy locks suppress repeat actions. Manual hardware tests no longer overwrite automatic Codex task status.

## T34A: incomplete dictation investigation and fix

The user-supplied redacted diagnostic was generated at 2026-09-13T02:20:40.272Z, build `t32b-backup-preview`. It reports computer microphone, successful realtime STT, local-rule/raw organization and successful active-window output in 71 ms. It contains no transcript or audio; exact missing words and acoustic accuracy cannot be established from this report.

Source inspection found an independent truncation bug: after any utterance completed, stop immediately consumed that earlier result without waiting for the remaining utterance. The previous listener also resolved on the first completed event. This is inconsistent with [the provider's session completion protocol](https://www.alibabacloud.com/help/en/model-studio/qwen-asr-realtime-server-events).

The renderer now establishes the realtime receiver before microphone capture, collects final segments by item ID, ignores provisional text for final output, drains queued audio IPC after recorder stop, and requests `session.finish`. Only `session.finished` seals output. Missing final segments, rejected audio, early close/error or a four-second safety deadline reprocess the complete recording with the existing batch adapter. This is not a fixed four-second wait. Cancelled work does not start fallback. Diagnostic finalization data is allowlisted: outcome, wait milliseconds, segment count and reason, never utterance content or item IDs.

This resolves the reproducible software race; it does not assert perfect ASR accuracy or successful live microphone/output acceptance.

## Evidence

- Vite build passed. Final full Node suite: **658/658**, zero failures/skips; includes ten new T34A tests and T34 restore/scenes/held-day tests. Initial run had one outdated build-ID assertion (657/658); updated it and reran the complete suite successfully.
- Native publish, Windows directory package and exact packaged-resource verification passed. Native input bridge is unchanged by T34A.
- Final candidate ASAR tested with stock Electron 36.9.5 and fresh synthetic profiles: real backup worker/UI; real scene store/UI; data-safety, draft/navigation/cancel and disabled legacy-route checks. All three exited zero. Permissions/network denied; no user data, hardware, cloud or real insertion exercised.
- 1440×1024 and 1024×768 affected-page captures inspected. Scene manager and backup controls fit narrow layout; memory results precede collapsed advanced controls; no horizontal document overflow in scene/memory checks. This is affected-page coverage, not a claim that every possible state on every page has been exhaustively tested.
- `git diff --check` passed.

Evidence correction: earlier T31–T33 UI claims that relied on the packaged `win-unpacked-incomplete-t20/electron.exe` launcher are not valid probe evidence: its embedded application can run instead of the supplied probe script. Current checks were rerun with verified stock Electron (default_app.asar) against the final candidate and produced explicit assertion summaries. Unit tests/build evidence are separate and remain valid.

## Artifacts and limits

SHA256:

- DeskMate.exe: `695182724108DB7550F696D8DC6A5E9AD7C166A8524B08BA466D997C16432BB4`
- resources/app.asar: `D8148D260BC770A355E8024E31D00400691B785EBAC0AEA212154E6F86E0921A`
- InputBridge: `3A8528F9FD0995A80B7F3A00BBAB993BD703FF5BFF9C015F9F1A0EEF0EDB0B5B`

Logs are in task temporary storage: `deskmate-t34a-verified-tests.log`, `deskmate-t34a-build.log`, `deskmate-t34a-{scene-closure,local-backup,ui-data-safety}.{stdout,stderr}.log`. Screenshots are synthetic temporary artifacts, not committed user data.

The running user application was not intentionally stopped/replaced. No live restore/deletion, KnowledgeOS submission, credential change, firmware write or hardware action was performed. Earlier `release-t34` candidate is superseded by T34A. Do not use a normal launch as an unapproved migration/restore test.

Next: user-controlled adoption and [ordered page acceptance](../testing/t34-page-acceptance-2026-09-13.md). Real microphone insertion, companion interruption/continuity, devices and real KnowledgeOS sync remain unverified here. Hold unknown dates/failed transcription/unfinished summaries or sync rather than deleting them. No claim of zero remaining bugs.
