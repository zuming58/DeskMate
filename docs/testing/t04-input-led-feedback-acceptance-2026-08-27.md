# T04 EasyInput input LED feedback acceptance

## Accepted artifact

- Firmware source HEAD: `75c65788524523325a4526718ad865ddf9f7a072`
- App SHA-256: `578A73E8E5FEB675096DAC88F4A512D3EF5CAFE2604D4ED869F457648E45813C`
- App write performed under the separately approved app-only authorization; no partition-table, NVS, sound-bank or eFuse write was included.
- Board returned to normal boot before the physical observations below.

The source HEAD is the identity of the firmware image accepted on hardware. Later documentation-only `main` commits must not be presented as a different flashed image.

## User-observed HIL results

- Normal cold boot remained dark until an accepted input event; no random startup flash was observed.
- S1 through S7 each produced the expected short input feedback. The current board's S8 was already electrically unresponsive before T04 and produced no input or light; this remains a single-board hardware blocker, not a change to the eight-key/GPIO48 product contract.
- Encoder left, right and press feedback passed; press produced the expected warm-white confirmation pulse.
- Held S1/S3 produced one feedback animation while preserving held PTT behavior.
- Fifty consecutive input operations passed without HID loss, sticking or reordering; animation coalescing remained acceptable.
- Five `123` / hold S6 / disconnect / reconnect / release / `abc` repetitions produced `123abc` without a residual Ctrl modifier.
- Fast encoder use, twenty consecutive voice-key operations, DeskMate voice input, target-window output, history copy and shortcut capture passed.

## Verdict and remaining hardware note

`AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_CONFIRMED / T04_LOCKED`

T05 configuration/NVS may start from the documented handoff baseline. When the replacement EasyInput board arrives, S8 must receive a supplemental input, LED and mapping HIL; that check does not reopen T04 for the already accepted board unless it exposes a product-wide defect.
