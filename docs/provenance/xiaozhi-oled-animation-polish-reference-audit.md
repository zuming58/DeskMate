# Xiaozhi OLED animation polish reference audit

Date: 2026-08-31

## Source and license boundary

- Product base: `2e538d0c080aa9f908f6b374fce080b008ef11ae`.
- Existing OLED provenance remains
  `docs/provenance/t09-xiaozhi-agent-display-reference-audit.md`.
- That audit pins the read-only `F:\Codex\xiaozhi-yuntai` reference files,
  records its MIT license and license SHA-256, and states that no source,
  bitmap, font, binary, model, sound or build artifact was copied.
- This polish package adds no new external code, assets, libraries or
  reference-derived constants. The blink scheduler, mailbox and waiting
  indicator are new product-side implementations.

## Behavior differences introduced by this package

| Previous product behavior | Polished behavior |
| --- | --- |
| idle was one static neutral frame | idle alternates between neutral and a short closed-eye frame at a bounded 3.6–6.4 second pseudo-random interval |
| waiting differed from idle mainly by eye proportions | waiting uses tall attention eyes plus a bottom three-dot indicator |
| four queued states could render obsolete intermediate scenes | one mailbox coalesces pending work so the latest accepted state wins |
| session reset always queued another idle frame | already-idle open eyes are not redrawn; non-idle or closed-blink state settles safely to idle |

The seven frozen agent-state meanings, DeskMate Link bytes, OLED I2C board map,
UART pins, product partition and failure capability semantics are unchanged.
T10A source is retained without modification and remains disconnected from
`app_main`, GPIO, PWM and servo drivers.

## Target paths

- `firmware/xiaozhi-yuntai/components/endpoint_core/include/display_owner.h`
- `firmware/xiaozhi-yuntai/components/endpoint_core/src/display_owner.cpp`
- `firmware/xiaozhi-yuntai/main/deskmate_oled.cpp`
- `firmware/xiaozhi-yuntai/host_test/`
