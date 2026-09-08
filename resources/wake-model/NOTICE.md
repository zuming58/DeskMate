# DeskMate local keyword model notice

These model files are the int8 `chunk-16` subset of
`sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01`.

- Upstream: <https://github.com/k2-fsa/sherpa-onnx/releases/tag/kws-models>
- Model page: <https://k2-fsa.github.io/sherpa/onnx/kws/pretrained_models/index.html>
- Training data: WenetSpeech L, as stated by the upstream model documentation.
- License: Apache License 2.0, as stated in the upstream model metadata.
- Imported: 2026-09-08.

DeskMate includes only the encoder, decoder, joiner and token table needed for
offline keyword spotting. Test recordings and upstream example keywords are not
included.

