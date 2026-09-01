# T11 Doubao realtime reference audit

## Sources

- Product reference inspected read-only: `F:\Codex\suligent`, fixed commit `3e2744fcef780466e82d6803362573c6d8560cf0`.
- Official protocol documentation: <https://www.volcengine.com/docs/6561/1594356?lang=zh>, updated 2026-08-20. Page `1594360` is only the product introduction and is not the wire-contract source.
- Official Python attachment linked by that protocol page was inspected in memory from `https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/24c5221cb7b64875b0e5b317598fab92~tplv-goo7wpa0wc-image.image`.

The reference repository did not expose a license file in the inspected fixed tree. No reference source, credentials, persona, prompt, navigation logic, media, or build artifact was copied into DeskMate.

## Behavior retained

- A dedicated realtime dialogue WebSocket distinct from text-input ASR.
- App ID, Access Key, Resource ID, model, and voice configuration. For this protocol, `X-Api-App-Key` is the required service constant `PlgvMymc7f3tQnJ6`, not a user credential.
- Binary framed connection/session/audio events and interruptible playback.

## DeskMate-specific implementation

- Independently implemented strict parser and encoder with explicit size bounds.
- The official StartConnection and StartSession byte arrays are external golden vectors in the tests. The parser covers documented flags `0..4`, sequence layouts, optional connection IDs, required session IDs, no/gzip compression, service errors and bounded failure closure.
- The adapter waits for `ConnectionStarted` before sending `StartSession`, matching the official sample instead of sending both requests concurrently.
- Credentials remain encrypted and main-process-only.
- Provider messages cannot execute host actions or arbitrary commands.
- A single foreground-session arbiter prevents microphone competition with text dictation/edit.
- Finite reconnect clears old audio and events instead of replaying them.
- Production audio adapters are explicitly unavailable until T10E; automated tests use simulated adapters.
- Final turns use DeskMate's transactional SQLite/outbox boundary before UI completion.

This is a behavior-derived implementation, not a source-code port.

## 2026-09-01 interoperability repair

The first T11 implementation used the same local encoder for both client and fake-server tests. That self-consistency test did not prove compatibility with provider frames and missed three live defects: the fixed App Key could be omitted, StartSession was sent before the connection acknowledgement, and the decoder rejected documented identifier/sequence/gzip layouts. The repair derives behavior from the official wire examples and the fixed product reference, while copying no unlicensed reference source.

## 2026-09-01 DialogCommonError follow-up

The official linked Python sample creates one WebSocket/session for continuous turns. Event `359` completes a TTS turn and, for microphone mode, releases the initial greeting gate once; it does not start another session. Session and connection finish requests occur only during explicit close. The documented event `599` payload is `DialogCommonError` with `status_code` and `message`.

The fixed product reference also distinguishes `tts.end` from `dialog.error`, but its raw provider reporting violates DeskMate's diagnostic boundary. T11D.4 therefore independently keeps event `359` as the same-session turn boundary and maps only the official `status_code` to a closed class. No source from the unlicensed reference was copied.
