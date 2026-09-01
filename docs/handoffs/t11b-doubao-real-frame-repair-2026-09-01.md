# T11B Doubao real-frame interoperability repair handoff

Date: 2026-09-01

## Delivery identity

- Branch: `codex/t11b-doubao-real-frame-repair`
- Exact base: `fe91dafcfd9c3a12c2c62491aa5a28849a6c4b42`
- Implementation commit: `80dac2e98ca462a781ff8ecf14d6bafcffdecd02`
- Status: `TEST_CONFIRMED / BUILD_CONFIRMED / LIVE_HIL_PENDING`

## Repaired behavior

- The adapter always supplies the provider-defined `X-Api-App-Key` protocol constant. It is no longer presented as an optional user credential, and previously saved empty values remain compatible.
- `StartConnection` is now sent first. `StartSession` is sent once only after a bounded `ConnectionStarted` response.
- The strict decoder accepts documented flags `0..4`, sequences, optional connection IDs, required session IDs, no/gzip compression and service error frames. Size, identifier, decompression and JSON limits fail closed.
- Handshake rejection, provider errors and frame failures expose only enumerated redacted stages. Raw frames, payloads, connection/session IDs, PCM and provider text never enter diagnostics or error copy.
- The existing `CompanionConversationController`, foreground audio owner, persisted computer/EasyInput microphone choice, computer speaker, SQLite turn boundary and Agent State chain are unchanged.

## Evidence

- Official contract: <https://www.volcengine.com/docs/6561/1594356?lang=zh>, updated 2026-08-20.
- Official StartConnection and StartSession arrays are hard-coded external golden vectors in the test suite.
- Fixed product reference `F:\Codex\suligent@3e2744fcef780466e82d6803362573c6d8560cf0` was inspected read-only. Its tree contains no declared license, so no reference source was copied.
- `npm ci --include=dev`: passed.
- Targeted Doubao/companion tests: `17/17` passed.
- Full `npm test`: `214/214` passed, zero failure/skip/todo.
- `npm run build:desktop -- --config.directories.output=release-t11b-doubao-repair-verify`: passed native InputBridge publish, Vite build and Electron Windows directory packaging.
- Package: `F:\Codex\deskmate-t11b-doubao-frame-repair\release-t11b-doubao-repair-verify\win-unpacked\DeskMate.exe`, 202,690,560 bytes, SHA-256 `B750B098A662507D776C6D28872BFA28FF9F92AD1D94A0BF6802CEB79FB0F0D4`.

## Safety boundary

No app was launched, stopped or controlled. No saved credentials were read or exported. No port, device, Flash, audio endpoint, network service, firmware, OLED or servo was accessed. Generated dependencies, native output, `dist/` and the package directory remain ignored.

## Minimal user-present acceptance

1. Manually close the old DeskMate package and open the package listed above.
2. Keep the already saved realtime credentials; a character name is not required and App Key needs no input.
3. Select the computer microphone, click **开始陪伴对话** once and speak a short sentence.
4. Pass when the page reaches connected/listening, shows the recognized turn and plays one reply through the computer speaker.
5. If it fails, record only the new displayed enum/category and stop. Do not export credentials, provider frames, transcript or audio.

This single live conversation is the remaining gate; software implementation and packaging are complete.
