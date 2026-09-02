# T12A companion pause, identity and call contract v1

Status: `T12A_COMPANION_PAUSE_IDENTITY_CALL_V1_FROZEN`

## Product boundary

- Windows DeskMate software only. No EasyInput firmware, Xiaozhi firmware, HID report, GPIO, OLED, servo, speaker or Flash change.
- The existing `CompanionConversationController`, VoiceWorkflow arbitration and T11D.6 strict half-duplex path remain the single runtime authority.
- T11D.6 user-present acceptance is inherited: one continuous connection, no reconnect/provider/transport/dialog failure, long answers complete, explicit interrupt returns to listening.

## Companion endpointing

- The per-utterance provider silence window is companion-only and is sent in Doubao `StartSession.asr.extra.end_smooth_window_ms`.
- Allowed values are `2000`, `3000`, and `5000` ms. Default and recommended is `5000` ms.
- The independent conversation idle timeout is armed only in `listening`. Allowed values are off (`0`), `30000`, `60000`, and `120000` ms; default is `60000` ms.
- `connecting`, `thinking`, `speaking`, playback `draining`, reconnecting and stopping never accumulate idle time. An accepted non-empty user final or explicit call resets/cancels the timer.
- Idle expiry uses the normal bounded stop path and ends as `listening-idle-timeout`; it is not a provider error and must display “长时间未说话，已结束”.
- Ordinary dictation and voice editing retain their existing endpointing.

## Identity and future wake boundary

- Default companion name is `小言`; default configured wake phrase is `你好，小言`.
- Identity is locally persisted and supplied to the provider only when the user starts a realtime conversation. It is excluded from diagnostic exports.
- `wake-word-adapter-v1` is a versioned capability boundary. V1 is unavailable and disabled: it opens no microphone, holds no provider session and makes no wake claim.
- A future wake implementation must be local/offline, explicit opt-in, visibly indicate microphone ownership and acquire the existing foreground audio owner. No wake engine or model is approved by this contract.

## EasyInput Host Action

- Existing frozen Maker `host_action_v1` is reused without a protocol change.
- Reserved canonical UUID: `f11135b4-7471-47f1-808a-629ae99eb63b`.
- Renderer action: `companion-call`; label: `AI 陪伴呼唤`.
- The UUID is reserved and never enters `AppActionStore`, never maps to an executable and never appears as “打开应用”. Unknown UUIDs continue to fail closed.
- Inactive/completed/error starts one companion session and enters listening. Listening stays active and resets the idle timer. Thinking/speaking/draining uses the existing explicit interrupt-and-listen path. Connecting/stopping/reconnecting deduplicates as busy.
- Repeated call never ends the full conversation. Only UI stop, Escape or idle timeout ends it.
- S1-S8 editing uses the existing read-preview-confirm-write-ACK/readback transaction and requires `host_action_v1`. A software “测试此动作” entry dispatches through the same main-process behavior without requiring a physical key.

## Privacy-safe diagnostics

- Diagnostics expose only the two validated numeric endpointing enums and existing bounded lifecycle counts.
- Companion name, wake phrase, provider content, transcript, reply, PCM, credentials, network/device identity and application paths are forbidden.

## Acceptance

- Automated: provider request, settings migration/persistence, fake-clock idle ownership, call dispatch/interruption, Host Action roundtrip, unknown UUID fail-closed, UI boundary and diagnostic privacy.
- User-present: software test action; bind one key through preview/confirm; idle to listening; speaking to explicit interrupt/listening; 60-second listening idle normal end; one utterance containing a five-second pause.
