# T10 motion safety core v1

Status: `T10_MOTION_SAFETY_CORE_V1_FROZEN`

Scope: Xiaozhi internal, host-testable arbitration only

Hardware output: prohibited in this slice

## Purpose

This contract freezes the safety semantics that must exist before any servo adapter, PWM output, motion DeskMate Link message, or user-visible mechanical action is allowed. It does not claim that the power path, servo direction, mechanical center, or limits are known.

## Hard gates

- Startup is fail-closed: calibration is not ready and no output is emitted.
- A usable calibration requires explicit evidence for the servo power path and common ground, plus center, direction, and both limits for each axis.
- Every axis must satisfy `minimum < center < maximum` and have a non-zero maximum step per service tick.
- A new session clears all queued intents and requires an explicit recovery/recenter intent. Old-session intents are rejected and never replayed.
- Emergency stop clears all intents, emits no further targets, and remains latched until explicitly cleared in the same live session. Clearing it always requires a new recenter.
- A latched fault clears all intents and cannot be cleared by a normal command.

## Single owner and priority

One `MotionSafetyCore` owns all motion intents. Its fixed priority is:

1. emergency stop or fault;
2. recovery/recenter;
3. dialogue action;
4. face tracking;
5. idle animation.

There is one bounded coalescing slot per non-emergency source. A newer sequence from the same source replaces its pending intent. Duplicate identical intents are idempotent; stale, conflicting, expired, out-of-session, or out-of-range intents fail closed.

## Output semantics

- Outputs are opaque calibrated actuator units, never PWM duty, pulse width, GPIO, or raw LEDC values.
- Each service tick moves each axis by at most its independently calibrated maximum step.
- A target is emitted once on acceptance and again only when the bounded next position changes; holding a reached target does not repeatedly rewrite it.
- Targets outside verified limits are rejected rather than silently widened.
- Reaching a normal target holds it only until that intent expires or a higher-priority intent wins.
- Reaching the explicit recenter target clears the recenter gate.

## T10A exclusions

T10A must not:

- include `driver/ledc.h`, call LEDC/MCPWM, name servo GPIOs, or initialize a servo driver;
- add or change DeskMate Link message IDs or framing;
- add a production call site in `app_main`;
- read or write Flash, NVS, otadata, eFuse, USB ports, or hardware;
- change OLED, T09 state mapping, EasyInput, desktop, audio, Wi-Fi, or cloud behavior.

## Next gate

T10B can add a disabled-by-default adapter and calibration workflow only while the user is physically present. It must first establish servo supply voltage/current capacity, common ground, safe mechanical center, direction, and small-step limits. No reference angle or pin value is accepted as real-board calibration evidence by itself.
