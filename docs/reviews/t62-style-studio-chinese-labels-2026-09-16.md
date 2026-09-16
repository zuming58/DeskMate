# T62 Style Studio Chinese labels review

Date: 2026-09-16

## User evidence

The Style Studio material canvas displayed retained English names such as `robot-coral-happy`, `robot-cobalt-focused`, and a UUID-shaped import task name. The user asked for the visible card labels to be Chinese.

## Change

- The four retained demo filenames now render as `青绿好奇`, `珊瑚开心`, `钴蓝专注`, and `淡紫小憩`.
- UUID-shaped task/import names render as `本地素材` or `本地作品`.
- The mapping is applied while hydrating retained source/result records and to newly imported matching files.
- Existing Chinese labels remain unchanged. Unknown meaningful user filenames remain visible.
- No stored library record, filename, digest, ID, image, provider request or backup field is rewritten.

## Verification

- Style Studio targeted tests: 23/23.
- Full suite: 848/848.
- `npm run build:desktop`: passed.
- Exact T62 packaged renderer/resource verification: passed and found all five Chinese labels.
- Final-ASAR T58+ dance lifecycle and T53 natural voice/reminder probes: passed without hardware.

The remaining check is visual user acceptance in the retained-profile Style Studio page.
