# T08 first read-only two-board acceptance

Status: `LINK_HIL_CONFIRMED / SIGNAL_DISCONNECT_CONFIRMED / COMBINED_SOFTWARE_REGRESSION_DEFERRED`

The two boards have now completed the positive connection, peer-restart and individual TX/RX disconnect-recovery portions of this checklist. The combined T03-T06 regression remains open, so T08 is not locked yet.

## Observed evidence · 2026-08-30

- Running images: EasyInput implementation `defaea8361cbd4f63e52c281cd1fd7a7cca6f19d`; Xiaozhi branch `132117e8cf8aeae07319cc647d2634326ec14637`, whose verified app implementation is `7edf755b289b87e04c1b8a2cc78983b4ac4cf8e5`.
- EasyInput UART0 local loopback produced matching `rx_frames=579` and `tx_frames=579`, with zero CRC errors. A direct Xiaozhi COM probe returned a byte-valid frozen HELLO response with a valid CRC before the boards were connected.
- The first board-to-board attempt incorrectly paired RX with RX and TX with TX. After crossing the signals as required by the frozen contract, two read-only snapshots stayed `connected` and advanced from `rx=21/tx=81` to `rx=23/tx=83`; timeout and retry counters did not continue growing.
- After a Xiaozhi reset, EasyInput observed `peer_restarts=1`, returned to `connected`, and advanced from `rx=171/tx=231` to `rx=173/tx=233`. The reset introduced ROM startup noise (`framing_errors=116`) and three semantic rejects; both counters then stayed stable, while CRC/version/length/queue-drop counters remained zero.
- With only EasyInput TXD0 disconnected, two snapshots remained `waiting`: `rx=0`, `tx=858 -> 894`, `request_timeouts=286 -> 298` and `retries=572 -> 596`. CRC, framing, version, length, unexpected-frame, semantic and queue-drop counters remained zero for that boot.
- The first physical restoration produced valid but unexpected reflected frames. The user reseated the same logical crossed wiring and cold-started both boards; two snapshots then stayed `connected` and advanced from `rx=21/tx=24` to `rx=22/tx=25`, with no new protocol or queue errors. This is recorded as an intermittent physical-contact/startup observation, not as proof that the logical wiring had been wrong.
- The user later explicitly disconnected only Xiaozhi TX to EasyInput RXD0 while retaining EasyInput TXD0 to Xiaozhi RX and common ground. Two snapshots remained `waiting`: `rx=0`, `tx=52 -> 57`, `request_timeouts=17 -> 19` and `retries=34 -> 38`; all protocol and queue error counters remained zero. After restoring RXD0 and cold-starting both boards, two snapshots returned to `connected` and advanced from `rx=13/tx=16` to `rx=14/tx=17`, with `unexpected_frames=0` and all CRC/version/length/semantic/queue counters at zero. The stable `framing_errors=58` value was startup noise and did not grow between samples.
- With both signals restored and Link connected, the user confirmed the physical buttons, encoder rotation and encoder press behavior remained healthy. DeskMate was not running, so voice input, Open Application, history copy and the configuration-page read were not exercised in this session and remain explicitly deferred.
- No OLED, servo or Xiaozhi audio action occurred. No additional Flash/NVS read or write, erase, partition change or eFuse operation was performed during Link HIL.

## Remaining acceptance

1. Start the accepted DeskMate candidate and repeat voice input, Open Application, history copy and configuration-page read while Link is connected.
2. The disconnected-state status/config channel remained responsive during both confirmed signal-direction tests. Complete any remaining user-visible faulted-state regression together with the deferred software checks before marking the complete T08 package locked.

## Preconditions

1. Independently audit and rebuild the exact EasyInput and Xiaozhi candidate HEADs.
2. Confirm both use `DESKMATE_LINK_V1_FROZEN@c8b8a344a72a849640c8b19575768d6daf4d6667` and the checked-in golden vectors.
3. Back up and verify each board using its own recovery/partition contract. Do not reuse one board's flash procedure for the other.
4. Obtain separate user authorization for both app-only flashes. Do not write NVS, partitions or eFuse.
5. After both standalone regressions pass, obtain explicit authorization for wiring.

## Wiring order

1. Power the two boards independently by their own USB connections.
2. Connect GND to GND first.
3. Connect EasyInput TXD0/GPIO43 to Xiaozhi RX and EasyInput RXD0/GPIO44 to Xiaozhi TX.
4. Leave EasyInput J4 `3V3` disconnected.

## Read-only matrix

1. Before connecting TX/RX, confirm EasyInput keys, encoder, LED feedback, configuration and Host Action remain healthy.
2. Connect TX/RX. Within two seconds, require HELLO, capability read and one status response; only privacy-safe counters/state may be observed.
3. Confirm Xiaozhi advertises only T08 `LINK_CORE` and `AGENT_STATE`; DISPLAY, MOTION and AUDIO stay disabled.
4. Restart Xiaozhi and require EasyInput to observe a new peer boot epoch, clear old capability/status data and reconnect automatically.
5. Disconnect TX, then RX, one at a time. Require bounded timeout, waiting state and no replay of an old agent state after reconnection.
6. Repeat EasyInput key/encoder/LED/config/Host Action regression while Link is connected and while it is faulted.

## Stop conditions

- Any voltage uncertainty, missing common ground, unexpected power path, repeated reset, parser error storm or regression stops the test.
- T08 must not illuminate the Xiaozhi OLED, initialize its audio, move either servo or accept a desktop state command.
- Record exact source HEADs, app hashes, wiring, observations and failures before marking `HIL_CONFIRMED`. Until then T08 remains open.
