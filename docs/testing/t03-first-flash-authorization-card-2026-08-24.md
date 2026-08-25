# T03 first-flash and HIL authorization card

Status: `T03_HIL_FAILED_CTRL_STICKY_AFTER_APP_REFLASH`

This card applies only to the EasyInput V2.0 board connected to the current main computer. It does not authorize Xiaozhi access, network scanning, eFuse changes, partition changes, erase-all, UART wiring or servo actions.

## Why a backup is required first

The current usable Maker firmware may contain board-specific settings. The pinned source reference is `F:\Codex\easyinput-wzm\easy-input-maker@7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`, but no independent, already verified Maker recovery `.bin` set has been confirmed. A source checkout is not a substitute for preserving the board's current Flash/NVS.

Therefore the first hardware operation must be reversible evidence collection before any write.

## Exact authorization scope

After the user explicitly authorizes this card, the current computer may perform only these ordered operations:

1. Identify the single connected EasyInput serial/USB target and show its detected chip identity; do not enumerate unrelated ports in the report.
2. Read the target's Flash geometry and create a local, untracked backup in a new ASCII-only recovery directory outside Git.
3. Record backup size and SHA-256; verify the file can be read and matches the expected size. Do not display MAC, serial number or full device path in project logs.
4. Preserve the current firmware/settings backup locally. Do not upload or commit it.
5. Show the resolved target, backup evidence, T03 image hash and exact write ranges before the first write. If identity, geometry, backup or hashes are uncertain, stop without writing.
6. Flash only the T03 build generated from the audited main commit using the existing ESP-IDF partition contract. Do not erase all, alter partitions or write eFuse.
7. Run the T03 HIL matrix below. If a blocking failure appears, stop and use the preserved recovery evidence; do not start T04.

Authorization does not include reading user recordings or credentials. Diagnostic output must omit Wi-Fi values, recognition text, API keys, MAC, serial, full device path and window titles.

## T03 HIL matrix

- Windows enumerates the expected HID identity: VID `303A`, PID `1006`; Keyboard Report ID `0x01`, Mouse Report ID `0x02`.
- S1～S8 produce, respectively: `Ctrl+Shift+Space`, Enter, `Ctrl+Shift+E`, Backspace, `Ctrl+A`, `Ctrl+C`, `Ctrl+V`, `Ctrl+Z`.
- Each key is tested for press, release, hold and repeated press without a stuck modifier.
- Encoder clockwise/counter-clockwise vertical scroll works at speed 3; press toggles horizontal/vertical once per debounced press.
- Rapid rotation does not create illegal jumps or delayed replay.
- Disconnect while holding a key, reconnect while held, then release: no old key or wheel event is replayed.
- Complete 20 consecutive S1 voice-key cycles without duplicate activation or a stuck shortcut.
- Regress DeskMate voice input into the focused window, bottom capsule without page jump, history copy, shortcut capture and target-window behavior.

Only after every item passes may T03 be marked `HIL_CONFIRMED` and locked. Configuration/NVS/Host Action/open-application work remains T04/T05 scope.

## 2026-08-25 pre-write evidence

- The user explicitly authorized the card and manually entered the current EasyInput download mode.
- One ESP32-S3 target was identified; the private hardware identity is retained only in the Git-external recovery record and is omitted here.
- Flash geometry is 16 MB. A complete 16,777,216-byte Flash image, including NVS, was read and verified readable. SHA-256: `51B0ECAD795E077FCB8F3964459733CA817FD68B4ACDD755E136549C5CE8C991`.
- The first pre-write comparison blocked the old T03 default table because it reduced factory from 3 MiB to 1 MiB and removed `sound_a` / `sound_b`. No write occurred.
- Commit `2d2f867dba95835f19af35cd0fd872b96748c2db` preserves the canonical table, adds CMake and Host fail-closed guards, and was rebuilt with ESP-IDF 5.5.5 / ESP32-S3. Host CTest is 3/3.
- The final generated 3,072-byte partition table is byte-identical to the table in the board backup; NVS, PHY and both sound banks are outside all planned writes.
- Exact final manifest and hashes are recorded in [`t03-first-flash-prewrite-audit-2026-08-25.md`](../reviews/t03-first-flash-prewrite-audit-2026-08-25.md).

## 2026-08-25 first-write execution evidence

- The user explicitly confirmed the exact three-range manifest immediately before execution.
- The single ESP32-S3 target was freshly re-enumerated; its private identity matched the backup target before and after the write. No unique identity is stored in Git.
- Only `0x000000..0x00515F`, `0x008000..0x008BFF` and `0x010000..0x04660F` were written. Esptool verified the data hash for all three segments.
- No erase-all, eFuse write, partition migration, NVS/PHY write, sound-bank write, Xiaozhi access or network scan occurred.
- The board remains in the manually entered download mode. The current evidence is `FLASH_VERIFIED_PENDING_NORMAL_BOOT_HIL`, not application-ready or `HIL_CONFIRMED`.
- Next physical action: use the board power switch to turn it off, wait 2–3 seconds, then turn it on normally. Do not press BOOT again. After that, verify HID enumeration and run the full T03 HIL matrix.

