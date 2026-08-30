# T09 three-end agent-state acceptance

Date: 2026-08-31  
Scope: Desktop -> EasyInput -> DeskMate Link -> Xiaozhi OLED  
Safety boundary: no servo PWM or Xiaozhi audio initialization

## Confirmed HIL

- Normal boot: Xiaozhi starts with the neutral two-eye scene. This confirms the OLED owner and the T09.1 UART task can start together.
- Read-only Link health: two snapshots remained `connected`; RX/TX advanced from `26/38` to `31/43` while timeout and retry counters stayed at `4/8`.
- Single state: `listening` was accepted and visibly rendered. Agent counters became `accepted=1`, `forwarded=1`, with no disconnected or queue drops.
- TTL: `thinking` visibly rendered as the asymmetric thinking scene and automatically returned to neutral idle after expiry.
- Frozen seven-state matrix: `listening`, `thinking`, `working`, `waiting`, `completed`, `error`, and `idle` were sent and the user confirmed every corresponding scene. After the sequence the Link remained connected at RX/TX `137/149`; agent counters were `accepted=10`, `forwarded=12`, `malformed=0`, `dropped_disconnected=0`, `queue_drops=0`.
- Latest wins: a rapid `listening -> thinking -> working -> completed` sequence ended at the expected happy/completed scene with no visible problem. The Link remained connected at RX/TX `151/163`; agent counters were `accepted=14`, `forwarded=16`, `queue_drops=0`.

## Interpretation

The real three-end state path, seven frozen state mappings, TTL-to-idle behavior, and latest-wins behavior are HIL-confirmed. These results do not authorize or validate any servo movement. Motion remains disabled in production and Xiaozhi audio remains disabled by product policy.

## Deferred manual regression

The user left the hardware powered and connected but is not available for physical intervention. The following remain explicit manual gates:

- physical Xiaozhi reset while a non-idle state is active, followed by proof that stale state is not replayed;
- physical Link disconnect/reconnect after T09.1, followed by proof of automatic recovery and no stale replay;
- optional broader T03-T06 desktop regression on the currently accepted application build.

No remote reset, disconnect, flash, erase, NVS/otadata/eFuse write, servo action, or audio action is permitted to close these deferred items.
