# T10D Windows simplified manual-control handoff

Date: 2026-09-02

## Exact delivery

- Branch: `codex/t10d-desktop-manual-control-ux`
- Base: `e9c23c1dd2a23631a9bd809b53e94188ea3a364b`
- Implementation commit: `76d33f44bb6211130c4b9ed97c17aaeb926d89fd`
- Final documentation commit: recorded by the final branch HEAD after this handoff is committed
- Scope: DeskMate Windows software only
- Classification: `SOFTWARE_ORCHESTRATION_TESTED / BUILD_CONFIRMED / HIL_NOT_RUN`

The main integration task reported the simplified control contract as `codex/t10d-d-simplified-manual-control@f18928f`. This software branch does not merge or rewrite that control/firmware branch. It keeps the existing T10C DeskMate Link operations `0x20/0x21` and Windows HID reports `0x16/0x17` byte-for-byte unchanged.

## User experience

The previous expert calibration form has been replaced by:

1. One checkbox: “设备周围无阻挡，我在设备旁”.
2. One start button: “开始手动控制（会先回中）”.
3. Four large press-and-hold direction controls.
4. “回到中心”.
5. An immediate stop that remains visible whenever the interface is available.
6. A collapsed “调试详情” section containing intent, EasyInput accepted and Xiaozhi terminal evidence.

Lease selection, explicit token generation, axis selection, four independent attestations and individual ±1° click buttons are no longer exposed in the normal UI. There is no arbitrary angle, pulse, PWM, duty, GPIO or raw report surface.

## Main-process orchestration

`ManualControlCoordinator` owns the only simplified session and delegates all wire work to the existing `ManualCalibrationController`.

### Start and center gate

After a read-only correlated status succeeds, start performs serially:

1. select Yaw;
2. ARM Yaw with the complete frozen safety flags, a fresh one-use token and 5000 ms lease;
3. establish the provisional Yaw center;
4. select Pitch;
5. ARM Pitch in the same manner;
6. establish the provisional Pitch center.

Any center failure leaves direction output disabled and exposes only “建立中心” recovery. No second motion state machine is created.

### Hold directions

Each semantic tick maps to one fixed output:

- left: Yaw `-1`;
- right: Yaw `+1`;
- up: Pitch `+1`;
- down: Pitch `-1`.

Post-HIL correction: the mapping above records this historical branch's initial implementation. User-present Stage 2 observation later proved the vertical semantics were reversed. The follow-on `codex/t10d-desktop-pitch-direction-recovery` changes only the Windows semantic transform to up → Pitch `-1` and down → Pitch `+1`; see `t10d-desktop-pitch-direction-recovery-2026-09-02.md`. The frozen wire and both firmware images remain unchanged.

For each tick the coordinator selects the axis only when needed, creates a fresh ARM and requests exactly one frozen single-step. The next tick is scheduled only after the prior Xiaozhi terminal. The minimum interval is 250 ms, so the rate never exceeds 4 Hz. No pending step is queued or replayed.

The continuation predicate is checked between select, ARM and output. Releasing while ARM is in flight prevents the later single-step request.

### Recenter, stop and lifecycle

Recenter runs Yaw and Pitch serially through select → fresh ARM → recenter. Immediate stop first suppresses every repeat, waits only for a current in-flight terminal and then issues the existing emergency-stop operation.

Post-HIL recovery addendum: this historical branch intentionally exposed stop but omitted an explicit clear/restart path. User-present HIL later proved the stop latched correctly and a subsequent start stayed locked. The follow-on `codex/t10d-desktop-emergency-stop-recovery` adds only an explicit, verified status → clear → dual-center restart transaction; see `t10d-desktop-emergency-stop-recovery-2026-09-02.md`. It does not weaken or automatically clear emergency stop.

Pointer release/cancel, lost pointer capture, window blur, hidden document, page leave, device disconnect, Link waiting/faulted/disabled and 60 seconds without activity lock the session. `center-required` remains recoverable without leaving the session; every other transport or endpoint failure exits fail closed and clears volatile ARM authority.

## Evidence boundary

The UI continues to display three independent facts:

- user intent;
- EasyInput accepted;
- Xiaozhi terminal.

When generic Link diagnostics are temporarily `unavailable`, a current correlated completed endpoint terminal may establish an effective connected label. This prevents a stale generic snapshot from hiding a proven current endpoint response. It does not prove physical motion.

`completed_output_count`, a successful terminal, the displayed direction and software build/test results do not prove axis direction, angle, center accuracy, mechanical clearance, current draw, limit behavior or emergency-stop hardware action.

## Verification

- `npm ci --include=dev`: passed.
- Focused manual-control, calibration, HID routing, Link diagnostics and native protocol regression: `41/41` passed.
- Full `npm test`: `310/310` passed.
- Packaged native bridge `--protocol-self-test`: passed.
- `npm run build:desktop -- --config.directories.output=release-manual-control-ux`: passed.
- `git diff --check`: passed.
- Diff under both firmware modules from the exact base: empty.

Package root: `release-manual-control-ux/win-unpacked`. Final artifact bytes and SHA-256 are filled from the final rebuild before delivery:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `DeskMate.exe` | 202690560 | `AF1F1BE1AD08367B9D2BE424D49A053880748EBBD7D2E8CE5D1B487BBD9BD842` |
| `resources/input-bridge/DeskMate.InputBridge.exe` | 153512841 | `B226849D883C947A160AC6FD0E6EE4AE4D492657551227D4371E5F4FD00215BD` |
| `resources/app.asar` | 112808866 | `F57067E1B1F1020161F5780E15F97FED8AD776CB5B1B31491199CD711046F0F3` |

Build outputs are ignored and are not committed.

## Remaining user-present HIL

After the main integration owner has selected one exact three-end baseline and the electrical/mechanical gates are satisfied:

1. Verify current physical position can be accepted safely as provisional center for each axis.
2. Verify left/right and up/down physical directions one short hold at a time.
3. Verify release, pointer cancel, focus loss and Link loss stop future movement.
4. Verify both-axis recenter behavior and soft limits.
5. Verify immediate stop and the real reachable cutoff.
6. Confirm no request backlog or old action replays after reconnect/restart.

No application, device/port, firmware, Flash/NVS/eFuse, OLED, audio, PWM or servo operation occurred in this package.
