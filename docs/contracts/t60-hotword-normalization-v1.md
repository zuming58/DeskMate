# T60 deterministic custom hotword normalization v1

## Problem

The Vocabulary page persisted and sent `WaytoAGI` to Qwen ASR, but the provider could still return `V two A G I`. Ordinary dictation did not run the local transcript normalizer after that response, and the normalizer only knew four fixed technical aliases.

## Contract

- Keep the configured hotword glossary in the existing ASR request. Do not add another provider request or model pass.
- After a successful batch transcription, run the same bounded local normalizer used by companion speech before organizing, saving or writing text.
- A configured ASCII technical hotword may correct its own case, harmless separators, separated letters and spoken digit forms. Matching must be bounded so it does not rewrite a substring inside a larger ASCII identifier.
- When `WaytoAGI` is configured, accept bounded `Way/Wei/V/维/威/微 + to/two/too/2/图/兔 + A G I` forms observed or reasonably adjacent to the user's failure. Do not enable that correction when the hotword is absent.
- Explicit replacement rules still run first and remain the user's deterministic escape hatch.
- Do not fuzzy-match arbitrary Chinese homophones. A configured `小岚` must not silently rewrite `小兰`; that requires an explicit replacement rule.
- Limits remain 100 hotwords per live recognition context, 64 characters per hotword and 20,000 transcript characters. No raw transcript, vocabulary content or matched term is added to diagnostics.

## Acceptance

- `V two A G I社区`, `V 2 A G I 社区`, `Way too A G I 社区` and `维图 A G I 社区` become `WaytoAGI社区` only when `WaytoAGI` is configured.
- General forms such as `E S P 3 2 - S 3` and `S E O` canonicalize to their configured hotwords.
- A larger identifier such as `notVtwoAGIX` is not rewritten.
- Provider-backed dictation applies the local correction after a successful mocked ASR response.
- Existing Codex aliases, explicit rules, companion normalization and unconfigured text remain unchanged.
