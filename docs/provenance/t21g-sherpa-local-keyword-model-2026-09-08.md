# T21G sherpa-onnx local keyword model provenance

## Reason for replacement

The user-present T21F diagnostic proved that the Windows `System.Speech`
listener received a speech-detected event but produced neither a recognition
result nor a rejection for the configured Chinese wake phrase. Button-started
cloud ASR remained healthy. T21G therefore replaces the legacy generic
recognizer with an offline engine designed specifically for open-vocabulary
keyword spotting.

## Engine

- Package: `sherpa-onnx-node` `1.13.7`.
- Registry: <https://www.npmjs.com/package/sherpa-onnx-node>
- Source: <https://github.com/k2-fsa/sherpa-onnx>
- License: Apache-2.0.
- Use: the official Node addon `KeywordSpotter` API receives the existing
  DeskMate-selected 16 kHz mono PCM stream. No upstream sample source was
  copied.

`pinyin-pro` `3.29.3` (MIT) converts a saved Chinese wake phrase into the
model's documented initial/final token representation. DeskMate independently
implements bounded validation, ephemeral keyword-file creation, microphone
arbitration, debounce and privacy-safe diagnostics.

## Model

- Upstream asset:
  `sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01.tar.bz2`.
- Official release URL:
  <https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01.tar.bz2>
- Downloaded archive: 32,654,866 bytes; SHA-256
  `B2F7C89690DC8CE4C6ED6AFEAB7CD800C36AD1421FB6B6302B4A4B194CF7F35F`.
- Upstream metadata: Apache License 2.0; trained on WenetSpeech L; Zipformer
  open-vocabulary keyword-spotting model with pinyin initial/final units.

Imported files:

| DeskMate file | Bytes | SHA-256 |
| --- | ---: | --- |
| `resources/wake-model/encoder.int8.onnx` | 4,777,666 | `DD784973FC9D2FABB3B800D6DCD20FC3B0CA84F8E2415AFE54B032878E447F4D` |
| `resources/wake-model/decoder.int8.onnx` | 181,069 | `ED83454004D5BD16D831EAF00ADCD181ED7734886AAB6EF440F3FFA5AA3CFE3B` |
| `resources/wake-model/joiner.int8.onnx` | 65,242 | `F79760052B87239E325F0567C752AD3130B30D92EFFB847D4307743C20C59A24` |
| `resources/wake-model/tokens.txt` | 1,627 | `72316508D9119696145ABC6F1F8CDC46287535C34E5CE7E595F845CB1499CF2E` |

The archive, test WAV files and example keyword files are not included. The
runtime keyword file uses opaque result labels, is deleted immediately after
model construction and is never exported. Audio, recognized text and the
configured phrase are not retained.

