# DeskMate current integration map

Date: 2026-09-02  
Owner: main Agent (`EasyInput固件开发`)  
Purpose: one project-level view of the three implementation tasks. This document records integration truth; it does not authorize hardware writes.

## Why reconciliation was required

The repository had two valid but incomplete histories. They are now joined in one isolated candidate:

```text
T11D.4 desktop + T10E/T11E EasyInput + T10C/OLED Xiaozhi
                         |
                         +-- T11F three-end integration @ ee0ac841

pre-T11F desktop history
        |
        +-- T11D.5 -- T11D.6 -- T12A -- T12B -- T12B.1 @ 710595f
                                                        |
                                                        +-- T13 @ 35e6273

T11F + T10C
     |
     +-- T10D-A EasyInput manual bridge (current code/build candidate)

T10D-A control + exact T10D-B/T13 Windows history
     |
     +-- T10D three-end candidate @ fd3204a
```

The T12/T13 software line contains newer Windows behavior but is not descended from T11F. The main Agent resolved that divergence in `codex/t10d-three-end-integration@fd3204a2b294535a1f865d9a2901e16e257179d8`. The dirty primary checkout remains on an older T07C branch and was not used for integration.

## Current integrated candidate

- Branch/tested merge: `codex/t10d-three-end-integration@fd3204a2b294535a1f865d9a2901e16e257179d8`.
- Desktop: `283/283` plus exact Windows package, build ID `t10d-three-end-integration-v1`.
- EasyInput: Host `13/13` plus ESP-IDF v5.5.5 fixed-layout build.
- Xiaozhi: Host `11/11` plus ESP-IDF v5.5.3 fixed-layout build.
- Classification: `THREE_END_CODE_BUILD_CONFIRMED / HIL_NOT_RUN`.
- Safety: no app launch, device/port access, flash, OLED, audio, PWM or servo action. Motion remains `NOT_READY` in production.

## Three task summaries

### 1. Main Agent / EasyInput controller

- Integrated baseline: `codex/t11f-three-end-integration@ee0ac8418b1d7c0497f72e3edc67b5ee39b232d4`.
- T10E microphone: `codex/t10e-easyinput-audio-capture@7b194ccc8f2e1693b9fdb88e9f4501c94b8fb7f4`; real onboard audio, repeat start/stop and real S1 voice transcription accepted. Computer microphone remains the product default; EasyInput LAN microphone remains selectable.
- T11E-A speaker: `codex/t11e-easyinput-speaker-downlink@0407ba6dd4f4674ec4ae77c5be1c289ecadc23cf`; Host `12/12` and ESP-IDF v5.5.5 fixed-layout build passed. Only a bounded local startup probe exists. No user authorization or HIL has accepted it, and realtime desktop speaker downlink is not frozen.
- Existing input/config/Host Action/Link/state behavior remains locked by T03–T09 acceptance. The new `AI 陪伴呼唤` action is interpreted by the Windows host and does not require an EasyInput firmware protocol change.
- T10D-A manual bridge: `codex/t10d-easyinput-manual-motion-bridge`; frozen HID `0x16/0x17` transport, exact T10C `0x20/0x21` forwarding, one request in flight and separate accepted/terminal evidence. Host `13/13` and exact ESP-IDF v5.5.5 fixed-layout build pass. No device/Flash/PWM/servo operation occurred; physical motion remains `NOT_READY / HIL_NOT_RUN`.

### 2. DeskMate Windows software

- Current candidate: `codex/t10d-desktop-manual-calibration-ui@67325032eee4b8e056de23c1c9b204b6d442d2f8`; implementation commit `695c47d255ccfc8b09e1fd2e9644735b7c0c1017`, based on T13 `35e627389282d8279d82646787f509681474c048`.
- Implemented bounds: persona configuration, reviewed/correctable/forgettable local memory, managed knowledge projection plus embeddings, allowlisted user-confirmed application intent, and a bounded Codex lifecycle summary that does not read chat text.
- T10D-B adds strict `0x16/0x17` codec/native validation, one request per USB epoch, status-first readiness, four safety attestations, one-use ARM, yaw/pitch fixed ±1° control, provisional center/recenter/e-stop/clear and separate intent/accepted/terminal evidence. Current production `NOT_READY` is intentionally truthful and keeps motion disabled.
- Code/build evidence: focused `14/14`, full `283/283`, desktop build and Windows package passed. `DeskMate.exe` SHA-256 is `2DD0ECB13782AE5287977A13A34EFAA9711D7655D71DF67A6C1364EF0428F101`; `app.asar` SHA-256 is `E03DB4A22E3695496108159FDAF4F34E3708713D3AF7EECDE3497962E23150E1`. Application/device/HIL were not run, and this branch is not yet merged with T11F/T10D-A.

### 3. Xiaozhi yuntai firmware

- Display baseline: the T09 seven-state Windows → EasyInput → Xiaozhi chain was user accepted. OLED polish branch `codex/xiaozhi-oled-animation-polish@8d6af0cd38fb3fed85ceba03bcd99857dd1e552e` adds bounded idle blinking, distinct waiting and latest-wins display ownership with Host/build evidence; no new image write is authorized by that code result alone.
- Manual-motion candidate: `codex/xiaozhi-t10c-manual-calibration@b83ce886ec8efd1fea288a65e0127d2a887d5883`; Host `11/11` and ESP-IDF v5.5.3 build passed.
- Runtime safety: production `app_main` injects no motion owner, no real adapter or PWM exists, and `MOTION` capability stays disabled. The current software companion-call behavior uses the existing seven states and does not require a Xiaozhi firmware change.
- Physical blockers: installed GPIO11/12 axis mapping, independent current-limited supply, common ground, reachable cutoff, unloaded center, direction and mechanical soft limits are still unknown/unaccepted.
- Classification: display/state `ACCEPTED_BASELINE`; motion `CODE_ONLY / HARDWARE_LOCKED`.

## Integration gates

| Gate | Entry condition | Exit evidence | Owner |
| --- | --- | --- | --- |
| T13 software HIL | Exact T13 package | Persona, memory/forget, knowledge rebuild, safe intent confirmation and Codex summary matrix | DeskMate software task + user |
| T10D-B manual UI | Frozen `0x16/0x17` contract and vectors | Code/build complete at `6732503`; HIL not run | DeskMate software task |
| T10D integration candidate | T10D-A and T10D-B code/build complete | Complete at `fd3204a`: Desktop full test/package and both firmware Host+IDF gates passed | Main Agent |
| Integrated software HIL | Exact integrated package | T13 feature matrix plus truthful T10D-B NOT_READY/status gating | Main Agent + user |
| EasyInput speaker HIL | Separate explicit app-only authorization and exact image audit | Low-volume local probe plus microphone-priority evidence; no layout regression | Main Agent + user |
| Motion route code | T10C contract remains unchanged | T10D-A and T10D-B code/build complete; production motion still disabled | Main Agent / DeskMate software task |
| Real servo calibration | All electrical/mechanical blockers documented and user present | Stage-by-stage recoverable HIL with physical cutoff and measured safe limits | Main Agent + user |

## Immediate next action

Run the software-only user matrix against the exact integrated package. Confirm T13 persona/memory/knowledge/safe-intent/Codex summary behavior and confirm the T10D-B manual-calibration panel truthfully reports `NOT_READY` with output disabled. Do not enable production motion or begin T10D-C from code/build evidence alone.
