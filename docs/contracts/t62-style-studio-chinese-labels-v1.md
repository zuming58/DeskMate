# T62 Style Studio Chinese media labels v1

## User correction

The Style Studio material cards exposed retained English demo filenames and opaque generation/import identifiers. The user wants those visible labels in Chinese.

## Contract

- Known retained demo names render as concise Chinese labels: `青绿好奇`, `珊瑚开心`, `钴蓝专注`, and `淡紫小憩`.
- UUID-shaped `exec`, `rec`, `img`, `image`, or `source` names render as `本地素材` or `本地作品` according to card kind.
- Existing Chinese names remain unchanged.
- Unknown meaningful user filenames remain unchanged; DeskMate does not guess a translation or silently rename user content.
- Localization is renderer-only. Stored names, record IDs, digests, files, deduplication, deletion, source/result links, provider requests and backup data are unchanged.
- T61 S4 behavior and every Style Studio hardware/input route remain unchanged.
