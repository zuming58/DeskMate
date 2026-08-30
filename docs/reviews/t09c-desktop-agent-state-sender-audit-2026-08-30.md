# T09C desktop agent-state sender independent audit

## Scope and baseline

- Reviewed branch: `codex/desktop-t09-agent-state-sender`.
- Reviewed remote HEAD: `543a49a1ca47a2007edc76fed9ba8164994bc8d9`.
- Independent audit branch: `codex/desktop-t09-agent-state-audit`.
- Audit fix commit: `86d54a70878dcfc2d6a07b6575279c914701b275`.
- Frozen contract: `T09_AGENT_STATE_DISPLAY_V1_FROZEN`.

The audit was performed in the isolated worktree
`F:\Codex\deskmate-t09-final-audit`. The user-owned primary worktree was not
modified. No port scan, device identification, Flash/NVS access, flashing,
erase, monitor, eFuse, OLED, servo or audio operation was performed.

## Findings and direct fixes

1. The EasyInput Feature Report normalizer read `buffer[0]` before rejecting a
   zero-length non-null input. The audit now rejects null and zero-length
   buffers before any byte access and adds both regression vectors.
2. The sender task required timeout coverage, but the JavaScript suite only
   covered disconnect cleanup. The audit adds a deterministic fake-timer test
   for timeout, latest-wins dispatch, stale acknowledgement rejection and
   shutdown cleanup.

No other contract, architecture or safety blocker was found. The implementation
keeps the existing VoiceWorkflow as the only state machine, validates the
64-byte Windows Feature Report in both Electron and the native bridge, never
lets simulator/mock sources write hardware, and does not replay state after a
disconnect or native-bridge restart.

## Independent verification

- Targeted T09 desktop/native tests: `33/33`.
- Full desktop tests: `126/126`.
- Native input bridge protocol self-test: pass.
- Windows desktop Release directory build: pass.
- EasyInput Host CTest: `9/9`.
- ESP-IDF: exact `v5.5.5`, target `esp32s3`, Minimal Build, preserved 16 MB
  partition table: pass.
- Code-gate app: 318,768 bytes (`0x4DD30`), SHA-256
  `90BC17D90F7F713D5AEE4BA3C451E470D6A7D71E07CE7AD3D2D806EFCBAF9ECE`.
- Partition table SHA-256:
  `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`.
- `git diff --check`, ASCII tracked paths, generated-artifact exclusion and
  firmware `AGENTS.md`/`CLAUDE.md` parity: pass.
- EasyInput board baseline helper: 1 pass, 1 existing C++ declaration parser
  warning, 0 failures; this package does not change GPIO or board pins.

The code-gate app above predates the documentation commit and is not a flash
authorization image. A final clean remote HEAD must be rebuilt and identified
again before any write is requested.

## Gate result

Status: `AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED /
T09_AGENT_STATE_DISPLAY_V1_FROZEN / HIL_NOT_AUTHORIZED`.

The next permitted step is not more speculative development. First complete the
two remaining T08 manual checks (disconnect TX and RX separately, then run the
T03-T06 combined regression). After a separate explicit authorization, run the
real VoiceWorkflow -> EasyInput -> Xiaozhi OLED T09 acceptance. Mock and
simulator sources must remain unable to write hardware.
