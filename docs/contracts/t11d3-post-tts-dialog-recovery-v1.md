# T11D.3 post-TTS dialog recovery v1

Status: `T11D3_POST_TTS_DIALOG_RECOVERY_V1_FROZEN`

Implementation status: `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`.

This Windows-software-only slice handles one provider behavior selected by T11D.2 HIL: event `599` arrived immediately after a successful local playback drain. It does not change provider framing, microphone capture, speaker credit/drain, Agent expressions, EasyInput firmware or Xiaozhi firmware.

## Recovery eligibility

A `dialog-error` may recover only when all conditions are true:

- the conversation token and provider epoch are current;
- the session is active, listening and not stopping or already reconnecting;
- the preceding provider arrival is exactly this turn's `tts.end`;
- that `tts.end` completed a successful local AudioSink drain before the terminal arrived;
- the evidence has not already been consumed; and
- the per-user-turn recovery limit has not been reached.

An error frame, session failure, non-adjacent dialog error, error received during drain, failed/timeout drain, stopping session, old provider epoch or old conversation token remains fail-closed. Recovery replaces the provider through the existing finite reconnect path, transitions `connecting -> listening`, and never replays PCM, text or prior events.

Two recoveries are allowed without a new accepted user-final turn. A new real user-final proves forward progress and resets this streak. A third eligible recovery without that progress fails closed. Provider connection attempts remain bounded by the existing three-attempt policy. Stop and a new generation always win.

## Diagnostics

The T11D.2 allowlist is retained and adds only:

- `postTtsDialogRecoveryAttempts`;
- `postTtsDialogRecoverySucceeded`;
- `postTtsDialogRecoveryFailed`;
- `postTtsDialogRecoveryLimited`;
- `lastPostTtsDialogRecoveryResult`: `never`, `in-progress`, `succeeded`, `failed`, `limited` or `cancelled`.

No raw provider code/message/payload, PCM, transcript/reply, timestamps, identifiers, device details or paths may enter diagnostics.

## UI ownership

The main React window no longer renders a second bottom live bar. The companion page retains its face, state and controls. The independent, non-focus-stealing Electron overlay remains the only floating capsule.

## Acceptance

Host tests cover eligible recovery, non-adjacent and no-drain failures, error-frame closure, stop during recovery, old-provider events, bounded repeated recovery, forward-progress reset, recovery failure redaction, no audio replay, main-window capsule removal and Electron overlay retention. Full long-answer/backpressure/stop/half-duplex regression and Windows packaging remain mandatory.
