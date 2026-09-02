# T16 desktop actions and Codex task briefing handoff

## Exact source

- Baseline: `codex/t10d-d-simplified-manual-control@2efe4e0b4cc430c235e3ae4df333f1a7ffc6bda3`
- Delivery branch: `codex/t16-desktop-actions-briefing`
- Tested implementation: `73c7a1e5bcbac278d2d0008c1f761ffcfcc33712`
- Frozen contract: `docs/contracts/t16-desktop-actions-and-task-brief-v1.md`
- The final branch HEAD is the documentation closure commit containing this handoff.

## Delivered Windows behavior

Application registration now owns a persisted `voiceEnabled` boolean. Migration and new registration set it to false. A companion voice intent may directly execute only an already registered opaque action with the switch enabled; every raw target, argument, URL, command, unknown label and disabled action is rejected. The target and credentials remain in Electron main.

The optional `codex-task-brief-v1` local receiver accepts only the frozen exact schema, strictly increasing sequences and privacy-safe bounded text. It retains at most eight snapshots in memory, announces first/thinking once, ordinary working progress at most every 15 seconds and waiting/completed/error immediately. Status questions use deterministic templates and ask for a task name when several are active. Without this reporter, DeskMate states that rich progress is unavailable and uses only the coarse content-free `codex-hook-v1` state.

Conversation listening and speaking remain higher priority than task announcements; displaced speech is dropped rather than replayed. The renderer never receives the opaque task key, target path, prompt, response, command, tool data, identifiers or secrets.

The motion page now has a local repeat count of one to three. Attention and search default to one; nod and dance default to two. The companion classifier recognizes only the frozen preset names, but the intent intentionally stops at `motion-preset-contract-not-frozen`. There is no HID, DeskMate Link, PWM, angle or servo output in this package.

## Verification

- `npm ci --include=dev`: passed.
- `npm test`: `332/332` passed.
- `npm run build:desktop`: passed.
- Isolated package: `release-t16-desktop-actions-briefing/win-unpacked`.
- Packaged input bridge `--protocol-self-test`: passed.
- `git diff --check`: passed.
- ASCII tracked-path and secret-token scans: passed.
- Diff under both firmware trees from the exact baseline: empty.

Package evidence:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `DeskMate.exe` | 202690560 | `D8F9EAB648520EC86A4F73598DFA5FF11E8FEB14FBEA75AD74F1F0CC32B42355` |
| `resources/input-bridge/DeskMate.InputBridge.exe` | 153512841 | `EE876DCD54C904C756BD7B5101443408DD1261A242FADC6523BF341DE68FA3C8` |
| `resources/app.asar` | 112837520 | `9E5FDB169A4E90DCA337AAF4838FC133C6548650A61669A2BF80FA60ADF3BF10` |

## Unclosed gates

- A user-controlled acceptance must enable voice opening on a harmless registered application, verify a disabled application stays blocked and verify no path/URL/argument can enter from speech.
- A repository-local task must explicitly send the frozen task brief to validate real start/progress/wait/completion announcements and deterministic spoken status queries. No global Codex reporter was installed or modified.
- T15 owns the hardware-safe motion transport. Until it is integrated, repeat count and preset intent are software-only and must not be presented as physical movement.
- This task launched or controlled no application and accessed no device, port, firmware, Flash/NVS/eFuse, OLED, audio, PWM or servo hardware.
