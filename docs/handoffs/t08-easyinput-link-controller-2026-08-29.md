# T08 EasyInput Link controller code handoff

Status: `DESKMATE_LINK_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED`

## Exact Git evidence

- Branch: `codex/easyinput-t08-link-controller`
- Coordination base: `93a5f9c6f72c9eb5a02917d062bfff38da0c4258`
- Frozen contract and language-neutral vectors: `c8b8a344a72a849640c8b19575768d6daf4d6667`
- EasyInput implementation: `697bffa0f372ef57e4b41fa3fa1d7b39bffbab0e`
- Fixed Maker reference: `F:\Codex\easyinput-wzm\easy-input-maker@7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`

The Maker reference has no product-equivalent DeskMate J4 UART transport. It was used only to audit task/logging structure; no Maker source or build artifact was copied.

## Delivered scope

- Pure C++ codec, CRC16, streaming parser and controller lifecycle under `components/input_core`.
- One UART0 owner task at priority 7 and stack 4096, using TX GPIO43, RX GPIO44, 115200 8N1 and bounded 512-byte RX storage.
- HELLO once per second while waiting; one capability read after each peer boot epoch; status polling every two seconds.
- One in-flight request, 250 ms timeout, two identical retries, disconnect after three exhausted requests, peer-restart detection and no stale state replay.
- Internal-only `SET_AGENT_STATE` queue/API. T08 has no desktop caller and performs no OLED, motion or audio action.
- Backward-compatible HID status extension with `deskmate_link_v1`, state and privacy-safe counters only.
- Application/bootloader console logging released from UART0 without eFuse changes. ROM startup noise remains possible and is discarded by the parser.

## Verification evidence

- EasyInput Host CTest: 8/8 passed.
- DeskMate desktop tests: 115/115 passed.
- `npm run build:desktop`: passed.
- ESP-IDF v5.5.5, target `esp32s3`, fixed 16 MB partitions: passed; candidate app is about 317 KiB with about 90% of the 3 MiB factory partition free.
- `git diff --check`, ASCII path, source/provenance, console ownership and tracked-artifact checks: passed before final handoff.
- The EasyInput board-baseline helper found the ESP-IDF project but warned that it cannot recognize the project's C++ pin-constant form. Pin drift is therefore also guarded by the checked-in source-contract test, which asserts S1–S8, encoder, USB, GPIO8, GPIO12 and Link GPIO43/44 values.

## Hardware boundary and next step

No port was scanned, no device was identified, no Flash/NVS was read or written, and no flash, erase, monitor, eFuse, wiring, OLED, audio or servo operation was performed.

Do not merge or connect boards solely from this handoff. First confirm the Xiaozhi branch uses contract commit `c8b8a344a72a849640c8b19575768d6daf4d6667`, passes its Host tests and exact ESP-IDF build, and has an equally strict noise-resynchronizing parser. Then independently audit both branches and request separate permissions for each app-only flash and for the first wiring. The first two-board test is the read-only checklist in `docs/testing/t08-first-read-only-link-acceptance.md`.
