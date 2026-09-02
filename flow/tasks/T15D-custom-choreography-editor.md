# T15D custom choreography editor

Status: `DESIGN_ACCEPTED / SOFTWARE_EDITOR_IN_PROGRESS / WIRE_NOT_FROZEN`

## Goal

Turn the motion page into a playful, truthful beat editor: two simultaneous
motion rows plus one synchronized expression row, backed by a bounded Xiaozhi
local program instead of Windows timing or manual calibration replay.

## Work split

- DeskMate Windows task: editor, local persistence, strict semantic compiler,
  software preview, adapter readiness gate, tests, package, and handoff.
- Main Agent: T15 physical preset closure, additive contract/golden vectors,
  EasyInput forwarding, Xiaozhi scheduler/display arbitration, integration and
  total Flow.

## Gates

- Do not freeze or implement new firmware wire IDs before the current four T15
  preset HIL is complete.
- Do not present software preview as Xiaozhi execution.
- Do not flash either board without a new exact-image audit and explicit per-board
  authorization.

Detailed product design: `docs/design/t15d-choreography-editor-v1.md`.

