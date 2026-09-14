# T34B immediate capsule feedback

CAPSULE_START_FEEDBACK_V1_FROZEN — 2026-09-13, user-authorized software correction and restart.

- Accepted hardware/global/tray start shows the pre-created non-focusable capsule before waiting for foreground audio coordination. Preparing is not recording; timer/wave recording indicators begin only when capture succeeds.
- UI start uses the same preparing state in the existing VoiceSession reducer. Do not create another VoiceWorkflow or change target capture/paste.
- Duplicate starts while preparing are rejected. Escape invalidates pending startup; late device acquisition must release tracks and cannot resurrect recording. Errors exit preparation visibly.
- Respect floating-disabled, existing terminal timer ownership, microphone permissions, shared-source preemption and exact-target input safety.
- No firmware operations. Build and test in isolation; switch the real app only after an idle check, using normal application quit where possible. Actual key-to-visible latency still needs user observation; no claim of zero latency.
