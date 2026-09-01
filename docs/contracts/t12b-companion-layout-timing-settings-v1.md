# T12B companion layout, timing settings and evidence contract v1

Status: `T12B_COMPANION_LAYOUT_TIMING_SETTINGS_V1_FROZEN`

## Product boundary

- Windows DeskMate software only. EasyInput and Xiaozhi firmware, HID reports, DeskMate Link, OLED, servo, audio hardware and Flash remain unchanged.
- The accepted T12A physical `AI 陪伴呼唤` action and the single `CompanionConversationController` remain authoritative.
- T12B corrects the Companion layout, makes preferences explicitly saved, freezes settings per session and adds content-free timing/lifecycle evidence. It does not add another voice state machine or microphone owner.

## Companion layout

- The overview has two independent self-height columns. The left column contains the bounded realtime companion card followed immediately by the Xiaozhi work-state test. The right column contains memory, companion settings, devices/services and the voice ownership notice.
- The face keeps a bounded `3:2` stage and existing expression assets. Grid stretch, `height: 100%`, large fixed minimum heights and flex growth may not elongate the face.
- Below the desktop breakpoint, the same semantic order becomes one column. The hardware-state test remains directly after the realtime card.

## Explicit settings

- Name is 1–32 characters. Wake phrase is 1–64 characters.
- Provider utterance pause is `500..50000` ms in exact `500` ms steps.
- Listening-only idle stop is disabled by `0`, or `10000..3600000` ms in exact `1000` ms steps.
- Editing a field changes only a renderer draft. One explicit **保存陪伴设置** action validates, writes atomically in Electron main, rereads the stored file and reports success only after exact readback.
- Invalid input and failed readback preserve the previous saved preferences.

## Per-session ownership

- Electron main is the startup and persistence authority. React never continuously writes companion preferences.
- A new conversation snapshots one saved preference revision. Name, wake phrase, provider pause and idle stop remain frozen for that session, including finite provider reconnects.
- Saving while a session is active changes only the next session. The active provider identity, pause, idle policy and visible active-session name do not hot-switch.
- Computer/EasyInput microphone selection remains an independent start option and is not persisted through the companion-preference API.

## Privacy-safe evidence

- Diagnostics expose `saved` and `sessionApplied` endpointing separately, with bounded numeric values and a process-local revision. Before any session is configured, `sessionApplied` is `unavailable`.
- The provider partial-to-final metric contains only the most recent bounded interval in milliseconds and a sample count. It contains no partial/final text, transcript, reply, audio, provider payload or identifier.
- An internally triggered listening idle stop emits final lifecycle evidence after completion, so a completed stop cannot remain `requested=1 / completed=0 / result=never`.
- Companion name and wake phrase remain outside diagnostic exports.

## Acceptance

- Automated: bounds and invalid drafts; no write while editing; atomic write/readback; session freeze; reconnect freeze; partial-to-final metric; idle completion event; renderer convergence; diagnostic privacy; independent layout; responsive order and all inherited regressions.
- User-present later: visually confirm the bounded face at 1440×1024 and a smaller window; save custom timing, start a new session and compare saved versus applied evidence; confirm an active session retains its old parameters until restarted.