## 2026-08-25 normal-boot and key evidence

- After a full power-off and normal power-on, Windows enumerated `VID 303A / PID 1006` with Keyboard, Mouse and HIDClass records; all reported OK and the download-mode device was absent.
- User-observed dedicated HIL confirmed clean press/release for S1～S7: `Ctrl+Shift+Space`, Enter, `Ctrl+Shift+E`, Backspace, `Ctrl+A`, `Ctrl+C` and `Ctrl+V`.
- The current physical test unit's S8 was already known to show no light and no input response before this flash. It is recorded as `CURRENT_UNIT_HARDWARE_BLOCK`, not as a T03 regression and not as a global change to the eight-key/GPIO48 contract.
- T03 cannot be declared fully `HIL_CONFIRMED` yet. Encoder, reconnect/held-key recovery, 20 S1 cycles and DeskMate regression remain; S8 ultimately needs a repaired/healthy board retest or an explicit prototype-only hardware waiver.

## 2026-08-25 pressure-test finding and rework candidate

- Encoder vertical and horizontal scrolling, DeskMate voice output, history copy and shortcut capture passed user-observed HIL.
- The held-key reconnect case failed: S6 was held during unplug/replug, and Windows retained `Ctrl`, so a later `A` acted as Select All. This blocks T03 lock.
- Initial diagnosis, later shown incomplete by HIL: clearing firmware queues and held sources on mount might not clear an OS modifier retained when the previous USB instance disappeared before sending key-up. Commit `dd7bb69` makes the first keyboard report of every mount epoch an explicit all-released snapshot.
- The rework candidate passed desktop 68/68, packaged desktop build and smoke, firmware Host CTest 3/3, and ESP-IDF v5.5.5 / ESP32-S3 build. Its app image is 222,768 bytes, SHA-256 `0F4ABC7FA9A3A1A1FCBF457FA468931468940AFDC49460B8302E1B1DFEB517C8`.
- A follow-up write is not yet authorized. If separately authorized, only app range `0x010000..0x04662F` will be written. Bootloader, partition table, NVS, PHY, both sound banks, eFuse and Xiaozhi remain untouched.
- During the voice pressure run, one transcription request failed and the following cycles recovered. The failure is preserved as a distinct safe history state; it is not counted as proof of a stuck HID trigger. T03 still requires reconnect retest and completion of the remaining voice cycles after the rework build runs on the board.

## 2026-08-25 app-only reflash execution evidence

- The user explicitly authorized only `dd7bb69` app range `0x010000..0x04662F` and manually entered the EasyInput download mode.
- The fresh ESP32-S3 identity matched the private identity in the original full-Flash recovery record before writing; the image SHA-256 matched the approved manifest.
- Exactly 222,768 bytes were written at `0x010000`; esptool reported data-hash verification, and the post-write private identity matched again.
- No bootloader, partition table, NVS, PHY, sound bank, eFuse or Xiaozhi range was written. The board remains in manual download mode and must be fully powered off/on before retest; this is not yet application or HIL confirmation.

## 2026-08-25 post-reflash HIL result

- The board was fully powered off/on without pressing BOOT. Windows again enumerated healthy Keyboard/Mouse/HID records and the download-mode port was absent.
- The user repeated the exact held-S6 unplug/reconnect/release test. Ctrl remained stuck and typing `A` still acted as Select All.
- Therefore the app-only write was valid but `dd7bb69` did not satisfy the reconnect HIL contract. T03 remains open; T04/T05 remain closed.
- The next task must model a real power-loss cold boot while S6 is already held, rather than only unmount/mount on the same runtime object. This is a leading hypothesis to test, not a confirmed root cause.
- Further work is handed to the second hardware laptop through [`second-computer-t03-cold-boot-reconnect-handoff-2026-08-25.md`](../handoffs/second-computer-t03-cold-boot-reconnect-handoff-2026-08-25.md).

## Original first-write authorization sentence

To authorize the reversible backup, first write and T03 HIL on the connected EasyInput only, reply:

> 我授权按 T03 首次烧录卡执行：只识别当前 EasyInput，先备份并校验 Flash/NVS，再展示目标和写入范围后烧录，随后执行 T03 真机测试；不擦除整片、不改分区、不写 eFuse、不操作小智。

## App-only reflash authorization sentence

To authorize only the reconnect fix app reflash and follow-up T03 HIL, reply:

> 我确认只将 dd7bb69 的 T03 修复版写入当前 EasyInput 的 app 区 0x010000..0x04662F；不写其他区域、不擦除、不改分区、不写 eFuse、不操作小智。
