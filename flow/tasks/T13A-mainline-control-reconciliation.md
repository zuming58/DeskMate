# T13A - Mainline control reconciliation

## Status

`COMPLETE / DOCUMENTATION_ONLY / NO_IMPLEMENTATION_MERGE`

## Objective

Restore one authoritative project control plane after the T11F hardware integration line and later T12 Windows software line diverged.

## Inputs

- Main integration: `codex/t11f-three-end-integration@ee0ac8418b1d7c0497f72e3edc67b5ee39b232d4`.
- Software candidate: `codex/t12b1-provider-endpointing-repair@710595f0b8b4bd209721fef9c6a96d5b80f43481`.
- Xiaozhi motion candidate: `codex/xiaozhi-t10c-manual-calibration@b83ce886ec8efd1fea288a65e0127d2a887d5883`.
- Xiaozhi OLED polish: `codex/xiaozhi-oled-animation-polish@8d6af0cd38fb3fed85ceba03bcd99857dd1e552e`.
- EasyInput microphone and speaker branches recorded in the current integration map.

## Deliverables

- One main-agent control branch based on T11F.
- A current branch/evidence/status matrix in `docs/status/current-integration-map-2026-09-02.md`.
- Unified priorities and ownership in `flow/plan.md`.
- Reconciliation handoff at the top of `flow/progress.md`.
- Stable integration-owner decision and reusable branch-local Flow lesson.

## Non-goals

- Do not merge the unaccepted T12B.1 software code.
- Do not modify desktop, EasyInput or Xiaozhi implementation sources.
- Do not launch the app, access hardware, flash, monitor, drive OLED/PWM/servo or change credentials.

## Acceptance

- Exact branch/HEAD and evidence for all three tasks are present.
- Code/build, HIL and mainline integration are separately classified.
- Dirty primary worktree is preserved.
- The next user gate and post-gate integration action are explicit.
