# DeskMate current integration map

Date: 2026-09-02  
Owner: main Agent (`EasyInput固件开发`)  
Purpose: one project-level view of the three implementation tasks. This document records integration truth; it does not authorize hardware writes.

## Why reconciliation was required

The repository had two valid but incomplete histories:

```text
T11D.4 desktop + T10E/T11E EasyInput + T10C/OLED Xiaozhi
                         |
                         +-- T11F three-end integration @ ee0ac841

pre-T11F desktop history
        |
        +-- T11D.5 -- T11D.6 -- T12A -- T12B -- T12B.1 @ 710595f
```

The T12 software line contains newer Windows behavior but is not descended from T11F. T11F contains the latest integrated firmware facts but not the T12 software line. The dirty primary checkout remains on an older T07C branch and is not used for integration.

## Three task summaries

### 1. Main Agent / EasyInput controller

- Integrated baseline: `codex/t11f-three-end-integration@ee0ac8418b1d7c0497f72e3edc67b5ee39b232d4`.
- T10E microphone: `codex/t10e-easyinput-audio-capture@7b194ccc8f2e1693b9fdb88e9f4501c94b8fb7f4`; real onboard audio, repeat start/stop and real S1 voice transcription accepted. Computer microphone remains the product default; EasyInput LAN microphone remains selectable.
- T11E-A speaker: `codex/t11e-easyinput-speaker-downlink@0407ba6dd4f4674ec4ae77c5be1c289ecadc23cf`; Host `12/12` and ESP-IDF v5.5.5 fixed-layout build passed. Only a bounded local startup probe exists. No user authorization or HIL has accepted it, and realtime desktop speaker downlink is not frozen.
- Existing input/config/Host Action/Link/state behavior remains locked by T03–T09 acceptance. The new `AI 陪伴呼唤` action is interpreted by the Windows host and does not require an EasyInput firmware protocol change.

### 2. DeskMate Windows software

- Current candidate: `codex/t12b1-provider-endpointing-repair@710595f0b8b4bd209721fef9c6a96d5b80f43481`.
- Exact base chain: accepted T11D.6 → T12A identity/call/idle → T12B layout and explicit settings → T12B.1 provider custom-VAD repair.
- Code/build evidence: focused `60/60`, full `270/270`, Windows package passed; build ID `t12b1-provider-custom-vad-v2`.
- Open user gate: save 8 seconds, start a new session, pause 3–7 seconds inside one utterance, continue, then verify one short utterance eventually closes. The earlier provider request omitted the documented default-false `enable_custom_vad` gate; the corrected package must be tested before integration.
- Classification: `SOFTWARE_CANDIDATE / HIL_PENDING / NOT_IN_T11F`.
- Future software-only work mentioned by the user—memory projection/retrieval, persona, wake word and LLM intent/application control—remains discovery or later contract work and is not claimed as implemented.

### 3. Xiaozhi yuntai firmware

- Display baseline: the T09 seven-state Windows → EasyInput → Xiaozhi chain was user accepted. OLED polish branch `codex/xiaozhi-oled-animation-polish@8d6af0cd38fb3fed85ceba03bcd99857dd1e552e` adds bounded idle blinking, distinct waiting and latest-wins display ownership with Host/build evidence; no new image write is authorized by that code result alone.
- Manual-motion candidate: `codex/xiaozhi-t10c-manual-calibration@b83ce886ec8efd1fea288a65e0127d2a887d5883`; Host `11/11` and ESP-IDF v5.5.3 build passed.
- Runtime safety: production `app_main` injects no motion owner, no real adapter or PWM exists, and `MOTION` capability stays disabled. The current software companion-call behavior uses the existing seven states and does not require a Xiaozhi firmware change.
- Physical blockers: installed GPIO11/12 axis mapping, independent current-limited supply, common ground, reachable cutoff, unloaded center, direction and mechanical soft limits are still unknown/unaccepted.
- Classification: display/state `ACCEPTED_BASELINE`; motion `CODE_ONLY / HARDWARE_LOCKED`.

## Integration gates

| Gate | Entry condition | Exit evidence | Owner |
| --- | --- | --- | --- |
| T12B.1 software HIL | Exact `t12b1-provider-custom-vad-v2` package | Timed mid-sentence and normal-sentence pass, or sanitized failure diagnostic | DeskMate software task + user |
| Post-HIL three-end integration | T12B.1 accepted | One common branch, conflict audit, Desktop full test/package, both firmware Host+IDF builds | Main Agent |
| EasyInput speaker HIL | Separate explicit app-only authorization and exact image audit | Low-volume local probe plus microphone-priority evidence; no layout regression | Main Agent + user |
| Motion route code | T10C contract remains unchanged | Windows manual UI and EasyInput translator tests with fake endpoint; production motion still disabled | Main Agent / Xiaozhi task as assigned |
| Real servo calibration | All electrical/mechanical blockers documented and user present | Stage-by-stage recoverable HIL with physical cutoff and measured safe limits | Main Agent + user |

## Immediate next action

Run the T12B.1 exact-package software gate. Do not merge it into T11F merely because tests and packaging are green. After a pass, the main Agent creates the next common integration branch and reruns all three module gates before assigning more product work.
