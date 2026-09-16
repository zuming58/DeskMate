# T59 vocabulary UI polish

## Result

The vocabulary page keeps its existing two-card workflow. The hotword input now owns flexible space while its action reserves enough width for a single-line “添加” label. Replacement rule fields use smaller 12 px type, 42 px height and a slightly tighter rhythm; the explanatory line is reduced to the page's secondary hierarchy. At compact width the add action becomes a full-width button without vertical text or horizontal document overflow.

No hotword, replacement rule, import/export, persistence or speech behavior changed. No user vocabulary was migrated or rewritten.

## Verification

- Vite production build passed.
- Isolated native React/preload UI passed 38 checks at 1440×1024 and 960×680. Evidence: `C:/Users/Administrator/AppData/Local/Temp/deskmate-workbench-qa-egftOg`.
- Reference and implementation were normalized and reviewed together in `C:/Users/Administrator/AppData/Local/Temp/deskmate-t59-vocabulary-comparison.png`; the current report is `design-qa.md`.
- Full software suite, Windows directory package and final package checks are recorded in the latest `flow/progress.md` entry after completion.

The synthetic UI profile deliberately displays a history-save failure fixture; this is not a production-profile finding and is unrelated to vocabulary layout.
