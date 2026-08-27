# T05 EasyInput configuration/NVS reference audit

## Fixed evidence

- Reference checkout: `F:\Codex\easyinput-wzm\easy-input-maker`
- Fixed commit: `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`
- Project code license: PolyForm Noncommercial 1.0.0
- Target: behavior evidence only; the dirty reference worktree, generated dependencies, binaries and build outputs are excluded.

Reviewed evidence includes `config_receiver`, `config_payload`, `config_state`, `config_status`, `status_hid_protocol`, `nvs_store`, USB HID configuration paths and their Host tests.

## Behavior difference table

| Area | Adopt as behavior | DeskMate rewrite | Explicitly not adopted | Required T05 tests |
| --- | --- | --- | --- | --- |
| Config write | `0x10`, `S3C`, version 1, 2048-byte limit, 52-byte chunks, CRC16 and endpoint-bound assembly | Static callback queue and single T05 owner integrated with the locked T03 USB runtime | Parsing/NVS work inside transport callbacks; dependence on reference runtime | full boundary, chunk order, epoch, CRC, overflow |
| Status request | `0x13`, `S3R`, non-zero request ID, reserved-zero validation, newer request supersedes stale response | Add exact flag `0x02` for complete config and kind `0x06` response | Treating status JSON or bytes/CRC fingerprint as complete configuration | capability, flag combinations, new ID, reconnect, timeout |
| Config schema | Validate `ai_keyboard.v1`; reuse Maker action/schema behavior as fixed evidence | Preserve exact raw JSON plus a T05 pure-HID runtime projection | Dropping unknown fields or activating Host Action/audio/network behavior | schema, unknown fields, profiles, unsupported actions |
| NVS load/save | Read `ai_keyboard/config_v2` as the legacy source | New `deskmate` dual-slot record, active marker, readback and deterministic recovery | Maker single-key overwrite; automatic `nvs_flash_erase` on init errors | each power-loss phase, corruption, capacity, bad marker |
| Boot recovery | Parse persisted configuration before applying runtime actions | DeskMate-slot → legacy read-only → compiled default priority, with source and sanitized recovery status | Automatic migration or overwrite without user confirmation | both slots, legacy import, invalid legacy, safe default |
| Host merge | Existing Maker reports prove whole-document replacement | Electron main owns exact read-modify-write, sanitized preview token and post-write readback | Renderer access to raw config; partial overwrite; “write then guess” | unapproved path equality, stale token, concurrent change |
| Input behavior | Maker configuration/keymap tests are the first comparison point | Preserve T03 held PTT, atomic taps, single router and T04 LED/GPIO8 behavior | Second input state machine; T05 Host Action/fixed-text execution | all supported actions plus full T02–T04 regression |

## Known reference gaps closed by the frozen contract

- Maker status response is capped at 512 bytes and returns `ai_keyboard.config_status.v1`, not the complete `ai_keyboard.v1` JSON.
- Maker NVS uses a single `config_v2` string and can erase the whole NVS partition after selected initialization errors; neither behavior is sufficiently transactional or preservation-safe for DeskMate.
- Maker does not provide DeskMate's renderer secrecy boundary, explicit redacted diff, expiring confirmation token, optimistic fingerprint gate or post-write lossless comparison.
- Maker tests do not cover DeskMate's dual-slot interrupted commit, invalid marker selection, read-only legacy import, complete configuration response kind `0x06` or coexistence with the locked T03/T04 runtime.

Any copied or substantially derived code must add file-level provenance before delivery. A clean reimplementation may use this behavior audit and frozen contract as its source record.
