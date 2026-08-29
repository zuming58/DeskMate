# T08 first read-only two-board acceptance

Status: `HIL_NOT_AUTHORIZED`

This checklist is a future authorization gate, not evidence that the boards are connected.

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
