# T15D choreography editor V1

Status: `T15D_CHOREOGRAPHY_V1_FROZEN / THREE_END_CODE_BUILD_CONFIRMED / HIL_PENDING`

## Product decision

The custom choreography editor is feasible with moderate, bounded effort. The
grid itself is a Windows UI task, but deterministic real execution requires an
additive Windows -> EasyInput -> Xiaozhi contract. It must not be implemented by
rapidly replaying manual `+/-1 degree` calibration commands.

The existing four presets remain available as **Quick actions**. The editor is
a separate **Custom dance** flow. A saved choreography may be marked as the
default dance; then quick-action or explicit voice “跳舞” executes that program.
With no default selected, “跳舞” uses the built-in program.

## Editor model

- One choreography contains 2 through 8 beats; the default is 6 beats.
- Three aligned rows share the same beat columns:
  - `Yaw`: three compact choices, left, center, right.
  - `Pitch`: three compact choices, up, center, down.
  - `Expression`: three dance-friendly choices, completed/happy,
    thinking/curious, and working/focused. Each uses the shipped expression
    image asset rather than an emoji or synthetic face.
- In every row, no selected choice means `hold`. Clicking the selected choice
  again clears it back to `hold`; no extra hold button occupies the grid.
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
3. Use **Software preview** to inspect the compact beat cursor and three-track
   text summary without rendering a second large face or claiming hardware
   output.
4. Use one primary **Run on Xiaozhi** button only when the complete real chain is
   ready. Keep **Stop and center** and **Emergency stop** visible.
5. Show one progress cursor over the current beat and one truthful terminal
   result. Never use arrow-shaped preset buttons that can be mistaken for manual
   directional control.
6. Keep Save, Software preview, Run on Xiaozhi, Stop and center, and Emergency
   stop in one compact wrapping action bar immediately below the editor grid.

## Safety and validation

- At least one beat must contain a non-hold value.
- Values are strict enums and unknown or additional fields are rejected.
- Yaw and Pitch tokens map only to Xiaozhi-owned Stage 2 safe poses. Windows may
  select one closed strength profile (`gentle/standard/vivid`) and one closed
  tempo profile (`relaxed/standard/quick`). No raw angle, arbitrary speed, PWM,
  pulse width, duty cycle, or GPIO is accepted.
- Xiaozhi owns timing. Windows sends one bounded program and does not stream each
  beat in real time.
- One choreography may run at a time. A second run returns busy and is not queued.
- Request IDs remain monotonic and duplicate requests are idempotent. Disconnect
  clears the in-flight request and never replays it.
- Emergency stop has the same highest priority as the accepted manual-control
  and T15 preset paths.

## Frozen transport

The fixed T15 presets completed physical acceptance. The additive slice is now
frozen as:

- Host HID Feature/Input: `0x1A/0x1B` on `FF00:0009`.
- DeskMate Link: `0x24 RUN_CHOREOGRAPHY` and `0x25 GET_CHOREOGRAPHY_STATUS`.
- One request contains a small header plus at most 8 beats. Each beat contains
  only three semantic enum bytes, so it fits the existing 63-byte HID payload and
  128-byte Link payload without fragmentation.
- Endpoint status reports request identity, state, current beat, completed loops,
  terminal result, logical-center acceptance, display-lease state, fault, and
  emergency-stop state. It is protocol evidence, not proof of physical angle or
  mechanical safety.

## Delivery and acceptance

1. Windows editor, persistence, real transport, default-dance routing and motion
   settings are implemented and packaged.
2. EasyInput forwarding and Xiaozhi scheduling/display ownership are implemented;
   both host suites and exact ESP-IDF builds pass.
3. Request separate app-only flash authorization for each board.
4. User-present HIL runs built-in actions, all three strength/tempo profiles,
   one custom program, default voice/quick dance, stop/center and emergency stop.
