# T67 voice configuration recovery v1

## Scope

- Canonical source and package input: `F:\Codex\deskmate\build-t10dc-work`.
- Installed runtime target: `D:\DeskMate`; it is never used as development source.
- Preserve the complete T66 product surface and retained application data.
- Remove the Windows native application menu while keeping the DeskMate tray menu.

## Recovery rule

At renderer startup, recovery is allowed only when both conditions are true:

1. persisted renderer setting is exactly `sttMode: "unconfigured"`;
2. the isolated main-process Bailian credential store reports `configured: true` through its existing status-only IPC.

The repair changes only the provider selector, the unused endpoint and bounded STT diagnostic state. It preserves microphone selection and every unrelated setting. It never returns, logs or rewrites the secret, never invents credentials, and never overrides explicit `bailian`, `http` or `mock` selection.

## Release gates

- Clean dependency install and full JavaScript regression.
- Windows InputBridge publish and production renderer build.
- Exact packaged-resource comparison, including the T67 build ID and T66 product modules/assets.
- Assisted per-user NSIS installer keeps the existing app identity and application data.
- Real microphone/provider acceptance remains a post-install user check; automated tests do not claim a real API transcription.
