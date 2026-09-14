# T42 Style Studio cleanup and physical-key correction

## Outcome

The accepted DeskMate shell, white workspace, central photo machine, transient style orbit, Image 2 workflow and Reveal composition stay unchanged. T42 adds two small, quiet cleanup affordances and corrects the page's interpretation of the current EasyInput key semantics.

## Trash interaction

- `删除素材` sits beside `添加照片`; `删除作品` sits beside `整理`.
- At rest both controls use the existing pale outline language. During a valid drag, the matching target lifts and becomes a restrained red drop target so the destructive destination is unmistakable.
- The user drops the card directly to delete it. Wrong-region cards are rejected, linked sources remain protected by the main-process store, and built-in samples remain fixed.
- Below 850 px the labels collapse to the trash icon while the accessible name remains, preserving the compact machine layout.

## S1, S2 and confirmation

The previous renderer treated `Return` as dial confirmation and suppressed it when a button had focus. The shipped EasyInput defaults use `Return` for S2, so that implementation could either do the wrong action or appear inert. T42 maps `Return` to S2's course flow: current result → enlarged result → Reveal. The board-origin S1 voice trigger now opens strength rather than generating; S3 continues to save.

Reveal keeps a clickable confirmation pill in addition to a future host-visible physical press. This preserves full mouse operation without pretending that the current internal encoder axis-toggle reaches Windows.

## Evidence

- User source: `C:/Users/ADMINI~1/AppData/Local/Temp/codex-clipboard-46cface5-7e23-4cfb-a330-6b6190b201cc.png` (2460×1056).
- Source production-renderer trash/S2 probes: `%TEMP%/deskmate-t37-qa-FZC8Sj/` and `%TEMP%/deskmate-t38-functional-FYDfpE/`.
- Final packaged-ASAR probe: `%TEMP%/deskmate-t37-qa-2aeo9w/`.
- Same-input comparison: `D:/CodexData/home/visualizations/2026/09/13/01a09b5c-9220-7d51-8952-f29968487205/t42-trash-s2-reference-vs-implementation.png`.

No private photo, paid Image 2 request, retained-profile deletion, microphone, firmware, Flash, device configuration, or HID write was used for this change.
