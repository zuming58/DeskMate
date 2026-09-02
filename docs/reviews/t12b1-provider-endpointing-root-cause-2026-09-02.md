# T12B.1 provider endpointing root-cause review

## Evidence

The user supplied a sanitized `deskmate-diagnostics.json`. It reports build `t12b-companion-layout-timing-settings-v1`, saved revision `3` and session revision `3`, both with `endSmoothWindowMs=8000` and `idleTimeoutMs=60000`. It also reports nine accepted ASR finals and nine replies without provider, dialog, transport or queue errors. The diagnostic contains no credential, transcript, reply, PCM or device identity.

This excludes the settings form, persistence readback, application restart and session-revision freeze as the reason for the observed short endpoint. The content-free `provider-partial-to-final-v1` interval is not silence duration and must not be presented as proof of the requested pause.

## Source comparison

- Volcengine's [official realtime dialogue wire-protocol document](https://www.volcengine.com/docs/6561/1594356?lang=zh) links a Python sample that sends `asr.extra.end_smooth_window_ms` as the only ASR endpointing setting.
- The provider [release note](https://www.volcengine.com/docs/6561/1329505?lang=zh) documents a default of 1500 ms and a supported 500–50000 ms range.
- DeskMate additionally sent `enable_asr_twopass=true` and an `audio_info` object. Neither belongs to the frozen companion endpointing contract or the current official sample.
- D053's `dialog.extra.input_mod=keep_alive` is independent. It was selected by earlier exact-package HIL because DeskMate intentionally suppresses upstream microphone PCM during computer-speaker playback; changing it here would reintroduce the provider audio-idle regression.

## Repair selection

The repair removes only the two unrelated ASR additions and retains the exact bounded `end_smooth_window_ms` value, provider framing, keep-alive mode, strict half-duplex and continuous-session lifecycle. An automated vector proves an 8000 ms preference becomes exactly:

```json
{"asr":{"extra":{"end_smooth_window_ms":8000}}}
```

The UI now calls this a provider-side request rather than a local delay. Server acceptance remains a user-present HIL gate; no software can infer it from local persistence alone.

## Remaining boundary

Spoken wake is deliberately unavailable under the T12A contract. Saving `你好，小智` reserves future local/offline wake configuration but opens no background microphone and holds no cloud session. The existing EasyInput `AI 陪伴呼唤` Host Action is a separate, implemented physical entry.
