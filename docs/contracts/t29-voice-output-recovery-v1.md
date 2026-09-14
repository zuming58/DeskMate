# T29 voice insertion and model connection recovery

Status: `T29_SOFTWARE_SLICE_FROZEN`, 2026-09-12, user-authorized repair.

T30 supersedes direct native SendInput with resident STA WinForms paste after
owned-window reproduction; [details](./t30-voice-insertion-day-context-v1.md).
The expiry and exact-focus gates remain.

## Evidence and reference review

The 2026-09-11 23:55 diagnostic records eight accepted companion finals: five completed, one interrupted and two pre-delta network failures after 10685 / 10470 ms. No ASR/TTS transport failure or fatal session exit was recorded; the user ended sessions with Escape. Network subtype is unavailable in that export. Do not label this a microphone failure or claim to have repaired the upstream network.

The previous raw-dictation audit demonstrates about 1.3 seconds of PowerShell/WinForms startup per insertion. Earlier native migration was rejected in HIL for target capture changes (see the focus-boundary lesson). This slice therefore **preserves the known stable recording-start PowerShell capture** and changes only output execution, retaining the exact captured HWND and the bounded 300 ms match wait. The T22 native INPUT ABI correction remains in force; no firmware/HID writes.

Reference behavior comparison: talktalk `9d3f3e49b875d9c4aa419ae91c9b086817f2d396` uses in-process insertion; DeskMate will use its own resident bridge, not copied reference code. For model transport, [OpenAI Node v5.23.2 client](https://github.com/openai/openai-node/blob/v5.23.2/src/client.ts) retries pre-response connection/5xx failures with bounded delays. DeskMate's narrower implementation permits only **one** retry before successful HTTP response consumption, never replaying streamed text/audio. No SDK code is copied and no dependency/provider is changed.

## Output gate

- Dictation writes clipboard text in main and sends only version, request ID, exact target HWND and expiry to the resident native helper. Native rejects expiry, invalid/changed/invisible target, busy/unavailable helper and incomplete SendInput; never activates a different window. Poll only the captured HWND for at most 300 ms. An expired queued command must not type later.
- Keep original capture stable; never recapture a target at output time. No PowerShell fallback or automatic second paste after an uncertain acknowledgement. Preserve explicit clipboard fallback and original/history persistence.
- Raw completion says input completed, not cloud organization completed. Add bounded output and persistence-wait timing without recording text, HWND or paths. Preserve the existing single voice workflow.

## Companion connection gate

- Retry once only on connection rejection or HTTP 5xx before reading a successful response; same immutable request body, same user context entry, same abort signal and existing overall request deadline. No retry on auth, ordinary 4xx, cancellation, total timeout, malformed/partial response or TTS failure. Do not retry private speculative drafts; a failed discarded draft cannot amplify requests.
- A confirmed/adopted turn may show a content-free delayed-response notice after three seconds without an assistant delta, and a retry notice when applicable. Retry and status callbacks are scoped to the current turn/generation; stop or recognized interruption prevents late requests or UI resurrection. These notices are not model text, speech or memory.
- Exhaustion preserves T28's return-to-listening behavior with visible error. The capsule must honor an explicit listening/error message instead of replacing it with `请开始说话`. Do not infer reliable remote delivery or acoustic response time from queue metrics.
- Reuse capsule DOM nodes and one shared presenter for both sources. Only show an invisible window; cancel terminal timers on new snapshots and reject stale timer generations. Success remains visible for 700 ms, failure/cancel for 1800 ms; no new workflow or focus activation.
- Record HTTP attempts and a strict allowlist of network cause codes. Never export raw error messages/causes, endpoint, credentials, text or item identity.

## Verification

Synthetic: native request expiry/target/no text, busy/failure/late ACK, preserved capture, raw wording; failed model then success with one context entry, two failures bounded, auth/cancel/no replay after stream, draft no retry, delayed/retry notices ownership and diagnostic redaction. Run full desktop tests, native self-test and exact package verification. User-present focus/paste and acoustic/network recovery remain separately labeled until observed.
