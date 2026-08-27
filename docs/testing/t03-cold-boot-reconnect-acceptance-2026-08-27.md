# T03 cold-boot reconnect acceptance

This procedure validates the EasyInput S6 modifier regression after the atomic HID tap fix. It is a hardware acceptance record, not a firmware build or flash instruction.

## Preconditions

- Use the final T03 branch/image recorded in [`t03-complete-to-original-codex-2026-08-27.md`](../handoffs/t03-complete-to-original-codex-2026-08-27.md).
- Start the read-only Windows Raw Input/PnP diagnostic before touching the board.
- Confirm the diagnostic reports EasyInput connected. Do not use port scans or Flash reads as part of this user workflow.

## One repetition

1. In Notepad type `123`.
2. Hold S6 continuously.
3. Unplug the EasyInput USB cable.
4. Keep S6 held and reconnect USB.
5. Wait about 3 seconds.
6. Release S6.
7. Type `abc` with the computer keyboard.

Pass result: the text is exactly `123abc`; no Select All occurs and Ctrl is not active afterward.

## Required evidence

Run the repetition five times after a complete power-off/on. Record whether each repetition passes. Raw Input/PnP monitoring may confirm device disconnect/reconnect and the old lifetime's close Ctrl+C down/up pair, but it cannot prove that Windows consumed a particular HID report byte. Mark monitored and user-observed evidence separately.

## Why the implementation uses atomic taps

S1 and S3 remain held PTT chords. S2, S4, S5, S6, S7 and S8 send a temporary chord followed immediately by the exact prior held snapshot, admitted as a two-report transaction in the existing bounded queue. This follows the bounded synthetic tap structure observed in the pinned Maker reference while keeping DeskMate's own router, descriptors, GPIO and queue contracts.

## Stop conditions

Stop after the first failure. Do not begin T04/T05, reflash, or alter the contract until the failure is recorded with the current image hash and a new review decision.
