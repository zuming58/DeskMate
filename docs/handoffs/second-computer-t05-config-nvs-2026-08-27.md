# Second-computer handoff: T05 configuration and NVS

## Authority and stop point

The second computer may implement and self-audit T05 on branch `codex/easyinput-t05-config-nvs`. It has no authority to identify hardware, scan ports, read or write Flash/NVS, flash, erase, monitor, merge `main` or begin T06.

The exact `origin/main` handoff commit is supplied in the user-visible copy prompt produced with this document. Compare the full 40-character hash before creating the branch; a branch name, date or abbreviated hash is not a substitute.

## Required reading

1. Root `AGENTS.md`, `flow/charter.md`, `flow/plan.md` and the top `flow/progress.md` entry.
2. `flow/tasks/T05-easyinput-config-nvs.md`.
3. `contracts/deskmate-host/easyinput-config-v1.md` (`CONFIG_V1_FROZEN`).
4. `docs/provenance/t05-easyinput-config-nvs-reference-audit.md`.
5. Firmware-local `AGENTS.md`, locked input/LED contracts and T04 hardware acceptance.

## Fixed external reference

- Read-only path: `F:\Codex\easyinput-wzm\easy-input-maker`
- Required commit: `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- Required comparison areas: `config_receiver`, `config_payload`, `config_state`, `config_status`, `status_hid_protocol`, `nvs_store`, USB HID configuration handling and corresponding Host tests.

Read each file from the fixed commit, not the reference worktree. Do not copy generated dependencies or build output. Record any copied or substantially derived source before delivery.

## Implementation package

- Add complete configuration read through frozen `0x13`/`0x11` messages, while preserving `0x10` write compatibility.
- Add the single bounded firmware configuration owner, exact raw JSON retention, pure-HID projection, dual-slot NVS transaction and deterministic boot recovery.
- Add native bridge read/assembly, Electron main-process lossless merge, sanitized preview/confirmation and post-write readback.
- Keep raw configuration and secrets out of renderer, logs, diagnostics, exports and repository data.
- Preserve T03 input/USB behavior, T04 LED feedback, GPIO8 ownership, fixed partitions and current default mappings.
- Preserve but do not execute fixed text, Host Action/open-app and other T06 actions.

No contract redesign is delegated. If an implementation requirement contradicts `CONFIG_V1_FROZEN`, stop and report the exact contradiction instead of choosing a new format.

## Required evidence

- Firmware Host tests for transport, projection, dual-slot storage, migration/recovery and every frozen failure boundary.
- Full existing T02–T04 Host regression.
- Desktop unit tests for bridge parsing, renderer secrecy, lossless merge, confirmation token, concurrent change and readback.
- `npm ci --include=dev`, `npm test`, `npm run build:desktop`.
- Exact ESP-IDF v5.5.5, target `esp32s3`, clean isolated build and fixed partition verification.
- `git diff --check`, ASCII tracked paths, source/license, secrets, build artifacts and local `AGENTS.md`/`CLAUDE.md` equality.

## Delivery

Update `flow/progress.md` and T05 provenance, commit and push only `codex/easyinput-t05-config-nvs`, then stop. Report final full HEAD, test counts, exact IDF version, app size/SHA-256 and a precise list of hardware actions not performed.
