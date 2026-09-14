# T44 Style Studio adaptive physical-key routing contract

Status: frozen for the T44 desktop slice. This contract does not change firmware, Flash, NVS, the persistent EasyInput keymap, or the T43 encoder lease.

## Problem

The product keymap currently assigns S3 to `companion-call`, S4-S7 to versioned Prompt Workbench Host Actions, and S8 to `paste`. The earlier Studio implementation assumed the compiled-safe fallback chords (`VoiceEdit`, Backspace, Ctrl+A/C/V/Z). During the page lease, real S3-S7 Host Actions were therefore blocked and S8's Ctrl+V could be mistaken for the old S7 position.

## Frozen behavior

- On every focused Style Studio acquisition, Electron reads the current `ai_keyboard.v1` configuration through the existing bounded InputBridge config-read path.
- Electron keeps the raw configuration in the main process. React receives only the existing sanitized eight-entry key projection.
- Physical positions retain the Studio meanings: S1 strength, S2 view/Reveal, S3 save, S4 close, S5 compare, S6 inspiration, S7 reset, S8 mode.
- Main maps configured `voice_ptt_hold`, `edit_ptt_hold`, and `host_action:<uuid>` events to the command belonging to their exact physical position. Renderer maps keyboard-emulated bindings using the sanitized projection.
- Duplicate event identities are ambiguous and fail closed. Unknown Host Actions remain consumed and blocked while the focused page owns input.
- Direct number keys 1-8 remain a page-local QA/accessibility fallback. If config read fails, the prior compiled-safe chord fallback remains available and the UI reports that physical S-key mapping was not read.
- The reserved T43 encoder Host Action remains confirm/generate only after its volatile hardware lease is acknowledged.

## Restoration and safety

The adaptive map exists only in memory. Blur, route leave, reload, renderer loss, window close, and application quit release page ownership; the board's ordinary voice, companion, prompt, paste, and encoder behavior then continues unchanged. No configuration preview, commit, firmware write, credential readout, or arbitrary Host Action execution is part of acquisition.

## Verification boundary

Automated tests cover the retained compiled-safe map, the current product map, S8 paste-to-mode disambiguation, duplicate Host Action fail-closed behavior, and page teardown. A packaged build plus user observation is still required to claim real S3-S8 acceptance.
