# Windows status-stream bounds repair

## Identity

- Branch: `codex/t10d-desktop-status-stream-bounds`
- Base: `codex/t10d-desktop-hid-collection-routing@72ee0e499f7afa551498654e3062f66112b88cab`
- Implementation commit: `60584bc5427c2a0840342a79e7909587d8bb4a58`
- Scope: DeskMate Windows native bridge and host tests only. Both firmware modules are unchanged.

## Root cause

Read-only HIL evidence established that a full config read (`0x13`, request flag
`2`) completed all `26/26` chunks. A status read (`0x11`, request flag `0`) emitted
no progress even though the current firmware status is about 1104 bytes / 23
chunks.

The native bridge accepted status streams only up to 1023 bytes and 21 chunks.
`ParseConfigStream` therefore rejected the first valid status chunk in
`HasValidStreamBounds`, reset the read, and never emitted progress. The EasyInput
producer contract owns a 1536-byte status buffer; at 50 data bytes per report the
defensive wire ceiling requires 31 chunks.

## Repair

`VendorReportProtocol` now uses independent limits:

| Stream | Maximum declared bytes | Maximum chunks |
| --- | ---: | ---: |
| Status `0x11` | 1536 | 31 |
| Full config `0x13` | 2048 | 42 |

The current NUL-terminated firmware JSON has an effective maximum of 1535 bytes,
but Windows accepts the complete producer buffer ceiling defensively. Existing
request correlation, sequence, CRC, padding, schema and privacy-safe field parsing
remain unchanged and fail closed.

Regression coverage includes:

- observed-size 1104-byte / 23-chunk status;
- effective 1535-byte / 31-chunk edge;
- explicit 1536-byte / 31-chunk bound acceptance;
- 32-chunk and 1537-byte rejection;
- unchanged full-config limit.

## Verification

- Focused native/bridge regression: `35/35` passed.
- Full `npm test`: `296/296` passed.
- .NET Release build: passed with zero warnings/errors.
- Native protocol self-test: passed.
- `npm run build:desktop`: passed.
- `git diff --check`: passed.
- Firmware diff from the base: empty.

Package:

- Path: `F:\Codex\deskmate-t14-agent-adapters\release\win-unpacked`
- `DeskMate.exe`: 202,690,560 bytes; SHA-256
  `154C5BA813B25472A1920FDCC766F49BB4A5A4B99744ECEEBEDF71E0E59B6C4F`
- `resources/input-bridge/DeskMate.InputBridge.exe`: 153,512,841 bytes;
  SHA-256 `DFE27722DFAF1CA7A59B881511C7E39C258BCBD2068F429F2D73AB035571FC0D`
- `resources/app.asar`: 112,776,795 bytes; SHA-256
  `3E33558D926994C7250142AA72EBC8759FBE74B146615018E25CC296864F872F`

Classification: `ROOT_CAUSE_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED /
HIL_NOT_RUN`.

## Shortest remaining HIL

1. Close every older DeskMate instance and launch only the package above.
2. Keep the existing safe wiring and open Settings/Diagnostics.
3. Trigger one read-only status refresh. Confirm status progress reaches the
   current total (expected about `23/23`) and the sanitized Link counters become
   available.
4. Send one manual Agent State and keep the evidence layers separate: Windows
   request, EasyInput ACK, DeskMate Link and visible Xiaozhi display.
5. Stop. Do not infer servo readiness or physical motion from this repair.

This task did not launch/control the app, enumerate a port/device, access
Flash/NVS/eFuse, or operate OLED, audio, PWM or servos.
