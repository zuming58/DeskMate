# Second computer handoff - T05 second rework

## Starting point

- Continue branch: `codex/easyinput-t05-config-nvs`
- Audited candidate: `c6c6c64d7c595375eb74f3651b50df2950801aff`
- Frozen product base: `a2adc9818da07119e59a6f14d125fc23576696c9`
- Read the audit from the latest `origin/main` without merging or rebasing the product branch:

```powershell
git fetch origin
git show origin/main:docs/reviews/t05-easyinput-config-nvs-second-audit-2026-08-27.md
git show origin/main:flow/tasks/T05-easyinput-config-nvs.md
```

If the checked-out T05 branch is not clean or does not contain the audited candidate in its history, stop and report the exact state.

## Mandatory reference-first step

Before editing production code, read the fixed Maker reference at commit `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`:

```text
F:\Codex\easyinput-wzm\easy-input-maker
```

At minimum compare `config_payload`, `config_state`, status/config HID receiver, NVS store, and their Host tests. Update T05 provenance with a Maker→DeskMate behavior/test-vector table. DeskMate remains an independent implementation under its frozen contract; do not copy the Maker runtime wholesale, do not read its dirty worktree, and do not invent a replacement before the applicable reference failures are represented as DeskMate tests.

## Test-first rework scope

Add failing tests first, then make the minimum production changes for all of these items:

1. exact `0x13` Feature Report length and bounded copy;
2. strict, bounded, non-throwing JSON/UTF-8/escape/surrogate/numeric parsing based on applicable Maker failure vectors;
3. encoder cursor assignment and a host-visible all-release before configuration replacement;
4. native read registration before send, synchronization, new-request reset, disconnect/cancel, last-valid-progress timeout, identical duplicate metadata, zero padding and reserved bytes;
5. one configuration transaction per USB epoch, with stale save/read results discarded across unmount/remount;
6. legal `0x13` status flags, `config_read_v1`/`config_write_v1` capability reporting and desktop capability gating;
7. complete dual-slot NVS interruption/failure matrix, legacy import when the new namespace is unavailable, and correct `Recovery` source;
8. board-first UI state, selected JSON-pointer patch paths, visible sanitized diff, token-bound commit and corrected user text;
9. clean-build reproducibility with exact ESP-IDF v5.5.5, isolated absolute `SDKCONFIG`, fixed partitions, image size and SHA-256.

Do not start T06. Do not add fixed text, open-app/Host Action execution, BLE, Wi-Fi provisioning, audio, DeskMate Link or Xiaozhi work.

## Verification and stop gate

Run the full firmware Host suite, ESP-IDF v5.5.5 `esp32s3` clean builds, `npm ci --include=dev`, `npm test`, `npm run build:desktop`, `git diff --check`, provenance/license, credential, ASCII path, tracked-artifact and AGENTS/CLAUDE consistency checks.

Update `flow/progress.md` and T05 provenance, commit and push the same branch, report the final HEAD and evidence, then stop. Do not merge `main`, scan ports, identify a device, read or write Flash/NVS, flash, erase, monitor or claim HIL. The original computer will perform the third independent audit.
