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
                                                        |
                                                        +-- T13 @ 35e6273

T11F + T10C
     |
     +-- T10D-A EasyInput manual bridge (current code/build candidate)
```

The T12 software line contains newer Windows behavior but is not descended from T11F. T11F contains the latest integrated firmware facts but not the T12 software line. The dirty primary checkout remains on an older T07C branch and is not used for integration.

## Three task summaries

### 1. Main Agent / EasyInput controller

- Integrated baseline: `codex/t11f-three-end-integration@ee0ac8418b1d7c0497f72e3edc67b5ee39b232d4`.
- T10E microphone: `codex/t10e-easyinput-audio-capture@7b194ccc8f2e1693b9fdb88e9f4501c94b8fb7f4`; real onboard audio, repeat start/stop and real S1 voice transcription accepted. Computer microphone remains the product default; EasyInput LAN microphone remains selectable.
- T11E-A speaker: `codex/t11e-easyinput-speaker-downlink@0407ba6dd4f4674ec4ae77c5be1c289ecadc23cf`; Host `12/12` and ESP-IDF v5.5.5 fixed-layout build passed. Only a bounded local startup probe exists. No user authorization or HIL has accepted it, and realtime desktop speaker downlink is not frozen.
- Existing input/config/Host Action/Link/state behavior remains locked by T03–T09 acceptance. The new `AI 陪伴呼唤` action is interpreted by the Windows host and does not require an EasyInput firmware protocol change.
- T10D-A manual bridge: `codex/t10d-easyinput-manual-motion-bridge`; frozen HID `0x16/0x17` transport, exact T10C `0x20/0x21` forwarding, one request in flight and separate accepted/terminal evidence. Host `13/13` and exact ESP-IDF v5.5.5 fixed-layout build pass. No device/Flash/PWM/servo operation occurred; physical motion remains `NOT_READY / HIL_NOT_RUN`.

### 2. DeskMate Windows software

- Current candidate: `codex/t13-desktop-persona-memory-intent@35e627389282d8279d82646787f509681474c048`; implementation commit `04f1fc06e0021fd44dbe2a9ba99bcadb599714bf`, based on `710595f0b8b4bd209721fef9c6a96d5b80f43481`.
- Implemented bounds: persona configuration, reviewed/correctable/forgettable local memory, managed knowledge projection plus embeddings, allowlisted user-confirmed application intent, and a bounded Codex lifecycle summary that does not read chat text.
- Code/build evidence: `npm ci`, full `276/276`, desktop build and Windows package passed. User-facing behavior remains `USER_ACCEPTANCE_PENDING` and this branch is not yet merged with T11F/T10D-A.
- T10D-B is now the next software motion slice: consume the frozen EasyInput `0x16/0x17` contract, query status first, then provide yaw/pitch, short-lease ARM, provisional center, fixed ±1° step, recenter, e-stop and clear with three-layer evidence.

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
| T10D-B manual UI | Frozen `0x16/0x17` contract and vectors | Software tests/package; status-first controls and three-layer evidence | DeskMate software task |
| Post-HIL three-end integration | T13 and T10D-B accepted | One common branch, conflict audit, Desktop full test/package, both firmware Host+IDF builds | Main Agent |
| EasyInput speaker HIL | Separate explicit app-only authorization and exact image audit | Low-volume local probe plus microphone-priority evidence; no layout regression | Main Agent + user |
| Motion route code | T10C contract remains unchanged | T10D-A complete; T10D-B pending; production motion still disabled | Main Agent / DeskMate software task |
| Real servo calibration | All electrical/mechanical blockers documented and user present | Stage-by-stage recoverable HIL with physical cutoff and measured safe limits | Main Agent + user |

## Immediate next action

Deliver the frozen T10D-A report schema and golden vectors to the DeskMate software task for T10D-B. In parallel, run the T13 user gate. Do not merge either candidate into T11F merely because tests and packaging are green. The main Agent creates the next common integration branch only after both software gates are accepted.
