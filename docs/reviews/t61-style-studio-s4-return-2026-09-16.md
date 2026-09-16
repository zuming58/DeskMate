# T61 Style Studio S4 return review

Date: 2026-09-16

## User evidence

The user reported that pressing the Style Studio `S4 收起` control left `风格映像` and opened the Workbench. The screenshot showed the base works surface with the on-page S4 control, so this is a route-semantics defect rather than an unavailable hardware report.

## Change

- S4 now resolves the active Style Studio layer before acting.
- Progress still uses the existing generation-cancellation path.
- Result, source, prompt, consent and delete layers close without changing route.
- Mode selection and strength adjustment cancel only their current editor.
- Reveal returns to Generate; the base surface collapses transient orbit/comparison state and scrolls to the top.
- S4 contains no Workbench navigation. The explicit top-left `返回工作台` control remains the route exit.
- Other S keys, media persistence, provider behavior, input mapping and firmware are unchanged.

## Verification

- Style Studio targeted tests: 22/22.
- Full suite: 847/847.
- `npm run build:desktop`: passed.
- Exact T61 packaged-resource verification: passed.
- Final-ASAR T58+ dance lifecycle and T53 natural voice/reminder probes: passed without hardware.
- Final packaged renderer contains the T61 same-route marker.

This verifies the software and packaged control path. Actual physical S4 acceptance remains a user test and is not inferred from automated key routing.
