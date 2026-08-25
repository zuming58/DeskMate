# T03 first-flash and HIL authorization card

Status: `FLASH_VERIFIED_PENDING_NORMAL_BOOT_HIL`

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

## User authorization sentence

To authorize the reversible backup, first write and T03 HIL on the connected EasyInput only, reply:

> 我授权按 T03 首次烧录卡执行：只识别当前 EasyInput，先备份并校验 Flash/NVS，再展示目标和写入范围后烧录，随后执行 T03 真机测试；不擦除整片、不改分区、不写 eFuse、不操作小智。
