# T14A DeskMate Hermes Agent adapter handoff

## Delivery

- Branch: `codex/t14-desktop-agent-adapter-framework`
- Base: `codex/t10d-three-end-integration@1f7b58e60b288ebd8d3a65caa71fb926a69ff3ee`
- Tested implementation: `be1a0afccc87aa32479d9cc8faeba916864d7091`
- Contract: `T14A_DESKTOP_AGENT_ADAPTER_V1_FROZEN`
- Build identity: `t14a-hermes-agent-adapter-v1`

## Implemented

- Added strict `deskmate-hermes-status-v1` local receiver and official lifecycle mapping.
- Added one generic sanitized provider status surface while retaining Codex IPC/event aliases.
- Routed Codex and Hermes through the existing `AgentStatePublisher`; voice and companion ownership remain unchanged.
- Updated AI Link UI so Hermes can be selected for automatic state and WorkBuddy remains explicitly manual-only.
- Added an optional, content-free Hermes plugin template as a packaged read-only resource. It was not installed or enabled on the user's computer.

## Verification

- `npm ci --include=dev`: passed.
- `npm test`: passed `289/289`.
- `npm run build:desktop`: passed.
- `DeskMate.exe`: `202690560` bytes; SHA-256 `95989A35243FA3AC4ED7B8FE83B36C5DE4035F07BA5502E860EFAD2DF89C1E99`.
- `app.asar`: `112772428` bytes; SHA-256 `7A27CDFCDE369CD60F8AB6EAF08A7E7144B1C9FB56A6DC585F90DD4A27BFDA43`.
- Read-only package inspection found build identity `t14a-hermes-agent-adapter-v1`.
- `git diff --check`, firmware boundary, ASCII path and secret-pattern checks passed.

## Safety and unresolved gates

- No application was started or controlled.
- No device, port, Flash, firmware, OLED, servo or audio hardware was accessed.
- No user/global Codex or Hermes configuration was changed.
- Real Hermes plugin enablement and event/OLED observation remain user-present acceptance.
- WorkBuddy automatic integration remains blocked on exact product identity and an authoritative lifecycle contract.
