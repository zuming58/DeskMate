# T10D-D simple manual control

Status: `CONTRACT_FROZEN / WINDOWS_IN_PROGRESS / XIAOZHI_STAGE2_CODE_BUILD_CONFIRMED / HIL_NOT_RUN`

## Objective

Turn the proven three-end manual-calibration route into a simple user-facing
press-and-hold control without changing its frozen wire formats.

## Deliverables

- Windows: one confirmation/start action, four hold controls, center and
  emergency stop; all select/ARM/token/evidence ceremony stays internal.
- EasyInput: no firmware or contract change. Continue forwarding one exact
  request at a time through HID `0x16/0x17` and Link `0x20/0x21`.
- Xiaozhi: a separate Stage 2 reference-profile overlay using the historical
  fixed-reference ranges that this same assembled unit previously ran.
- Verification: Windows focused/full tests and package; Xiaozhi Host tests and
  exact ESP-IDF v5.5.3 fixed-partition build; then one new explicitly
  authorized app-only flash and user-present hold/release/center/e-stop HIL.

## Acceptance

1. Start establishes yaw and pitch center or displays one concise rejection.
2. Holding each direction produces bounded serial one-degree steps; release
   produces no later step and delayed responses are never replayed.
3. Center returns both axes through terminal-gated operations.
4. Emergency stop remains immediate and recoverable on the next explicit
   start sequence.
5. UI does not expose checklists, leases, tokens, request IDs or evidence cards
   in the normal path.

No flash, hardware action or physical movement is authorized by this task card.
