# T11F three-end integration audit

Date: 2026-09-01  
Integration branch: `codex/t11f-three-end-integration`  
Integrated code commit: `5544fb22d6d20a774bd653609b1e15b86574a4fa`

## Inputs

- Windows desktop: `origin/codex/t11d4-dialog-error-root@3a62bf123e19fcaaf48ded9db0b9e41144f523bc`
- EasyInput controller: `origin/codex/t11e-easyinput-speaker-downlink@0407ba6dd4f4674ec4ae77c5be1c289ecadc23cf`
- Xiaozhi yuntai: `origin/codex/xiaozhi-t10c-manual-calibration@b83ce886ec8efd1fea288a65e0127d2a887d5883`

The two firmware branches merge with the desktop implementation without source conflicts. Merge conflicts were limited to shared planning, decision, lesson and documentation indexes; their non-conflicting facts were retained and the safety states were not upgraded.

## Verification

- Desktop `npm test`: `246/246` passed.
- Desktop `npm run build:desktop`: passed.
- EasyInput Host CTest: `12/12` passed.
- EasyInput ESP-IDF v5.5.5 fixed-16-MiB build: passed.
- Xiaozhi Host CTest: `11/11` passed.
- Xiaozhi ESP-IDF v5.5.3 fixed-16-MiB build: passed.
- `git diff --check`: passed.

Build evidence from integration code commit `5544fb2`:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Desktop `DeskMate.exe` | 202,690,560 | `59E6E167AF10695F4F042A6EA5B9D3023F9B5A1E530F8FAD072CD15A5603D537` |
| Desktop `app.asar` | 112,642,631 | `6506FEB7458CAEB6A7F4D1B9B13A363D1DA529BE5A86DFCC394FB2D7CECA8B28` |
| EasyInput app | 857,696 (`0xD1660`) | `FD6C2219C9506267A126998C2B1E2D74B492554D99AADDF67D3A2244B67CF4D9` |
| EasyInput partition table | 3,072 | `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278` |
| Xiaozhi app | 206,432 (`0x32660`) | `F4E3438CC0EE673DF00A41EE99D509000F1B6D214F95C38F48CF27DD5323A7DE` |
| Xiaozhi partition table | 3,072 | `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0` |

These firmware images are build evidence, not authorized flash candidates. A later documentation commit changes the embedded Git identity, so any authorized firmware write requires a fresh clean rebuild and exact-image authorization.

## Cross-end audit result

### Ready for user-present HIL now

Only the Windows T11D.4 realtime-companion repair is ready. It keeps one Doubao WebSocket/session across event `359`, returns to listening after real speaker drain, fails closed on event `599`, and records only allowlisted diagnostic classifications.

### Not ready for physical HIL

- EasyInput T11E-A speaker is a local one-time low-volume boot probe only. The integrated source has not been flashed, and it does not implement desktop realtime speaker downlink.
- Xiaozhi T10C is code-only. Desktop has no manual-calibration UI, EasyInput has no strict T10C translator, Xiaozhi `app_main` injects no manual owner, `MOTION` remains disabled, and no real PWM/GPIO adapter exists.
- Servo supply/current capacity, common ground, installed axis mapping, provisional center, direction, mechanical limits and physical cutoff remain unverified. Therefore no servo movement or firmware flash is requested in this audit.

## Manual acceptance order

1. Use the launched T11D.4 desktop package with computer microphone and computer speaker.
2. Start Companion and request a story lasting at least 20 seconds.
3. Require complete audible playback, then a direct transition to listening on the same session: no `connecting`, no repeated welcome and no automatic stop.
4. Immediately speak a second-turn request such as “用一句话总结刚才的故事”; require a normal answer without restarting Companion.
5. End with the page button. Start once more and end with `Esc`. Both must return to idle without hanging, and only the compact Electron capsule may appear.
6. On any failure, stop repeating the test and export one sanitized diagnostic JSON from System Diagnostics. Do not include credentials, transcript or audio.

## Next code package after HIL

If the desktop HIL passes, the next motion package must add the missing Windows intent/UI and strict EasyInput translator while preserving T10C's correlated three-layer evidence. The user-visible control should expose axis selection, short ARM, recenter, emergency stop and repeated fixed `-1°/+1°` single steps; it must not accept arbitrary target angles or direct PWM values. A real Xiaozhi adapter remains a separate, later user-present electrical/mechanical gate.

No port scan, device identity read, Flash/NVS/eFuse access, erase, flash, monitor, audio capture, OLED command, PWM or servo operation occurred during this integration audit.
