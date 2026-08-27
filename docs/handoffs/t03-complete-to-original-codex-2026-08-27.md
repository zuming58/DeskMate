# T03 complete handoff to original Codex - 2026-08-27

Status: `T03_COMPLETE`

## Repository state

- Branch: `codex/easyinput-t03-cold-boot-reconnect`
- HEAD: `5c0988097c44194269bb1c7b23fa24277fae6680`
- T04 and T05 were not implemented on this branch.
- External reference directories remained read-only and were not copied into the product repository.

## Hardware evidence

The final app image was built with ESP-IDF `v5.5.5` for `esp32s3`, then written only to the factory app on the identified ESP32-S3 (COM5, MAC suffix `D9:A0`) after explicit user authorization.

- Image: `build-atomic-tap-final-v5.5.5/deskmate_easyinput_controller.bin`
- SHA-256: `82731f1a72892fcefedf3f3dc920013de8110c384cab2f6a0edea4ec97e2913e`
- Size: `0x37310` (226,064 bytes)
- Effective app range: `0x010000..0x04730F`
- Flash tool sector erase end: `0x047FFF`, still inside the 3 MiB factory app partition
- Bootloader, partition table, NVS, PHY, both sound banks and eFuse were not written; no full-chip erase was used.

After a complete power-off/on, the user performed five repetitions of:

`123` -> hold S6 -> unplug USB -> keep S6 held -> reconnect -> wait about 3 seconds -> release S6 -> type `abc` on the computer keyboard.

All five repetitions produced `123abc` without Select All or residual Ctrl. Repetitions 1 and 2 were accompanied by read-only Raw Input/PnP monitoring. The monitor saw each S6 `Ctrl+C` as a close Ctrl/C down/up pair before disconnect, then saw `A/B/C` from `other-keyboard` after reconnect. Repetitions 3 through 5 were completed consecutively by the user and reported as passing; they were not independently byte-captured by the bridge.

## Root cause and fix

Stateful S6 `Ctrl+C` could leave Ctrl held in the Windows state associated with a USB HID lifetime that disappeared during unplug. A zero report from a new lifetime, even when repeated or transfer-complete, was not a reliable replacement for the old lifetime's key-up. Maker's pinned synthetic `HidTap` path showed the useful bounded pattern: send a temporary chord and restore the prior held snapshot while the old lifetime is still alive.

DeskMate now keeps S1/S3 as held PTT sources. S2/S4/S5-S8 send an atomic press and exact restore pair on stable Press, with two-slot admission in the existing 16-item queue. Physical Release only rearms the tap. Overflow, send failure, disconnect and stale lifetime events remain fail closed.

## Development rounds recorded

1. Initial T03 runtime established edge-safe GPIO sampling, encoder decoding, the single action router, TinyUSB descriptors, bounded queues and diagnostics.
2. Audit rework fixed component dependencies, monotonic timing, full modifier clearing, platform-independent held-key state, non-modal host assertions and expanded tests.
3. Lifecycle and descriptor audits added ordered USB lifetime delivery, complete descriptor golden vectors, queue overflow recovery and managed-component ignore rules.
4. Cold-boot reconnect work added mount release barriers, delayed readiness/completion handling, physical GPIO40 USB lifecycle and stale wheel suppression. Real HIL still failed after repeated reconnects.
5. Final Maker-informed atomic-tap rework changed only ordinary command-key semantics, preserving S1/S3 hold, descriptors, GPIO, queue sizes and partition layout. Host 3/3 and the exact IDF build passed before the authorized flash.

## Lessons for the next computer

- Read the pinned Maker implementation and tests before designing a new HID lifetime strategy; use it as behavioral evidence, then reimplement only the contract-required subset.
- Distinguish Host evidence, Windows bridge evidence and user-observed HIL. The bridge cannot prove raw HID report bytes were consumed by Windows.
- Keep the existing single input router and USB owner. Do not add a second state machine to address a regression.
- Preserve GPIO `2,47,38,41,1,6,7,48`, encoder `17/16/18`, USB `19/20`, active-low SEN_VIN `40`; GPIO0 and GPIO8 remain forbidden in this package.
- Do not start T04/T05 in this handoff. The original main computer should independently audit main -> T03, rerun the full tests/build, and then create the stacked T04 branch only after accepting this evidence.

## Reproducible verification

Host CTest: 3/3 (`input_core_tests`, `input_runtime_tests`, `firmware_source_contract_tests`).

ESP-IDF build: exact `v5.5.5`, target `esp32s3`, Minimal build enabled; factory app has 93% free space. `git diff --check`, scope/secret/ASCII-path/build-artifact checks and `firmware/easyinput-controller/AGENTS.md` versus `CLAUDE.md` identity checks passed before flash. Monitoring was stopped after the five-round HIL run.
