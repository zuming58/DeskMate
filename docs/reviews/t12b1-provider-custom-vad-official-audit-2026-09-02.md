# T12B.1 Doubao custom-VAD official capability audit

## Question

Why did a saved and session-applied eight-second pause still produce a reply after roughly two seconds, and can the official API actually honor the requested value?

## Official evidence

- Volcengine's current [realtime dialogue API document](https://www.volcengine.com/docs/6561/1594356?lang=zh) defines both fields under `StartSession.asr.extra`: `end_smooth_window_ms` sets the user stop-speaking window, while `enable_custom_vad` controls whether custom user-stop detection is enabled and defaults to `false`.
- The same document defines `dialog.extra.input_mod=keep_alive` for a microphone stream that can become temporarily silent and separately defines `push_to_talk` plus event 400 `EndASR` for a client-owned press-to-talk boundary. The latter is an alternative interaction mode, not required for server-side custom VAD.
- The official [product update](https://www.volcengine.com/docs/6561/162929?lang=en) states that custom stop time is supported from 500 ms through 50 seconds and lists no model-version restriction. The API product constraint says features without a version annotation apply to all current versions; DeskMate's configured default is the documented O2.0 model `1.2.1.1`.

## Root cause

The renderer transaction, encrypted service configuration, new-session preference snapshot and numeric range were already correct. The rejected package emitted:

```json
{"asr":{"extra":{"end_smooth_window_ms":8000}}}
```

Because it omitted the documented default-false gate, the request supplied a custom value without enabling custom user-stop detection. The observed roughly two-second finalization is therefore consistent with the provider retaining its default server VAD.

The earlier linked Python sample contains the window alone, but the current normative API table and downloadable PDF explicitly contain the activation flag. The normative contract and the user's rejected live result together outweigh that incomplete sample.

## Minimal repair

DeskMate now emits:

```json
{"asr":{"extra":{"end_smooth_window_ms":8000,"enable_custom_vad":true}}}
```

The repair does not add `enable_asr_twopass`, an ASR `audio_info` block, local silence timing, `push_to_talk`, EndASR or a second voice state machine. It preserves `dialog.extra.input_mod=keep_alive` because strict half-duplex intentionally suppresses microphone upload during computer-speaker playback.

## Verification boundary

Automated vectors prove the exact JSON shape for the default and eight-second settings. They cannot prove provider behavior. Acceptance requires a new session on build ID `t12b1-provider-custom-vad-v2`, configured for eight seconds, in which a pause longer than three seconds and shorter than eight seconds does not trigger a reply.

No credential, transcript, audio, device, port, firmware or hardware operation was used in this audit.
