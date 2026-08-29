# DeskMate Companion foreground session v1

Status: `FOREGROUND_SESSION_V1_FROZEN`

Scope: a pure Windows-side domain contract for mutual exclusion between the existing text-dictation workflow and the new Companion conversation workflow. It does not define any board protocol, cloud provider, audio codec, persistence format, Electron IPC, UI control, or Xiaozhi behavior.

## Ownership

At any instant exactly zero or one foreground session owns audio capture, realtime provider events, reply playback, and companion-visible state.

```text
mode := "dictation" | "companion"
sessionId := non-empty opaque string
generation := strictly increasing positive integer
```

## Commands and events

| Input | Required behavior |
| --- | --- |
| `start(mode, sessionId)` while idle | Acquire the session and emit `acquired`. |
| `start(mode, sessionId)` while another session is active | Emit `stopping` and `released` for the old session, revoke its event/playback permission, then immediately acquire the new session. The old session is not queued. |
| `stopped(sessionId, generation)` | The old session has already been revoked by replacement; acknowledge it only as `ignored_stale` and never release the replacement session. |
| `finish(sessionId, generation)` | Return to idle only if it matches the active session; otherwise ignore as stale. |
| `emergencyStop()` | Revoke the active session and return to idle; it takes precedence over all starts. |

Consumers must accept provider/UI events only when both `sessionId` and `generation` equal the active lease. Late events from a cancelled or replaced session are discarded locally, even if an upstream provider cannot cancel immediately.

## Required emitted facts

The pure arbiter emits normalized facts only: `acquired`, `stopping`, `released`, `finished`, `emergency_stopped`, and `ignored_stale`. Each fact includes the relevant mode, session ID, generation, and a reason when applicable.

## Explicitly excluded

- No automatic persistence of ASR partials, transcripts, audio, or memory.
- No virtual-key output, Windows application launch, Host Action, DeskMate Link, firmware, UART, servo, OLED, or provider-specific cancellation packet.
- No second VoiceWorkflow. Existing VoiceWorkflow integration is a later adapter task and must use this arbiter rather than clone recording logic.

## Tests required before integration

1. Dictation interrupts Companion and stale Companion reply/TTS events are rejected.
2. Companion interrupts Dictation and unfinished Dictation text is not committed by the arbiter.
3. Repeated late stop/finish events do not release the replacement session.
4. Emergency stop prevents every late event and leaves the arbiter idle.
5. Repeated start/stop calls are deterministic and do not create two owners.
