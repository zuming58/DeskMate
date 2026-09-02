# T15D choreography editor V1

Status: `T15D_CHOREOGRAPHY_V1_NOT_FROZEN`

## Product decision

The custom choreography editor is feasible with moderate, bounded effort. The
grid itself is a Windows UI task, but deterministic real execution requires an
additive Windows -> EasyInput -> Xiaozhi contract. It must not be implemented by
rapidly replaying manual `+/-1 degree` calibration commands.

The existing four presets remain available as **Quick actions**. The new editor
is a separate **Custom dance** flow and does not replace the accepted manual
control or the still-pending T15 physical preset acceptance.

## Editor model

- One choreography contains 2 through 8 beats; the default is 6 beats.
- Three aligned rows share the same beat columns:
  - `Yaw`: hold, left, center, right.
  - `Pitch`: hold, up, center, down.
  - `Expression`: hold, idle, listening, thinking, working, waiting, completed,
    or error.
- All non-hold values in one column begin together. Columns execute in order.
- One global beat duration is selected from 400, 600, 800, or 1000 ms.
- The full choreography repeats 1 through 3 times.
- Completion, stop, disconnect, fault, and emergency-stop recovery all end with
  the existing bounded center behavior. Normal completion restores the latest
  external Agent display state after releasing a temporary choreography display
  lease.
- A choreography name is 1 through 20 visible characters. Windows may keep at
  most 8 saved custom choreographies.

## Interaction

1. Choose **Quick actions** or **Custom dance**.
2. In Custom dance, choose one semantic token in each row for every beat.
3. Use **Software preview** to inspect timing without claiming hardware output.
4. Use one primary **Run on Xiaozhi** button only when the complete real chain is
   ready. Keep **Stop and center** and **Emergency stop** visible.
5. Show one progress cursor over the current beat and one truthful terminal
   result. Never use arrow-shaped preset buttons that can be mistaken for manual
   directional control.

## Safety and validation

- At least one beat must contain a non-hold value.
- Values are strict enums and unknown or additional fields are rejected.
- Yaw and Pitch tokens map only to Xiaozhi-owned Stage 2 safe poses. No angle,
  range, speed, PWM, pulse width, duty cycle, or GPIO is accepted from Windows.
- Xiaozhi owns timing. Windows sends one bounded program and does not stream each
  beat in real time.
- One choreography may run at a time. A second run returns busy and is not queued.
- Request IDs remain monotonic and duplicate requests are idempotent. Disconnect
  clears the in-flight request and never replays it.
- Emergency stop has the same highest priority as the accepted manual-control
  and T15 preset paths.

## Candidate transport budget

The additive wire slice is intentionally not frozen until the four T15 presets
complete physical acceptance. The candidate is:

- Host HID Feature/Input: new independent report pair, not `0x18/0x19`.
- DeskMate Link: new run/status message pair, not `0x22/0x23`.
- One request contains a small header plus at most 8 beats. Each beat contains
  only three semantic enum bytes, so it fits the existing 63-byte HID payload and
  128-byte Link payload without fragmentation.
- Endpoint status reports request identity, state, current beat, completed loops,
  terminal result, logical-center acceptance, display-lease state, fault, and
  emergency-stop state. It is protocol evidence, not proof of physical angle or
  mechanical safety.

## Delivery order

1. Finish the current fixed-preset UI clarity repair and run the ordered T15
   physical preset acceptance.
2. Windows may build and test the editor, local storage, strict compiler, and
   disabled semantic adapter in parallel.
3. After T15 HIL, freeze Host and Link vectors, then implement Xiaozhi local
   scheduling/display lease and EasyInput one-request forwarding.
4. Merge Windows transport, rebuild all three ends, request separate app-only
   flash authorization for each board, and perform custom choreography HIL.

