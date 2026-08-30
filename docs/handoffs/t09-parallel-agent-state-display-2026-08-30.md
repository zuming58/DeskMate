# T09 parallel agent-state display handoff

T09 is one feature package with two non-overlapping firmware owners.

- EasyInput branch: `codex/easyinput-t09-agent-state-bridge`, based on
  `37f0cbd997ddd737f1ec1938a983e1047bed2ff5`.
- Xiaozhi branch: `codex/xiaozhi-t09-agent-display`, based on
  `132117e8cf8ae07319cc647d2634326ec14637`.
- Contract owner: EasyInput window.
- Frozen contract: `docs/contracts/t09-agent-state-display-v1.md`.

Both windows may perform source audit, code, Host tests, clean builds and
self-review. Neither may scan ports, access Flash/NVS, flash, monitor, operate
OLED/servos/audio or claim HIL. The user returns before T08 manual disconnect
acceptance and all T09 hardware work.

The exact contract commit is the first commit on the EasyInput T09 branch that
adds this handoff. The Xiaozhi window must fetch it and cherry-pick that exact
commit before implementation, then must not edit the shared contract.
