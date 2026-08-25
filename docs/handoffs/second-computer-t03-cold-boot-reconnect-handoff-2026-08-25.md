# Second-computer handoff: T03 cold-boot reconnect rework

Status: `T03_HIL_FAILED_CTRL_STICKY_AFTER_APP_REFLASH`

T03 is the only package open now. Do not start T04 or T05 while this blocker remains. After T03 is independently fixed, tested and locked on the second hardware laptop, continue T04 and then T05 on the same laptop under the staged-branch plan below; the original main computer will perform the later independent combined audit.

## Repository and local references

- Product repository: `F:\Codex\deskmate`
- Remote: `https://github.com/zuming58/DeskMate.git`
- Pull the latest `origin/main`; it must contain `dd7bb69`, `498b63d` and `1b47919` plus this handoff.
- EasyInput read-only reference: `F:\Codex\easyinput-wzm\easy-input-maker` pinned at `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`.
- Xiaozhi read-only reference: `F:\Codex\xiaozhi-yuntai`; it is out of scope for this task.
- Full Flash backup, NVS, private identity, flash logs and built binaries remain only on the original hardware computer. They are intentionally absent from GitHub and are not required for code-only work.

## Facts already confirmed

- T03 code before this rework passed firmware Host CTest 3/3 and ESP-IDF v5.5.5 / ESP32-S3 build.
- Windows enumerates `VID 303A / PID 1006`; S1～S7, encoder vertical/horizontal scrolling, DeskMate voice input, history copy and shortcut capture passed user-observed HIL.
- The current physical unit's S8 was non-responsive before DeskMate firmware was written. Preserve the S8/GPIO48 software contract; do not redesign the product as seven-key in this task.
- First reconnect failure: hold S6 (`Ctrl+C`), unplug USB, reconnect while still held, wait, release S6, then type `abc` on the computer keyboard. Windows retained Ctrl and `A` acted as Select All.
- Commit `dd7bb69` added an all-released keyboard report on every `UsbInputRuntime::on_mount()` and passed Host tests.
- The user authorized an app-only reflash of that candidate. Exactly `0x010000..0x04662F` was written and data-hash verified; bootloader, partition, NVS, PHY, sound banks, eFuse and Xiaozhi were untouched.
- After full power-off/on, Windows enumeration was healthy, but the exact reconnect scenario failed again with the same sticky Ctrl. Therefore T03 is not closed and `dd7bb69` is not a HIL fix.
- One voice pressure cycle had a recoverable transcription request failure and later cycles succeeded. This is desktop/cloud evidence, not the root cause of the HID modifier blocker.

## Leading hypothesis to prove or reject

The current Host test models unmount and mount on the same live `UsbInputRuntime`. The physical test removes USB power, so the ESP32-S3 cold-boots while S6 is already held.

On a cold boot, `physically_held_` begins clear. `InputCore` can establish its initial debounced baseline from an already-held switch without emitting the same Press/Release history used by the same-runtime test. The mount-time zero report may therefore be sent before the cold-boot-held state is known, and the later physical release may not force a second zero report. This is a hypothesis, not a confirmed root cause.

Also verify rather than assume that the mount release report is accepted after `tud_hid_ready()`, reaches transfer-complete, and is not merely queued/sent too early for Windows to consume.

## Required rework

1. Read the root and firmware-local `AGENTS.md`, `flow/plan.md`, top of `flow/progress.md`, the T03 task and frozen input contract.
2. From latest `origin/main`, create `codex/easyinput-t03-cold-boot-reconnect`.
3. Add a production-path cold-boot model to Host tests. At minimum cover:
   - fresh `InputCore` and fresh `UsbInputRuntime` while S6 is physically held before the first stable scan/mount;
   - first accepted HID keyboard report is all released;
   - all input remains suppressed while the boot-time key is held;
   - releasing that key forces an all-released report even if no Press owner existed in this runtime;
   - only a new press after complete release may emit `Ctrl+C`;
   - `tud_hid_ready()==false`, delayed readiness, transfer complete/failure and duplicate mount do not drop the required release barrier;
   - no old wheel displacement or shortcut is replayed.
