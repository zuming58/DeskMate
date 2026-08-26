# T03 second reconnect failure after 8ce5712

Date: 2026-08-26
Branch: `codex/easyinput-t03-cold-boot-reconnect`
HEAD: `8ce571228c4814e684ea1d5119b21413c8bf8428`
Status: `T03_HIL_FAILED_CTRL_STICKY_SECOND_REPETITION_AFTER_8CE5712_FLASH`

## Local and flash evidence

- Host CMake/build/CTest remained 3/3 passing before the hardware run.
- ESP-IDF `v5.5.5` / target `esp32s3` build passed.
- The app image was `224672` bytes with SHA-256 `2D3B92F8FF5FBCED3CBE0C523A982B42A08BEA966FD9A06AD5DA57FD1E4096ED`.
- User explicitly authorized app-only writing. The data image was written at `0x010000` with length `0x36DA0`; esptool reported data hash verification passed. No bootloader, partition table, NVS, PHY, sound bank, eFuse or Xiaozhi operation was performed.
- After normal power restart, Windows enumerated the expected `VID 303A / PID 1006` keyboard, mouse and vendor HID interfaces.

## Reproduction

The user repeated the bounded matrix after the new image was installed:

`123` -> hold S6 -> unplug USB -> keep S6 held -> reconnect USB -> wait 3 seconds -> release S6 -> type `abc`.

The first repetition passed. The second repetition again left Ctrl logically active; typing `A` triggered Select All. The run stopped immediately and was not extended to five repetitions.

## Conclusion

The mount-time all-zero report plus one reasserted all-zero report is not a reliable HIL fix. Host tests model the expected release barrier, but the real second reconnect still loses the host-visible Ctrl release. The remaining gap is not covered by the current frozen diagnostics snapshot: there is no evidence of the exact per-lifetime order of TinyUSB mount, `tud_hid_ready`, report acceptance, report completion/failure, physical-presence invalidation and Windows HID consumption.

Do not claim T03 complete, do not start T04/T05, and do not flash another image until a new candidate has a fresh HEAD/hash/range authorization. The next rework should add bounded, redacted observability or a stronger desired-versus-accepted keyboard delivery state in the existing single runtime, then reproduce one monitored cycle before another hardware write.

## Safety

No external reference, Xiaozhi firmware, DeskMate Link, desktop code, frozen contract, partition layout, NVS or non-app Flash range was modified. No erase, monitor, Flash read or device data was collected into the repository.
