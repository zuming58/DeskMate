# T03 Cold-Boot Reconnect Monitored Failure

Date: 2026-08-25
Branch: `codex/easyinput-t03-cold-boot-reconnect`
HEAD observed: `812c21d2eb7a787c77c3760b8fddaa85e99a7ddc`
Status: `T03_HIL_FAILED_CTRL_STICKY`

## Reproduction

The read-only diagnostic process was started first and its initial status
reported EasyInput connected. The user then performed one bounded run:

`123` -> hold S6 -> unplug USB -> keep S6 held -> reconnect USB -> wait about
3 seconds -> release S6 -> type `abc`.

The user reported that the result was still Ctrl-sticky and caused select-all.
No further retries or flash operations were performed.

## Observed timeline

- `14:41:45.841` to `14:41:46.541`: Raw Input identified repeated EasyInput
  `VK_0x11_SCAN_0x1D` (Ctrl) and `VK_0x43_SCAN_0x2E` (C) down events while S6
  was held. This is the normal host repeat shape for a held Ctrl+C report, but
  it confirms the old lifetime was actively held before removal.
- `14:41:46.547`: the diagnostic status changed to EasyInput disconnected.
- `14:41:50.741`: the diagnostic status changed to EasyInput connected.
- `14:41:55.669` onward: `A` and `B` came from `other-keyboard`; no EasyInput
  Ctrl-up event was visible after reconnect.

The PnP status changes prove that the four EasyInput HID interfaces really
disappeared and re-enumerated. The bridge does not expose raw HID report
bytes, so absence of a keyboard transition cannot prove whether the all-zero
report was never sent, was sent before the host could consume it, or was
consumed without producing a Raw Input transition.

## Current diagnosis

The highest-confidence failure mechanism is a release-acknowledgement gap:
the firmware treats TinyUSB transfer completion as sufficient evidence that
Windows has applied the new lifetime's all-zero keyboard state. TinyUSB
completion only means the controller accepted the transfer. On reconnect,
the first all-zero report can race HID interface readiness/host polling, so a
modifier held by the removed lifetime may remain logically active on Windows.
The current runtime has only a one-shot mount release and no host-visible
acknowledgement; this is not yet proven at the raw-report-byte level.

## Next work

1. Keep T03 open; do not enter T04/T05 and do not burn another image yet.
2. Add a Host model for a reconnect-held key that requires a post-completion
   release reassertion before the barrier can progress, including delayed HID
   readiness and completion ordering.
3. Review TinyUSB readiness/transfer ordering against the Maker reference's
   desired-versus-accepted delivery model; reimplement only the minimal
   product-side state needed.
4. Re-run all Host tests and an ESP-IDF v5.5.5/ESP32-S3 build. Any new image
   requires a new HEAD, SHA-256, exact app-only range, and fresh user flash
   authorization before hardware work.

## Safety boundary

This run did not modify Windows software, external references, or the board;
it did not scan ports, identify hardware, read Flash, flash, erase, monitor,
or collect secrets, user text, or device identifiers.
