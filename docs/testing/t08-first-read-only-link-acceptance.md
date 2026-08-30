# T08 first read-only two-board acceptance

Status: `PARTIAL_HIL_CONFIRMED / SIGNAL_DISCONNECT_AND_COMBINED_REGRESSION_PENDING`

The two boards have now completed the positive connection and peer-restart portions of this checklist. Individual TX/RX disconnect recovery and the combined T03-T06 regression remain open, so T08 is not locked yet.

## Observed evidence · 2026-08-30

- Running images: EasyInput implementation `defaea8361cbd4f63e52c281cd1fd7a7cca6f19d`; Xiaozhi branch `132117e8cf8aeae07319cc647d2634326ec14637`, whose verified app implementation is `7edf755b289b87e04c1b8a2cc78983b4ac4cf8e5`.
- EasyInput UART0 local loopback produced matching `rx_frames=579` and `tx_frames=579`, with zero CRC errors. A direct Xiaozhi COM probe returned a byte-valid frozen HELLO response with a valid CRC before the boards were connected.
- The first board-to-board attempt incorrectly paired RX with RX and TX with TX. After crossing the signals as required by the frozen contract, two read-only snapshots stayed `connected` and advanced from `rx=21/tx=81` to `rx=23/tx=83`; timeout and retry counters did not continue growing.
- After a Xiaozhi reset, EasyInput observed `peer_restarts=1`, returned to `connected`, and advanced from `rx=171/tx=231` to `rx=173/tx=233`. The reset introduced ROM startup noise (`framing_errors=116`) and three semantic rejects; both counters then stayed stable, while CRC/version/length/queue-drop counters remained zero.
- No OLED, servo or Xiaozhi audio action occurred. No additional Flash/NVS read or write, erase, partition change or eFuse operation was performed during Link HIL.

## Remaining acceptance

1. Disconnect EasyInput TXD0 and RXD0 one at a time while retaining common ground; require bounded waiting and automatic recovery after reconnection.
2. Confirm no old Agent state is replayed after either disconnect.
3. Repeat the locked EasyInput key, encoder, LED, configuration, Host Action and voice regressions while Link is connected and while it is faulted.

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
