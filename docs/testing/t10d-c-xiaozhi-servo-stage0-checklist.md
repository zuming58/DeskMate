# T10D-C Xiaozhi servo Stage 0 and Stage 1 checklist

Status: `NOT_RUN / USER_PRESENT_REQUIRED`

This checklist is a prerequisite for producing an enabled calibration profile.
It is not a flash command and does not itself authorize wiring, power, PWM or
motion.

## Current installed image history

- On 2026-08-30 the Xiaozhi board received the authorized T09 app-only image
  from commit `b26e99e...`.
- On 2026-08-31 it received the authorized T09.1 app-only image from commit
  `65144a1...`; exact readback and normal boot were completed.
- No T10A, T10C or T10D manual-motion change has been flashed afterward.
- Therefore the current board is T09.1. It is not stock/葡萄 firmware and it is
  not a board that has never been flashed. Its `UNKNOWN_TYPE (1)` response to
  the T10C status request is expected because that image predates messages
  `0x20/0x21`.

## Stage 0: power removed, no servo output

Record date, operator and photos or measurement notes for every item. Leave the
build gate disabled if any result is missing, ambiguous or failed.

- [ ] Board identity and mechanical assembly match the intended Xiaozhi unit.
- [ ] Both axes can be inspected without binding; load/horn condition is
      recorded. Do not force an axis through a stop.
- [ ] With all power removed, continuity verifies installed yaw signal to
      ESP32-S3 GPIO11 and installed pitch signal to GPIO12; ground identity is
      recorded. The fixed reference alone is not an installed-board test.
- [ ] Servo supply voltage and a conservative current capacity are measured and
      recorded. Servos do not draw their power through USB or an unverified
      logic rail.
- [ ] The servo supply and controller use a verified common ground.
- [ ] A reachable physical action removes servo power immediately without
      relying on software; the operator has rehearsed it before any PWM.
- [ ] Brownout/reset monitoring and stop criteria are agreed before power-up.
- [ ] For yaw, provisional center pulse, logical direction, conservative minimum
      and maximum pulse and pulse-per-degree are measured and reviewed.
- [ ] The same five values are measured and reviewed independently for pitch.
- [ ] Neither center nor limit is copied from the reference nominal 90-degree
      configuration. Direction and mechanical limits are not guessed.
- [ ] A separate review records the exact Kconfig profile and confirms every
      verification flag before building a Stage 1 image.

If any item is not complete, stop at the default Stage 0 image. It may be used
only after separate flash authorization to verify Link/status compatibility;
it cannot produce PWM.

## Stage 1: first user-present single-axis calibration

This section is blocked until Stage 0 is signed off and a separately reviewed,
enabled calibration image is authorized.

1. Keep the second axis unconfigured. Select exactly one axis in the DeskMate
   UI.
2. Confirm all four frozen safety attestations.
3. Create a 1000..5000 ms one-use ARM token.
4. With a hand on the physical power cutoff, request provisional center once.
5. Stop immediately on a jump, buzz, stall, collision, excessive current,
   brownout or unexpected direction.
6. Re-arm for each individual fixed 1-degree step. Never issue continuous or
   arbitrary movement.
7. Recenter with a newly issued ARM token before ending the axis trial.
8. Exercise e-stop and verify power/output disable behavior before considering
   the second axis.
9. Disconnect and reconnect the Link, then reboot each endpoint; confirm it is
   locked, disarmed and does not replay old output.

Completing Stage 1 does not enable preset gestures, dancing, expression-linked
movement or the normal `MOTION` capability. Those require later accepted
centers, directions, conservative limits and a separate production package.
