# T11D.1 companion queue and runtime root-fix handoff

Date: 2026-09-01

## Identity and scope

- Branch: `codex/t11d1-companion-queue-runtime-root-fix`
- Exact base: `d21b8d1e304fd45d35181794065ebe5edc3ee021`
- Status: `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`
- Scope: Windows software only. No application launch/control, hardware, port, firmware, credential, user diagnostic, PCM or conversation text access.

## Delivered repair

- Replaced the renderer's silent three-second queue clear with a main-owned credit window and sequence-bound accepted/played/cancelled acknowledgements. Full credit blocks the next write; a stalled renderer fails the session explicitly instead of cutting the answer and pretending success.
- Drain now requires all accepted chunks to be naturally played. Explicit interrupt/stop cancels nodes and waiters and does not count as played. Manual interrupt/stop during backpressure is normal cancellation and cannot turn into an error state.
- Replaced captured whole-runtime writes with atomic reducer slice updates. Companion events/status are ordered by main `eventSequence`, session and generation; reconnect checks the token across every await boundary.
- Page, capsule and Escape use one single-flight awaited stop action with returned-status application and bounded forced reconciliation. A still-active result becomes a visible retryable sanitized failure, not an endless stopping spinner.
- Added package build ID plus bounded main/render, stop, provider and speaker lifecycle evidence. Fixed realtime `serviceConfigured` export to use the actual status projection.

## Verification

- `npm ci --include=dev`: passed.
- Targeted production regressions: `59/59` passed.
- Full `npm test`: `234/234` passed.
- Isolated Windows package: `F:\Codex\deskmate-t11d1-companion-queue-runtime-root-fix\release-t11d1-queue-runtime-root-fix-verify\win-unpacked\DeskMate.exe`.
- Package size: `202690560` bytes; SHA-256: `292D3BBB3C134E8A76A0DAEF3499E3EC2A457776708E93D13041EC49F62589E7`.
- `resources/app.asar`: `112635192` bytes; SHA-256: `07B7E402F46EB5468E430933A2E02AF2BA7E3D5FCFBFB8FC67478F0DF03A3F1D`.
- Read-only package inspection confirmed `t11d1-playback-runtime-root-fix-v1` is present in packaged main code. Build outputs are ignored and are not committed.

## Minimal user-present gate

1. Confirm the package build ID in the exported sanitized diagnostics is `t11d1-playback-runtime-root-fix-v1`.
2. Start computer-microphone realtime companion and request an answer longer than ten seconds. Do not interrupt. The answer must remain continuous, and `working/speaking` must persist through its audible end before returning to listening.
3. While listening, click the page stop button. It must immediately show ending and reach idle/remove the capsule within a few seconds.
4. Start again and end from the capsule during playback; repeat once using Escape. All three paths must stop playback and converge to idle without a later state revival.
5. Export sanitized diagnostics only if a failure remains. `queueDrops` must stay zero; accepted/played/cancelled/backpressure and stop result counters must distinguish the cause without content.
