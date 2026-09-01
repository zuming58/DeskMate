# T11D.4 dialog-error root diagnostics v1

Status: `T11D4_DIALOG_ERROR_ROOT_DIAGNOSTICS_V1_FROZEN`

Implementation status: `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`.

This Windows-software-only slice supersedes T11D.3. It restores the official same-WebSocket, same-session multi-turn boundary and preserves enough privacy-safe evidence to classify a future `DialogCommonError` without inventing provider behavior. It does not change microphone capture, speaker flow control, Agent expressions, firmware or hardware.

## Session continuity

- Provider event `359` is the end of the current TTS turn. After the matching local speaker drain succeeds, the current controller returns directly to `listening` on the same provider object and session.
- A normal completed answer must not transition through `connecting`, create a second connection or replay the initial greeting.
- `FinishSession` and `FinishConnection` remain explicit-stop operations. Transport loss may use the existing finite transport reconnect path, but provider event `599` is not transport loss.
- Conversation token and provider epoch continue to reject stale events. No PCM, transcript, reply or state is replayed.

## DialogCommonError boundary

The official event `599` payload has `status_code` and `message`. DeskMate treats it as terminal and fail-closed. It never ignores the event and never replaces the provider merely because it followed `tts.end`.

The adapter may expose only a closed `dialogErrorStatusClass`:

- `missing`;
- `invalid`;
- `request-invalid`;
- `empty-audio`;
- `audio-format-invalid`;
- `server-busy`;
- `server-internal`;
- `unknown-provider-error`.

The controller additionally records whether the error was `adjacent-tts-end` or `non-adjacent`, and its arrival phase. Raw status codes, messages, payloads and identifiers are forbidden.

## Diagnostic allowlist

The existing T11D.2 terminal counters and enums remain. T11D.4 adds only:

- `dialogErrorsAdjacentTtsEnd`, a bounded non-negative counter;
- `lastDialogErrorStatusClass`, from the closed enum above plus `none`;
- `lastDialogErrorAdjacency`: `none`, `adjacent-tts-end` or `non-adjacent`.

T11D.3 recovery counters and result enums are removed because a newly connected session was not a successful continuation.

## Acceptance

Automated tests must prove the official event-599 binary layout, redaction, fail-closed handling during active and drain phases, same-provider second-turn continuity after event `359`, zero reconnect/greeting replay on normal completion, and the existing long-answer/backpressure/stop/half-duplex/privacy regressions.

One later user-present run must use the exact packaged build. A normal long answer must return directly to listening and accept a second turn without `connecting` or a welcome replay. If event `599` still occurs, the sanitized status class, phase and adjacency select the next provider-specific repair; absence of that evidence is not permission to guess.