4. Fix the smallest production path that makes those tests true. Prefer an explicit physical-snapshot/release-barrier state owned by the existing single USB runtime; do not add a second input state machine.
5. Preserve all T03 frozen descriptors, VID/PID, Report IDs, default mappings, queue bounds, diagnostics and fail-closed Vendor behavior.
6. Run all firmware Host tests, exact ESP-IDF v5.5.5 `esp32s3` build, `git diff --check`, source/license, secret, ASCII-path and build-artifact checks.
7. Self-review the diff specifically for cold boot versus same-runtime reconnect, readiness/transfer ordering, suppressed-key release and retry loops.
8. Push the T03 branch. Do not merge `main`, access Xiaozhi, alter partitions or implement configuration features before T03 HIL is locked.

## Hardware gate on the second computer

The EasyInput may be attached to the second computer, but code development does not authorize writing it.

Before any reflash, show the user the branch HEAD, exact app image SHA-256 and exact app-only address range. Obtain a new explicit authorization. Do not erase, change partitions, write eFuse, touch NVS/PHY/sound banks or operate Xiaozhi.

After an authorized app-only reflash and full power-off/on, repeat exactly:

1. In Notepad type `123`.
2. Hold S6; do not release it.
3. Unplug EasyInput USB, reconnect while S6 remains held, wait 3 seconds, then release S6.
4. Type `abc` using the computer keyboard.
5. Pass result is literal `123abc`, with no Select All, no missing characters and no residual modifier.
6. Repeat this scenario five times, then regress S1～S7, rapid encoder movement and at least the remaining voice-trigger cycles.

Do not mark T03 HIL complete solely from Host tests or one successful reflash. Record exact observed evidence in `flow/progress.md`; S8 remains a separately documented current-unit hardware block/waiver decision.

## Continued independent development after T03 passes

The user's temporary two-computer arrangement is explicit: the EasyInput hardware moves with the second laptop. Once T03 passes five reconnect repetitions and the remaining T03 regression, the second laptop continues T04 and T05 independently instead of waiting for the original computer.

Use stacked branches so the original computer can audit each package later:

1. `codex/easyinput-t03-cold-boot-reconnect` from the handoff `main`.
2. `codex/easyinput-t04-config-nvs` from the final T03 HEAD.
3. `codex/easyinput-t05-host-actions` from the final T04 HEAD.

For T04, read [`T04-easyinput-config-nvs.md`](../../flow/tasks/T04-easyinput-config-nvs.md). First propose and self-audit the complete configuration contract; the current `0x13` status/fingerprint is not a complete configuration read. Only after marking the slice `CONFIG_V1_FROZEN` may implementation begin. Finish code, Host/desktop tests, exact IDF build, separately authorized HIL and self-audit, then push T04 without merging main.

For T05, read [`T05-easyinput-host-actions.md`](../../flow/tasks/T05-easyinput-host-actions.md). Start only from locked T04. First freeze `HOST_ACTION_V1_FROZEN`, then implement the hardware-key→UUID→Windows local application mapping/open loop, run all previous regressions, separately authorized HIL and self-audit, and push T05 without merging main.

Do not start T06. Do not combine the three branches into `main`. When the user returns to the original computer, that computer will independently review main→T03, T03→T04 and T04→T05, rerun the combined build/test matrix and repeat hardware checks as needed before accepting or merging anything.

If T03 cannot pass, stop there and do not enter T04. If a T04/T05 contract cannot be frozen without guessing, push the proposal/evidence as a blocked handoff rather than implementing a guessed wire format.

## Final stop condition

Stop the temporary second-computer run when either:

- T03 remains genuinely blocked and its branch/evidence has been pushed; or
- T03, T04 and T05 have each completed their own contract/code/test/build/HIL/self-audit gates and all three stacked branches are pushed; or
- a later contract cannot be frozen safely, in which case push the completed earlier branches plus the blocked contract proposal and stop.

Never merge `main` or start T06 on the second laptop.
