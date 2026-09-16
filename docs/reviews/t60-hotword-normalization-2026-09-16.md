# T60 hotword normalization review

Date: 2026-09-16

## User evidence

The retained-profile Vocabulary page contained `WaytoAGI`, while real dictation produced `V two A G I`. T59 package inspection proved the hotword reached the provider glossary but its local normalizer returned `changed=false`.

## Change

- Batch Bailian transcription now runs the existing bounded local transcript normalizer after a successful provider result.
- Configured ASCII hotwords accept bounded formatting, spacing and spoken-digit variants.
- The observed WaytoAGI pronunciation family has an explicit configured-only alias set.
- Existing replacement rules still run first. Arbitrary Chinese homophones are deliberately not guessed.
- No extra provider call, raw-text diagnostic field, vocabulary migration, API configuration or hardware behavior was added.

## Verification

- Targeted normalizer/Bailian tests: 17/17.
- Full suite: 846/846.
- Production renderer and native bridge build: passed through `npm run build:desktop`.
- Exact T60 package resource verification: passed.
- T58+ dance lifecycle and T53 natural voice/reminder final-ASAR probes: passed without hardware.
- Final package probe:
  - `V two A G I社区` with `WaytoAGI` -> `WaytoAGI社区`.
  - `E S P 3 2 - S 3 开发板` with `ESP32-S3` -> `ESP32-S3 开发板`.
  - The same WaytoAGI transcript without the hotword remains unchanged.
  - `notVtwoAGIX` remains unchanged.

Real microphone pronunciation and provider output remain user acceptance evidence, not simulated acceptance.
