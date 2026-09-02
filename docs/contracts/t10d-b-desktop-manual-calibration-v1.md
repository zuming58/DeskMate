# T10D_B_DESKTOP_MANUAL_CALIBRATION_V1_FROZEN

Status: `FROZEN` for the Windows software boundary. No firmware, hardware or
physical-motion authorization is included.

## Scope

This slice adds a fail-closed Windows control surface for the frozen
`EASYINPUT_MANUAL_CALIBRATION_HOST_V1_FROZEN` transport. The desktop may query
the current manual owner and request only these high-level operations:

- select yaw or pitch;
- create one short-lived arm lease after four explicit safety attestations;
- provision a center candidate;
- request one fixed `-1` or `+1` degree step;
- recenter;
- emergency stop;
- clear the emergency-stop lock.

There is no desktop field or IPC value for an absolute target, arbitrary step,
PWM, pulse width, duty cycle or GPIO. The desktop never writes a servo directly.

## Lifecycle and authorization

- A correlated `0x21` terminal status response is required before commands are
  enabled. EasyInput HID presence alone is not readiness.
- Only one manual-calibration request may be in flight.
- Request IDs are non-zero and increase within one USB mount epoch. Commands
  also have a distinct non-zero confirmation ID.
- ARM requires all four attestations: user present, unloaded linkage, current-
  limited independent servo supply, and an immediately reachable cutoff.
- The arm token is volatile and consumed by one provisional-center, step or
  recenter request. It is cleared by axis selection, emergency stop, clear,
  disconnect or remount.
- USB disconnect/remount clears the status gate, pending request, endpoint
  context and token. The next epoch must begin with another status query.
- Production Xiaozhi currently has no manual owner/real servo adapter; its
  truthful result is `NOT_READY`. The UI must keep output disabled in that
  state.

## Evidence model

The UI keeps three independent evidence layers:

1. user intent: a local request and confirmation ID were created;
2. EasyInput accepted: the exact request entered its single forwarding slot;
3. Xiaozhi terminal: the correlated endpoint response or rejection, including
   `completed_output_count`.

No layer is renamed to movement success. Even a terminal `completed` response
is protocol evidence, not proof of electrical safety, mechanical angle or
visible motion.

## Privacy and process boundary

- The .NET bridge validates exact 64-byte `0x16` requests before
  `HidD_SetFeature` and exact 64-byte `0x17` responses before relay.
- Raw report bytes are decoded in Electron main and removed before renderer
  delivery.
- Renderer status contains bounded enums, counters and opaque correlation
  numbers only. It excludes device paths, serials, MAC, IP, SSID, user text and
  hardware identifiers.
- Preload exposes only status, status query, a closed command object, and a
  sanitized event subscription.

## Acceptance boundary

Automated tests may close codecs, golden vectors, malformed-input rejection,
single-flight behavior, mount lifecycle, safety attestations, token use,
privacy and UI gating. They cannot close physical readiness or motion.

T10D-C requires separate user-present authorization and Stage 0 electrical and
mechanical evidence before any production firmware enables a motion adapter.
