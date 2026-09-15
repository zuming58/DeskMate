# T50 companion exhibition introduction v1

Status: `T50_COMPANION_EXHIBITION_INTRO_V1_FROZEN`

This is a deterministic Windows companion response for live demonstrations. It changes no firmware, hardware authority, microphone routing, speech provider, memory retention or Style Studio provider behavior.

## Trigger

- Explicit requests such as `介绍一下你自己`, `你给大家介绍一下自己`, `做个自我介绍` and `介绍一下 DeskMate 的功能` claim the current companion turn.
- The route runs before the intent classifier and free-conversation model. It therefore adds no text-model request and cannot improvise unsupported exhibition claims.
- First-person owner statements such as `我来给大家介绍一下自己` remain ordinary conversation and do not trigger the companion script.

## Script contract

- Use the currently saved companion name instead of hard-coding a historical default.
- Describe the implemented product areas: continuous companion dialogue, confirmed local memory, personal reminders, voice input, shortcut keys, prompt switching, Style Studio (`风格映像`), trusted task/device status and the EasyInput interaction surface.
- Describe Xiaozhi as an optional physical embodiment. Say it is currently connected only when the sanitized runtime state says connected; claim ready screen/motion responses only when the trusted motion state is ready.
- Keep the complete response at or below the existing 240-character direct-speech boundary so TTS does not silently truncate the exhibition introduction.

## Acceptance

- `小岚小岚，你给大家介绍一下自己吧` returns one complete local introduction using the saved name.
- The response reaches the existing trusted direct-speech path without invoking the model classifier.
- Connected/ready Xiaozhi wording differs from disabled, disconnected or unverified wording.
- No credentials, device path, identifier, user memory content or unverified hardware completion claim is included.
