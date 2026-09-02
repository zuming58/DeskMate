# T10D-D simple manual control v1

Status: `T10D_D_SIMPLE_MANUAL_CONTROL_V1_FROZEN`

This slice replaces the operator-facing T10D-B calibration ceremony with one
simple manual-control surface. It does not change the frozen DeskMate Link
`0x20/0x21` payloads or EasyInput HID `0x16/0x17` reports.

## Operator surface

The normal page exposes only:

- one environment confirmation and `Start manual control` action;
- press-and-hold left/right for yaw and up/down for pitch;
- release to stop issuing steps;
- one `Return to center` action;
- one always-available emergency stop.

The four protocol attestations, arm-token lifetime, axis selection, request
IDs and the three evidence layers are implementation and diagnostic details.
They are not separate controls. Arbitrary angles, PWM, pulse width, duty cycle
and GPIO remain absent.

## Existing-wire orchestration

- A fresh terminal status response is still required before starting.
- One environment confirmation applies only to the current foreground manual
  session. Windows expands it to the existing `0x0F` ARM safety flags.
- Start serially establishes both centers using the existing operations:
  `SELECT_AXIS -> ARM(fresh one-use token) -> PROVISIONAL_CENTER`, first yaw and
  then pitch. It stops at the first non-completed terminal response.
- A hold tick serially selects the requested axis when needed, creates a fresh
  one-use ARM token and sends one fixed `SINGLE_STEP`. The next tick is not
  created until the preceding Xiaozhi terminal response arrives.
- Hold ticks are limited to at most 4 per second. There is no client queue,
  catch-up or replay after a delayed terminal response.
- Recenter serially selects, arms and recenters yaw and pitch. Emergency stop
  remains highest priority and cancels the local hold loop immediately.
- Pointer release/cancel, window blur, hidden page, route exit, USB loss or Link
  loss stops producing new ticks. Disconnect/reboot keeps the inherited
  fail-closed and no-replay behavior.
- An inactive manual UI session expires after 60 seconds. Internal ARM leases
  remain 1000..5000 ms and are never shown as the user's control window.

`accepted` proves only EasyInput forwarding. Only the correlated Xiaozhi
terminal result and output count prove endpoint acceptance; neither proves a
visible or measured mechanical angle. These details remain available in a
collapsed diagnostic view rather than occupying the normal control surface.

## Xiaozhi reference-profile gate

The already flashed Stage 1 image is intentionally limited to 1489..1511 us,
so it can accept only one one-degree step on either side of center. It cannot
support a useful press-and-hold trial.

The separate Stage 2 candidate may use the exact fixed-reference operating
envelopes previously exercised successfully by this same assembled Xiaozhi:

| Axis | GPIO | Center | Candidate limits | Fixed step |
| --- | ---: | ---: | ---: | ---: |
| yaw | 11 | 1500 us | 1055..1944 us | 11 us |
| pitch | 12 | 1500 us | 1277..1722 us | 11 us |

These values remain adapter-local and never cross Windows, HID or DeskMate
Link. Normal `MOTION`, presets, dancing and expression-linked movement remain
disabled. The Stage 2 image is a new app-only candidate and requires its own
exact build verification and explicit flash authorization.

