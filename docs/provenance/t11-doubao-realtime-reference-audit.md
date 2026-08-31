# T11 Doubao realtime reference audit

## Sources

- Product reference inspected read-only: `F:\Codex\suligent`, fixed commit `3e2744fcef780466e82d6803362573c6d8560cf0`.
- Official protocol documentation: <https://www.volcengine.com/docs/6561/1594360?lang=zh>.

The reference repository did not expose a license file in the inspected fixed tree. No reference source, credentials, persona, prompt, navigation logic, media, or build artifact was copied into DeskMate.

## Behavior retained

- A dedicated realtime dialogue WebSocket distinct from text-input ASR.
- App ID, Access Key, optional App Key, Resource ID, model, and voice configuration.
- Binary framed connection/session/audio events and interruptible playback.

## DeskMate-specific implementation

- Independently implemented strict parser and encoder with explicit size bounds.
- Credentials remain encrypted and main-process-only.
- Provider messages cannot execute host actions or arbitrary commands.
- A single foreground-session arbiter prevents microphone competition with text dictation/edit.
- Finite reconnect clears old audio and events instead of replaying them.
- Production audio adapters are explicitly unavailable until T10E; automated tests use simulated adapters.
- Final turns use DeskMate's transactional SQLite/outbox boundary before UI completion.

This is a behavior-derived implementation, not a source-code port.
