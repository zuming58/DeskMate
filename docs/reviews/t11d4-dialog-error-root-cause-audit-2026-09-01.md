# T11D.4 DialogCommonError root-cause audit

## Conclusion

The repeated welcome and visible `connecting` state have a precise local root cause: T11D.3 converted a sequence-adjacent provider event `599` into a new provider connection and session. That behavior violated the requirement that a normal completed answer continue on the same WebSocket/session.

The upstream reason for event `599` is not yet proven. The previous diagnostic retained only a coarse failure bucket and discarded the official `status_code`, so a provider contract, request or service failure cannot be distinguished from the available evidence. T11D.4 therefore removes the speculative reconnect repair, fails closed on `599`, and adds only closed, privacy-safe status classification for one future exact-package run.

## Evidence reviewed

- Exact rejected base: `codex/t11d3-post-tts-dialog-recovery@e637b73fa59e29f7ac6799002c9c68f986c0fc76`.
- Sanitized user-present evidence proved full speaker acceptance/drain, one dialog error and one reconnect/new connection. It did not expose provider text, audio, identifiers or raw error content.
- Official protocol page: <https://www.volcengine.com/docs/6561/1594356?lang=zh>.
- Official linked Python sample attachment SHA-256: `A1CF62DDB6B0EF08051BE66C1845CEFB9226C7DFC37FA167FA3FCF206AA116D1`.
- Fixed product reference inspected read-only: `F:\Codex\suligent@3e2744fcef780466e82d6803362573c6d8560cf0`.

No reference code, credential, prompt, media or artifact was copied. The fixed product reference had no license file in the inspected tree and exposed raw provider details, so only its behavior was compared.

## Behavior difference

| Boundary | Official sample | Fixed reference | Rejected T11D.3 | T11D.4 |
| --- | --- | --- | --- | --- |
| Start | connection acknowledgement, then one session | one session flow | one session flow | unchanged |
| Event `359` | completes a TTS turn/initial greeting gate; capture continues | emits `tts.end` | drains, then arms event-599 reconnect eligibility | drains, then returns directly to listening on the same provider/session |
| Event `599` | `DialogCommonError` with `status_code` and `message` | emits a dialog error, but leaks raw content | may create a fresh provider/session after successful drain | always fails closed; exports only a closed status class |
| Normal second turn | same WebSocket/session | same session behavior | could show `connecting` and replay welcome | no reconnect and no greeting replay |
| Diagnostics | sample is not a product diagnostic | raw provider detail | coarse bucket plus misleading recovery success | bounded counters/enums; no raw code/message/payload/ID |

## Rejected hypothesis

Event adjacency plus successful playback drain is not proof that `599` is a harmless end-of-turn signal. The official protocol already supplies event `359` for turn completion and defines `599` as an error. Reconnecting can hide the error while creating an observable product regression, so D051 and the T11D.3 recovery contract are superseded.

## Minimal repair

1. Remove all post-TTS event-599 recovery eligibility, limits, counters and success results.
2. Keep event `359` as the same-session drain-to-listening boundary.
3. Parse only the official `status_code`; map it to a fixed class and discard the raw value and `message`.
4. Count adjacency and arrival phase before asynchronous drain completion can obscure order.
5. Keep real transport reconnect separate and finite.

This is intentionally not a guessed provider-service fix. The next exact-package sanitized result decides whether a further request/session change is justified.
