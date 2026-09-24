# T66 release audit — 2026-09-21

## Scope and conclusion

User-authorized pre-coursework stabilization of DeskMate, including the last two nights of KnowledgeOS delivery and an installable Windows desktop build. This is a risk-based source audit and automated regression, not a claim that every code path or physical device was exercised. No firmware flashing, physical motion, paid generation, real recording, production restore or user-data deletion was performed.

Baseline: branch `codex/t65-task-status-journal-recovery`, committed HEAD `95b8daf`, desktop build T65. Existing startup notes in `flow/progress.md` were preserved. Candidate: `t66-release-audit`, application version `0.1.1`, Windows x64. Identity remains `deskmate` / `com.deskmate.app`; this is an upgrade, not a second product/profile.

## Findings and disposition

| Priority | Finding | Disposition and evidence |
| --- | --- | --- |
| P1 | Retention treated server acceptance as completed storage; raw records from a disabled source could qualify through another source's completed day. | Require `completed/raw_sealed` receipts for both journal classes when remote retention protection applies, and require each record's actual `summary_day` coverage. Both cleanup implementations and regression fixtures updated. |
| P1 | Electron 36.9.5 and several locked dependencies had known advisories. | Pin Electron 44.4.3, Vite 6.4.3 and update affected transitive dependencies. Final `npm audit --json`: zero known advisories. This is dependency evidence, not proof of zero security defects. |
| P2 | KnowledgeOS offline delivery retried independently per row every five minutes, persisting across days with no shared backoff. | Persist a shared 5/15/30/60-minute backoff, stop the batch after its first transport failure, retain original payload/idempotency keys, and allow explicit manual retry. Accepted journals are queried, not submitted again. |
| P2 | No persisted remote completion verification; UI could describe an accepted journal as sealed. | Poll `submission.get_status`, persist sealed/failed/pending receipt state, display honest delivery counts and next retry. Remote terminal failure remains visible and does not cause duplicate journal submission. |
| P2 | MCP tool call was sent before initialize completed and without `notifications/initialized`. | Await supported initialization/capabilities, send initialized notification, then call the tool. Added ordered-stream regression. Live adapter verification remains contingent on KnowledgeOS service availability. |
| P2 | Encrypted AI credential files used direct replacement writes vulnerable to partial writes. | Write a private same-directory temporary file, flush, close and atomically rename. Injected partial-write and rename failures preserve the old encrypted file. No production credentials were changed. |
| P3 | Idle journal scans bumped the store revision even when all outbox records already existed. | Only bump after actual insertion; idle-loop regression added. |
| P3 | Local backup UI did not explain that Style Studio media and external dance music are excluded. | Added explicit UI warning; full media backup was not introduced. Users must export/copy these media separately. |

## Last two nights: observed facts

Read-only inspection used the existing DeskMate profile and its saved MCP identity; report contains only counts, stages and receipts, no conversation text or credentials. At the initial audit (2026-09-21 10:16, China time):

| Workday | Local summary | Remote work/personal |
| --- | --- | --- |
| 2026-09-19 | Completed at 2026-09-20 00:01:11; 38 dictation records, coverage marked. | Both failed with `knowledgeos-adapter-exited`; 152 attempts each; no submission ID. |
| 2026-09-20 | Automatic close at 23:00:14, summary completed at 23:06:25; 7 dictation records. First generation attempt failed, second succeeded. | Both failed with `knowledgeos-adapter-exited`; 48 attempts each; no submission ID. |

Schedule remains **23:00**. Daily date is the workday being summarized, which need not equal the wall-clock date on late recovery. The two local summaries are present; there is **no evidence of successful remote storage** for these days. No KnowledgeOS background process was found and the saved adapter health call exited. An adapter exit alone does not distinguish an offline Core from an adapter/configuration problem. Repeated delivery attempts are not repeated summary-model calls.

The user previously closed KnowledgeOS. An explicit question was sent about starting it for recovery; absent an answer, this audit does not start it, rewrite the old summaries, or claim a successful remote repair. Once the service and new DeskMate are running, retry the immutable outbox and verify both classes reach `completed/raw_sealed` for both days. Merely receiving a submission ID is insufficient.

## Other audited boundaries

- Electron: isolated renderer, restricted preload/IPC and trusted sender handling; denied untrusted navigation/window opening; no renderer secrets or direct device paths. Existing application-action registry limits execution to configured local targets, not arbitrary model command strings.
- Voice/companion: shared lifecycle, child stdin `EPIPE` ownership and bounded recovery, audio-drain ownership, interruption/reminder/dance regressions retained. Actual microphone, API and hardware latency acceptance remains manual.
- Reminders: local durable storage, due-time/claim/ack and interruption behavior covered by existing suite. No production reminder was added or deleted during audit.
- Style Studio: bounded local media import, cancellation/failure handling, uncertain paid-request handling and restrained drag feedback reviewed. Real renderer probe uses synthetic generation, not a cloud API.
- Privacy/data: confirmed deletion, isolated backup/restore and retention tests, known backup exclusions explicitly stated. No real restoration or retention deletion performed.
- Firmware: current host contract suites rebuilt in fresh temporary directories, not borrowed from a previous build. These are host tests, not ESP-IDF builds or physical acceptance.

## Verification

- Baseline `npm test`: **860/860 passed**.
- Final `npm test`: **868/868 passed**; includes the renderer production build.
- Windows input bridge: Release publish and `--protocol-self-test` exited 0; this command exits before hardware initialization.
- EasyInput host suite: **17/17 passed**; Xiaozhi host suite: **16/16 passed** (MSVC x64).
- Electron 44.4.3 isolated renderer: data-safety interactions passed; actual companion video decoding/state switching and page-leave unloading passed; Style Studio functional probe passed.
- Final dependency audit: **0 known vulnerabilities**. Runtime binaries downloaded from official Electron release; package installation checksums used.
- Additional runtime/package/installer evidence is recorded in the T66 entry of `flow/progress.md` after artifact validation; do not infer installation from configuration tests.

Temporary logs use the prefix `deskmate-t66-` in the Windows temporary directory. `scripts/audit-memory-health.cjs` provides explicit-profile read-only receipt verification; `scripts/probe-release-runtime.cjs` tests SQLite, encrypted storage and native wake module without bootstrapping hardware.

## Installer contract and remaining acceptance

- Chinese assisted NSIS installer, current-user installation, selectable target folder, desktop and Start menu shortcuts; normal uninstall preserves application data. Existing unpacked releases are not deleted automatically.
- User installs the delivered package; this audit does not silently install over the running T65 profile. Fully exit the old tray process before first launch, otherwise the single-instance lock can bring the old version forward.
- The desktop shortcut launches installed DeskMate without Codex or a development server. KnowledgeOS remains a separate service; this installer does not install or silently start it.
- No publisher certificate was supplied: do not describe this as a signed/public release. Verify installer signature status and hash at handoff.
- Before declaring release acceptance: install, launch using desktop shortcut, verify build ID, perform one real voice input and reminder, verify the two pending days' remote receipts, then observe the next 23:00 automatic close. Long-duration retention and physical firmware acceptance are not claimed.

## Primary references

- [Electron supported release lines](https://www.electronjs.org/docs/latest/tutorial/electron-timelines).
- [Example upstream Electron security advisory affecting the old runtime](https://github.com/electron/electron/security/advisories/GHSA-xj5x-m3f3-5x3h); applicability requires its stated conditions, not assumed exploitation of DeskMate.
- [MCP 2025-06-18 initialization lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle).
