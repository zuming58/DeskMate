# T12A endpointing and wake-word source audit

Date: 2026-09-01

## Provider endpointing

- Volcengine's official realtime dialogue release note documents `end_smooth_window_ms` as the user stop-speaking detection window, with a default of 1500 ms and an allowed range from 500 ms to 50 seconds: https://www.volcengine.com/docs/6561/1329505?lang=zh
- The official parameter reference places it in ASR `extra` and defines it as the silence duration after which VAD ends the utterance: https://www.volcengine.com/docs/6348/1807452?lang=zh
- Product conclusion: DeskMate's 2/3/5-second choice belongs in the provider StartSession request. A renderer-only delay would not change server endpointing. The independent whole-conversation idle timeout remains local.

## Wake-word candidates

- Microsoft documents local keyword recognition using an on-device keyword model and an offline scenario: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/keyword-recognition-overview
- openWakeWord code is Apache-2.0, but its included pretrained models use CC BY-NC-SA 4.0 and the project currently describes English models: https://github.com/dscripka/openWakeWord/blob/main/README.md
- Porcupine documents offline inference, Windows support and custom `.ppn` keyword files, but requires an AccessKey and account/licensing review: https://picovoice.ai/docs/porcupine/

## Decision

No candidate currently satisfies the product's Chinese `你好，小言` requirement with an approved redistributable model, licensing record and credential boundary. T12A therefore freezes only `wake-word-adapter-v1` and truthfully reports unavailable/disabled. The physical EasyInput call action remains fully usable without wake-word support.
