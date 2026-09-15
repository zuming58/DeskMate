# T53 follow-up: delayed listening completion and unsaved reminder

User reported remaining reminder refusal and delayed transition from listening after speech. They cannot recall the exact reminder wording. Inspection only; no product/settings/process changes in this round. Report generated 2026-09-15T12:38:14Z, build `t53-natural-barge-reminders`.

## Evidence

- Ordinary early interruptions accepted: 2; explicit: 0; final: 0; inconsistent-final and post-playback echo drops: 0. This supports the restored path firing, not complete acoustic acceptance.
- Reminder bridge last outcome is `personal-reminder-time-in-past`, last action clarify, draft active; pending/delivering/failed/notified all zero. It entered the local route but did not save. Exact requested time is unavailable, so cannot determine whether the time really was past or was misparsed. The deterministic past-time answer does not deny system capability; the reported broad refusal is not established by this redacted log. Unclaimed follow-ups/free chat remain possible, not proven.
- Applied ASR silence duration is 1500 ms. Last stop is explicit escape, with no provider/transport/dialog errors. Do not diagnose this report as a crash or idle-timeout exit.
- One pending-barge final timeout and recovery occurred. Main config sets at least 5000 ms recovery. A completed model turn has first delta at 3018 ms, final at 6819 ms, first TTS request at 6822 ms: visible model data existed roughly 3801 ms before final eligibility. This is consistent with final gating, not solely slow inference; counters/history do not conclusively correlate that turn with the timeout event.
- Other completed turns with a speech-stop timestamp show provider stop → final 132/216 ms and final → first audio queue 1553/1436 ms. Those provider-stop measurements do not include silence detection before the stop event. Physical end-of-speech to audible playback is not measured by this report.

## Synthetic reproduction

Current-item speech start → confirmed ordinary partial at 300 ms → accepted interruption → speech stopped. `interrupt()` resets speech evidence, so the stop is not retained (`receivedStopAt = null`); pending recovery remains 5000 ms. Repeating the identical partial rearms that 5000 ms timeout despite adding no content. No user data, network call or real microphone was used.

## Next scope

Preserve the successful early-yield behavior; fix pending-interruption end-of-speech ownership and bound recovery based on actual progress/end evidence, not every duplicate partial. Preserve continued speech and do not release unconfirmed speculation merely to change the UI label. Reconcile the existing user-selected 1500 ms endpointing with a low-latency mode explicitly rather than silently changing saved settings. Retain the reminder draft and provide truthful targeted past-time clarification; diagnose natural follow-up routing with synthetic examples without inventing the user's missing utterance. Additional content-free timing/routing evidence should distinguish endpoint wait, missing final, model wait and persistence outcomes. No new implementation or real acceptance claimed.
