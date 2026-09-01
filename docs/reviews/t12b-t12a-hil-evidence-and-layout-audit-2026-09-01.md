# T12B audit of T12A HIL evidence and Companion layout

## Evidence inherited from the user-present T12A run

- The physical EasyInput `AI 陪伴呼唤` action started the existing companion controller and explicitly interrupted an answer back to listening. This accepted behavior is preserved.
- The user accepted the practical idle behavior and completed a real multi-turn session.
- The supplied sanitized summary reported one session, saved values `endSmoothWindowMs=5000` and `idleTimeoutMs=60000`, nine accepted user finals, nine TTS turns and no provider/transport/dialog error.

These facts accept the call path and overall conversation continuity. They do not prove the exact provider partial-to-final interval because T12A exported only the saved renderer choices. They also do not prove final idle-stop lifecycle convergence because the final snapshot could still show the pre-completion stop counters.

## Rejected evidence gaps

1. **Saved was presented as applied.** The diagnostic export copied renderer settings into one flat endpointing object. It could not distinguish what had been saved after a session began from what the active provider and idle timer had actually frozen.
2. **No sentence-boundary timing metric.** T12A had no content-free interval between the last provider partial and its final, so a configured five-second value was not observable as runtime behavior.
3. **Stop evidence was emitted too early.** The controller emitted terminal idle before incrementing the final completion counters and emitted no later lifecycle event. A renderer/export taken in that gap could report `requested=1`, `completed=0`, `result=never` after an internally completed idle stop.
4. **The face was stretched by layout ownership.** The overview grid used `align-items: stretch`; both columns used full height; the stage imposed a 720 px minimum; and the face grew as `flex: 1` with a 410 px minimum. The taller settings column therefore elongated the face instead of allowing independent column heights.
5. **Settings were not an explicit transaction.** Preset controls changed persistent renderer state, while an App effect automatically called the main preference setter. This blurred editing, saving and active-session behavior.

## Selected repair

- Replace the stretch chain with independent self-height columns and a bounded `3:2` face stage.
- Keep a renderer draft until one Save action validates and main performs atomic write/readback.
- Snapshot the saved revision exactly once before each new controller session and pass the same frozen values to every provider created by that session.
- Export saved and session-applied numeric evidence separately. Add only an interval/count timing metric.
- Emit a final `stop.lifecycle` event after stop completion and merge its bounded metadata in the renderer without reopening the floating overlay.

## Scope and safety

This audit used the supplied bounded facts and repository sources and did not open a user diagnostic file, access credentials, text, audio, ports or devices, or modify either firmware. The T12B package itself was never launched. Before the active task was corrected after a context handoff, existing T12A processes were mistakenly restarted once; no further application control occurred.
