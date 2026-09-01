# T11D.2 Doubao terminal diagnostics handoff

Date: 2026-09-01

## Identity and scope

- Branch: `codex/t11d2-doubao-terminal-diagnostics`
- Exact base: `1243570244133370c6de70dc241f208a23f6409d`
- Implementation commit: `355f8b2835f06e09c74c45a29f9f46aefdccc0d2`
- Build identity: `t11d2-doubao-terminal-diagnostics-v1`
- Status: `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`
- Scope: Windows diagnostic evidence and tests only. Existing conversation behavior, UI expressions and every firmware source remain unchanged.

## Delivered

- Provider arrivals receive a safe process-local sequence before controller queueing, so a terminal event received while `tts.end` waits for speaker drain remains ordered.
- Error frame, dialog error, session finished/failed, connection finished and transport error/close have independent counters and terminal enums.
- Provider codes map only to fixed buckets. Raw provider content, code and identifiers never enter the exported diagnostic.
- Active-stop terminal events are distinguished from unexpected active-session terminals without changing their handling.
- Package/status identity is `t11d2-doubao-terminal-diagnostics-v1`.

## Verification

- `npm ci --include=dev`: passed.
- Targeted terminal and privacy tests: passed.
- Full `npm test`: `242/242` passed.
- Isolated Windows package: `F:\Codex\deskmate-t11d2-doubao-terminal-diagnostics\release-t11d2-doubao-terminal-diagnostics-verify\win-unpacked\DeskMate.exe`.
- `DeskMate.exe`: `202690560` bytes / SHA-256 `EA82E908ADDCB143CDF95579A3912C313C65D0543A3A86B710BA2D454B8A625A`.
- `resources/app.asar`: `112642539` bytes / SHA-256 `C1827A5F3370C1B5D8D2E36AC5FE80EB6F0917D8E34008271B0DC4C6095A274F`.
- Read-only `app.asar` inspection found `const DESKMATE_BUILD_ID = "t11d2-doubao-terminal-diagnostics-v1"`.

Build output is ignored and is not committed. No application was launched or controlled, and no credential, user diagnostic, audio, text, device, port, Flash or firmware was accessed.

## Next user-present evidence

1. Run only the exact packaged build and confirm exported build ID `t11d2-doubao-terminal-diagnostics-v1`.
2. Start one computer-microphone companion conversation and request a long answer without interruption.
3. After the answer ends and the UI stops, export one sanitized diagnostic.
4. Use `lastTerminalEvent`, `lastTerminalPhase`, event sequences and the fixed failure bucket to distinguish `error-frame`, `dialog-error`, unexpected session finish/failure or transport close.

Do not make a provider behavior repair until this evidence selects one path. Xiaozhi/Desktop expression synchronization remains audited but unimplemented.
