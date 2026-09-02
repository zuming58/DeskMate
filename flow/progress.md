# Progress log

## 2026-09-02 - T10D-D movement HIL blocked before output by desktop request-ID regression

- The exact Stage 2 package reached the manual-control page with EasyInput writable and DeskMate Link `connected`, but `Start manual control` failed before center establishment. The user-visible result was `stale`; the direction pad correctly remained hidden because the manual session never became active.
- The user's fresh redacted diagnostic reports `manualCalibration.request={kind:status,id:8}`, `accepted=false`, `transport=stale`, while both EasyInput HID collections remain writable and DeskMate Link remains connected. No Xiaozhi terminal payload or output count was produced, so this is not servo, adapter or Stage 2 firmware evidence.
- Root cause is the Windows process-local `ManualCalibrationController.requestCounter`: it restarts from zero when DeskMate restarts, while EasyInput retains `max_request_id_` across that restart in the same USB mount epoch and rejects lower IDs as stale under the frozen host contract.
- The Windows-only repair was sent to the existing `DeskMate软件开发` task with source baseline `codex/t10d-d-simplified-manual-control@b5673e2`. Required acceptance is a monotonic request ID across desktop process restarts, deterministic first-run/corruption/uint32-boundary tests, full regression and a fresh isolated Windows package. No firmware, port or device action is authorized for that task.
- Classification: `STAGE2_APP_FLASH_VERIFIED / PHYSICAL_OUTPUT_NOT_RUN / WINDOWS_HIL_BLOCKED_REQUEST_ID_STALE`. Next: receive and audit the Windows fix, merge it into the integration branch, rebuild/relaunch the exact package, then resume start/center and four-direction user observation without reflashing either board.

## 2026-09-02 - Windows manual-control request ID restart recovery complete

- Exact delivery is `codex/t10d-desktop-request-id-recovery` from integrated baseline `b5673e203adc482cff658d84cab343f96b366b0b`; implementation commit is `d587626c1fb8c60b03eb64da72df640ee8382876`. The final documentation pointer is the branch HEAD containing this record.
- User-present HIL had already proved EasyInput connected, both required HID collections writable and DeskMate Link connected, but the first manual-control status request returned `stale` for request ID `8`. Root cause was Windows process-local request numbering: the desktop restarted from a low counter while EasyInput correctly retained its higher `max_request_id_` for the current USB mount epoch.
- Added one Electron-owned persistent request-ID sequence. It reserves a 4096-ID block before use, writes a checksummed primary and backup journal under Electron `userData`, resumes strictly above the persisted high-water after desktop restart and never wraps at `uint32` exhaustion. A valid journal copy can recover the other; two invalid copies, persistence failure or exhaustion fail closed before any device request is sent.
- First deployment begins at `0x40000000`. If the already-mounted EasyInput still rejects a read-only status request as stale, the same explicit user action may advance through a bounded sequence of higher floors and retry only that status query. It never guesses an unbounded value, replays a movement command or changes the frozen HID/DeskMate Link encoding.
- Verification passed: focused request-ID/manual-control tests `27/27`; `npm ci --include=dev`; full `npm test` `316/316`; packaged native bridge `--protocol-self-test`; `git diff --check`; and isolated Windows packaging at `release-t10d-request-id-recovery/win-unpacked`. Firmware diffs from the exact base are empty.
- Package evidence: `DeskMate.exe` is `202690560` bytes / SHA-256 `B70ECB55106BAE84C257BB02DCF6298F2EDEB96FF8DB5935860A00F092D39A2D`; `resources/input-bridge/DeskMate.InputBridge.exe` is `153512841` bytes / `3B0C0936D3A81CBFBAD400E1B635A51C09435872A8FCEBFB88293780E1B7B014`; `resources/app.asar` is `112816342` bytes / `06FE4D2FBAC62AD59139435B64A89AD1562AA2F222FE2277F7471152C0E23BD0`.
- Classification: `WINDOWS_ROOT_CAUSE_FIXED / CODE_BUILD_CONFIRMED / EXACT_PACKAGE_READY / HIL_RERUN_PENDING`. No application was launched, no device or port was accessed, and no firmware, Flash/NVS/eFuse, OLED, audio, PWM or servo operation occurred. Next: the integration owner launches this exact package, and the user presses start once without unplugging EasyInput to confirm the prior `stale` response is replaced by an accepted status result.

## 2026-09-02 - Xiaozhi Stage 2 app-only flash verified; movement HIL underway

- After the exact `COM13` Xiaozhi target was freshly identified as ESP32-S3, the user explicitly confirmed `确认烧录 COM13 小智`. The same private hardware identity matched again immediately before and after the write; it was not persisted in this repository or diagnostics.
- ESP-IDF v5.5.3 / esptool.py v4.12.0 wrote only `build-stage2-reference-manual-control-integrated/deskmate_xiaozhi_yuntai.bin` at `0x100000`. The app is `212720` bytes with SHA-256 `C47B6037C3424E4902D64B1AC732B8A8B4749B772632CE6C8F965B7EEBAF7AA2`; esptool reported `Hash of data verified`.
- No bootloader, partition table, OTA data, NVS or eFuse was written, and no erase command was used. The final post-write identity check completed before a hard reset returned the board to normal boot.
- The independently packaged Windows candidate `release-t10d-d-integrated/win-unpacked/DeskMate.exe` (SHA-256 `AF1F1BE1AD08367B9D2BE424D49A053880748EBBD7D2E8CE5D1B487BBD9BD842`) was then launched with no older DeskMate process present.
- Classification: `STAGE2_APP_FLASH_VERIFIED / WINDOWS_EXACT_PACKAGE_RUNNING / PHYSICAL_MOVEMENT_HIL_IN_PROGRESS`. No manual center/step/hold command was issued by the Agent. The user-present acceptance is now: start manual control, briefly hold each direction, confirm release stops further steps, return to center, then exercise emergency stop. Any jump, stall, collision, reset, unexpected direction or Link loss ends the test immediately.

## 2026-09-02 - T10D-D simplified manual control merged and independently verified

- The user explicitly authorized publication, and `codex/t10d-d-simplified-manual-control` through `16059286bc9155c82cccf6a4a3bb891a45030e87` was pushed to `origin` (`https://github.com/zuming58/DeskMate.git`) with the remote HEAD independently matched. This following documentation-only commit replaces the earlier pending-authorization handoff note.
- The main integration branch `codex/t10d-d-simplified-manual-control` merged the complete Windows delivery `codex/t10d-desktop-manual-control-ux@55e929bee6da65ddf2c78efc429834e986995572` with the Stage 2 hardware preparation. The tested implementation merge is `514ad6be7a5c54a8574174d26121ac07bdafabbe`; this progress pointer is the following documentation-only closure commit.
- The normal software path is now one environment confirmation/start action, four press-and-hold directions, return to center and always-visible emergency stop. Four individual attestations, lease/token controls, explicit axis selection, standalone ±1° clicks and large evidence cards are removed from the normal UI. Electron main still performs the unchanged terminal-gated select/ARM/center/step operations with one request in flight, at most 4 Hz and no replay after release or interruption.
- Independent desktop verification passed after merge: `npm ci --include=dev`, full `npm test` `310/310`, packaged native bridge `--protocol-self-test`, `git diff --check` and isolated Windows packaging at `release-t10d-d-integrated/win-unpacked`. `DeskMate.exe` is `202690560` bytes / SHA-256 `AF1F1BE1AD08367B9D2BE424D49A053880748EBBD7D2E8CE5D1B487BBD9BD842`; `DeskMate.InputBridge.exe` is `153512841` bytes / `A73314555755CFEF472538CCD04352DFAF3E98FCD8B046BEF15AD90B8CC8F46F`; `app.asar` is `112808866` bytes / `F57067E1B1F1020161F5780E15F97FED8AD776CB5B1B31491199CD711046F0F3`.
- Final-tree firmware verification passed EasyInput Host CTest `13/13` and Xiaozhi Host CTest `12/12`. An exact ESP-IDF v5.5.3 Stage 2 build again produced the `212720`-byte Xiaozhi app with SHA-256 `C47B6037C3424E4902D64B1AC732B8A8B4749B772632CE6C8F965B7EEBAF7AA2`; `app-flash_args` contains only `0x100000 deskmate_xiaozhi_yuntai.bin`. The unchanged `3072`-byte partition table remains SHA-256 `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0` and is not part of the future app-only write.
- One sandbox run initially could not read the installed Microsoft SDK, and the first package attempt found the isolated worktree's Electron dependency absent. Re-running under normal local permissions after the lockfile install passed; neither event was a product regression.
- Classification: `THREE_END_CODE_BUILD_CONFIRMED / HIL_READY_NOT_RUN`. No application was launched and no device/port was enumerated or accessed; no Flash/NVS/eFuse, erase, flash, monitor, OLED, audio, PWM or servo operation occurred. EasyInput needs no new firmware. Before physical testing, the Xiaozhi Stage 2 app requires a new exact app-only authorization and verified write, followed by user-present direction/release/center/e-stop acceptance.

## 2026-09-02 - T10D-D simple manual control contract and Xiaozhi Stage 2 build complete

- Exact implementation delivery is `codex/t10d-d-simplified-manual-control@f18928f066af9a433a5a83ac5310b90c06a45bb3`; this progress pointer is the following documentation-only closure commit.
- Root cause from the user-present no-motion attempt is now closed: Xiaozhi returned `CENTER_REQUIRED` with `completed_output_count=0`. The request route worked, but the old UI armed and stepped without first establishing a provisional center, so the endpoint rejected the action before PWM. This was not evidence of a failed servo.
- Froze `T10D_D_SIMPLE_MANUAL_CONTROL_V1_FROZEN`. The operator-facing surface is one environment confirmation/start action, press-and-hold left/right/up/down, return to center and emergency stop. Windows hides axis selection, the four wire attestations, 1..5 second one-use tokens and the three evidence layers, and serially expands each action into the unchanged T10C/T10D-A operations. Link `0x20/0x21` and HID `0x16/0x17` are byte-for-byte unchanged; EasyInput firmware requires no update.
- Added `profiles/stage2-reference-manual-control.defaults`. The already flashed Stage 1 image is limited to 1489..1511 us and cannot support useful hold control. Stage 2 restores the fixed-reference ranges previously exercised by this same assembled unit: yaw GPIO11 1055..1944 us and pitch GPIO12 1277..1722 us, both centered at 1500 us with fixed 11 us steps. Default `sdkconfig.defaults` remains locked; normal `MOTION`, presets, dancing and expression-linked movement remain disabled.
- Verification passed Xiaozhi Host CTest `12/12`, `git diff --check` and an independent exact ESP-IDF v5.5.3 fixed-partition build. Generated config contains all Stage 2 values. `app-flash_args` contains only app address `0x100000`. App is `212720` bytes / SHA-256 `C47B6037C3424E4902D64B1AC732B8A8B4749B772632CE6C8F965B7EEBAF7AA2`; unchanged partition table is `3072` bytes / SHA-256 `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0`.
- Classification: `CONTRACT_FROZEN / XIAOZHI_STAGE2_CODE_BUILD_CONFIRMED / WINDOWS_IN_PROGRESS / HIL_NOT_RUN`. No application or device/port was accessed and no Flash/NVS/eFuse, erase, flash, monitor, OLED, PWM or servo operation occurred. Next: receive the software task's exact branch/HEAD/tests/package, integrate and rebuild, then request one new explicit Xiaozhi app-only flash authorization for the exact final image before user-present hold/release/center/e-stop testing.

## 2026-09-02 - Xiaozhi Stage 1 reference-baseline app-only flash and exact verification confirmed

- After the exact authorization card was shown, the operator explicitly authorized the identified Xiaozhi target for app-only flashing. A same-operation preflight reconfirmed one ESP32-S3 target and the candidate SHA-256 before any write; private device identity was not persisted in Git or diagnostics.
- `esptool.py v4.12.0` wrote only the `212720`-byte app image at `0x100000` and verified the exact image digest successfully. Source implementation is `4a0eeccf8d077ae8899602354ec1f6f26280a48d`; app SHA-256 is `752ABFAB73E431084913AD5F85E429E9AE5816C79D0571DD6A2C470B6F2E3EC2`. No bootloader, partition table, OTA data, NVS or eFuse was written.
- The tool hard-reset the board after write and verify. This does not yet prove normal application boot, DeskMate Link readiness or servo motion. The candidate is structurally no-PWM at boot/status/select/ARM, and no manual output command was issued.
- User-present post-flash UI evidence then passed both no-output gates: a fresh status request completed, followed by Yaw selection with matching user-intent, EasyInput-accepted and Xiaozhi-terminal evidence. The terminal reports `owner=axis-selected`, `axis=yaw` and `completed_output_count=0`. The generic top-right Link label still displays `unavailable`, but the correlated terminal responses prove the active request path; this remains a separate stale/general-status UI defect.
- Classification: `STAGE1_APP_FLASH_VERIFIED / STATUS_HIL_CONFIRMED / YAW_SELECTION_HIL_CONFIRMED / PHYSICAL_OUTPUT_NOT_RUN`. Next: only after truthful runtime attestations, issue one-use ARM and provisional center while the operator is beside the unobstructed mechanism with immediate power cutoff available; stop before any one-degree excursion if there is noise, jump, stall, collision, reset or Link loss.

## 2026-09-02 - Xiaozhi reference-baseline Stage 1 micro-trial candidate prepared; flash not authorized

- The operator supplied the missing real-board evidence rather than unknown engineering numbers: this exact assembled Xiaozhi unit previously completed nod and rotation normally with the fixed reference firmware. The fixed source was re-read and establishes yaw GPIO11, pitch GPIO12, 50 Hz, 1500 us at 90 degrees and an approximately 11 us one-degree delta.
- Added the separate overlay `firmware/xiaozhi-yuntai/profiles/stage1-reference-trial.defaults`. It enables only the frozen manual-calibration owner/backend with 1500 us centers, 11 us fixed steps and a deliberately narrow 1489..1511 us envelope on each axis. Normal defaults and the source-tree `sdkconfig` remain Stage 0 locked; normal `MOTION`, presets, dancing and expression-linked movement remain disabled.
- The existing runtime safety sequence is unchanged: status first, one selected axis, four physical attestations, short one-use ARM, provisional center, at most one `-1 degree`/`+1 degree` observation, recenter and emergency stop. Construction, boot, status, axis selection and ARM produce no PWM; only an explicitly armed output can lazily configure the selected axis.
- Verification passed Xiaozhi Host CTest `12/12` and an independent generated-config ESP-IDF v5.5.3 fixed-partition build from implementation commit `4a0eeccf8d077ae8899602354ec1f6f26280a48d`. The generated config was inspected and contains every enabled/profile value; `app-flash_args` contains only the app at `0x100000`. The committed app-only image is `212720` bytes with SHA-256 `752ABFAB73E431084913AD5F85E429E9AE5816C79D0571DD6A2C470B6F2E3EC2`. The unchanged `3072`-byte partition table has SHA-256 `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0` and is not part of the app-only write. An earlier build that silently reused the Stage 0 source-tree `sdkconfig` was identified as a false candidate and rejected before any device access.
- The operator connected the Xiaozhi top USB-C data port. Fresh read-only enumeration found one new USB serial endpoint; `esptool` identified an ESP32-S3 revision v0.2 with 8 MB embedded PSRAM and 16 MB Flash, matching the Xiaozhi target and fixed partition contract. Private device identity was not written to Git or diagnostics. One initial `chip-id` spelling attempt exited in argument parsing before connection; the corrected `chip_id` and `flash_id` reads completed and hard-reset the board without reading user partitions.
- Classification: `STAGE1_REFERENCE_BASELINE_CODE_BUILD_CONFIRMED / TARGET_IDENTITY_CONFIRMED / FLASH_NOT_AUTHORIZED / SERVO_MOTION_NOT_RUN`. No Flash/NVS/eFuse read/write, erase, flash, monitor, OLED, audio, PWM, GPIO or servo operation occurred. Next: request one explicit app-only authorization for the exact `0x100000` image, then power-cycle and perform the user-present single-axis micro-motion sequence.

## 2026-09-02 - T10D-C Stage 0 protocol HIL confirmed; servo output remains untested

- Exact firmware source is `codex/xiaozhi-t10d-c-real-servo-adapter@c812ee0668bcdbbe8f640db617e60db02dc1eeac`. The user-authorized app-only image was written at `0x100000`; exact readback matched all `212704` bytes and SHA-256 `C38617DB94E8C17FF7D45EA5B40A8DA69FB29C289D9CC72E20DC666B7E32CCF4`.
- The fixed partition table was not written and is byte-identical before/after/build (`3072` bytes, SHA-256 `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0`). A complete pre-flash 6 MiB `ota_0` backup and a Git-external flash receipt were retained under ignored build evidence.
- User-present calibration-panel evidence reports `状态已读取`: the previous `UNKNOWN_TYPE (1)` is gone and the EasyInput -> DeskMate Link -> Xiaozhi `0x21` status round trip completed. Xiaozhi returned owner `locked`, selected axis `none` and fixed step `1°`, matching the default-disabled calibration gate, unavailable adapter and zero-PWM design.
- The generic top-right `DeskMate Link: unavailable` indicator conflicts with the successful terminal status response. It is provisionally classified as an unrefreshed/general Link state or stale UI cache, not as proof of a physical Link failure; root cause remains open.
- Classification: `STAGE0_PROTOCOL_HIL_CONFIRMED / DEFAULT_LOCKED / SERVO_OUTPUT_NOT_TESTED / STAGE1_PROFILE_BLOCKED`. No Stage 1 profile, PWM, GPIO11/GPIO12 output, servo movement, OLED command or audio operation was attempted. Do not start Stage 1 until the user-present power, common-ground, unloading, cutoff and measured axis-mapping evidence is complete and separately authorized.

## 2026-09-02 - T10D-C Xiaozhi real servo adapter Stage 0 package complete

- Real HIL established that the installed Xiaozhi board responds `UNKNOWN_TYPE (1)` to T10C manual-calibration status because its latest authorized image is T09.1: T09 app-only was flashed on 2026-08-30 (`b26e99e...`), T09.1 app-only on 2026-08-31 (`65144a1...`) with exact readback and normal boot, and no T10A/T10C/T10D manual-motion change was flashed afterward. It is neither stock/葡萄 firmware nor an unflashed board.
- Branch `codex/xiaozhi-t10d-c-real-servo-adapter` attaches the frozen T10C manual owner in production and adds a real dual-axis ESP-IDF backend from fixed reference evidence: yaw GPIO11/channel 0, pitch GPIO12/channel 1, low-speed timer 0, 14-bit, 50 Hz. DeskMate Link framing/messages, UART, OLED, audio, Wi-Fi, partitions, EasyInput and Desktop are unchanged.
- The committed Stage 0 configuration is fail-closed: calibration enable is off, all values are zero and all evidence flags are false. Status is recognized and reports locked/adapter unavailable, but construction, boot, status, select-axis and ARM cannot initialize LEDC or output PWM. Normal `MOTION` remains disabled.
- An enabled profile requires installed mapping, independent servo power, common ground, physical cutoff and both axes' measured center/direction/conservative limits/pulse-per-degree. The first possible backend call remains one selected-axis, four-attestation, short one-use-ARM provisional-center request; every output attempt consumes ARM, and range/backend faults fail closed while Link remains live.
- Verification passed Xiaozhi Host CTest `12/12` and exact ESP-IDF v5.5.3 / `esp32s3` fixed-partition build. The exact post-commit HEAD, image size and SHA-256 are reported in the handoff response; source/license, privacy/secret, ASCII path, build-output and scope checks are part of the final gate.
- Classification: `STAGE0_CODE_BUILD_COMPLETE / DEFAULT_LOCKED / STAGE1_PROFILE_BLOCKED / HIL_NOT_RUN`. No application, device/port, wiring, Flash/NVS/eFuse, erase, flash, monitor, OLED, audio, PWM/GPIO or servo operation occurred. The package may request separate Stage 0 app-only flash authorization after cross-audit; it cannot request physical motion.

## 2026-09-02 - T14A Hermes Agent adapter delivery verified and queued as a Windows follow-on

- Received and independently checked `codex/t14-desktop-agent-adapter-framework@8578f0cc8bef40ba269bb0960adbaf04c66432ed`; tested implementation is `be1a0afccc87aa32479d9cc8faeba916864d7091`. Git ancestry proves it starts from the exact T10D integrated Flow HEAD `1f7b58e60b288ebd8d3a65caa71fb926a69ff3ee`.
- Scope audit confirms a Windows-only follow-on: strict local Hermes lifecycle Hook parsing, one generic sanitized provider status surface, the existing single `AgentStatePublisher`, Codex compatibility, and an optional packaged Hermes plugin template. WorkBuddy remains explicitly manual because its authoritative product lifecycle is still unknown. No firmware or DeskMate host/Link contract file changed.
- Reported evidence was inspected from the pushed handoff: `npm ci --include=dev` passed, full Desktop tests `289/289`, Windows package passed, source/secret/ASCII/firmware-boundary checks passed. `DeskMate.exe` is `202690560` bytes / SHA-256 `95989A35243FA3AC4ED7B8FE83B36C5DE4035F07BA5502E860EFAD2DF89C1E99`; `app.asar` is `112772428` bytes / SHA-256 `7A27CDFCDE369CD60F8AB6EAF08A7E7144B1C9FB56A6DC585F90DD4A27BFDA43`.
- Classification is `SOFTWARE_FOLLOW_ON / CODE_BUILD_CONFIRMED / HIL_NOT_RUN / NOT_MERGED`. The task did not launch DeskMate, install/enable Hermes, change global Hook/plugin configuration, access devices/ports or touch firmware/hardware. Real Hermes lifecycle plus OLED observation remains an explicit user-present gate.
- The authoritative handoff remains on that branch at `docs/handoffs/t14a-desktop-hermes-agent-adapter-2026-09-02.md`. The current T10D exact-package gate and `NOT_READY` motion boundary are unchanged; the main Agent will select a later integration point rather than silently swapping the package under test.
## 2026-09-02 - Windows simplified manual-control UX and orchestration complete

- Created Windows-only branch `codex/t10d-desktop-manual-control-ux` from the accepted calibration diagnostics HEAD `e9c23c1dd2a23631a9bd809b53e94188ea3a364b`; implementation commit is `76d33f44bb6211130c4b9ed97c17aaeb926d89fd`. EasyInput and Xiaozhi source are unchanged.
- Replaced the expert calibration form with one environment confirmation, one start action, four press-and-hold direction controls, recenter, always-visible immediate stop and a collapsed diagnostic detail. The renderer no longer exposes four attestations, lease/token management, axis selection or individual ±1° click controls.
- Added one Electron-owned `ManualControlCoordinator` and terminal-gated scheduler. It expands each semantic action through the existing frozen `0x16/0x17` HID and T10C `0x20/0x21` path: hidden complete safety confirmation, fresh one-use ARM with 5000 ms lease, axis selection only when needed, then exactly one fixed step. At most one request is in flight, repeat cadence is at most 4 Hz, and there is no queue or replay.
- Session start serially establishes Yaw and Pitch centers; recenter serially handles both axes. Pointer release/cancel, lost capture, window blur, hidden document, page leave, device/Link disconnect and 60 seconds of inactivity stop future output and lock the session. Only `center-required` remains recoverable in-session; other transport/endpoint failures exit fail closed. Emergency stop remains available whenever the calibration interface is available.
- Effective Link presentation now accepts a correlated successful Xiaozhi terminal as bounded connected evidence when the generic diagnostic snapshot is stale/unavailable, but continues to keep user intent, EasyInput accepted and Xiaozhi terminal evidence separate. None of these facts is physical-motion evidence.
- Verification passed: `npm ci --include=dev`; focused manual-control/routing regression `41/41`; full `npm test` `310/310`; native packaged bridge `--protocol-self-test`; isolated `npm run build:desktop -- --config.directories.output=release-manual-control-ux`; `git diff --check`; firmware diff empty. Package hashes are recorded in `docs/handoffs/t10d-desktop-simplified-manual-control-2026-09-02.md`.
- Classification is `SOFTWARE_ORCHESTRATION_TESTED / BUILD_CONFIRMED / HIL_NOT_RUN`. No application was launched or controlled; no device, port, Flash/NVS/eFuse, firmware, OLED, audio, PWM or servo was accessed.
- Next: the main integration owner records this exact branch/HEAD. Real direction, center, limit, hold/release, recenter and emergency-stop behavior remain a user-present T10D hardware acceptance after the electrical/mechanical gates are satisfied.

## 2026-09-02 - Windows manual-calibration Link error diagnostics repaired

- Created Windows-only repair branch `codex/t10d-desktop-calibration-link-errors` from the accepted status-stream HEAD `7208b20236d585ced59aa6c4f6553e228efaa8b1`; implementation commit is `a712c90011dc966b99472b07d2cf0c9c45703ff5`. EasyInput and Xiaozhi source are unchanged.
- Preserved the generic transport result `link-error` while strictly decoding the frozen DeskMate Link error values `UNKNOWN_TYPE`, `BAD_PAYLOAD`, `NOT_READY`, `BUSY`, `SEQUENCE_CONFLICT` and `INTERNAL`. Unknown codes and inconsistent transport/flag/error combinations now fail closed.
- The manual-calibration panel now distinguishes “current Xiaozhi firmware does not support the protocol” from “protocol exists but owner/adapter is not ready”, shows the exact bounded Link error evidence, and keeps every movement control disabled. It never treats an EasyInput acceptance or Link error as Xiaozhi movement success or unlock evidence.
- Sanitized diagnostics now include one bounded `manualCalibration` latest fact: request kind/id, accepted boolean, generic transport, frozen Link error name/code, allowlisted endpoint result/state when present, and timestamp. No device identifiers, paths, network data, payloads or user content are exported.
- Verification passed: focused codec/controller/UI/diagnostics regression `30/30`; full `npm test` `299/299`; native bridge Release publish and protocol self-test; full `npm run build:desktop -- --config.directories.output=release-calibration-link-errors-npm`; `git diff --check`. The default output directory was locked by an existing process, which was not stopped or controlled. The isolated package `DeskMate.exe` is `202690560` bytes / SHA-256 `3D5B0C9022FA31CB46D302DDB88A4D3805592071FB16A649BB6783A08AC48F03`; bundled `DeskMate.InputBridge.exe` is `153512841` bytes / `88A7B980BE6185B6D272F0AFB9DE49272706D2AAB2C8E1EAD89E113C82A0C4C8`; `app.asar` is `112783381` bytes / `6D4222FC402BC5A7CDC3F2086ADFF4C379B6195DC27A0D398E356C58FBAFD6EB`.
- Classification is `HIL_INPUT_CONFIRMED / SOFTWARE_REPAIR_TESTED / BUILD_CONFIRMED / HIL_NOT_RERUN`. No application, port/device, firmware, Flash/NVS/eFuse, OLED, audio, PWM or servo operation occurred.
- Next: with the old DeskMate instance closed, run the exact isolated package and issue one read-only status query. `UNKNOWN_TYPE` identifies a Xiaozhi firmware protocol gap; `NOT_READY` identifies an implemented protocol whose calibration owner/real adapter is unavailable. Both remain status-only and keep movement disabled.

## 2026-09-02 - Windows status-stream bounds aligned with EasyInput

- Created Windows-only repair branch `codex/t10d-desktop-status-stream-bounds` from the accepted HID routing HEAD `72ee0e499f7afa551498654e3062f66112b88cab`; implementation commit is `60584bc5427c2a0840342a79e7909587d8bb4a58`. EasyInput and Xiaozhi source are unchanged.
- Root cause was confirmed from read-only HIL evidence and source contracts: a full config read completed `26/26`, while the approximately 1104-byte status response emitted no progress because the native bridge rejected its first `0x11` status chunk against stale `1023`-byte / `21`-chunk limits. Firmware owns a 1536-byte status buffer, so the Windows defensive ceiling is now 1536 bytes / 31 chunks at 50 data bytes per report.
- Regression vectors now cover a real-size 1104-byte / 23-chunk stream, the 1535-byte / 31-chunk effective JSON edge, explicit 1536-byte acceptance, and 32-chunk / 1537-byte rejection. Full-config and status limits remain independent.
- Verification passed: focused native/bridge regression `35/35`; full `npm test` `296/296`; .NET Release build and protocol self-test with zero warnings/errors; `npm run build:desktop`; `git diff --check`. Package is `release/win-unpacked`; `DeskMate.exe` SHA-256 is `154C5BA813B25472A1920FDCC766F49BB4A5A4B99744ECEEBEDF71E0E59B6C4F`; bundled `DeskMate.InputBridge.exe` SHA-256 is `DFE27722DFAF1CA7A59B881511C7E39C258BCBD2068F429F2D73AB035571FC0D`; `app.asar` SHA-256 is `3E33558D926994C7250142AA72EBC8759FBE74B146615018E25CC296864F872F`.
- Classification is `ROOT_CAUSE_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. No application, device/port, firmware, Flash/NVS/eFuse, OLED, audio, PWM or servo operation occurred.
- Next: main task launches only the exact package after closing any old instance, reads status once, and confirms config progress reaches about `23/23`, Link evidence becomes available, and Agent State evidence remains separate. Do not infer Xiaozhi display or motion from a successful Windows read.

## 2026-09-02 - Windows HID multi-collection routing repair complete

- Created Windows-only repair branch `codex/t10d-desktop-hid-collection-routing` from exact accepted software HEAD `8578f0cc8bef40ba269bb0960adbaf04c66432ed`; implementation commit is `7333cf3f43635cb7b14fdb868a4967da81c3aed5`. The dirty primary checkout and both firmware modules were not modified.
- Root cause was confirmed in the native bridge: reports `0x10..0x15` and manual calibration `0x16/0x17` are separate EasyInput top-level collections, but Windows selected the first VID/PID/length-compatible path and subscribed Raw Input only to `FF00:0002`. The repair freezes exact VID/PID, Usage Page, Usage and 64-byte platform lengths; config/Agent State routes to `FF00:0002`, calibration routes to `FF00:0007`, and Raw Input registers both collections.
- Enumeration evidence now separates any EasyInput HID, writable config collection and writable calibration collection. A calibration-only removal no longer tears down config/Agent State; a returning config collection triggers one bounded Link refresh. Diagnostics/UI and exported JSON expose only these booleans/closed states, never paths or identifiers, and never infer Xiaozhi Link connectivity.
- Verification passed: focused native/routing regression `41/41`; full desktop `npm test` `295/295`; .NET Release build; renderer build; `git diff --check`; independent Windows package at `release-hid-routing/win-unpacked`. `DeskMate.exe` SHA-256 is `154C5BA813B25472A1920FDCC766F49BB4A5A4B99744ECEEBEDF71E0E59B6C4F`; bundled `DeskMate.InputBridge.exe` SHA-256 is `8FA5FB1D093F2C44285334C3D0019845EC9E8D7626F47AF649ACF7E370A36386`; `app.asar` SHA-256 is `3E33558D926994C7250142AA72EBC8759FBE74B146615018E25CC296864F872F`.
- Classification is `ROOT_CAUSE_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. The default package directory was locked by an already-running DeskMate process, so it was not overwritten or terminated; the identical package step passed in the independent output directory. No app control, device/port access, firmware, Flash/NVS/eFuse, OLED, audio, PWM or servo operation occurred.
- Next: close the old DeskMate instance and launch only the exact independent package. Confirm both HID collection rows become writable, then send one real Agent State and issue one read-only manual calibration status query. Observe EasyInput ACK, real Link state and the Xiaozhi terminal separately; do not claim motion or proceed to a movement command.

## 2026-09-02 - T14A Windows Hermes lifecycle adapter code/build gate complete

- Created isolated Windows-only branch `codex/t14-desktop-agent-adapter-framework` from the accepted three-end integration HEAD `1f7b58e60b288ebd8d3a65caa71fb926a69ff3ee`; tested implementation is `be1a0afccc87aa32479d9cc8faeba916864d7091`. The dirty primary checkout was not modified.
- Froze `T14A_DESKTOP_AGENT_ADAPTER_V1_FROZEN`. Added a strict `deskmate-hermes-status-v1` receiver, official Hermes lifecycle mapping and one generic sanitized provider status surface while preserving the existing Codex pipe and IPC aliases. Both providers reuse the single `AgentStatePublisher`; VoiceWorkflow and the active companion conversation remain higher priority.
- Added a repository-owned Hermes plugin template using documented `plugin.yaml`/`__init__.py` structure and ships it only as a read-only package resource. It queues only allowlisted event/tool/outcome metadata, drops when DeskMate is absent, and was not installed or enabled in user configuration. WorkBuddy remains manual because the exact product/version and authoritative lifecycle contract are unknown.
- Verification passed: `npm ci --include=dev`; full `npm test` `289/289`; `npm run build:desktop`; `git diff --check`; secret-pattern, ASCII path and unchanged-firmware checks. Package build ID is `t14a-hermes-agent-adapter-v1`; `DeskMate.exe` is `202690560` bytes / SHA-256 `95989A35243FA3AC4ED7B8FE83B36C5DE4035F07BA5502E860EFAD2DF89C1E99`; `app.asar` is `112772428` bytes / SHA-256 `7A27CDFCDE369CD60F8AB6EAF08A7E7144B1C9FB56A6DC585F90DD4A27BFDA43`.
- Classification is `CONTRACT_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. No application, port/device, global Hook/plugin configuration, firmware, Flash, OLED, servo or audio hardware was accessed.
- Next: after the user explicitly reviews and enables the Hermes plugin, run one real lifecycle acceptance for thinking/working/waiting/completed/error and verify Codex remains unchanged. WorkBuddy automatic support waits for exact product identity instead of process/window guessing.

## 2026-09-02 - T10D three-end integration candidate rebuilt and ready for software HIL

- Created isolated branch `codex/t10d-three-end-integration` from control HEAD `b0a95d1c254d8fb8fad62933f76fa71fe7da10a3` and merged the exact Windows delivery `codex/t10d-desktop-manual-calibration-ui@67325032eee4b8e056de23c1c9b204b6d442d2f8`. The tested implementation merge is `fd3204a2b294535a1f865d9a2901e16e257179d8`; the dirty primary checkout was not modified.
- Shared Flow/document conflicts were reconciled once. The Windows decisions that collided with the hardware branch's D053-D059 range were renumbered to D060-D066 without changing behavior. Implementation directories had no cross-module conflict, and firmware source is byte-for-byte unchanged from the T10D-A control baseline.
- Desktop verification passed: `npm ci --include=dev`, full `npm test` `283/283`, and the exact Windows package with build ID `t10d-three-end-integration-v1`. `DeskMate.exe` is `202690560` bytes / SHA-256 `F0257A6FEC1221815FB9EF07A4191402C8BDF06D00A3780E0F2F6ECEB595DFC5`; `app.asar` is `112760686` bytes / SHA-256 `FB0E727AEC47753845CCE407D2C249AAF764CC48620FD515281A01DEA768692E`.
- EasyInput verification passed Host CTest `13/13` and exact ESP-IDF v5.5.5 fixed-layout build. App size is `0xD2F60`; app SHA-256 is `21D27F5BCF7E818F8778D4DFA0E59809AE3F598F34F3F7036A68512036CC199A`; partition-table SHA-256 is `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`. The required 24 KiB NVS, 4 KiB PHY, 3 MiB factory and two 576 KiB sound banks remain intact.
- Xiaozhi verification passed Host CTest `11/11` and exact ESP-IDF v5.5.3 fixed-layout build. App size is `0x32660`; app SHA-256 is `582EAF3EA2F09B3EFC279FB6B526D7140B546068B2AB082EEE2B0B6594BC8CFD`; partition-table SHA-256 is `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0`.
- Classification is `THREE_END_CODE_BUILD_CONFIRMED / HIL_NOT_RUN`. No application was launched, no device or port was enumerated, and no Flash/NVS/eFuse, audio, OLED, PWM or servo operation occurred. Production Xiaozhi still advertises no motion capability, so the T10D-B controls must truthfully remain `NOT_READY` and disabled.
- Next: launch only `release-t10d-three-end-integration/win-unpacked/DeskMate.exe` for the documented software user matrix. T10D-C electrical/mechanical Stage 0 and any real adapter, flash or physical motion remain separately authorized user-present work.

## 2026-09-02 - T10D-B Windows manual calibration UI delivered; integration candidate is next

- Verified the software task handoff and remote ancestry: `codex/t10d-desktop-manual-calibration-ui@67325032eee4b8e056de23c1c9b204b6d442d2f8`, implementation `695c47d255ccfc8b09e1fd2e9644735b7c0c1017`, is based on T13 `35e627389282d8279d82646787f509681474c048` and consumes the EasyInput frozen contract from control HEAD `1645bf688b11d2f0d7ba3dfa7900f552886cb404`.
- Delivered Windows scope: strict HID `0x16/0x17` codec, .NET write/response validation, single request and USB mount epoch, status-first gate, four safety attestations, one-use ARM token, fixed yaw/pitch ±1° control, provisional center/recenter/e-stop/clear, and independent user-intent/EasyInput-accepted/Xiaozhi-terminal evidence. Production `NOT_READY` stays visible and disables output.
- Verification reported and handoff inspected: focused `14/14`, full `283/283`, desktop build/package and source-boundary checks pass. `DeskMate.exe` is `202690560` bytes / `2DD0ECB13782AE5287977A13A34EFAA9711D7655D71DF67A6C1364EF0428F101`; `app.asar` is `112760685` bytes / `E03DB4A22E3695496108159FDAF4F34E3708713D3AF7EECDE3497962E23150E1`.
- Classification remains `CONTRACT_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. No application, device, firmware, Flash/NVS, OLED, audio or servo operation occurred. The software handoff remains on its branch at `docs/handoffs/t10d-b-desktop-manual-calibration-ui-2026-09-02.md`.
- Next: main Agent creates a new isolated integration candidate joining T10D-B/T13 Windows history with T11F + T10D-A, resolves shared Flow/docs once, and reruns Desktop package plus both firmware Host/IDF gates. T10D-C real adapter and Stage 0 remain user-present and separately authorized.

## 2026-09-02 - T10D-A EasyInput manual-motion bridge code/build gate complete

- Delivered `codex/t10d-easyinput-manual-motion-bridge` implementation commit `0c69d9b3d89b99a2f29d502586b46ad40dd7131e`. The additive `EASYINPUT_MANUAL_CALIBRATION_HOST_V1_FROZEN` contract assigns Feature `0x16` and Input `0x17`, both with 63-byte payloads, strict CRC/padding/semantic checks and committed golden vectors.
- EasyInput now accepts one correlated Host request, reports accepted and terminal evidence independently, forwards the exact frozen T10C `0x20/0x21` payloads through the existing UART owner, and fails closed on busy/conflict/stale, timeout, bad response, USB epoch change, Link disconnect and peer restart. Diagnostics contain bounded counters/boot evidence only.
- Safety remains structural: ARM needs four attestations, a non-zero one-use token and 1000..5000 ms lease; output commands contain only selected yaw/pitch and fixed `-1/+1` direction. There is no arbitrary angle, pulse, duty, PWM, GPIO or EasyInput-local servo adapter.
- Verification: complete EasyInput Host CTest passed `13/13`; exact ESP-IDF v5.5.5 build passed with unchanged fixed partitions (24 KiB NVS, 4 KiB PHY, 3 MiB factory, two 576 KiB sound banks), app size `0xD2F60`. No device/port, application, Flash/NVS/eFuse, flash, monitor, audio, OLED, PWM or servo action occurred.
- Software handoff is documented at `docs/handoffs/t10d-a-easyinput-manual-motion-bridge-2026-09-02.md`. T10D-B must implement a status-first yaw/pitch/ARM/provisional-center/±1°/recenter/e-stop/clear UI and keep intent, forwarding and endpoint evidence separate. Current production Xiaozhi is expected to return `NOT_READY`; T10D-C remains hardware locked.
- Separately received the DeskMate software T13 delivery `codex/t13-desktop-persona-memory-intent@35e627389282d8279d82646787f509681474c048` (implementation `04f1fc06e0021fd44dbe2a9ba99bcadb599714bf`): persona, reviewed memory, managed knowledge projection/embedding, safe intent bridge and bounded Codex lifecycle summary; `276/276` plus build/package passed, with user acceptance still pending. It is recorded in the total plan but not merged into T11F.

## 2026-09-02 - Firmware continuation split selected while DeskMate software continues independently

- The DeskMate software task reaffirmed its Windows-only boundary and delivered `codex/t12b1-provider-endpointing-repair@710595f0b8b4bd209721fef9c6a96d5b80f43481` with `270/270`, packaging and pending exact-package custom-VAD HIL. Its later memory, persona, wake and intent/application-control work remains in that task and will return exact handoffs to the main Agent.
- Main-agent firmware analysis selected T10D-A as the next safe parallel package: freeze and implement only the Desktop→EasyInput manual-calibration transport and strict EasyInput→Xiaozhi translator against the already frozen T10C messages. It will use a fake endpoint and Host/build gates; no Windows UI, real Xiaozhi adapter, PWM, motion, app launch or device access enters this slice.
- Xiaozhi requires no new display/state code for current companion behavior. Its next production change is intentionally deferred until T10D-A and the later T10D-B UI are integrated and the user-present electrical/mechanical Stage 0 evidence is accepted. Preset actions and dancing remain later than manual two-axis calibration.
- EasyInput T11E-B local-speaker HIL remains an independent, separately authorized hardware gate. Realtime desktop speaker downlink stays `NOT_FROZEN` until the local probe and microphone-priority behavior pass.
- Added `flow/tasks/T10D-A-easyinput-manual-motion-bridge.md` and D058. No implementation source, application, port/device, Flash/NVS/eFuse, audio, OLED, PWM or servo was touched in this planning update.

## 2026-09-02 - Main Agent reconciled all three task Flows into one project control plan

- Read and cross-checked the latest `EasyInput固件开发`, `DeskMate软件开发` and `小智云台固件开发` task conclusions against their actual branch-local `flow/` files, Git ancestry, worktree state and pushed HEADs. The primary checkout was intentionally left untouched because it remains a dirty T07C worktree.
- Root cause of the stale T06/T07-looking plan: every feature branch updated its own `flow/`, but no integration owner recollected those facts after the T11F hardware integration and the later T12 software work diverged. T11F contains the current EasyInput/Xiaozhi integration, while T12A/T12B/T12B.1 continued from the pre-T11F desktop history; neither line alone is the complete product.
- Established `codex/project-control-reconciliation-2026-09-02` from exact clean T11F HEAD `ee0ac8418b1d7c0497f72e3edc67b5ee39b232d4`. This branch changes control documentation only and does not merge the still-unaccepted software candidate or alter firmware.
- Unified status: software candidate `codex/t12b1-provider-endpointing-repair@710595f0b8b4bd209721fef9c6a96d5b80f43481` has `270/270` and a successful Windows package but still needs exact-package custom-VAD HIL; EasyInput microphone is accepted, speaker is code/build only; Xiaozhi display/state chain is accepted at T09, T10C motion remains code-only with production MOTION disabled.
- Added the authoritative current map at `docs/status/current-integration-map-2026-09-02.md`, updated `flow/plan.md`, and recorded the permanent integration-owner decision and branch-local Flow lesson. Next action is the T12B.1 user gate; after acceptance the main Agent creates the next three-end integration branch and reruns all three module gates.
- No application was launched or controlled, no port/device was enumerated, and no Flash/NVS/eFuse, audio, OLED, PWM or servo operation occurred.

## 2026-09-01 - T11F three-end integration audit complete; desktop HIL is the only open user test

- Integration: isolated branch `codex/t11f-three-end-integration` merged desktop `3a62bf1`, EasyInput `0407ba6` and Xiaozhi `b83ce88`; implementation directories had no merge conflicts. Shared flow/document conflicts were resolved by retaining all current facts without upgrading hardware claims.
- Verification: desktop `246/246` and Windows packaging passed; EasyInput Host `12/12` plus ESP-IDF v5.5.5 fixed-layout build passed; Xiaozhi Host `11/11` plus ESP-IDF v5.5.3 fixed-layout build passed. Exact artifacts and hashes are recorded in `docs/handoffs/t11f-three-end-integration-audit-2026-09-01.md`.
- HIL decision: the launched T11D.4 desktop package is ready for one long-response/same-session/second-turn/stop matrix. EasyInput speaker HIL requires a later separately authorized app-only image. Servo HIL is not available: Windows UI and EasyInput translator are absent, Xiaozhi production owner/real adapter are disabled, and electrical/mechanical gates remain unknown.
- Safety: no port/device/Flash/NVS/eFuse access, erase, flash, monitor, audio capture, OLED command, PWM or servo action occurred. Next, record the desktop result; if accepted, open the strict Windows→EasyInput T10C route package before any real-adapter or mechanical work.

## 2026-09-01 - T10C Xiaozhi manual calibration candidate complete, motion remains locked

- What changed: branch `codex/xiaozhi-t10c-manual-calibration` freezes the additive `T10C_MANUAL_CALIBRATION_LINK_V1_FROZEN` contract and adds a pure C++ manual owner, disabled/fake servo adapters and optional simulated endpoint injection. Base framing/CRC/UART and existing messages are unchanged.
- Safety semantics: output requires selected axis plus a volatile one-use ARM token; only adapter-local provisional center, fixed 1.0-degree direction step and recenter exist. Emergency stop is highest priority and idempotent. Expiry, disconnect and peer restart disarm without replay.
- Production boundary: `app_main` injects no owner, the real adapter is absent, and MOTION capability stays disabled. Windows/EasyInput forwarding is not implemented. Installed mapping, supply/current/common ground, center, direction, limits and cutoff remain unknown.
- Verification: final branch HEAD `b83ce886ec8efd1fea288a65e0127d2a887d5883`; Xiaozhi Host CTest `11/11`; exact ESP-IDF v5.5.3 fixed-16-MiB build passed. No device/Flash/NVS/eFuse/OLED/audio/PWM/GPIO/servo operation occurred; this is not a flash candidate.

## 2026-08-31 - Xiaozhi OLED animation polish merged as code-only evidence

- Bounded idle blinking, a distinct waiting scene and a one-slot latest-wins display mailbox were added without activating motion or Xiaozhi audio. OLED failure remains fail-soft for the Link baseline.
- Host and exact ESP-IDF v5.5.3 build gates passed in the source branch; this integration does not authorize a new image write or claim OLED HIL.

## 2026-09-01 - T11E-A EasyInput local speaker code and independent audit complete

- Implementation: I2S1 uses GPIO14/13/15 at 48 kHz, 16-bit mono-left with one synthesized low-volume startup probe. The existing GPIO8 controller remains the sole physical power writer through its `Speaker` lease; no sound-bank, desktop, HID, UDP or DeskMate Link audio trigger was added.
- Arbitration and audit repair: microphone generations have absolute priority and cancel active playback before I2S0 begins. Independent review closed microphone teardown gaps so unresolved I2S deletion or GPIO8 lease release faults capture closed rather than admitting overlapping hardware ownership.
- Verification: EasyInput Host CTest `12/12` and exact ESP-IDF v5.5.5 fixed-16-MiB build passed. Status remains `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED`; no device, Flash/NVS/eFuse, sound bank, Xiaozhi or servo operation occurred.

## 2026-08-31 - T10E EasyInput microphone path accepted

- Real HIL confirmed non-zero board audio, repeated start/stop and a real S1 voice-input transcription after repairing the single-UDP-endpoint and I2S timeout-unit defects.
- Product decision: computer microphone remains the default; the working EasyInput LAN microphone remains selectable. This integration preserves the accepted firmware and does not authorize a new image write.

## 2026-09-01 - T11D.4 same-session dialog boundary restored; DialogCommonError root diagnostics ready

- Scope and identity: Windows software only on `codex/t11d4-dialog-error-root`, created from exact rejected T11D.3 base `e637b73fa59e29f7ac6799002c9c68f986c0fc76`; implementation and verification commit is `9055b00215e8846c578267ea20ce4686dffcf9dd`. Build identity is `t11d4-dialog-error-root-diagnostics-v1`.
- Root cause and correction: the visible `connecting` transition and repeated welcome were caused by T11D.3 replacing the provider/session after event `599`. Official evidence keeps event `359` as a TTS-turn boundary in one continuous WebSocket/session and defines `599` as `DialogCommonError`. T11D.4 removes the speculative post-TTS reconnect, drains directly back to listening on the current provider, and keeps `599` fail-closed. The upstream provider reason for the live `599` remains unknown because the rejected package did not retain an allowlisted status class.
- Privacy-safe evidence: the adapter maps only official `status_code` shape/value to a closed status class. Diagnostics add an adjacent-error count, class and adjacency enum while retaining arrival phase. Raw code, message, payload, text, PCM, timestamps and identifiers remain excluded. T11D.3 recovery-success counters are removed because a new session is not continuity.
- Verification: `npm ci --include=dev` passed; targeted controller/terminal/stop/computer-audio tests passed `49/49`; full `npm test` passed `246/246`; isolated Windows packaging passed. `DeskMate.exe` is `202690560` bytes / SHA-256 `59E6E167AF10695F4F042A6EA5B9D3023F9B5A1E530F8FAD072CD15A5603D537`; `app.asar` is `112642631` bytes / SHA-256 `6506FEB7458CAEB6A7F4D1B9B13A363D1DA529BE5A86DFCC394FB2D7CECA8B28`; read-only inspection confirmed the build identity. Firmware boundary, ASCII path, ignored-output and `git diff --check` checks passed.
- Safety and next: no app launch/control, user diagnostic, credential, audio/text, device, port, Flash, firmware or hardware access occurred. Status is `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. The next user-present gate is one long response followed by a second turn on the same session, with no `connecting` or welcome replay. If `599` remains, export one sanitized diagnostic and select the next repair from its status class, phase and adjacency; do not guess. Contract: `docs/contracts/t11d4-dialog-error-root-diagnostics-v1.md`; audit: `docs/reviews/t11d4-dialog-error-root-cause-audit-2026-09-01.md`; handoff: `docs/handoffs/t11d4-dialog-error-root-diagnostics-2026-09-01.md`.

## 2026-09-01 - T11D.3 evidence-selected post-TTS dialog recovery complete; HIL pending

- Scope and identity: Windows software only on `codex/t11d3-post-tts-dialog-recovery`, created from exact T11D.2 base `c28a54e30f2d1afbe44c1b64e0b72af543eeeebd`; implementation and verification commit is `bd54437631660f635f3de980f8ea4e99bac2a4bd`. Build identity is `t11d3-post-tts-dialog-recovery-v1`.
- HIL-selected behavior: the new T11D.2 evidence showed `tts.end` sequence `244`, successful speaker drain, then adjacent active-phase `dialog-error` sequence `245`, with no queue drop, drain timeout, error frame, reflected ASR or transport close. Only this current-token/current-provider-epoch vector consumes its successful-drain evidence and enters the existing finite reconnect path. It returns through `connecting -> listening` without replaying audio or text.
- Failure and ownership boundary: non-adjacent, pre-drain, failed-drain, error-frame, session-failure, stopping and stale-provider events remain fail-closed. Two recoveries are allowed without a new accepted user-final turn; a new real user turn resets the streak. Stop/new generation wins. Four counts and one closed result enum provide proof without provider content or identifiers.
- Product surface: the duplicate long React bottom live bar is removed. The independent 320x58 non-focus-stealing Electron overlay remains the sole floating capsule; the companion page keeps its face, status and controls. Seven-state face synchronization remains unimplemented and separate.
- Verification: `npm ci --include=dev` passed; targeted controller/terminal/UI tests passed `46/46`; full `npm test` passed `250/250`; isolated Windows packaging passed. `DeskMate.exe` is `202690560` bytes / SHA-256 `F1837C3D1DC5507D2EC227709472F6CB21939FA2DBB4B5A51BD04C7C8ADAC5A1`; `app.asar` is `112643656` bytes / SHA-256 `B1376358FD45DC787ECDD7BC44F63DD522EC328B0C0B29BC5690019693568642`; read-only inspection confirmed the build identity. Differential privacy, ASCII path, ignored-output, firmware boundary and `git diff --check` checks passed.
- Safety and next: no app launch/control, user diagnostic, credential, audio/text, device, port, Flash or firmware access occurred. Status is `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. Run three real turns including one >10-second answer, then verify recovery counters, stop during listening/playback and the single overlay. Contract: `docs/contracts/t11d3-post-tts-dialog-recovery-v1.md`; handoff: `docs/handoffs/t11d3-post-tts-dialog-recovery-2026-09-01.md`.

## 2026-09-01 - T11D.2 Doubao terminal diagnostics complete; behavior repair awaits new HIL evidence

- Scope and identity: Windows diagnostic-only branch `codex/t11d2-doubao-terminal-diagnostics` was created from exact T11D.1 base `1243570244133370c6de70dc241f208a23f6409d`; implementation commit is `355f8b2835f06e09c74c45a29f9f46aefdccc0d2`. Build identity is `t11d2-doubao-terminal-diagnostics-v1`.
- Evidence: provider events now receive a process-local arrival sequence before controller queueing. Independent counters and closed enums distinguish error frame, dialog error, session finish/failure, connection finish and transport error/close, including whether a terminal arrived during explicit stop or while `tts.end` waited for speaker drain.
- Privacy and behavior boundary: provider error codes map only to fixed coarse buckets. Raw code/message/payload, text, PCM, timestamps and connect/session/request/message identifiers remain excluded. Reconnect, stop, error handling, audio credit/drain, strict half-duplex, UI expressions and all firmware are unchanged.
- Verification: `npm ci --include=dev` passed; targeted terminal/privacy plus long-answer/backpressure/stop/half-duplex regressions passed `59/59`; full `npm test` passed `242/242`; isolated Windows packaging passed. `DeskMate.exe` is `202690560` bytes / SHA-256 `EA82E908ADDCB143CDF95579A3912C313C65D0543A3A86B710BA2D454B8A625A`; `app.asar` is `112642539` bytes / SHA-256 `C1827A5F3370C1B5D8D2E36AC5FE80EB6F0917D8E34008271B0DC4C6095A274F`. Read-only inspection confirmed the T11D.2 build identity.
- Safety and next: no app launch/control, user diagnostic, credential, audio/text, device, port, Flash or firmware access occurred. Status is `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. One new exact-package conversation and sanitized export must select `error-frame`, `dialog-error`, session terminal or transport terminal before any behavior repair. The audited Desktop/Xiaozhi seven-state face synchronization is not implemented in this package. Contract: `docs/contracts/t11d2-doubao-terminal-diagnostics-v1.md`; handoff: `docs/handoffs/t11d2-doubao-terminal-diagnostics-2026-09-01.md`.

## 2026-09-01 - T11D.1 queue/runtime root repair implemented; Windows HIL pending

- Scope and base: Windows software only on `codex/t11d1-companion-queue-runtime-root-fix`, created from audit baseline `d21b8d1e304fd45d35181794065ebe5edc3ee021`; implementation and verification commit is `0e0adcc99d0277461d816563978de2f898213371`. The rejected T11D evidence was preserved: speaker `queueDrops=3` explained truncation, and captured whole-runtime updates explained renderer stopping after main idle.
- Playback: renderer/main now exchange sequence-bound `accepted`, natural `played` and explicit `cancelled` outcomes. Main grants a finite 3000 ms playback credit window and backpressures later writes; acceptance/credit timeouts fail the session explicitly. No overflow path stops old nodes and continues silently. Drain waits all accepted audio, while interrupt/stop cancel blocked writes without creating a false error.
- State and stop: runtime slices use reducer-owned atomic merges. Main events/status carry monotonic sequence and generation, and reconnect rechecks ownership after awaits. Page, capsule and Escape share one awaited single-flight stop with bounded returned-status reconciliation and a retryable sanitized failure state.
- Evidence: diagnostics add fixed build ID, main/render state, stop/provider/audio lifecycle enums and counts and correct realtime service configuration. They exclude user diagnostic source files, PCM, text, IDs, credentials and device/network/window data.
- Verification: clean `npm ci --include=dev` passed; targeted production regression `59/59`; full `npm test` `234/234`; isolated Windows directory packaging passed. `DeskMate.exe` is `202690560` bytes / SHA-256 `292D3BBB3C134E8A76A0DAEF3499E3EC2A457776708E93D13041EC49F62589E7`; packaged `app.asar` is `112635192` bytes / SHA-256 `07B7E402F46EB5468E430933A2E02AF2BA7E3D5FCFBFB8FC67478F0DF03A3F1D`, and read-only inspection confirmed build ID `t11d1-playback-runtime-root-fix-v1`. Status: `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. Contract: `docs/contracts/t11d1-companion-playback-credit-runtime-stop-v1.md`; handoff: `docs/handoffs/t11d1-companion-queue-runtime-root-fix-2026-09-01.md`.

## 2026-09-01 - T11D user-present gate failed; queue/state audit complete and repair paused

- Exact evidence: the running processes were independently verified to come from the exact T11D package, excluding an old package. A stuck-state sanitized export reported renderer `stopping/connected`, `queueDrops=3`, `ignoredAsrDuringPlayback=0`, while terminal Agent `idle` had already been acknowledged 13 seconds earlier. The diagnostic file itself was not committed.
- Root causes and candidates: the current three-second renderer backlog policy stops all scheduled nodes and silently continues with newer audio, directly explaining audible truncation. Companion, InputBridge and EasyInput-audio effects also replace the entire nested `runtime` from the same render snapshot; frequent Link updates can therefore overwrite a newer companion idle with stale stopping. Both behaviors are reproduced in two non-production characterization tests. Server VAD remains under-instrumented but is not required to explain this run.
- Package audit: `DeskMate.exe` remains 202,690,560 bytes / `45480D7E2C624B0449E6E962FB8550109BC8B2020D70C75C5633CEEA069E279B`; `app.asar` is `CAC299F816EA364C04F4EB67AEC6FBB8F624216E196406D104B441373B2A9C5B`. Packaged controller SHA matches source `AD839A11FD3E7117D475C9CF6730A5869ACA3272AC5D6ACB3CC4FE0F228522A8`, proving T11D stop/drain code is present. The package still lacks visible build identity.
- Verification: clean `npm ci --include=dev` passed; the two new failure-characterization vectors passed `2/2`; controller/audio plus characterization tests passed `29/29`; full `npm test` passed `224/224`; `git diff --check` passed. No new Windows package was produced because this package is an audit, not a repair.
- Status and scope: `T11D_HIL_FAILED / AUDIT_COMPLETE / PRODUCTION_REPAIR_NOT_STARTED`. No production code, package, application, credential, audio, device, port, firmware, OLED or servo was changed/accessed. The next package must replace silent queue clearing with bounded continuous playback/backpressure or explicit failure, make runtime slices atomic and ordered, unify awaited stop/reconciliation, and add build/stop/provider/audio lifecycle diagnostics. Audit: `docs/reviews/t11d-companion-stop-drain-hil-failure-audit-2026-09-01.md`; HIL: `docs/testing/t11d-companion-followup-hil-2026-09-01.md`.

## 2026-09-01 - T11D played-boundary, bounded stop and Companion layout repair complete

- Role and identity: Windows desktop software only. Branch `codex/t11d-companion-stop-drain-capsule` was created from exact T11C base `fb17123f01f812de0ef2d3fe6b5fdd06c429898c`; implementation/documentation commit is `7a138e53c3d8c017a8f54eec9efd1267866af98e`.
- HIL fact and cause: the user completed several real T11C turns, so the provider/computer-microphone/computer-speaker main chain remains accepted. The run rejected one prematurely ended answer, a stop action stuck in `listening`, an over-wide in-app live bar and a left Companion card that ended above the right stack. Code evidence showed that network `tts.end` released the guard before queued Web Audio ended and that teardown had no bounds.
- Playback and lifecycle repair: a request-sequence and session/generation-bound AudioSink drain now holds `speaking/working`, microphone suppression and reflected-ASR rejection through the last scheduled sample. Four-second drain timeout clears playback and fails soft. Stop is one idempotent in-flight operation with bounded source, sink, provider and Agent-state teardown; repeat controls disable immediately, idle/foreground release is guaranteed, and late events cannot revive the session. Diagnostics add counts only.
- Product surface: the bottom live bar is a compact content-width capsule with narrow-window contraction. Desktop Companion columns stretch to one row bottom, and extra left-card height expands the face container without distorting the expression image. Below the desktop breakpoint both columns return to natural height.
- Verification: `npm ci --include=dev` passed; targeted controller/computer-audio/UI tests passed `32/32`; final `npm test` passed `222/222`; isolated Windows packaging passed. `DeskMate.exe` is 202,690,560 bytes with SHA-256 `45480D7E2C624B0449E6E962FB8550109BC8B2020D70C75C5633CEEA069E279B`. `git diff --check`, ASCII path, differential secret, ignored-output and firmware/native-source boundary checks passed.
- Safety and next: no application launch/control, user audio, credential, transcript, window title, port/device/Flash, firmware, OLED or servo access occurred. Status is `TEST_CONFIRMED / BUILD_CONFIRMED / MAIN_CHAIN_HIL_CONFIRMED / T11D_HIL_PENDING`. Next user-present gate is one long answer, stop from listening, stop during playback, manual interrupt, compact capsule and desktop/single-column layout confirmation. Handoff: `docs/handoffs/t11d-companion-stop-drain-capsule-2026-09-01.md`.

## 2026-09-01 - T11C companion strict half-duplex and layout closure complete; acoustic HIL pending

- Role and identity: Windows desktop software only. Branch `codex/t11c-companion-layout-echo-guard` was created from exact repaired baseline `e77195edc4743fdd461860e9999acf60a30be95d`; implementation commit is `9f23b3a325cb66d75f5433ec61cb873c3120477e`.
- HIL fact and cause: the user confirmed real speech input and audible reply after T11B, accepting the fixed-App-Key handshake, selected computer microphone, Doubao session and computer speaker. The answer could still interrupt itself because capture continued during playback and any reflected ASR final could trigger the old spoken-interrupt path.
- Behavior: `computer-speaker-echo-guard-v1` now enforces strict turn taking. Listening uploads PCM, user final enters thinking, real playback enters speaking/Agent working while PCM and ASR are suppressed, and normal `tts.end` or explicit manual interruption restores listening/upload. Browser capture also requests echo cancellation, noise suppression, automatic gain control and mono without exposing the selected device ID.
- Product surface: the real companion face is first, device/companion evidence stays beside it, and the Xiaozhi state test follows the whole overview. The conflicting Companion expression-library segment/callout is removed, while assets and hardware mappings remain. Playback visibly says `回答中 · 防回声`. Only an enum, active flag and two counters enter sanitized diagnostics.
- Verification: `npm ci --include=dev` passed; targeted tests passed `42/42`; full `npm test` passed `216/216`; isolated Windows packaging passed. `DeskMate.exe` is 202,690,560 bytes with SHA-256 `4AFD80B0386FB0E850549A55FD194AE1E01B31AF5EED1B694CEAF7A854DCB27C`. `git diff --check`, ASCII path, differential secret, ignored-output and firmware-scope checks passed.
- Safety and next: no app launch/control, user audio, credential, transcript, port/device/Flash, firmware, OLED or servo access occurred. Status is `TEST_CONFIRMED / BUILD_CONFIRMED / MAIN_CHAIN_HIL_CONFIRMED / ECHO_GUARD_HIL_PENDING`. User-present follow-up is two normal turns, one long uninterrupted answer, one manual interruption and `listening -> thinking -> working -> listening` face/Xiaozhi observation. EasyInput KEY1 remains text VoiceWorkflow; natural automatic barge-in remains a later AEC/acoustic-gate package. Handoff: `docs/handoffs/t11c-companion-half-duplex-echo-guard-2026-09-01.md`.

## 2026-09-01 - T11B Doubao real-frame interoperability repair complete; live dialogue HIL pending

- Role and identity: Windows desktop software only. Branch `codex/t11b-doubao-real-frame-repair` was created from exact T11B base `fe91dafcfd9c3a12c2c62491aa5a28849a6c4b42`; implementation commit is `80dac2e98ca462a781ff8ecf14d6bafcffdecd02`.
- Root cause and repair: live `doubao-frame-invalid` came from three provider-contract gaps hidden by a self-generated fake server: the required fixed App Key could be omitted, StartSession was sent before ConnectionStarted, and the parser rejected documented sequence, identifier and gzip layouts. The adapter now follows official page `1594356`, uses its fixed protocol constant, completes the two-stage handshake, covers bounded flags `0..4`/connection/session/gzip/error layouts and exposes only enumerated redacted failure stages.
- Compatibility: old saved empty App Key values continue to work and the UI no longer asks the user for that provider constant. The one companion controller, persisted computer/EasyInput source, computer speaker, foreground arbitration, SQLite turn ordering and Agent state path are unchanged. No second state machine or firmware contract was introduced.
- Verification: `npm ci --include=dev` passed; targeted companion tests passed `17/17`; final `npm test` passed `214/214`; `npm run build:desktop -- --config.directories.output=release-t11b-doubao-repair-verify` passed. Package `DeskMate.exe` is 202,690,560 bytes with SHA-256 `B750B098A662507D776C6D28872BFA28FF9F92AD1D94A0BF6802CEB79FB0F0D4`. Official StartConnection/StartSession arrays are external golden tests. `git diff --check`, ASCII path, ignored-output, firmware-scope and redacted-data checks passed.
- Safety and next: no app launch/control, saved-credential read/export, port/device/Flash/audio/network-service access, firmware, OLED or servo operation occurred. Status is `TEST_CONFIRMED / BUILD_CONFIRMED / LIVE_HIL_PENDING`. The only next gate is one user-present packaged-app conversation using the existing saved App ID/Access Key. Detailed handoff: `docs/handoffs/t11b-doubao-real-frame-repair-2026-09-01.md`.

## 2026-09-01 - T11B computer-audio continuous companion software complete

- Role and identity: Windows desktop software only. Branch `codex/t11b-desktop-computer-audio-companion` was created from exact cumulative software base `544fa54a482a8dca06674916644f042b069f446d`; implementation commit is `371f1189765aecebc198a655c9a6425b1469390a` and implementation/documentation delivery commit is `9f2531485e012b281fbfe4ca642447b93004ae1e`.
- What changed: the one existing `CompanionConversationController` now has a production computer microphone and computer speaker bridge, reuses the persisted concrete Windows input device, and keeps the selected EasyInput LAN microphone as an optional source. EasyInput may visibly fall back once before capture begins; the successful adapter is then locked and a later failure stops without switching. Computer-only sessions no longer stop on an unrelated EasyInput HID disconnect.
- Continuity and safety: PCM16 16 kHz capture and PCM16 24 kHz playback cross only a versioned session/generation Web Audio IPC bridge with 64 KiB chunks, a three-second playback cap, bounded startup and stale-event rejection. Manual or confirmed spoken interruption clears scheduled audio and discards late response frames through `tts.end` without guessing an undocumented provider cancellation event. Finite reconnect never replays old PCM, replies or Agent states.
- Product truth: the companion page exposes actual per-session input, computer output, service connection and explicit fallback. Diagnostics include only enumerated lifecycle/evidence and bounded counters. Provider credentials stay in Electron main; PCM, partial/final text, IP, device IDs and paths do not enter diagnostics or exports. EasyInput speaker remains `NOT_FROZEN` and visibly unavailable.
- Verification: `npm ci --include=dev` passed; `npm test` passed `211/211`; `npm run build:desktop -- --config.directories.output=release-t11b-verify` passed native InputBridge publish, Vite production build and Windows Electron packaging. Package `DeskMate.exe` is 202,690,560 bytes with SHA-256 `1B8E46983C677B4FC432C36B9344D7D063952C133497154B2A4FABB71DCA3DF6`. `git diff --check`, ASCII changed paths, differential secret, ignored-output and firmware-scope checks passed.
- Safety and next: no app launch/control, port, device, network endpoint, microphone, speaker, Flash/NVS/eFuse, firmware, OLED or servo operation occurred. Status is `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. User-present work must validate real credentials/network, packaged Windows input selection and permissions, speaker/echo/latency/interruption, EasyInput fallback/failure and physical OLED state. Detailed handoff: `docs/handoffs/t11b-desktop-computer-audio-companion-2026-09-01.md`.

## 2026-09-01 - T11A companion status truth and Codex ownership closure complete

- Role and base: Windows desktop software only. Branch `codex/t11a-companion-agent-status-closure` was created from latest cumulative software HEAD `b61cef36b856e802b1fb9bded7b2e2d81ba74808`; implementation commit is `cbb9097cab32669ae5d881fb1f14c04b1d961388`.
- What changed: the real Xiaozhi work-state test is now above the companion fold while Windows expression preview is isolated in the expression library. Companion, Connections and Diagnostics use one bounded runtime presentation model for EasyInput HID, DeskMate Link, LAN microphone, realtime service and memory. An integrated-but-unselected board microphone is no longer called pending, and EasyInput ACK is never presented as Xiaozhi display evidence.
- Codex boundary: `codex-hook-v1` is versioned, diagnostic and explicitly disableable. Official lifecycle metadata automatically covers idle/thinking/working/waiting/completed with duplicate suppression and no replay after provider/voice/companion displacement. Official Hooks currently provide no general turn-failure event, so error stays manual instead of being inferred from private text, windows or processes.
- Verification: `npm ci --include=dev` passed; `npm test` passed `202/202`; Windows packaging passed via `npm run build:desktop -- --config.directories.output=release-t11a-verify`. Package SHA-256 is `8E0E2453B983D7DC6BCD394B816C9A7E736476C036DF05E97FBA8BE4EC1F0FA1`. `git diff --check` passed and generated output remains ignored.
- Safety and next: no automated UI, port/device/Flash, firmware, OLED, servo or audio hardware operation occurred. The already user-open package was not controlled; build output used a separate ignored directory. Status is `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. Detailed handoff: `docs/handoffs/t11a-companion-agent-status-closure-2026-09-01.md`. Next software-only slice may close continuous conversation around existing adapters, but T11E speaker framing remains blocked until independently frozen.

## 2026-09-01 - T12A local-memory controls and knowledge-base boundary complete

- Role and base: Windows desktop software only. Branch `codex/t12a-desktop-memory-controls` was created from locked desktop HEAD `da0fe11ccc429f9f166ef4d1b9e4a3ba82ece01b`; implementation commit is `99ecbf6e4f0b5cb2d58113788aa7ba583d675465`.
- What changed: the existing SQLite memory store now exposes correction, one-way candidate review, reviewed-only JSON export, single-item permanent deletion and whole-store transactional forgetting. Destructive actions use one-use 60-second tokens bound to an item/global revision so stale or replayed confirmations fail closed. Complete forgetting deletes turns, summaries, candidates, embeddings and the idempotent outbox.
- Knowledge-base boundary: users can select an existing writable local folder through a native picker. Its full absolute path is encrypted with Electron `safeStorage` and remains main-process-only; React receives only readiness and the folder basename. T12A deliberately does not scan or write the folder. D043 fixes T12B as deterministic stable-ID Markdown/`[[double links]]` projection and T12C as model-versioned chunking, embeddings and rebuildable hybrid retrieval.
- Verification: `npm ci --include=dev` passed; final `npm test` passed `198/198` with zero failure/skip/todo; `npm run build:desktop` passed native InputBridge Release publish, Vite production build and Electron Windows directory packaging. `git diff --check`, ASCII changed paths, differential secret and firmware-scope checks passed. Package evidence: `release/win-unpacked/DeskMate.exe`, 202,690,560 bytes, SHA-256 `C454A8C315F75D3A91A286766C15408DD7A67BAECCBF8FF6A79070A99D659F65`.
- Safety and next: no app launch/UI automation, port/LAN/device/Flash access, firmware, microphone, OLED, servo or speaker action occurred. Status is `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. Continue with T12B without waiting for hardware; the user may choose the real knowledge-base directory later. Detailed handoff: `docs/handoffs/t12a-desktop-memory-controls-2026-09-01.md`.

## 2026-09-01 - T11A Workbench status truthfulness package complete; hardware confirmation remains open

- What changed: branch `codex/t11a-desktop-status-truthfulness` was created from locked Windows base `73057c92be7f631c19619bb8984b66504abbb046`; implementation commit `de105c0` removes production-looking fixtures from the Workbench. The face card is now an explicit software preview, the compact device summary comes from the existing sanitized DeskMate Link diagnostic, and missing temperature/humidity/light/servo integrations are shown as pending or disabled. The header date is local instead of fixed.
- Persistence: application schema v9 resets only the exact historical sample `正在整理桌宠开发文档 / 68%` to idle. Non-identical saved Agent state is preserved. This prevents old demo content from appearing as a live Codex task without erasing real restored state.
- Verification: after `npm ci --include=dev`, `npm test` passed `192/192` with zero failure/skip/todo; `npm run build:desktop` passed native InputBridge publish, Vite production build and Windows Electron directory packaging. `git diff --check`, ASCII changed paths, differential secret, firmware-scope and ignored build-output checks passed. Package evidence is `release/win-unpacked/DeskMate.exe`, 202,690,560 bytes, SHA-256 `6993BAC803B0721D15FF6A3CD4838826D86BA02F88AB8873A80337F886DEFA0D`.
- Safety and next: no app launch/UI automation, port/LAN/device/Flash access, firmware, microphone, OLED, servo or speaker action occurred. Status is `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. User-present follow-up only needs to confirm the packaged Workbench shows the true Link state and never labels pending fields as live telemetry. Detailed handoff: `docs/handoffs/t11a-desktop-status-truthfulness-2026-09-01.md`.

## 2026-09-01 - T11A Windows software finalized; packaged-app and physical acceptance remain open

- What changed: branch `codex/t11a-desktop-finalize` was created from cumulative T11A HEAD `d95860b9d1ffe22ae5cee80a1ccd28cd413f49e8` without touching the dirty primary worktree. The final audit closes the Windows code scope for LAN microphone reception, persisted computer/EasyInput source selection, per-recording source locking, visible pre-start fallback, mid-record fail-closed behavior, ordinary-keyboard trigger suppression, Link/Agent diagnostics, reconnect recovery, and the separated local-preview/real-state controls. No new state machine or transport was needed.
- Verification: clean dependency installation passed; `npm test` passed `187/187` with zero failure/skip/todo; `npm run build:desktop` passed including native InputBridge Release publish, Vite production build and Windows Electron packaging. `git diff --check` passed and generated dependencies/build/package output remains ignored. Local package evidence is `release/win-unpacked/DeskMate.exe`, 202,690,560 bytes, SHA-256 `B48D138250C4737536374DD2D7D0D208A53F6A6551672DD1F67DF442E9C8D53D`.
- Interpretation: status is `T11A_SOFTWARE_LOCKED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_PENDING`. The remaining work is user-present packaged-app and hardware acceptance, not missing T11A implementation. EasyInput speaker downlink/full duplex dialogue is explicitly a later T11B/T11E scope.
- Safety and handoff: no app/UI automation, port/LAN/device/Flash/NVS/otadata/eFuse access, audio capture, firmware, OLED, servo or speaker action occurred. Detailed closure and the six-item acceptance matrix are in `docs/handoffs/t11a-desktop-software-final-2026-09-01.md`.

## 2026-08-31 - T11A expression and Link UX software package complete; physical acceptance remains open

- What changed: from exact desktop base `93a2d71efca6dd5297a3f654d3ebeacdeb8215eb`, branch `codex/t11a-expression-link-ux` now separates the companion page's seven Windows-only expression previews from a directly visible Xiaozhi work-state test. Local preview copy and notices explicitly say no hardware state was sent. The hardware panel publishes only the frozen idle/listening/thinking/working/waiting/completed/error values through the existing manual Agent State path; clicking the selected state again issues a new request.
- Why and interpretation: blink, angry and other local expressions do not map one-to-one onto the frozen work-state vocabulary, so silently driving Xiaozhi from preview buttons would be misleading. The new panel keeps current selection, EasyInput write ACK/failure, DeskMate Link state and physical display confirmation as separate evidence, and links directly to the existing system diagnostics view. D041 records this stable product boundary.
- Compatibility and recovery: one shared request service now backs both the existing AI Link manual control and the companion test panel. Electron's one `AgentStatePublisher`, HID report, Link contract and reconnect recovery remain unchanged. A Link recovery still resends only a current unexpired state; expired listening/completed/error work is not replayed. No VoiceWorkflow, microphone selection, Codex Hook, firmware or protocol code changed.
- Verification: `npm ci --include=dev` passed; `npm test` passed 187/187; `npm run build:desktop` passed including native InputBridge Release publish and Windows Electron packaging. `git diff --check`, ASCII changed paths, firmware-scope, differential secret and ignored build-output checks passed.
- Safety and next: no app launch, UI automation, port/device/Flash/NVS access, firmware, OLED, servo, microphone, speaker or hardware action occurred. Status is `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. After the loose three-wire connection is repaired, follow `docs/handoffs/t11a-expression-link-ux-2026-08-31.md` to verify preview-only behavior, seven real states, same-state resend, counter evidence and reconnect expiry.

## 2026-08-31 - T11A desktop Link diagnostics and restart recovery complete; hardware acceptance remains open

- What changed: branch `codex/t11a-link-diagnostics-recovery`, based exactly on `59176d021a631740e6f112bd3ecbd16148d1ffcd`, completed the Windows-only implementation payload at `1f267a1714650f0e2e754ef66f75f1f599191be7`. Device Connections now separates EasyInput HID presence from Xiaozhi DeskMate Link `connected/waiting/faulted/disabled/unavailable`, exposes the frozen bounded Link/Agent counters, and records the latest Agent State request, target, EasyInput write ACK/failure, redacted reason and time. The same enumerated shape is added to the sanitized diagnostics JSON.
- Why and interpretation: an EasyInput HID connection and even a successful `HidD_SetFeature` write do not prove that Xiaozhi received or rendered an expression. The UI therefore says `EasyInput write ACK` and requires Link/forwarding counters for downstream evidence. Clicking any manual state now sends immediately; clicking the selected state creates a fresh transition for explicit recovery.
- Recovery and compatibility: application start/EasyInput reconnect rereads the existing capability/status report. A Link transition to connected reuses the one `AgentStatePublisher` to send its current unexpired intent once, otherwise idle; expired listening/completed/error work is not replayed. Reconnect Link reads and the existing audio configuration refresh are serialized on the one native Feature Report read slot. No protocol, firmware or second state machine was added. D040, reusable lesson, documentation index and `docs/handoffs/t11a-desktop-link-diagnostics-recovery-2026-08-31.md` record the boundary.
- Verification: `npm ci --include=dev` passed; final `npm test` passed 182/182; final `npm run build:desktop` passed including native InputBridge Release publish and Windows Electron packaging. CJS syntax, `git diff --check`, ASCII changed paths, differential secret, firmware-scope and ignored build-output checks passed.
- Safety and next: no UI automation, port/device/Flash/NVS/otadata/eFuse, firmware, hardware reset, OLED, servo or audio operation occurred. Status is `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. User-present acceptance should confirm explicit unavailable/connected display, counter advancement, same-state resend, Xiaozhi restart recovery and failed ACK never shown as synchronized.

## 2026-08-31 - T11A Windows microphone source selection complete; ordinary keyboard auto-trigger path disabled by default

- What changed: branch `codex/t11a-desktop-microphone-source-selection`, implementation `84b153df61fa71db01a054fccdf2b42fd5bd0a8f`, adds a persisted computer/EasyInput microphone selector to the existing text `VoiceWorkflow`. Computer remains the default and retains concrete Windows-device selection. Every recording locks one actual adapter; unavailable EasyInput audio may visibly fall back once before recording starts, while a board failure after start terminates without switching sources. Bluetooth remains disabled and labelled pending.
- Auto-recording diagnosis and fix: `Ctrl+Shift+Space` and `Ctrl+Shift+E` previously had two authorities—the EasyInput HID path and Electron ordinary-keyboard global registration—so an unrelated keyboard, input method or generated chord could appear as an unexplained board press. Ordinary global shortcuts now default off and are removed during schema migration. KEY1/KEY3 remain available through VID/PID-scoped Raw Input semantic events; a generic keyboard or injected F22 cannot impersonate EasyInput. Users may explicitly re-enable the legacy global fallback in settings.
- Architecture and outputs: Electron main owns the bounded EasyInput PCM recorder and returns only one finalized WAV to the existing renderer workflow after stop; live PCM, network coordinates and credentials remain main-process-only. New files are `electron/easyinput-voice-recorder.cjs`, `electron/pcm-wav.cjs`, `src/domain/microphoneSource.js`, `src/hooks/useEasyInputRecorder.js` and their tests. D039, AGENTS/DESIGN, T11A contract/task, architecture, acceptance and reusable lessons were updated. Handoff: `docs/handoffs/t11a-desktop-microphone-source-selection-2026-08-31.md`.
- Verification: `npm ci --include=dev` passed; `npm test` passed 176/176; `npm run build:desktop` passed after closing only the old executable launched from this isolated worktree. Native InputBridge publish and Electron Windows packaging passed. `git diff --check`, ASCII changed paths, differential secret scan, firmware-scope and ignored build-output checks passed.
- Safety and next: no firmware file, device, port, Flash/NVS/otadata/eFuse, hardware reset, OLED, servo or physical audio operation was touched. Status is `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. User-present acceptance should verify five minutes without automatic recording, ordinary-keyboard suppression, KEY1/KEY3 board triggers, persisted source, real EasyInput recording, pre-start fallback and mid-record disconnect. EasyInput speaker/downlink still blocks full realtime companion dialogue.

## 2026-08-31 - T11A Windows EasyInput microphone uplink software complete; hardware acceptance remains open

- What changed: from exact T11 software baseline `c7d789e7359c744a2059680db4061a3d2a5dc9ff`, branch `codex/t11a-desktop-easyinput-audio-uplink` implemented the Windows-only T11A package at `c94d84184384bce4c12a8875fce08f1590658078`. Electron main now owns strict `EIHB/EICC/EICA/EIAU` UDP decoding, explicit selected-adapter binding, random-session/ACK source locking, finite retry and keepalive, bounded in-memory PCM delivery, and the production `EasyInputLanAudioSource` used by the existing T11 controller.
- Why and interpretation: EasyInput remains the V1 audio endpoint, but credentials, IP and PCM cannot cross into the main React renderer. A separate sandboxed setup window performs the T05 read/preview/60-second confirmation/write/readback transaction and modifies only the frozen four audio/network fields. The independent 30-second microphone diagnostic publishes only level and counters. Dictation/edit, microphone test and companion conversation share one foreground ownership boundary and never auto-resume stale audio.
- Outputs: contracts `docs/contracts/easyinput-audio-capture-v1.md` and `docs/contracts/t11a-desktop-easyinput-audio-uplink-v1.md`; implementation in `electron/easyinput-audio-*.cjs`, isolated setup-window files, preload/main/UI/diagnostics integration; provenance `docs/provenance/t11a-easyinput-audio-reference-audit.md`; task `flow/tasks/T11A-desktop-easyinput-audio-uplink.md`; handoff `docs/handoffs/t11a-desktop-easyinput-audio-uplink-2026-08-31.md`.
- Verification: `npm ci --include=dev` passed; `npm test` passed 165/165; `npm run build:desktop` passed, including native InputBridge publish and Windows Electron packaging. Protocol vectors, malformed/source/session/order/timeout/overflow gates, transactional configuration/privacy, foreground ownership, CJS syntax, `git diff --check`, ASCII path and differential secret checks passed. Generated dependencies/build/package output remains ignored and uncommitted.
- Safety and next step: status is `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_RUN`. No app, UDP listener, LAN scan, device/config/Flash/NVS access, hardware reset, microphone capture, recording, firmware, Xiaozhi, OLED or servo action occurred. T10E must first pass independent microphone HIL; then a user-present setup and 30-second diagnostic can be accepted. Full realtime conversation stays blocked by the deliberately unavailable EasyInput speaker until a separately frozen T11E firmware downlink and T11B Windows sink are implemented and accepted.

## 2026-08-31 - T11 Windows realtime companion software core complete; real audio acceptance remains open

- What changed: from exact software base `62f2829fedf3e7f9a9855747133d3a1bdba008d7`, branch `codex/t11-desktop-realtime-companion` implemented the Windows-only T11 package at `1558ee5efaf76563fe632ccf3120e0754d435d43`. It adds one `CompanionConversationController`, a shared foreground-session arbiter with the existing `VoiceWorkflow`, a strict Doubao binary WebSocket adapter with bounded retry/reconnect, explicit `CompanionAudioSource`/`CompanionAudioSink` interfaces, a compact non-focusing live capsule, T09 expression ownership, and transactional exactly-once SQLite turn/outbox persistence.
- Why and interpretation: continuous companion dialogue must not compete with text dictation/edit or pretend that the computer/Xiaozhi microphone is the V1 EasyInput endpoint. Dictation therefore preempts and permanently stops companion; companion start is rejected during active dictation; unavailable production audio adapters are reported honestly until the separate T10E work supplies the board bridge. Old provider, Codex, audio, reply, and expression events are discarded rather than replayed after preemption or reconnect.
- Outputs: frozen contract `docs/contracts/t11-desktop-realtime-companion-v1.md`; task `flow/tasks/T11-desktop-realtime-companion.md`; implementation under `electron/companion-*.cjs`, `electron/doubao-realtime*.cjs`, `electron/foreground-session.cjs`, `electron/main.cjs`, preload/renderer UI; provenance `docs/provenance/t11-doubao-realtime-reference-audit.md`; handoff `docs/handoffs/t11-desktop-realtime-companion-2026-08-31.md`.
- Verification: `npm ci --include=dev` passed; `npm test` passed 148/148; `npm run build:desktop` passed, including native input bridge publish and Windows Electron packaging; CJS syntax, targeted companion/provider/SQLite/UI tests, `git diff --check`, ASCII changed paths, differential secret scan, and ignored build-output checks passed. Generated `dist/`, `release/`, native `bin/obj/publish`, dependencies, recordings, and user data are not committed.
- Safety and remaining gate: no firmware file was modified; no port/device/Flash/NVS/otadata/eFuse/reset/OLED/servo/audio capture or hardware action occurred. Real Doubao credential/network dialogue, T10E EasyInput microphone/speaker integration and quality, Codex full-restart Hook HIL, physical Link stale-expression regression, and servo calibration remain explicitly unverified. Next action is to integrate the T10E adapter behind the frozen source/sink interfaces, then run user-present real network/audio acceptance without changing the T11 state machine.

## 2026-08-31 - Codex global hook activation blocker traced to the long-lived app server

- Observation and root cause: creating a new Codex task did not change the OLED because the desktop `ChatGPT.exe` and its `codex.exe app-server` were still the processes started at 11:12, while the global hook file was modified at 12:15. New tasks reused that pre-install app server, so the new hook definition had not been loaded or offered for trust review.
- Independent path check: while DeskMate was running, the repository sender delivered a synthetic `UserPromptSubmit` event to `\\.\pipe\deskmate-codex-status-v1` and received `{\"ok\":true}`. This confirms the DeskMate named-pipe receiver path is healthy; it does not claim that the not-yet-restarted Codex process emitted a real lifecycle event.
- Correct activation: fully exit Codex once, wait until both `ChatGPT.exe` and the Codex `app-server` stop, then reopen it and approve/review the changed user hook through the trust prompt or `/hooks`. Merely creating or reopening a task is insufficient for this initial reload. DeskMate does not need to be restarted, and no firmware or hardware action is involved.
- Output: corrected `docs/handoffs/t10-codex-global-hook-install-2026-08-31.md`. Next verification is one real prompt after the full Codex restart while the DeskMate AI Link page has Codex selected; the page should report the latest real Hook event and the OLED should follow it.

## 2026-08-31 - Codex global lifecycle hook installed without replacing legacy hooks

- What changed: on dedicated software branch `codex/t10-codex-global-status`, the already packaged Codex lifecycle adapter was installed into the user-level Codex hook boundary. `C:\Users\Administrator\.codex\hooks.json` now appends a bounded DeskMate handler to seven supported lifecycle events, using `C:\Users\Administrator\.codex\hooks\deskmate-codex-status-hook.cjs`. The existing EasyInput executable handlers remain first and unchanged; `SubagentStart` and `SubagentStop` were not modified.
- Why and interpretation: this makes real Codex work state available to DeskMate for every newly opened Codex task, instead of tying the feature to one special window. Hooks are loaded at task start, so the currently open task is intentionally not restarted and will not hot-reload the change. Multiple concurrent Codex tasks still use latest-event-wins; task aggregation is deferred rather than guessed.
- Safety and recovery: the original global file was backed up to `C:\Users\Administrator\.codex\backups\hooks-before-deskmate-20260831-121308.json`, SHA-256 `E6B5060315421B4B895C06E68804FD650BE93599F9DEB8813C13EFCBE986FE58`. The helper forwards no prompt, response, tool payload, transcript, cwd, identifiers or device data and silently exits when DeskMate is unavailable. No firmware or hardware operation occurred.
- Verification and output: helper syntax passed; global JSON parsed; all legacy handler objects matched the backup; exactly seven DeskMate handlers were present; the configured Windows command exited zero with no output in 188 ms against the packaged DeskMate pipe. Full install and rollback handoff: `docs/handoffs/t10-codex-global-hook-install-2026-08-31.md`.
- Next: close and reopen one Codex task, approve the hook trust prompt if shown, select Codex in DeskMate, and observe a real prompt/tool/wait/stop lifecycle. Keep firmware development on its existing separate branches; this branch remains desktop integration only.

## 2026-08-31 - Codex real lifecycle status adapter implemented and packaged

- 做了什么：在分支 `codex/t10-desktop-config-app-polish` 基于 `21580e51a2cc2947522ad2d520c07f8613c692b1` 完成首个真实 Agent 适配器，实现提交为 `28e9563eb1b2f316c618fa2a52511f72c7d7b4c3`。官方 Codex `SessionStart/UserPromptSubmit/PreToolUse/PermissionRequest/PostToolUse/Stop/SessionEnd` 生命周期经仓库 Hook、隐私最小化本机命名管道和 Electron 主进程进入既有 `0x12 -> EasyInput -> DeskMate Link -> Xiaozhi OLED` 状态链；界面保留人工七状态作为回退，并把显示名称纠正为 WorkBuddy（持久化兼容 ID 仍为 `workbody`）。
- 为什么与怎么理解：进程存在、前台窗口或标题无法证明 Codex 是工作、等待还是完成，因此不能冒充真实状态。该切片只映射官方事件能证明的状态；当前稳定 Hook 没有通用失败事件，不读取回复正文时也无法识别所有自由文本提问，所以 `error` 和这类等待继续保留人工入口。当前手动选择的 Agent 是唯一所有者，只有选中 Codex 时事件才写硬件；VoiceWorkflow 优先，期间事件丢弃且不补发。
- 隐私与合同：新增 `docs/contracts/t10-codex-real-status-v1.md`，状态为 `CODEX_REAL_STATUS_V1_FROZEN`。Hook 只转发版本、固定 provider、事件名和有界工具名；提示词、回复、工具输入/输出、会话/轮次 ID、transcript、cwd、模型和设备信息都不进入 DeskMate。消息严格限长/限键，DeskMate 不运行时 150 ms 内静默失败；为保持事件顺序没有使用可能乱序的后台 Hook。现有 Project Flow `Stop` Hook 被合并保留，没有覆盖。
- 验证：定向 15/15、桌面全量 `npm test` 139/139；`npm run build:desktop` 通过。首次打包仅因运行中的旧候选锁定 `release/win-unpacked/icudtl.dat` 失败，精确关闭该隔离目录的 DeskMate 进程后重建成功。最新版 `F:\Codex\deskmate-t09-integration\release\win-unpacked\DeskMate.exe` 已启动；生产管道接受 `SessionStart` 以及测试用 `UserPromptSubmit -> Stop` 事件。`git diff --check`、ASCII 路径和差异密钥扫描通过。
- 硬件边界：没有扫描端口、识别设备、读写 Flash/NVS、烧录、擦除、改分区或 eFuse，也没有舵机/音频动作。若界面当前选中 Codex，管道验收事件仅沿已经验收的状态链发送待命/思考/完成表情；它们明确是接收路径测试，不冒充本次 Codex 会话的真实自动验收。
- 下一步：提交后重开一个位于本仓库、并已信任新 Hook 的 Codex 任务，再真实观察“提交问题 -> 工具工作 -> 授权/结构化输入等待 -> 完成”的表情和界面状态。当前活动任务不会热加载新 Hook。WorkBuddy、Hermes 与 Claude Code 仍为手动，不开始猜测性进程适配。


## 2026-08-31 - Desktop manual Agent selection and real seven-state publication complete

- What changed: branch `codex/t10-desktop-config-app-polish` implementation `42a497756ef93c14535f65910aec3ee85d7849e6` adds a local selector for Codex, Workbody, Hermes, Claude Code and a bounded custom Agent, plus explicit controls for idle, listening, thinking, working, waiting for user, completed and error. A trusted preload/IPC path now publishes the existing frozen HID `0x12` Agent-state report; no firmware or framing changed. The same package also makes keyboard-config reads reconnect-aware with bounded retries/manual retry and replaces the oversized application picker with a compact accessible list.
- Why and interpretation: Agent identity is a desktop concern, while hardware understands only the T09 seven-state vocabulary. Automatic provider inference remains deferred because multiple Agents can run concurrently. Active VoiceWorkflow phases own the visible expression and reject manual override; completed/error retain the existing 10-second TTL. EasyInput WS2812 remains physical input feedback, while Xiaozhi OLED remains the Agent-state display.
- Outputs: frozen contract `docs/contracts/t10-desktop-manual-agent-control-v1.md`; UI/model in `src/pages.jsx` and `src/domain/agentControl.js`; main-process boundary in `electron/main.cjs` and `electron/agent-state-hid.cjs`; regression tests in `tests/manual-agent-control.test.mjs`, `tests/agent-state-hid.test.mjs` and `tests/desktop-config-ui.test.mjs`.
- Verification and safety: `npm test` passed 135/135; `npm run build:desktop` passed before the final Workbody label normalization and the renderer/full tests passed again afterward; `git diff --check` and ASCII tracked-path checks passed. The exact isolated executable was rebuilt and launched for user review. No port scan, device identify, Flash/NVS/otadata/eFuse read/write, reset, OLED command, servo or audio operation occurred; powered/wired T09 hardware stayed untouched.
- Next: user opens AI Companion -> AI Link, manually sends thinking, waiting-for-user and completed, and visually confirms the OLED states and completed-to-idle TTL. After this small HIL check, decide whether to add the first real provider adapter; do not infer a provider automatically until its privacy-safe state source and concurrent ownership policy are frozen.

## 2026-08-31 - T10A motion safety core complete without hardware activation

- What changed: from the T09 HIL evidence commit `381cef3114c0219d2f760b112db0afdefe721d8d`, branch `codex/t10a-motion-safety-core` added a pure C++ single-owner motion safety core and froze `T10_MOTION_SAFETY_CORE_V1_FROZEN`. It enforces verified power/common-ground/center/direction/limit gates, explicit recenter, fixed source priority, per-axis rate limiting, session/expiry clearing, and latched emergency-stop/fault behavior.
- Why and reference interpretation: the fixed Xiaozhi reference was audited first. Its range limits, small steps and recenter concept are useful behavior evidence, but its nominal centers and immediate LEDC initialization are not real-board calibration evidence. T10A therefore contains no copied reference code and no PWM, GPIO, driver or production startup path; detailed hashes/license/differences are in `docs/provenance/t10-xiaozhi-servo-reference-audit.md`.
- Verification: implementation `848d2019ca8492723503f43c39e40fb1ee781a10`; Xiaozhi Host 9/9 including `/W4 /WX` motion tests; ESP-IDF v5.5.3 `esp32s3` fixed-partition build passed; code-gate app 202,880 bytes with SHA-256 `C1A6DF830B18589D737B09BC3365F63A31F535A9D61E4EF29F4097AAF8F9C7ED`; desktop regression 127/127; `git diff --check` and ASCII tracked-path checks passed. The app is not a flash candidate because the core is intentionally unreachable.
- Safety and next: no port/device/Flash/NVS/otadata/eFuse/reset/monitor/OLED/audio/PWM/servo operation occurred; the user's powered and wired T09 hardware stayed untouched. State is `T10A_TEST_CONFIRMED / BUILD_CONFIRMED / MOTION_HARDWARE_LOCKED`. T10B waits for the user to be physically present to validate the servo supply, current capacity, center, direction and small-step limits before any adapter or mechanical action is authorized. Full handoff: `docs/handoffs/t10a-xiaozhi-motion-safety-core-2026-08-31.md`.

## 2026-08-31 - T09 three-end visible state path accepted; physical reconnect regression deferred

- What was confirmed: the live Desktop -> EasyInput -> DeskMate Link -> Xiaozhi OLED path stayed `connected`, RX/TX counters advanced without new timeouts, and the user visibly accepted all seven frozen states. `thinking` automatically returned to neutral idle after TTL, and a rapid `listening -> thinking -> working -> completed` sequence ended at the latest happy scene without queue drops.
- Evidence: the final matrix snapshot reached RX/TX `137/149` with agent `accepted=10`, `forwarded=12`, and zero malformed/disconnected/queue drops; latest-wins then reached RX/TX `151/163`, `accepted=14`, `forwarded=16`, and zero queue drops. Full evidence is in `docs/testing/t09-three-end-agent-state-acceptance-2026-08-31.md`.
- Safety interpretation: this closes the visible state, TTL, and latest-wins HIL slices only. Servo PWM remains uninitialized and Xiaozhi audio remains disabled. The user is away and only has remote control, so no physical reset, wire disconnect, flash or mechanical action will be attempted.
- Next: preserve the powered/wired hardware, defer T09.1 physical reset/reconnect/no-stale-replay regression until the user is present, and proceed only with T10A's host-testable motion safety core and calibration gates. T10A must not add PWM, board pins, motion messages, or a production call site.

## 2026-08-31 - T09.1 normal boot confirms Xiaozhi UART startup; Link read paused

- User-visible HIL: after the exact-readback-confirmed T09.1 app was normally reset without BOOT, Xiaozhi displayed the neutral two-eye scene rather than the new startup error scene. Under this candidate's explicit startup diagnostic, that confirms OLED initialization, UART0 driver installation and the DeskMate Link task all returned successfully.
- Scope reduction: the previous `rx_frames=0` failure is no longer attributable to Xiaozhi UART/task startup. Full two-board communication is still unconfirmed because EasyInput was not powered/running when the follow-up privacy-safe status read began.
- Pause and safety: the user asked to stop until tomorrow. The in-progress read-only helper was terminated; no Feature Report completed, no configuration or state was written, and no Flash/NVS/otadata/eFuse, erase, partition, servo or audio operation followed the reboot observation.
- Resume point: power/start EasyInput while retaining common GND and the known crossed TX/RX wiring, then take two privacy-safe Link snapshots. Require `connected`, increasing `rx_frames/tx_frames`, and no growing protocol errors before sending a single real state and observing the OLED scene change.

## 2026-08-31 - T09.1 Xiaozhi app flash and exact readback confirmed; normal boot pending

- What happened: after a fresh identity check confirmed the only USB serial candidate as the same ESP32-S3/16 MiB Xiaozhi board, the existing T09 app, fixed partition table, NVS and otadata were read and backed up to a Git-external recovery directory. The current app and all protected regions matched their expected hashes before writing.
- Authorized write: source `65144a1e0a8294f202b59f23affd46cc2ca60c83`, app 202,880 bytes (`0x31880`), SHA-256 `709515DF57A96C04A86FECEE9242D57E0AE558E70C3236E6B4124656DED544D3`, written only at `0x100000..0x13187F`; the write tool erased only the covering sectors through `0x131FFF`.
- Verification: an independent readback of the full written app produced the same SHA-256. The device identity matched again after writing. The Git-external flash receipt SHA-256 is `20642BA0C01B958DFF401BD32B2C61EEC18D14B91137EE56A55251F686236CA9`.
- Safety boundary: no whole-chip erase, partition/bootloader/NVS/otadata/eFuse write, EasyInput operation, servo action or audio initialization occurred. The device was deliberately left without an automatic application reset, so this evidence is `APP_FLASH_AND_EXACT_READBACK_CONFIRMED`, not normal-boot or Link HIL confirmation.
- Next: normally reset or power-cycle Xiaozhi without pressing BOOT. The OLED should first distinguish startup: sad/error eyes mean UART startup failed; neutral eyes mean UART startup succeeded. Then restore/retain the known crossed three-wire Link and read EasyInput's privacy-safe Link counters before triggering one real DeskMate state.

## 2026-08-31 - T09.1 Xiaozhi Link startup candidate built; HIL authorization pending

- What changed: the optional OLED path is now split into synchronous display initialization and a separate display-task start. `app_main` initializes the OLED and endpoint, installs/starts the frozen T08 UART transport, and only then allocates the optional display task. DeskMate Link framing, GPIO43/GPIO44, 115200/8N1, OLED scenes, servo and audio boundaries are unchanged.
- Why: the last fresh HIL sample proved Desktop-to-EasyInput delivery but showed EasyInput `tx_frames=28`, `rx_frames=0`, timeouts and retries. T09 had introduced OLED task creation ahead of the T08-proven UART startup and discarded both startup results. The new ordering removes that resource/startup regression candidate; if UART startup returns anything other than `kStarted`, a working OLED task now renders the error scene instead of leaving an indistinguishable neutral display.
- Verification: Xiaozhi Host CTest passes 8/8, including a new source-contract check that display initialization precedes UART startup and UART startup precedes the optional display task. The exact ESP-IDF v5.5.3 `esp32s3` build passes against the fixed 16 MiB partition table; the pre-commit candidate app is `0x31880` bytes with 97% of the 6 MiB app partition free. `git diff --check` passes.
- Status and limits: this is a bounded diagnostic/fail-soft candidate, not yet a confirmed root-cause fix. No device was scanned, identified, read, written, erased or monitored; no Flash/NVS/otadata/eFuse, OLED HIL, servo or audio operation occurred. After commit and final rebuild, present the exact source HEAD, app SHA-256 and `0x100000` app-only range for a new explicit authorization.
- Acceptance after an authorized flash: a startup UART failure must produce the error/sad scene; neutral eyes mean UART installation completed. With the known crossed three-wire Link restored, EasyInput status must move from `waiting` to `connected`, `rx_frames` must increase, and a real DeskMate state must change the OLED before T09 can be locked.

## 2026-08-30 - T09 paused with a reproducible Xiaozhi response-path blocker

- Latest HIL fact: after the user reseated the already-crossed three-wire Link and cold-started both independently powered boards, a fresh privacy-safe EasyInput status read still reported `waiting`, `rx_frames=0`, `tx_frames=28`, `request_timeouts=9`, and `retries=18`. Agent-state counters were reset to zero. The reseat therefore did not restore the T08-proven Link, and the result is not stale desktop state.
- What remains healthy: the replacement EasyInput board still has all S1-S8 keys, encoder and LED feedback available; Xiaozhi T09 cold-starts into the neutral two-eye OLED scene; no servo or Xiaozhi audio path is initialized. Desktop-to-EasyInput `0x12` delivery was independently proven earlier in this diagnosis, while EasyInput correctly drops states when the Link is disconnected.
- Code comparison: the Xiaozhi T08 and T09 builds use the same `deskmate_link_uart.cpp`, UART0, GPIO43/GPIO44, 115200/8N1, parser and frozen framing. The material T09 startup change is that OLED initialization and its task are started before `StartDeskMateLinkUart()`, and both startup return values are currently discarded. OLED visibility therefore does not prove that the UART driver and Link task started.
- Paused candidate, not yet implemented: split OLED initialization from its display-task start, initialize the display first, install/start the UART transport before allocating the optional display task, and render a visible error scene when UART startup returns `kHardwarePinoutBlocked`, `kDriverError`, or `kTaskError`. Add a source-contract test for transport-before-optional-task ordering. This is a diagnostic/fail-soft candidate, not a confirmed root-cause fix, and must be rebuilt and separately authorized before any app-only flash.
- Safety and resumption: no source change, Flash/NVS read or write, erase, partition/eFuse operation, servo or audio action was performed after the failed reseat sample. Do not ask the user to repeat wiring work tomorrow before the code-level candidate is implemented, Host/ESP-IDF gates pass, and a precise Xiaozhi app image is presented. T09 remains `THREE_END_STATE_HIL_BLOCKED_LINK_WAITING / PAUSED_BY_USER`.

## 2026-08-30 - T09 state-path diagnosis separated desktop status parsing from the physical Link failure

- Observation: the user exercised the real VoiceWorkflow after restoring the three-wire connection, but the Xiaozhi OLED stayed on the cold-start idle eyes. No servo or audio action occurred.
- Desktop/config root cause: EasyInput T09 expanded `ai_keyboard.config_status.v1` to about 561 bytes / 12 reports, while the Windows native bridge still rejected status streams above 512 bytes / 11 reports. The consumer now follows the firmware's bounded 1023-byte / 21-report status contract, keeps the 2048-byte / 42-report configuration contract, validates all counters, and has a regression vector for the expanded status.
- Privacy-safe evidence: after the parser fix, a live status read succeeded. EasyInput reported Link `waiting`, `rx_frames=0`, increasing `tx_frames/request_timeouts/retries`, and Agent-state `accepted=6`, `dropped_disconnected=6`, `forwarded=0`. A second sample remained waiting and advanced TX/timeouts/retries while RX stayed zero. This proves the desktop reports reached EasyInput but were intentionally dropped because no Xiaozhi response was received.
- Product output: the native bridge now exposes only enumerated Link state and bounded uint32 counters to Electron main; raw status JSON, payloads, paths and device identifiers remain unavailable. Desktop tests pass 127/127 and `npm run build:desktop` succeeds.
- Safety/next: no Flash/NVS read or write, erase, partition/eFuse operation, servo or audio action was performed. The user should keep the known crossed logical wiring, reseat both signal paths and cold-start both boards; after that, re-read the counters before another visible-state attempt. T09 remains `THREE_END_STATE_HIL_BLOCKED_LINK_WAITING`.

## 2026-08-30 · T09 Xiaozhi normal boot and standalone OLED idle confirmed

- 真机结果：用户在 app-only 写入与精确回读后仅执行正常 `RESET`，未按 `BOOT`；小智 OLED 随即点亮并显示两个默认 idle 大眼睛，确认 `b26e99e07dac4af4ee57bf8e40cb2efbc57f731d` T09 app 已进入正常应用态且 DISPLAY 初始化成功。
- 行为解释：当前 idle 场景是冻结合同中的静态画面，T09 未实现眨眼动画，因此“不眨眼”不是缺陷；舵机和小智音频仍按安全边界保持未初始化，用户观察到无舵机动作、无异常声音符合预期。
- 安全边界：本轮只记录用户可见现象，没有再次调用 identify/esptool、读取或写入 Flash/NVS、烧录、擦除、改分区、写 eFuse，也没有发送状态、驱动舵机或初始化音频。
- 下一步：状态推进为 `XIAOZHI_NORMAL_BOOT_CONFIRMED / OLED_INIT_CONFIRMED / IDLE_SCENE_CONFIRMED / THREE_END_STATE_HIL_PENDING`。恢复 GND 与交叉 TX/RX，3V3 保持悬空；启动最新 DeskMate 后验证七状态、latest-wins、TTL 回 idle、断线重连不重放旧状态，再回归 T03～T06。

## 2026-08-30 · T09 Xiaozhi app flash and exact readback confirmed; normal boot and OLED HIL pending

- 做了什么：在现有 T08 app、固定分区表、NVS、otadata 和板级身份均已完成只读备份与校验后，按用户精确授权，将源码 `b26e99e07dac4af4ee57bf8e40cb2efbc57f731d` 的小智 T09 app 单独写入 `0x100000..0x13183F`；写入工具自动擦除仅覆盖到 `0x131FFF`。写入前后均在同一受控流程中 fresh 验明为同一块 ESP32-S3/16 MB 小智板，身份数据未持久化。
- 精确证据：候选和板上独立读回均为 202,816 字节，SHA-256 均为 `9BF9183376FEF427E0549EFCA942B193979C11BF563EBA989F7E487F956A9786`；结果为 `APP_FLASH_AND_EXACT_READBACK_CONFIRMED`。Git 外恢复目录新增烧录回执 `t09-b26e99e-flash-receipt.json`，回执 SHA-256 为 `1BE01E0BCB46641539C947301AD9A9546D63D62BF4889EF05EDA99B9FE5D7EFD`。
- 安全边界：未写分区表、NVS、otadata、bootloader 或 eFuse，未整片擦除，未操作 EasyInput、舵机或音频；设备按授权保持在待正常复位状态，本条不冒充 OLED 已启动或三端 HIL 已通过。
- 下一步：用户只按一次小智 `RESET`（不按 `BOOT`）或正常断电重开，先确认 OLED 冷启动即显示 idle 大眼睛；通过后恢复 GND 与交叉 TX/RX、保持 3V3 悬空，再执行七状态、latest-wins、重连不重放和 T03～T06 联合回归。

## 2026-08-30 · T09 Xiaozhi identity and recovery backup confirmed; app flash authorization pending

- 做了什么：按用户单独授权，只对当前唯一 USB 串行候选执行 fresh 小智验身；前后身份在同一进程内匹配且未持久化 MAC/序列号。确认芯片为 ESP32-S3、Flash 为 16 MB 后，依次只读备份固定分区表、当前 T08 app、NVS 和 otadata。
- 恢复证据：当前 T08 app `0x100000/0x29DA0` SHA-256 为 `C6FF9CCE3704EED980781C83FCE92B6BFDAC853935A59C07C8F042284856C6D9`；分区表有效 3 KiB SHA-256 为 `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0`，4 KiB 读取窗口尾部 1 KiB 全为 `0xFF`。二者均与预期完全一致。
- 产出路径：Git 外恢复目录 `F:\Codex\deskmate-device-backups\xiaozhi\t09-preflash-20260830T215245`；NVS SHA-256 `8F9A6BACF4BB1175D1E293EB19D18EE984BBB172B8A453DAD8E7111B1EEB8A1B`，otadata SHA-256 `8BA3B110139F45443D4F268D1A3373EF99A1718B71D51664531B83EE2D4B91A3`，manifest SHA-256 `D46A26184A9C952193D626EB59E15E3B2928F925513E0F33CB9927C642F2DE69`。NVS/otadata 内容未解析、未显示，也不会进入 Git。
- 安全与下一步：本轮未写 Flash/NVS、未烧录、擦除、改分区或写 eFuse，也未操作 OLED、舵机和音频。状态推进为 `XIAOZHI_IDENTITY_CONFIRMED / RECOVERY_BACKUP_CONFIRMED / APP_FLASH_AUTH_PENDING`；下一步只允许在用户再次确认精确源码、镜像哈希和 `0x100000..0x13183F` app-only 范围后写入。

## 2026-08-30 · T09 Xiaozhi final app candidate rebuilt; identity and recovery authorization pending

- 做了什么：在最终整合分支 `codex/t09-three-end-integration@b26e99e07dac4af4ee57bf8e40cb2efbc57f731d` 上使用冻结的 ESP-IDF v5.5.3、target `esp32s3` 和独立构建目录重新生成小智 T09 app；`d961797..b26e99e` 之间没有任何 `firmware/xiaozhi-yuntai/` 源码变化。
- 候选证据：app 为 202,816 字节（`0x31840`），SHA-256 `9BF9183376FEF427E0549EFCA942B193979C11BF563EBA989F7E487F956A9786`；冻结写入地址为 `0x100000`，数据终点 `0x13183F`，若获授权写入工具最多覆盖扇区至 `0x131FFF`。生成分区表 SHA-256 保持 `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0`。
- 构建说明：最终全量构建在未计划写入的 bootloader `rtc_init.c` 遇到一次 GCC `try_forward_edges` 内部编译器错误；没有源码编译错误。既有同源 T09 全量构建门已通过，本轮随后只执行 `idf.py app`，app 链接、bin 生成和 6 MiB `ota_0` 大小检查通过。该证据只支持 app-only 候选，不冒充新的 bootloader 全量构建通过。
- 硬件边界：Windows 目前仅观察到一个 USB 串行候选口，但尚未用 esptool fresh 验明芯片/MAC，也未读取或写入 Flash/NVS、未烧录、擦除、改分区、写 eFuse、monitor 或操作 OLED/舵机/音频。下一步先取得“只识别当前小智并备份校验现有 app、分区表和 NVS”的单独授权，展示结果后再次等待精确 app-only 写入确认。

## 2026-08-30 · T09 EasyInput eight-key, encoder and LED regression confirmed on replacement board

- 做了什么：在 T09 EasyInput 正常应用启动和 `VID_303A/PID_1006` 双 HID 枚举确认后，用户对当前更换后的新 EasyInput 开发板执行实体输入回归。
- 真机结果：S1～S8 八个按键均可用；旋钮旋转、按压和对应灯效均正常。此前 S8 无响应只属于已经换下的旧测试板，不再是当前硬件阻断，也不得继续写成当前样机状态。
- 怎么理解：八键/GPIO48 产品合同始终未变；本次补齐健康替换板的 S8 证据，并确认 T09 app 没有破坏 T03 输入和 T04 灯效。此结果不等于小智 OLED 或完整三端状态链已通过。
- 下一步：状态推进为 `EASYINPUT_APP_FLASH_CONFIRMED / NORMAL_BOOT_CONFIRMED / HID_ENUMERATION_CONFIRMED / EIGHT_KEY_ENCODER_LED_REGRESSION_CONFIRMED / XIAOZHI_T09_FLASH_PENDING`。下一步对小智单独完成身份、恢复备份和 app-only 烧录授权，再恢复三线 Link 验证 OLED idle 与七种真实状态。

## 2026-08-30 · T09 EasyInput normal application boot and HID enumeration confirmed

- 做了什么：用户完成断电重开且未再次按 BOOT 后，仅通过 Windows PnP/HID 做正常应用态只读检查；没有再次调用 esptool、进入下载模式或发送厂商配置写入。
- 验证：Windows 同时枚举到 `VID_303A/PID_1006` 的 USB 输入设备与供应商定义 HID 接口，二者状态均为 `OK`。这证明已写入的 `d96179725fb9bd0724e6c92429f090e4bd3a6a7a` T09 EasyInput app 已正常启动，不再只是“烧录和回读成功”。
- 安全边界：本次未读取或写入 Flash/NVS，未烧录、擦除、改分区或写 eFuse，也未操作小智、OLED、舵机和音频；没有记录完整设备路径、MAC 或序列号。
- 下一步：状态推进为 `EASYINPUT_APP_FLASH_CONFIRMED / NORMAL_BOOT_CONFIRMED / HID_ENUMERATION_CONFIRMED / PHYSICAL_REGRESSION_PENDING`。用户短测 S1～S7、旋钮左右与按压及灯效；通过后再单独准备和授权小智 T09 app-only 烧录。

## 2026-08-30 · T09 EasyInput app flash and exact readback confirmed; normal boot pending

- 做了什么：在恢复备份、身份和固定分区校验通过后，按用户精确授权把 `d96179725fb9bd0724e6c92429f090e4bd3a6a7a` 的 EasyInput T09 app 单段写入 `0x010000..0x05DD2F`，自动擦除仅覆盖到 `0x05DFFF`；写后重新枚举并 fresh 验身，再只读回同一 app 数据范围。
- 验证：本地候选和板上回读均为 318,768 字节，SHA-256 均为 `80A3D1B02768FEEB2271F9978594BD3FFA5458F32BE87BDDA1F26CD8765C5489`；esptool 写入校验与独立回读校验均通过。回执保存在 Git 外恢复目录的 `t09-d961797-flash-receipt.json`。
- 安全边界：未写分区表、NVS、bootloader、`sound_a`、`sound_b` 或 eFuse；未整片擦除、未改分区，也未操作小智、OLED、舵机和音频。
- 下一步：当前只具备 `EASYINPUT_APP_FLASH_CONFIRMED`，不冒充应用已正常运行。用户需按当前 EasyInput 板级规则“关机一次→正常开机”，不要再次按 BOOT；随后先验证 USB/HID、按键、旋钮和灯效，再准备小智 T09 的独立备份与 app-only 烧录。

## 2026-08-30 · T09 EasyInput identity and recovery backup confirmed; flash still pending

- 做了什么：按用户单独授权只识别当前 EasyInput，确认硬件为 ESP32-S3、8 MB PSRAM、16 MB Flash；只读备份分区表 `0x008000/0x001000`、NVS `0x009000/0x006000` 和完整 factory app 分区 `0x010000/0x300000`，生成 Git 外恢复清单。未解析 NVS 内容，也未显示或保存 MAC、序列号和完整设备路径。
- 为什么与怎么理解：T09 app-only 写入前必须先证明目标板身份、固定分区布局和可恢复性。板上读取的分区窗口为 4 KiB，而 ESP-IDF 有效分区表文件为 3 KiB；前 3 KiB 逐字节一致，尾部 1 KiB 全为擦除态 `0xFF`，五个分区的名称、类型、地址和大小完全一致，因此不是布局不匹配。
- 产出路径：Git 外目录 `F:\Codex\deskmate-device-backups\easyinput\t09-preflash-20260830T131317`；`manifest.json` SHA-256 为 `6F30C0557E34418555261C19D9D1CB03AD148CD78A6CFDF9E7C371C7CDEA7667`。分区、NVS 和 factory app 三个备份均通过精确长度与 SHA-256 校验。
- 问题解决：首次直接拿 4 KiB 读取窗口与 3 KiB 生成文件做整文件 SHA-256，出现假不一致并立即触发停止；离线解析和逐字节比较确认差异只来自 1 KiB `0xFF` 填充后，才继续已授权的 NVS/app 只读备份。第一次 3 MiB 读取命中 120 秒上限且未产生 app 文件，改用 460800 波特率、300 秒有界超时重新完整读取并校验。
- 下一步：本次仍未写 Flash/NVS、未烧录、未擦除、未改分区或 eFuse，也未操作小智、OLED、舵机和音频。文档提交后从新 HEAD 重建 EasyInput T09 app、重新给出 SHA-256 和精确 app-only 写入范围；只有用户再次确认后才允许烧录。

## 2026-08-30 · T09 three-end integration and code gates complete; final images and HIL authorization pending

- 做了什么：从已通过 T08 双向断线验收的 `b38c8c21afa2b5b8164c084953faa28996b5ea65` 建立隔离分支 `codex/t09-three-end-integration`，合入小智 OLED 实现 `d014af453dd95fab9ad6af24b25d54b6c3c8561e`；保留桌面 HID `0x12` 发送器、EasyInput 状态桥和冻结 DeskMate Link，未改写冻结协议。整合 merge 为 `86ca15c763351c7141d2337dad39f246ab41e21a`。
- 为什么与怎么理解：T09 三端代码已经各自通过审计，统一整合能消除双窗口分叉并形成唯一烧录候选。小智在冷启动时独立初始化 OLED、先显示 idle 大眼睛；显示失败只降级 DISPLAY，不能拖垮 Link、EasyInput 输入或 Host Action。
- 产出路径：`docs/handoffs/t09-three-end-integration-2026-08-30.md`、三张 T09 任务卡、两套固件 README/局部规则和本条进展记录。
- 验证：桌面 `126/126`、EasyInput Host `9/9`、小智 Host `8/8`；Windows 原生桥、Vite 和独立 Electron unpacked package 通过；EasyInput ESP-IDF v5.5.5 固定 16 MiB 分区构建通过；小智 ESP-IDF v5.5.3 固定产品分区构建通过。未安装或升级工具链。
- 问题解决：小智首次构建失败来自本机 ESP-IDF 工具根目录配置，不是源码；复用既有 `C:\Espressif\tools` 后完成构建。桌面第一次打包因两个构建进程重叠出现 rename 竞态，改用隔离输出 `release/verify` 后完整通过。
- 下一步：提交文档后从最终 HEAD 干净重建两块板 app，生成大小、SHA-256、分区哈希和精确 app-only 授权卡；本轮未扫描端口、未识别设备、未读写 Flash/NVS、未烧录、未 erase/monitor/eFuse，也未实际操作 OLED、舵机或音频。获得逐板新授权后按 EasyInput→小智顺序烧录并执行 T09 可见状态与 T03～T06 联合回归。

## 2026-08-30 · T08 two-board Link and both signal-direction HIL confirmed; software regression deferred

- 做了什么：在已烧录的 EasyInput `defaea8361cbd4f63e52c281cd1fd7a7cca6f19d` 与小智 `132117e8cf8aeae07319cc647d2634326ec14637` 上，按冻结三线合同逐根断开信号线，保留 GND 共地且始终不连接 3V3；仅通过 EasyInput 已冻结 HID 状态通道读取脱敏 Link 状态与计数。
- 真机证据：断开 EasyInput TXD0→小智 RX 时保持 `waiting/rx=0`，`tx 858→894`、timeout `286→298`、retry `572→596`。用户随后明确只断开小智 TX→EasyInput RXD0、保留另一信号与 GND；状态同样保持 `waiting/rx=0`，`tx 52→57`、timeout `17→19`、retry `34→38`，所有协议与队列错误为 0。恢复 RXD0 并冷启动后 Link 保持 `connected`，收发从 `13/16` 增至 `14/17`，所有新增协议错误为 0。
- 接触观察：第一次恢复同一逻辑线序时出现有效但 unexpected 的回送帧；用户重新插拔相同交叉接法并冷启动后恢复 `connected`，收发 `21/24→22/25` 且 unexpected 归零。因此只记录为间歇性接触/启动观察，不把它误写成已经证实的线序错误。
- 既有功能回归：恢复两根信号后，用户确认实体按钮、旋钮旋转和旋钮按压均正常。DeskMate 当时未运行，因此语音输入、打开应用、历史复制和配置页读取没有执行，明确保留为延期项，不冒充通过。
- 安全与产出：未写 HID/配置，未读取或写入 Flash/NVS，未烧录、擦除、改分区或 eFuse，也未操作 OLED、舵机和小智音频。证据已补入 `docs/testing/t08-first-read-only-link-acceptance.md`；状态推进为 `LINK_HIL_CONFIRMED / SIGNAL_DISCONNECT_CONFIRMED / COMBINED_SOFTWARE_REGRESSION_DEFERRED`。
- 下一步：保持两根信号线与 GND 正常连接、3V3 悬空；可以继续 T09 候选准备，但在标记完整 T08 包锁定或执行 T09 三端真机验收前，仍需启动已接受的 DeskMate 候选补做语音、打开应用、历史复制、配置读取及一次用户可见故障态回归。

## 2026-08-30 · T09C independent audit confirmed after boundary hardening

- 做了什么：在隔离工作树 `F:\Codex\deskmate-t09-final-audit`、分支 `codex/desktop-t09-agent-state-audit` 独立审计远端 T09C `543a49a1ca47a2007edc76fed9ba8164994bc8d9`。审计提交 `86d54a70878dcfc2d6a07b6575279c914701b275` 在任何首字节访问前拒绝 null/zero-length Feature Report，并补齐固件边界向量与桌面 timeout、latest-wins、stale ACK、stop cleanup 回归；未改冻结合同、DeskMate Link、小智、界面导航或硬件引脚。
- 为什么与怎么理解：正常 Windows/TinyUSB 路径不会主动制造零长度非空缓冲，但协议归一化层必须独立 fail closed；同理，任务卡声称的 timeout 不能由 disconnect 用例代替。修复保持既有 VoiceWorkflow 为唯一状态机，64 字节 Windows Feature Report 仍由 Electron 与原生桥双重校验，mock/simulator 仍不能写硬件，断线或原生桥重启后仍不重放旧状态。
- 产出路径：`firmware/easyinput-controller/components/input_core/src/agent_state_core.cpp`、`firmware/easyinput-controller/host_test/agent_state_core_tests.cpp`、`tests/phase3-input-bridge.test.mjs`、`docs/reviews/t09c-desktop-agent-state-sender-audit-2026-08-30.md`、T09C 任务/交接、`flow/plan.md` 与 `flow/lessons.md`。
- 验证：定向桌面/原生测试 33/33；桌面全量 126/126；原生桥协议自检、Windows Release 打包通过；EasyInput Host CTest 9/9；精确 ESP-IDF v5.5.5、target `esp32s3`、Minimal Build 和固定 16 MB 分区构建通过。代码门 app 318,768 字节（`0x4DD30`），SHA-256 `90BC17D90F7F713D5AEE4BA3C451E470D6A7D71E07CE7AD3D2D806EFCBAF9ECE`；分区表 SHA-256 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`。静态检查通过；板级脚本为 1 PASS/1 个既有 C++ 声明解析 WARN/0 FAIL，本包没有修改 GPIO。
- 问题解决与下一步：状态推进为 `AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / T09_AGENT_STATE_DISPLAY_V1_FROZEN / HIL_NOT_AUTHORIZED`。主目录用户界面改动保持不动；未扫描端口、未识别设备、未读写 Flash/NVS、未烧录、未 erase/monitor/eFuse，也未操作 OLED、舵机或音频。下一步先人工完成 T08 的逐根 TX/RX 断线与 T03～T06 组合回归，再针对最终远端 HEAD 干净重建并单独授权 T09 三端真机闭环。

## 2026-08-30 · T09C desktop agent-state sender code and build gate complete

- 做了什么：在隔离工作树 `F:\Codex\deskmate-t09-desktop`、分支 `codex/desktop-t09-agent-state-sender` 完成桌面 T09C，基线为 `d9f91e30e6f52325df70d0665f900de1164bfd96`，实现提交为 `b93de789fd17b86f3022baa85abd52d2dff9dd29`。Electron 主进程把既有 VoiceWorkflow 映射为七状态并编码 HID Feature `0x12` v2；原生桥再次严格校验后调用 Windows HID 写入；队列只保留一个在途和一个最新候选，断线或进程重启后不重放旧状态。模拟器、mock STT 和 demo 来源明确隔离，不能写硬件。
- 为什么与怎么理解：Windows `HidD_SetFeature` 必须按顶层 HID collection 的 `FeatureReportByteLength` 发送，当前集合长度为 64 字节；前 17 字节是 Report ID 加 16 字节冻结语义，余下 47 字节只能为零填充。该填充只是 Windows 传输形态，不是 DeskMate `0x12` 业务 payload；EasyInput 只在 TinyUSB 边界归一化并拒绝非零尾部，冻结语义和 DeskMate Link framing 均未改变。
- 产出路径：`electron/agent-state-hid.cjs`、`electron/input-bridge.cjs`、`native/DeskMate.InputBridge/Program.cs`、`src/pages.jsx`、`tests/agent-state-hid.test.mjs`、`docs/contracts/t09-agent-state-display-v1.md`、`flow/tasks/T09C-desktop-agent-state-sender.md` 和 `docs/handoffs/t09c-desktop-agent-state-sender-2026-08-30.md`。稳定决策与复用经验已分别写入 `flow/decisions.md`、`flow/lessons.md`。
- 验证：桌面 `npm test` `125/125`、`npm run build:desktop`、原生协议自检通过；EasyInput Host CTest `9/9`；ESP-IDF `v5.5.5`、target `esp32s3`、固定 16 MB 分区构建通过。app 318,768 字节（`0x4DD30`），SHA-256 `B275C31CBC681FF07A1AA79614AD39C397DB4045C9F2A7F040A46F95590C746D`；分区表 SHA-256 保持 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`。`git diff --check`、ASCII 路径、密钥/隐私、构建产物忽略和局部规则一致性检查通过；板级基线脚本只有“无法解析 C++ 引脚声明”的既有警告，本包没有修改 GPIO 或引脚。
- 问题解决与下一步：本轮关闭了桌面缺少真实 `0x12` 发送器以及 Windows 64 字节 Feature Report 形态不兼容两个代码阻断。状态为 `TEST_CONFIRMED / BUILD_CONFIRMED / T09_AGENT_STATE_DISPLAY_V1_FROZEN / HIL_NOT_AUTHORIZED`；未扫描端口、未识别设备、未读写 Flash/NVS、未烧录、未 erase/monitor/eFuse，也未操作 OLED、舵机或音频。本条 app 哈希仅为代码门证据，不是烧录授权镜像；申请写入前必须从最终远程 HEAD 干净重建并重新计算哈希。下一步先独立审计，再补 T08 逐根 TX/RX 断线和 T03～T06 组合回归；取得单独授权后才进行桌面真实语音状态→EasyInput→小智 OLED 的 T09 真机验收。

## 2026-08-30 · T09 two-end firmware cross-audit passed after display-degradation fix

- scope/baseline：交叉审计 EasyInput `codex/easyinput-t09-agent-state-bridge@9c97edd557c9b2ad54b7b6338acc70793ce37522` 与小智 `codex/xiaozhi-t09-agent-display@d014af453dd95fab9ad6af24b25d54b6c3c8561e`；T09 状态合同、DeskMate Link v1 和黄金向量在两分支逐文件一致，未重写 framing 或共享合同。
- finding/fix：小智按合同在 OLED 初始化/渲染失败时移除 DISPLAY enabled、保留基础 Link，并用 status bit1/bit7 表示显示启用/故障；EasyInput 首版却把 DISPLAY 当作握手硬条件且仍使用 T08 status 掩码，会把合法降级误判为整链断开。已在 EasyInput 提交 `9c97edd557c9b2ad54b7b6338acc70793ce37522` 修正：CORE+AGENT_STATE 保持 Link，`SET_AGENT_STATE` 仍须 DISPLAY，MOTION/AUDIO 仍禁用，并补 implemented `0x07`/enabled `0x03`/fault `0x81` 回归。
- verification：EasyInput Host 9/9、ESP-IDF v5.5.5 构建通过，app 318,576 字节（`0x4DC70`），SHA-256 `DB152B01152C1D646B5F2B4D22CD827A0340ACC8CF7D3397A23118F57F831C5A`；小智最终 HEAD 在独立审计工作树 Host 8/8、ESP-IDF v5.5.3 构建通过，app 202,816 字节（`0x31840`），SHA-256 `214793123280D53650C40633B46F65A0037EB23BDD16A3A5E50829030DB21D9A`。两边固定分区表哈希保持不变。
- hardware/next：状态为 `CROSS_AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED`。未扫描端口、未识别设备、未读写 Flash/NVS、未烧录、未 erase/monitor/eFuse，也未操作 OLED、舵机或音频。下一步先实现独立桌面主进程 HID `0x12` 状态发送器；人工回来后仍需补 T08 两根信号线单独断线和 T03～T06 组合回归，再分别申请两板 app-only 烧录与 T09 OLED 真机验收。

## 2026-08-30 · T09 EasyInput agent-state bridge code and build gate complete

- scope/implementation：在隔离工作树 `F:\Codex\deskmate-t09-easyinput`、分支 `codex/easyinput-t09-agent-state-bridge`，基于冻结合同提交 `5e2541fa082c1014948731fd91897d71ac509d5f` 完成 EasyInput 端，产品实现提交为 `e50bc75e974695c1a79cd887e88836222296565e`。新增 HID Feature `0x12` v1/v2 严格解码、单槽最新状态邮箱、七状态映射、TTL、USB/Link epoch 与对端重启清理，并只经既有 `SET_AGENT_STATE` 转发；未修改桌面 UI、小智固件、Link framing、输入、灯效、NVS、音频、BLE、Wi-Fi 或分区。
- audit/fix：最终自审发现首版候选错误复用配置 FIFO，且 idle 去重记录可能跨断线/对端重启残留；提交前改为独立 `xQueueOverwrite` 单槽邮箱，并补齐 idle 断线与 restart 回归。能力门要求 CORE+AGENT_STATE+DISPLAY，MOTION/AUDIO 保持禁用；诊断只暴露计数，不记录 payload、source hash 或用户数据。
- verification：EasyInput Host CTest 9/9；ESP-IDF v5.5.5、target `esp32s3`、固定 16 MB 分区构建通过。app 318,576 字节（`0x4DC70`），SHA-256 `013A7697AF498C4072DB4996AF095F7412F6C4778AD73C627BA96261E778954D`；分区表 SHA-256 保持 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`。`npm ci --include=dev`、桌面 115/115 和 `npm run build:desktop` 通过，`git diff --check` 通过。
- hardware/next：未扫描端口、未识别设备、未读写 Flash/NVS、未烧录、未 erase/monitor/eFuse，也未操作接线、OLED、舵机或音频。下一步等待小智 T09 分支并行完成后交叉审计；仍须补 T08 的逐根 TX/RX 断线和 T03～T06 组合回归，并另做桌面主进程 `0x12` 发送器，之后才申请 T09 两端 app-only 烧录和 OLED 真机验收。

## 2026-08-30 · T08 positive Link and Xiaozhi restart recovery passed; two manual checks remain

- role/base：在硬件电脑使用已烧录的 EasyInput `defaea8361cbd4f63e52c281cd1fd7a7cca6f19d` 与小智 `codex/xiaozhi-t08-link-endpoint@132117e8cf8aeae07319cc647d2634326ec14637`，两端继续消费 `DESKMATE_LINK_V1_FROZEN@c8b8a344a72a849640c8b19575768d6daf4d6667`。本记录只补真机事实，不改冻结协议。
- HIL：EasyInput UART0 本地回环收发均为 579；小智 COM 直连能够返回逐字节和 CRC 均有效的冻结 HELLO 响应。发现最初把 RX→RX、TX→TX 后，按合同改为 EasyInput TXD0→小智 RX、EasyInput RXD0←小智 TX、GND 共地且 3V3 悬空，两次状态采样保持 connected，收发从 `21/81` 增至 `23/83`，历史 timeout/retry 不再增长。
- restart：用户重启小智后，EasyInput 记录 `peer_restarts=1`、自动恢复 connected，连续采样从 `rx=171/tx=231` 增至 `rx=173/tx=233`。小智 ROM 启动字符形成的 `framing_errors=116` 与三次 semantic reject 随后保持稳定；CRC/version/length/queue-drop 均为 0，证明有界重同步生效。
- safety/status：未操作 OLED、舵机或小智音频；本段未新增 Flash/NVS 读写、烧录、擦除、分区或 eFuse 操作。T08 当前为 `PARTIAL_HIL_CONFIRMED`，尚缺逐根 TX/RX 断线恢复、旧状态不重放以及 connected/faulted 下的 T03-T06 组合回归，不得标记 `T08_LOCKED`。
- output/next：证据写入 `docs/testing/t08-first-read-only-link-acceptance.md`。用户离开期间只允许继续合同、代码、Host test、构建和自审；人工回来后先完成两根信号线断线矩阵，再进行任何 T09 app 烧录或 OLED 真机动作。

## 2026-08-30 · Both T08 apps are flashed; physical three-wire Link wiring identified but not connected

- Xiaozhi evidence：用户提供另一窗口的烧录/校验记录：小智 `codex/xiaozhi-t08-link-endpoint@132117e8cf8aeae07319cc647d2634326ec14637` 只写 app `0x100000..0x129D9F`，镜像 171,424 字节，SHA-256 `C6FF9CCE3704EED980781C83FCE92B6BFDAC853935A59C07C8F042284856C6D9`；app、既有分区表和既有 NVS 独立校验通过，未整片擦除、未改分区/NVS/eFuse，完整 16 MiB Flash 备份已留在小智窗口的 Git 外恢复目录。
- physical identification：用户新提供的小智实物近照清楚显示三个大焊盘 `RX / TX / GND`；它们与已审计的 H2 pad 3/2/1 和 GPIO44/43/GND 一致。首次链路只允许 `EasyInput TXD0 → 小智 RX`、`EasyInput RXD0 ← 小智 TX`、`GND ↔ GND`；EasyInput J4 `3V3` 必须留空并绝缘，两板独立供电。
- current gate：本窗口未接线、未焊接、未做通断/电压测量，未操作 OLED、舵机或音频。焊接必须在两板 USB 与电池电源均断开时完成，通电前先检查焊桥、对地短路、三线对应和 `3V3` 悬空。首次上电只验收 HELLO/capabilities/status 与既有 EasyInput 回归，DISPLAY/MOTION/AUDIO 仍禁用。

## 2026-08-30 · T08 EasyInput controller app flashed; single-board and read-only Link HIL pending

- authorization/identity：用户按精确实现提交 `defaea8361cbd4f63e52c281cd1fd7a7cca6f19d`、镜像范围和禁止边界明确授权。本机只发现一个 Espressif 下载端口；私有设备身份在识别、备份和写入前均一致，端口、MAC 和序列号未进入 Git 或诊断文档。
- recovery：写入前只读备份完整 3 MiB factory app（`0x010000..0x30FFFF`）；备份长度 3,145,728 字节，SHA-256 `6919099F6799EC65C515AB3A2DE2D7772F720322BC39402C51F28C0BEDAC7874`，保存在当前工作树 Git 忽略的 `diagnostics-private/` 恢复目录。未读取 NVS、PHY 或声音 bank。
- flash result：写入前复验 app 为 316,672 字节（`0x4D500`），SHA-256 `76669AEBF214434532D25743E5B2A6BE6C291AA596466CBFA304BF17CD294987`。只从 `0x010000` 写入数据至 `0x05D4FF`，工具擦写扇区边界不超过 `0x05DFFF`；esptool 退出码 0 且报告数据哈希验证通过。未整片擦除，未写 bootloader、分区表、NVS、PHY、声音 bank 或 eFuse，未操作小智。
- next：设备保持下载态且未启动新 app。用户需正常断电再开机（不再按 BOOT），先回归 EasyInput 按键、旋钮、灯效、语音和配置/Host Action，并确认小智未连接时 Link 安全停留 waiting。小智由独立窗口按其精确镜像、分区和恢复卡另行识别、备份与授权烧录；两块板均通过单板启动回归前不接 UART。

## 2026-08-30 · T08 two-end audit passed after EasyInput deferred-capability hardening

- baseline：交叉审计 EasyInput `codex/easyinput-t08-link-controller@0a0c3efce140b38e8fa1e7ed020b51c9f4eb7cfa` 与小智 `codex/xiaozhi-t08-link-endpoint@132117e8cf8aeae07319cc647d2634326ec14637`；两端都以冻结合同 `c8b8a344a72a849640c8b19575768d6daf4d6667` 为祖先，协议正文、README 和黄金向量逐文件一致且未重写。小智端 Host 7/7、分区/引脚/唯一 UART owner 与既有 ESP-IDF v5.5.3 干净构建证据通过审计，未初始化 OLED、舵机、LEDC、I2S 或音频。
- fix：EasyInput 审计发现总控会接受 T08 明确要求保持关闭的 DISPLAY/MOTION/AUDIO capability 和 status ready 位。实现提交 `defaea8361cbd4f63e52c281cd1fd7a7cca6f19d` 增加冻结切片掩码校验，基础 Link/Agent State 仍按原合同工作，未知未开放能力不被误标为可用；补充两组失败关闭回归，没有修改共享合同、小智、桌面、输入、USB、配置、灯效或 Host Action。
- verification/candidate：EasyInput Host CTest 8/8；ESP-IDF v5.5.5、target `esp32s3`、固定 16 MB 分区构建通过。app 为 316,672 字节（`0x4D500`），SHA-256 `76669AEBF214434532D25743E5B2A6BE6C291AA596466CBFA304BF17CD294987`，app-only 数据范围 `0x010000..0x05D4FF`，写入工具可能覆盖扇区至 `0x05DFFF`；分区表 SHA-256 保持 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`。
- hardware/next：本轮没有扫描端口、识别设备、读写 Flash/NVS、烧录、擦除、monitor、接线、写 eFuse 或操作 OLED/舵机/音频。下一步先推送 EasyInput 最终候选并展示精确 app-only 烧录卡；用户再次确认后只烧 EasyInput。小智随后由独立窗口按其精确 HEAD/哈希/分区和恢复门另行授权烧录；两板都完成单板启动回归前不接 UART。

## 2026-08-30 · T08 cross-end audit fixes stale controller status; Xiaozhi remains hardware-blocked

- role/baseline：在 EasyInput 隔离工作树 `F:\Codex\deskmate-t08-easyinput` 复核 `codex/easyinput-t08-link-controller@a2e7072edaadffa60e9c5b9d77b3331f428015ed`，并交叉审计小智远端 `codex/xiaozhi-t08-link-endpoint@db52e883156b5a4a6e63c0954eb7e3073d3b8aae`。冻结合同 `c8b8a344a72a849640c8b19575768d6daf4d6667` 是两端祖先，`v1.md`、黄金向量和 README 的 SHA-256 逐文件一致。
- fix：审计发现 EasyInput 在三次请求失败进入 waiting/faulted 后只清能力与 flags，仍保留对端旧 `agent_state/last_error`，违反“断线清除 peer-derived status”合同。实现提交 `105ffa7853e1f1483a0909b1c0acf08ab7054291` 统一把断线/故障状态复位为 idle、无错误、零 flags/能力，并补充真实握手、状态、三轮失败后的回归断言；没有修改输入、USB、配置、灯效、Host Action、桌面或小智固件。
- verification：EasyInput Host CTest `8/8`；ESP-IDF v5.5.5、target `esp32s3`、固定 16 MB 分区干净构建通过，分区表 SHA-256 保持 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`。小智 Host CTest `6/6`；ESP-IDF v5.5.3、target `esp32s3` 干净构建通过，app 150,432 字节、SHA-256 `E7042239508134514F3CA5F42E27F0A3F09365A1633FC846E351BA5C63E7E140`，与交接一致。
- blockers/next：小智生产入口仍以 `verified=false/-1/-1` 返回 `HARDWARE_PINOUT_BLOCKED`，不会安装 UART；新工程仍使用默认 app `0x10000`/1 MiB 分区，而固定参考板使用 `partitions/v1/16m.csv`、app `ota_0@0x100000`/6 MiB。当前不得烧录或接线。下一步由小智窗口先固定有来源的 16 MB 布局和恢复方案，再以原理图/PCB 网表或断电通断测量证明实体 TX/RX 焊盘到 SoC GPIO；随后本机只做最终差异审计、生成两板烧录卡和只读 Link HIL。
- hardware：本轮未扫描端口、识别设备、读取或写入 Flash/NVS、烧录、擦除、monitor、写 eFuse、接线，也未初始化 OLED/舵机/音频。

## 2026-08-29 · T08 EasyInput DeskMate Link controller code and build gate complete

- 做了什么：在隔离工作树 `F:\Codex\deskmate-t08-easyinput`、分支 `codex/easyinput-t08-link-controller` 完成 EasyInput 总控端；共享合同/黄金向量提交为 `c8b8a344a72a849640c8b19575768d6daf4d6667`，实现提交为 `697bffa0f372ef57e4b41fa3fa1d7b39bffbab0e`。新增纯 C++ codec/CRC/流式解析器/请求生命周期、GPIO43/44 的 UART0 唯一 owner、HELLO/能力/状态轮询、有限重试、对端重启和旧状态不重放，并把脱敏 Link 状态兼容加入既有 HID 状态响应。
- 为什么/怎么理解：T08 只建立 EasyInput ↔ 小智的安全只读通信底座，不修改桌面、小智固件、OLED、舵机或音频。Maker 固定参考没有同类 J4 产品通信，只用于任务/日志结构核对；协议真相只来自已冻结合同。应用与 bootloader 日志已退出 UART0，ROM 启动噪声通过 magic/长度/CRC/100 ms 超时恢复，不写 eFuse。
- 产出路径：`contracts/deskmate-link/`、`firmware/easyinput-controller/components/input_core/*deskmate_link*`、`firmware/easyinput-controller/main/deskmate_link_uart.*`、`docs/handoffs/t08-easyinput-link-controller-2026-08-29.md`、`docs/testing/t08-first-read-only-link-acceptance.md`。
- 验证/问题解决：EasyInput Host CTest 8/8；ESP-IDF v5.5.5/esp32s3/固定 16 MB 分区构建通过；桌面 `npm ci --include=dev`、115/115 测试和 `npm run build:desktop` 通过。最终自审补齐了“合法错误响应也计入连续请求失败”的边界和精确 100 ms 字节间超时。板级辅助脚本确认 ESP-IDF 工程，但不能识别本仓 C++ pin 常量而给出 warning；因此引脚漂移继续由源码合同测试逐项锁定。未扫描端口、未识别设备、未读写 Flash/NVS、未烧录、未 erase/monitor/eFuse、未接线、未操作小智/OLED/舵机/音频。
- 下一步：推送本分支并停止。小智窗口必须基于合同提交 `c8b8a344a72a849640c8b19575768d6daf4d6667` 完成 Host/构建；随后在当前电脑独立审计两端，再分别申请 app-only 烧录和首次接线授权。第一次双板 HIL 仅验证 HELLO、能力、状态、重启/断线恢复和既有功能回归。

## 2026-08-30 · T09 Xiaozhi agent-state OLED endpoint ready for cross-audit

- baseline/contract：在隔离工作树 `F:\Codex\deskmate-t08-xiaozhi`、分支 `codex/xiaozhi-t09-agent-display` 从精确 T08 基线 `132117e8cf8aeae07319cc647d2634326ec14637` 开始；没有 cherry-pick 夹带双方记录的 `5e2541fa082c1014948731fd91897d71ac509d5f`，而是仅恢复三份 T09 新文件并逐项核对用户指定 blob，导入提交为 `dfe6d85dc0d37dd119cdf862d19e8cc28fe7da85`。合同状态为 `T09_AGENT_STATE_DISPLAY_V1_FROZEN`；共享 DeskMate Link framing、CRC、消息 ID、错误和黄金向量未修改，EasyInput 固件和桌面软件未修改。
- implementation：新增七状态纯逻辑场景映射、唯一同步 display owner、四项有界队列和 fake OLED；Link 只入队，owner 接受后才 ACK。OLED 初始化成功后才启用 DISPLAY；初始化失败不声明实现/启用，运行期渲染或 task 失败保留 implemented、关闭 enabled 并设置既有 fault 位，Link 继续工作。重复状态、队列满、EasyInput TTL 发来的实时 idle、transport 断开、重连、controller boot epoch 改变和旧状态不重放均有 Host 覆盖。实体渲染端固定为已审计的 SSD1306 128×64、I2C0、GPIO41/42、`0x3c`、400 kHz 和 X/Y mirror；`angry` 不自动映射，音频、I2S、舵机、LEDC/PWM 和待机动作均未启用。
- provenance：只读参考 `F:\Codex\xiaozhi-yuntai` 没有 `.git`，准确提交保持 `UNKNOWN`；项目版本 1.9.0、许可证 MIT。只采用板级映射、40×40 双眼/10 px 间距和唯一队列写屏等行为证据，产品侧为新写的确定性一位过程式场景，没有复制 LVGL、参考源码、图片、字体、模型、音频或构建产物。逐文件 SHA-256 和差异表见 `docs/provenance/t09-xiaozhi-agent-display-reference-audit.md`。
- verification：Host CTest `8/8`。使用精确 `ESP-IDF v5.5.3@2c211b236707889e8400c4dc5644dd5c4ee071e0`、target `esp32s3`、独立生成的 sdkconfig 和新 build 路径完成 16 MiB 构建；首轮并行编译在 IDF 自带 RGB LCD 源发生一次 GCC internal error，同源码/同参数立即重试后完整构建通过。提交交接前 app 为 202,816 字节（`0x31840`）、写入地址 `0x100000`、小于 6 MiB，SHA-256 `BD59E936F7AE1CF7CC3EBAE1CF07F992E880264F33C44EE8810A7E4EE490300B`；分区表 SHA-256 `4D122CA60C7321C2C4CB393D3B612908263C2C860E92FDD43036FDBFD1C762E0`。最终文档提交会改变内嵌 Git 版本，交付回复另报最终 HEAD 重建哈希。
- safety/stop：本轮没有扫描或识别端口、接线、读写 Flash/NVS、烧录、erase、monitor、写 eFuse、操作真机 OLED、舵机或音频。当前为 `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED / PENDING_EASYINPUT_CROSS_AUDIT`；推送后停止，等待 EasyInput 窗口先做交叉审计。T08 两根信号线分别断开的验收、旧状态真机不重放和 T09 OLED HIL 仍未执行。

## 2026-08-30 · T08 Xiaozhi 16 MiB partition and Board1_2 UART pinout blockers closed

- baseline/scope：在隔离工作树 `F:\Codex\deskmate-t08-xiaozhi`、分支 `codex/xiaozhi-t08-link-endpoint` 从用户指定的 `db52e883156b5a4a6e63c0954eb7e3073d3b8aae` 开始，只修改 `firmware/xiaozhi-yuntai/` 和 T08 来源/任务/交接记录。冻结合同提交 `c8b8a344a72a849640c8b19575768d6daf4d6667` 仍为祖先，DeskMate Link 合同、黄金向量和已审计协议实现没有重写；EasyInput 固件、桌面软件、T07、VoiceWorkflow 和 T09 未修改。烧录阻断实现提交为 `7edf755b289b87e04c1b8a2cc78983b4ac4cf8e5`。
- partition：把只读参考 `F:\Codex\xiaozhi-yuntai\partitions\v1\16m.csv` 以逐字节一致的产品源文件落到 `firmware/xiaozhi-yuntai/partitions/v1/16m.csv`；两者均为 329 字节、SHA-256 `5F9FA5E46E092D5571D19DA7B8956F6F9BFD5B7F603799B24D8DFCE769E30C14`。恢复 NVS `0x9000/0x4000`、OTA data `0xD000/0x2000`、PHY `0xF000/0x1000`、model `0x10000/0xF0000`、OTA_0 `0x100000/0x600000`、OTA_1 `0x700000/0x600000`；sdkconfig、CMake 失败门与 Host 测试共同锁定该表，没有复制或提交构建产物。
- pinout/console：只读参考 README 指向公开 OSHWHub 板卡。推荐的 Board1_2 PCB 将 H2 pad 1/2/3 分别置于 `GND/TX/RX` 网络，同版原理图把 `TX/RX` 接到模块 `TXD0/RXD0`；结合 Espressif ESP32-S3 的 U0TXD/U0RXD=GPIO43/GPIO44 定义，板级证据门已关闭。生产配置为 `verified=true`、TX43/RX44；纯 C++ 安装计划对未验证、负数或同脚配置 fail-closed，Host 测试锁定“未验证禁止安装”和“验证后只用 43/44”。应用/次控制台、bootloader/application 日志仍关闭，不写 eFuse，ROM 噪声仍由 parser 重同步丢弃。
- verification：Host CTest `7/7`。在实现提交 `7edf755b289b87e04c1b8a2cc78983b4ac4cf8e5` 上使用精确 `ESP-IDF v5.5.3@2c211b236707889e8400c4dc5644dd5c4ee071e0`、target `esp32s3` 和全新 build/SDKCONFIG 路径完成干净构建；`app-flash_args` 为 `0x100000 deskmate_xiaozhi_yuntai.bin`。app 171,424 字节（`0x29DA0`），仅占 6 MiB 的 2.72%，SHA-256 `C6FF9CCE3704EED980781C83FCE92B6BFDAC853935A59C07C8F042284856C6D9`；分区二进制 3,072 字节，SHA-256 `4D122CA60C7321C2C4CB393D3B612908263C2C860E92EDD43036EDBFD1C762E0`。`git diff --check`、合同祖先/不变性、所有权、AGENTS/CLAUDE 镜像、来源/许可证、密钥/隐私、ASCII 路径和构建产物忽略检查通过。
- hardware/stop：本轮没有扫描端口、识别设备、接线、通断测量、读写或擦除 Flash、烧录、monitor、写 eFuse、操作 OLED/舵机/音频，也未启动 T09 或两板 HIL。分区和 pinout 的代码阻断已关闭，但电气/恢复与硬件授权仍关闭；独立供电、共地、空闲电压、无短路、USB 恢复、实片 Flash/PSRAM 和舵机电气/机械参数仍为 `UNKNOWN` 或未验收。推送后停止，任何物理操作都必须重新取得用户明确授权。

## 2026-08-30 · T08 Xiaozhi Link endpoint Phase B completed; hardware pinout remains blocked

- baseline/contract：在隔离工作树 `F:\Codex\deskmate-t08-xiaozhi`、分支 `codex/xiaozhi-t08-link-endpoint` 从要求的 `503315e96dc7fbb23a01a308c0164c5bfe767e25` 开始；以 merge commit `a6547c31027141fd35c49690ff39ec6d1cb5f0ac` 合入冻结合同 `c8b8a344a72a849640c8b19575768d6daf4d6667`，祖先检查返回 0，合同和共享黄金向量没有重写。Phase B 实现提交为 `915cd0a5c4aedc87a227564a4b09b3d478acf061`；EasyInput 固件、桌面软件、T07 UI、VoiceWorkflow 和 T09 均未修改。
- implementation：严格实现 DMLK 编解码、CRC16-CCITT-FALSE、100 ms 流式 parser、分段/粘包/启动噪声/坏 CRC/超长/溢出重同步，完成 HELLO、GET_CAPABILITIES、GET_STATUS、SET_AGENT_STATE、一字节错误响应、最近八项精确缓存、重复幂等、冲突序列拒绝、controller boot epoch 失效和随机非零 Xiaozhi boot epoch。唯一 UART owner 固定 UART0 115200/8N1/无流控、512 字节有界 RX buffer 和单一写入口；SET_AGENT_STATE 只写 RAM，DISPLAY/MOTION/AUDIO 能力为零，未初始化 OLED、舵机、PWM/LEDC、麦克风、功放、扬声器或 I2S。
- pinout/console：只读参考仍无 `.git`，准确提交为 `UNKNOWN`，许可证 MIT、版本 1.9.0。照片只证明实体焊盘有 GND/TX/RX 丝印；板型源码只证明当前功能未占 GPIO43/44，ESP-IDF 只证明 SoC 默认 UART0 IOMUX 为 TX43/RX44，缺少原理图网络、PCB 网表或断电通断证据，不能据此猜生产引脚。因此 `board_link_pinout.h` 保持 `verified=false/-1/-1`，启动在安装 driver、配置 GPIO 和创建 task 前返回 `HARDWARE_PINOUT_BLOCKED`。应用/次控制台、bootloader/application 日志关闭，不写 eFuse；ROM 启动字节由 parser 安全丢弃。
- verification：Host CTest `6/6`；精确 `ESP-IDF v5.5.3@2c211b236707889e8400c4dc5644dd5c4ee071e0`、target `esp32s3` 单线程干净构建通过。实现提交 app 为 150,432 字节（`0x24BA0`），SHA-256 `F53334BF7AC7AE49D359C142D03F7236A25866B86FED8038E717F7265FAFA285`；默认 1 MiB factory 余量 `0xDB460`（86%），仅为编译证据，不是获准烧录的最终布局。`git diff --check`、所有权、冻结合同、ASCII 路径、AGENTS/CLAUDE、来源/许可证、密钥/隐私和构建产物忽略检查通过。详细交接见 `docs/handoffs/t08-xiaozhi-link-endpoint-phase-b-2026-08-30.md`。
- hardware/stop：本轮未扫描端口、识别设备、接线、读写或擦除 Flash、烧录、monitor、写 eFuse、操作 OLED/舵机/音频，也未启动 T09 或两板 HIL。当前状态为 `T08_PHASE_B_PROTOCOL_READY / DESKMATE_LINK_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / HARDWARE_PINOUT_BLOCKED / HARDWARE_NOT_AUTHORIZED`；推送后停止，下一步只能先取得准确板级引脚证据并另行通过电气/恢复与用户授权门。

## 2026-08-29 · T08 Xiaozhi Link endpoint Phase A completed and stopped at contract gate

- role/branch/base：本窗口只负责小智固件，在隔离工作树 `F:\Codex\deskmate-t08-xiaozhi`、分支 `codex/xiaozhi-t08-link-endpoint` 工作；起点为 T08 交接 HEAD `93a5f9c6f72c9eb5a02917d062bfff38da0c4258`，正式主基线已核对为 `origin/main@3e2a046f49260ead422da4c295c3321de13dca5d`，Phase A 实现提交为 `bfa1f46554a97636241d3a5f15c4d23e9391e05f`。原 `F:\Codex\deskmate` 工作树未切换、未覆盖；EasyInput 固件、桌面软件和 `contracts/deskmate-link/` 均未修改。
- reference/UART：只读参考 `F:\Codex\xiaozhi-yuntai` 没有 `.git`，因此准确参考提交保持 `UNKNOWN`；根许可证为 MIT，项目版本 `1.9.0`。参考当前 UART0 是 115200 主控制台，USB Serial/JTAG 是次控制台；ESP-IDF v5.5.3 的 ESP32-S3 默认 UART0 IOMUX 为 TX GPIO43/RX GPIO44，当前板源未占用这两个 GPIO，但缺少原理图或连续性测量，不能证明物理排针连接。Phase A 只把应用日志迁到 USB Serial/JTAG，ROM 启动字节、USB 物理路由和恢复行为仍未验证。
- outputs/safety：建立 ESP-IDF v5.5.3/esp32s3 正式模块、纯 C++ transport abstraction、Host-only fake UART、只读 capability/status 模型和 fail-closed 源码合同测试。Link/motion 为 `locked`，display 为 `pending_validation`，本板麦克风/功放/扬声器为 `disabled_by_product`；没有真实 UART 控制器/引脚/速率或 framing、magic、版本、消息 ID、CRC、超时、重试、错误语义，也没有初始化 OLED、I2S、音频、LEDC、PWM 或舵机。完整证据见 `docs/provenance/t08-xiaozhi-link-endpoint-reference-audit.md`，交接见 `docs/handoffs/t08-xiaozhi-link-endpoint-phase-a-2026-08-29.md`。
- verification：Host CTest `3/3`；精确 `ESP-IDF v5.5.3@2c211b236707889e8400c4dc5644dd5c4ee071e0`、target `esp32s3` 构建 `530/530`。app 为 160,768 字节（`0x27400`），SHA-256 `E553C1B18D37320B3B5606F3552B1637835F46B39D598EA0D686DA4A5187EAE1`；默认 1 MiB factory 分区约 85% 空闲，但它只是编译脚手架，不是获准烧录的最终布局。`git diff --check`、所有权、ASCII 路径、AGENTS/CLAUDE 镜像、来源/许可证、密钥/隐私、构建产物忽略检查均通过。
- hardware/UNKNOWN/next：本轮未扫描端口、未识别设备、未接线、未读写或擦除 Flash、未烧录、未 monitor、未初始化任何外设。仍为 `UNKNOWN`：参考 Git 提交、PCB 版本/原理图、排针到 GPIO43/44 连续性、USB 路由与恢复、电平/共地、Link UART 外设和引脚、物理排针启动字节、Flash/PSRAM 实器件与最终 Flash/OTA/恢复布局、舵机供电/峰值电流/中心/方向/机械限位。现在停止；只有 EasyInput 窗口提供准确且显式标记 `DESKMATE_LINK_V1_FROZEN` 的提交后，才可进入 Phase B，并且小智窗口只消费合同、不修改合同。

## 2026-08-29 · T08 parallel firmware ownership opened from frozen T07 main

- role/branch/base：本窗口在隔离工作树 `F:\Codex\deskmate-t08-easyinput` 创建 `codex/easyinput-t08-link-controller`，精确基线为 `origin/main@3e2a046f49260ead422da4c295c3321de13dca5d`；原 `F:\Codex\deskmate` 的用户界面脏工作树完全未改动。另一窗口将从同一基线创建 `codex/xiaozhi-t08-link-endpoint`。
- scope/understanding：用户确认两条固件线并行，但本窗口只开发 EasyInput，另一窗口只开发小智。为避免两边分别猜协议，`contracts/deskmate-link/` 在冻结前由本窗口单点拥有；小智窗口在取得准确合同提交前只做 UART/控制台证据核对、工程/transport/Host 骨架。
- outputs：任务卡 `flow/tasks/T08-easyinput-link-controller.md`、`flow/tasks/T08-xiaozhi-link-endpoint.md`；并行交接 `docs/handoffs/t08-parallel-firmware-split-2026-08-29.md`；D031 固定所有权与单合同原则。协调提交 `90585a6d23a448ad12433c112d451ddea8c737f5` 已推送，当前合同仍是 `NOT_FROZEN`，尚未实现协议或固件代码。
- verification/hardware：仅检查 Git 基线、规则和文档；未扫描端口、识别设备、读写 Flash/NVS、烧录、擦除、monitor、接线、初始化 OLED/音频或驱动舵机。GitHub fetch 因网络连接失败，本地 `origin/main` 对象与用户截图的准确 HEAD 一致。
- next action：本窗口先单独提交 `DESKMATE_LINK_V1_FROZEN` 和黄金向量，再实现 EasyInput endpoint；另一窗口立即执行小智任务 Phase A，收到本窗口合同提交后再进入 Phase B。两端 Host/build 通过和电气恢复门完成前不接线。

## 2026-08-29 · T07 desktop baseline integrated and verified for mainline

- role/base/source：在隔离工作树 `F:\Codex\deskmate-t07-main-merge` 中，以 `origin/main@069c2a90da4f3ad436074c0cd35a566a2268f91e` 为第一父提交，合并已冻结的 T07 分支 `codex/companion-t07d-t06-integration@a0ade9c6fc1b25d8786471b2f53babe3219fb5f3`。原工作树 `F:\Codex\deskmate` 的用户未提交修改保持原样，没有使用整目录覆盖。
- merge resolution：仅 `docs/README.md`、`flow/progress.md`、`flow/tasks/T05-easyinput-config-nvs.md` 发生文本冲突；产品源码均自动合并。冲突按当前已验收 T05/T06/T07 状态为准，同时保留旧 `main` 的两条 T05 审计历史；桌面界面合同继续标记为 `T07_DESKTOP_UI_V1_FROZEN`。
- verification：`npm ci --include=dev` 成功；`npm test` 115/115；`npm run build:desktop` 完整通过；EasyInput 固件 Host CTest 7/7。合并候选 `release/win-unpacked/resources/app.asar` SHA-256 为 `273942ADFF301D2AA36096DB9FE2C90F2578C17108CF8A86DC6D1C755AEC354E`，并通过 `git diff --check`。
- hardware/safety：本次仅做 Git、文档、桌面构建与 Host 测试；没有扫描端口、识别设备、读取或写入 Flash/NVS、烧录、擦除、monitor、写 eFuse，也没有驱动小智 OLED 或舵机。
- next action：推送合并后的远端 `main`，EasyInput 与小智后续任务都必须先 `git fetch origin`，再从该准确远端基线创建各自短分支；继续禁止跨电脑整目录覆盖。实时陪伴、自动记忆摘要与检索、DeskMate Link、小智 OLED/舵机仍是待冻结或待实现切片，不能标作已接入。

> 最新记录置顶。这里是跨电脑、跨 Agent 的事实交接入口。

## 2026-08-29 · T07 Desktop UI V1 frozen for mainline integration

- role/branch/base：当前硬件验收电脑在隔离工作树 `F:\Codex\deskmate-t07-integration`、分支 `codex/companion-t07d-t06-integration` 完成桌面冻结；本轮进入时 HEAD `860e726ed5519a3afa8195e59c15994ad2717eb8`，冻结提交 `e3b2e605166a90d32c73d72d39e4f2e0f016a738`，共同历史基于已锁定 T06 `619d85347499545e9af11488bb5d141296ae1dd3`。
- scope/changed paths：用户确认 KEY3 语音编辑已完成，且此前真实文字模型的智能整理测试通过。新增 `docs/contracts/t07-desktop-ui-v1.md` 并标记 `T07_DESKTOP_UI_V1_FROZEN`；D030 固定七个主导航入口、内部页面归属、共享七表情脸、单一 VoiceWorkflow 和完整 T06 能力基线；同步 `docs/README.md`、`flow/decisions.md`、`flow/plan.md`。
- verification/hardware：冻结前最终候选已完成 `npm test` 115/115 和 `npm run build:desktop`，用户完成 KEY3 功能确认；智能整理与 KEY3 属用户可见 HIL，实时陪伴、自动记忆、DeskMate Link、小智 OLED/舵机仍未完成。本轮冻结记录没有扫描端口、读写 Flash/NVS、烧录或改变任一固件/硬件配置。
- open risks/next action：`origin/main` 当前仍是较早的 `069c2a90da4f3ad436074c0cd35a566a2268f91e`，而冻结分支包含后续 T05/T06/T07；原 `F:\Codex\deskmate` 工作树仍在 `codex/companion-t07c-ui-shell@9e5e442` 且有用户未提交改动，必须保持原样。下一步在新隔离工作树从准确 `origin/main` 合并冻结分支，重新执行依赖安装、115 项全量测试和桌面打包，通过后推送远端 `main`，供 EasyInput 与小智后续短分支共同取基线。

## 2026-08-29 · T07D idle Escape and physical KEY3 voice-edit regression fixed

- 用户证据：用户用已配置的真实文字模型确认“智能整理”可用，能够去除重复和口头语；同时复现两个桌面回归：没有语音会话时按 Escape 仍显示“已取消当前语音输入”，实体 KEY3/语音编辑没有可见响应。
- 根因与修复：实现提交 `0f59ff598d46046ea1f55e9badb50d1a05a3dfbd`。Escape 原先从只读输入桥无条件进入取消事件；现在只有共享语音状态处于 recording/transcribing/organizing/outputting 时才允许取消，idle/completed/error 均忽略。KEY3 的 `Ctrl+Shift+E` 原先在全局快捷键 key-down 时立即复制选区，可能与仍按住的 Ctrl/Shift/E 冲突；常驻原生桥现在只在完整组合键释放后发出脱敏 `VoiceEdit` 语义事件，主进程取消延迟后备触发、再读取选区并显示明确进度/错误。输入钩子继续只读，不吞键，不输出选区、窗口标题或设备路径。
- 验证与候选：定向 native/protocol/voice 回归 38/38；全量 `npm test` 115/115；`npm run build:desktop` 完整通过。最终候选为 `F:\Codex\deskmate-t07-integration\release\win-unpacked\DeskMate.exe`，`app.asar` SHA-256 `273942ADFF301D2AA36096DB9FE2C90F2578C17108CF8A86DC6D1C755AEC354E`，旧 D 盘候选已关闭，新候选已启动。详细矩阵见 `docs/testing/t07d-voice-edit-escape-regression-2026-08-29.md`。
- 边界与下一步：本轮没有改 EasyInput 固件或配置，没有扫描端口、读取/写入 Flash/NVS、烧录或操作小智。用户需在新候选中确认空闲 Escape 无提示、KEY3 第一次释放开始编辑录音、第二次释放结束并替换所选文字，以及活动会话内 Escape 仍能取消；完成前 KEY3 保持 `HIL_PENDING`。

## 2026-08-29 · T07D voice edit, AI services and local memory foundation ready for manual regression

- 身份与分支：在隔离工作树 `F:\Codex\deskmate-t07-integration`、分支 `codex/companion-t07d-t06-integration` 上继续工作；本轮起点 HEAD 为 `82d582c91007ffc27549397d71d8cdc658e38178`，功能实现提交为 `78a95726db4ac7e5f33c11fd400eab064c38f4ac`。主工作树 `F:\Codex\deskmate` 未修改。
- 做了什么：用 DeskMate 自定义确认框替换按键保存时的原生 Windows `confirm`；把“设备连接”从主导航迁入“设备与诊断”内页；新增独立 `Ctrl+Shift+E` / KEY3 语音编辑链路，先精确捕获前台窗口选区，再录制编辑指令、调用文字大模型，且仅在目标窗口和原选区仍一致时替换；原样输出仍走本地确定性规则，智能整理和自定义整理改为真实文字模型调用，并与 KEY3、后续 Bridge/记忆摘要共用一套版本化文字模型配置。
- AI 服务与安全：设置页新增“AI 服务”，分别配置百炼 ASR、OpenAI-compatible 文字模型，以及豆包/自定义 WSS 实时语音；API Key、App ID、Access Key、App Key 通过 Electron `safeStorage` 加密，React 不读取密钥、Node API 或设备路径。实时语音配置目前只保存并显示待接入，尚未启用第二套语音状态机或陪伴 Bridge；未伪装成已经联通。
- 记忆基础：新增 `%APPDATA%\deskmate\companion-memory.sqlite3`，使用内置 `node:sqlite`、WAL 和 FULL synchronous，落地对话轮次、每日摘要、记忆候选、审核状态和 embedding 表；AI 陪伴的“记忆管理”已显示真实数据库状态、候选列表与审核入口。数据库和管理面是真实实现，但陪伴对话写入、自动小时/每日摘要、向量生成与检索仍待后续切片，当前空库会如实显示。
- 来源与边界：对照 Maker 固定参考确认 KEY3/`Ctrl+Shift+E` 只负责热键和音频生命周期，Windows 选区捕获、模型处理与安全替换应由 Host 实现；只参考 `F:\Codex\suligent` 的“实时语音 WebSocket + 独立 OpenAI-compatible 意图/状态模型 + 输入打断播放”架构，没有复制人物、凭据或代码。本轮未扫描端口、未识别设备、未读写 Flash/NVS、未烧录、未驱动小智 OLED/舵机。
- 验证：`npm ci --include=dev` 成功；`npm test` 112/112 通过。最终源码与原生桥构建通过；仓库内 `npm run build:desktop` 在 electron-builder 重命名 `release\win-unpacked.tmp` 时受 Windows 文件锁 `EPERM` 阻断，但对同一最终源码执行等价打包到隔离输出目录成功，成品为 `D:\CodexData\home\visualizations\2026\08\29\01a04af3-3b1b-7843-9dcd-d8d26ef52e4c\deskmate-package\win-unpacked\DeskMate.exe`，`app.asar` SHA-256 为 `4E4157950939B8BACC4A27A08F10827BCFFD29155CF0671FB0E984ED1F737BE4`，应用已启动且创建本地记忆库。Edge 自动视觉采集因无法可靠确认浏览器当前 URL 而安全停止，未把未完成的自动截图冒充 QA。
- 下一步：用户在已启动的最终包中人工回归原 T06 按键保存/回读与新确认框、KEY1 原样/智能整理、KEY3 选中文本语音编辑、AI 服务保存状态和记忆空库状态；新 KEY3 尚未取得本轮真机验收，不标记为 HIL 通过。实时陪伴语音、Bridge、自动记忆摘要和 embedding 检索另开冻结切片后实现。

## 2026-08-29 · T07D companion UI integrated on the locked T06 baseline

- 身份与分支：在隔离工作树 `F:\Codex\deskmate-t07-integration`、分支 `codex/companion-t07d-t06-integration` 上工作；精确基线为已锁定 T06 HEAD `619d85347499545e9af11488bb5d141296ae1dd3`，已验证实现提交为 `ac5bf6d86661fc1260bb8a3301e684778c829a9b`。原 `F:\Codex\deskmate` 的 T07C dirty 工作树保持原样，没有整目录覆盖或回写。
- 做了什么：主导航收敛为工作台、语音输入、AI 陪伴、历史记录、词库、按键配置、设备连接、设备与诊断；AI 联动、表情库和动作编排嵌入 AI 陪伴，表情编辑和环境感知不再作为主入口。新增共享 `CompanionFace`，把默认、眨眼、开心、难过、生气、思考、聆听七张真实图片用于品牌、侧栏设备脸、工作台、陪伴页、表情库和动作预览；自然眨眼为 4.2～7.8 秒间隔、150 ms 持续并尊重 reduced-motion。
- 功能边界：T06 的 VoiceWorkflow、活动窗口写回、固定文字、UUID 打开应用、配置 ACK/回读、按键映射、连接和诊断实现未被替换。陪伴对话、记忆、提醒、图片导入持久化、小智屏幕和舵机均明确标为软件预览、待开发或待接入；“开始陪伴对话”不打开麦克风，动作按钮不发送硬件命令。
- 产出：实现见 `src/CompanionFace.jsx`、`src/App.jsx`、`src/pages.jsx`、`src/appData.js`、`src/styles.css` 和 `public/assets/expressions/`；设计说明见 `docs/design/companion-ui-integration-after-t06.md`，视觉 QA 见 `design/qa/design-qa.md`，选定表情系统见 `design/concepts/companion-expression-elastic-language.png`。
- 验证：精确 T06 基线在改动前 101/101；集成后 `npm test` 105/105，`npm run build:desktop` 通过。所选 Edge 中八个主入口逐页打开，陪伴预览、七表情、表情搜索、动作软件预览和 AI 联动均完成交互检查；小窗口无横向文档溢出。自动验证只证明软件候选，不替代用户对原有功能的人工回归。
- 硬件与下一步：本轮未扫描端口、未识别设备、未读写 Flash/NVS、未烧录、未 erase/monitor/eFuse，未接线、未操作小智 OLED/舵机。下一步由用户运行 `release/win-unpacked/DeskMate.exe`，优先人工回归 T06 固定文字、打开应用、配置回读、语音写回和八键/旋钮，再检查 AI 陪伴七表情与内部分页；任何原功能回归立即停在本候选修复，不开始小智通信或固件实现。

## 2026-08-29 · T06 manual matrix passed, locked and ready for Git handoff

- 做了什么：启动当前 `release/win-unpacked` DeskMate 供用户人工验收；用户按清单完成同一窗口语音写回、主动切窗剪贴板安全回退、固定文字、UUID 打开应用、DeskMate 重启后的配置读取，以及八键、旋钮旋转/按压、灯效和语音键回归，并明确报告“测试全部通过”。T06 状态更新为 `HIL_CONFIRMED / USER_ACCEPTED / T06_LOCKED`。
- 证据归属：接受的桌面源码为本条文档提交前的 `1fb0dab99697209f70927442aa3aaf78fd45ecbc`；板上固件源码仍为已授权烧录的 `7907d6f8412e549fc312eed23deeb31ba5dcda53`，app 327,952 字节（`0x50110`），烧录 SHA-256 `8CDAF8B2786D26DF1253E68E7A3EC1A1987199551CB8C7DFC454C090EF09BAE6`。`7907d6f..1fb0dab` 的固件目录 diff 为空，因此本次桌面修复没有造成板端代码漂移；不能把后来未烧录的干净构建哈希冒充板上镜像。
- 自动化与产出：继承桌面 101/101、固件 Host 7/7、`npm run build:desktop`、精确 ESP-IDF v5.5.5/esp32s3/固定 16 MB 分区构建和组合代码审计通过。正式验收记录为 `docs/testing/t06-host-actions-acceptance-2026-08-29.md`，跨电脑交接同步到 `docs/handoffs/second-computer-t06-host-actions-2026-08-29.md`。
- 上传边界：GitHub 只交换源码、合同、测试、审计和交接；`release/`、`build/`、`managed_components/`、SDKCONFIG、bin/elf/map 不提交。另一台电脑 fetch 最终分支后本地重建，不再用整目录覆盖。
- 硬件与下一步：记录验收和推送期间未扫描端口、未识别设备、未读写 Flash/NVS、未烧录、未 erase/monitor/eFuse，未修改小智或外部参考。提交并推送当前分支后停止；另一台电脑先核对远端 HEAD 和本记录。T07、新固件写入或其他硬件操作必须另行开包和授权。

## 2026-08-29 · T02-T06 combined self-audit and stable voice-path restoration ready for handoff

- 做了什么：完成 T02～T06 组合代码审计，并撤销被连续真机证据否决的常驻原生桥语音目标候选；恢复 `9e214d1` 已知成功的 PowerShell 边界，即录音开始捕获前台 HWND，输出时在同一 PowerShell 调用内精确核对 HWND 后发送 Ctrl+V。保留配置保存/回读修复、T06 固定文字与打开应用、固件、中文单键和 320 px 悬浮条。同步修正 T05 任务卡的旧 `T06_BLOCKED` 状态。
- 为什么与怎么理解：`c6ead2a` 和 `8462e59` 虽通过自动化，用户现场仍持续出现目标变化回退；该证据已经否决候选，不能继续用采样参数猜测修复。审计确认性能优化替换了曾通过 HIL 的 Windows 焦点/粘贴边界，因此先恢复最后已知稳定实现，再把性能优化留给独立、可观测的新任务。
- 产出路径：`electron/active-window-output.cjs`、`electron/main.cjs`、`native/DeskMate.InputBridge/Program.cs`、相关测试；组合审计 `docs/reviews/t06-host-actions-combined-self-audit-2026-08-29.md`；交接 `docs/handoffs/second-computer-t06-host-actions-2026-08-29.md`；经验写入 `flow/lessons.md`。
- 验证：桌面 `npm test` 101/101；`npm run build:desktop` 通过；MSVC 19.44 固件 Host CTest 7/7；精确 ESP-IDF v5.5.5、Python 3.11.15、`esp32s3`、Minimal Build、绝对隔离 SDKCONFIG 和固定 16 MB 分区构建通过。dirty 审计 app 为 327,952 字节（`0x50110`），SHA-256 `8C2259C809046B4D9688A62B882173FAA2E576EDF28F2A6C07F16B27911C0D4A`；最终干净 HEAD 镜像在提交后重建并随交付报告。`git diff --check`、AGENTS/CLAUDE 逐字一致、来源/许可证、隐私/密钥、ASCII 路径和构建产物检查通过。
- 审计结论：T02 输入基础、T03 atomic tap/held PTT/断线释放、T04 LED/GPIO8 单一所有权、T05 配置读改写/NVS/脱敏边界及 T06 Host Action/固定文字均未发现新的自动化阻断。语音恢复路径和 T06 实体动作仍需用户在场的人工 HIL，不能声明 T06 锁定。
- 硬件操作与下一步：本轮未扫描端口、未识别设备、未读写 Flash/NVS、未烧录、未 erase/monitor/eFuse，未修改小智或外部参考。状态为 `SELF_AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_PENDING`。提交并推送当前分支后停止；接手方先核对远端 HEAD 并独立重建，再由用户在场验证同窗语音写回、主动切窗回退、固定文字、UUID 打开应用、配置重启回读和 T03/T04 组合矩阵，不开始 T07。

## 2026-08-29 · T06 active-window capture stabilized after monitored Windows focus gap

- 做了什么：针对用户在未主动切窗时仍收到“目标窗口已变化”的回归，连续执行两轮脱敏前台监控，只记录相对时间、HWND 和 PID。两轮都观察到从 Codex 切入记事本时先出现 `GetForegroundWindow() == 0`，空窗分别约 92 ms 和 61 ms；进入记事本后 HWND 在整个语音操作期间保持不变。原生桥现在对录音开始目标执行最多 250 ms、每 10 ms 一次的有界采样，并要求同一可见窗口连续出现两次才接受；输出时仍要求当前前台 HWND 与该捕获值完全一致，没有放宽为任意当前窗口。界面同时区分“目标后来变化”和“未能稳定捕获输入目标”，不再把所有安全回退误报为用户切窗。
- 为什么与怎么理解：旧实现只调用一次 `GetForegroundWindow()`；当用户刚切到目标编辑器就按语音键时，Windows 焦点交接会短暂返回零，DeskMate 因此没有保存本轮目标。转写完成后的剪贴板回退是 fail-closed 的正确后果，但旧提示错误地称为“目标窗口已变化”。监控还证明悬浮条没有抢焦点，记事本内部也没有 HWND 抖动。
- 产出路径：`native/DeskMate.InputBridge/Program.cs`、`src/pages.jsx`、`tests/native-input-bridge-protocol.test.mjs`、`tests/desktop-reliability.test.mjs`；可复用结论同步到 `flow/lessons.md`。
- 验证：定向桌面/原生回归 `46/46`；全量 `npm test` `101/101`；`npm run build:desktop` 通过（首次因旧 DeskMate 占用发布文件而失败，关闭旧进程后重跑通过）；`git diff --check` 通过。已关闭旧包并启动 `release/win-unpacked/DeskMate.exe`。未修改固件或冻结合同，未扫描端口、读取/写入 Flash/NVS、烧录、erase 或 monitor。
- 下一步：用户在新包中先切到记事本、等待焦点稳定后完成一次语音输入，确认文字直接写回；再主动切窗一次确认仍安全回退剪贴板。当前保持 `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_PENDING`，T06 组合 HIL 完成前不开始 T07。

## 2026-08-29 · T06 voice target capture race removed and overlay compacted

- 做了什么：修复用户在没有主动切换窗口时仍收到“目标窗口已变化”的新回归。录音开始时的目标捕获从约 1.35 秒冷启动的 PowerShell 改为常驻 `DeskMate.InputBridge` 即时命令；捕获与输出核对现在由同一个原生桥、同一种窗口句柄语义完成。桥事件只返回临时句柄，不含窗口标题、进程路径或转写正文。语音悬浮条按用户要求从 520px 缩为 320px，波形、间距、字号和状态区同步收紧，转写继续单行显示最新尾部。
- 为什么与怎么理解：上一候选已经把输出核对改为即时原生桥，但捕获仍延迟启动 PowerShell；两个时点和执行路径不一致，延迟期间即使用户未主动切换，也可能捕获到不同前台窗口。统一到常驻桥既消除竞态，也移除录音开始阶段的 PowerShell 固定开销。
- 产出路径：`electron/input-bridge-protocol.cjs`、`electron/input-bridge.cjs`、`electron/main.cjs`、`native/DeskMate.InputBridge/Program.cs`、`tests/desktop-reliability.test.mjs`、`tests/phase3-input-bridge.test.mjs`、`tests/native-input-bridge-protocol.test.mjs`。
- 验证：定向回归 30/30；全量 `npm test` 101/101；`npm run build:desktop` 通过。新增覆盖常驻桥捕获命令、仅句柄结果、主进程无 PowerShell、320px 稳定宽度，以及既有目标变化/SendInput modifier 释放。未修改固件或冻结合同，未扫描端口、读取/写入 Flash/NVS、烧录、erase 或 monitor。
- 下一步：启动新打包 DeskMate，用户在同一目标窗口完成一次语音输入，确认直接写回且悬浮条尺寸合适；再主动切换窗口一次，确认仍安全回退剪贴板。T06 组合 HIL 完成前不开始 T07。

## 2026-08-29 · T06 ACK-timeout reconciliation and resident voice paste ready for HIL

- 做了什么：根据新版真机截图确认配置完整读取正常，但保存结果因 `config-ack-timeout` 被判失败；现在写入 ACK 超时后会启动有界完整回读，只有板上指纹精确等于预期配置才判定保存成功，不一致或不可读仍失败关闭。移除保存页长期驻留的“待确认的脱敏路径”卡片，脱敏路径继续只出现在用户确认对话中。语音活动窗口输出不再启动 PowerShell，而是向常驻 `DeskMate.InputBridge` 发送仅含 request ID 和目标窗口句柄的粘贴命令；桥核对前台窗口后用 `SendInput` 发送 Ctrl+V，失败时补发 V/Ctrl release。
- 为什么与怎么理解：用户切页后能读到已修改值，证明本次真实边界是固件保存成功但 ACK 未被 Windows 链路消费；精确回读能够确认最终状态，不能仅凭超时或体感伪装成功。语音慢的本机测量显示空 PowerShell 冷启动五次平均约 1.35 秒，说明上一轮“两个进程减为一个”仍保留明显固定延迟，改用既有常驻桥才能移除该成本。
- 产出路径：`electron/config-readback.cjs`、`electron/input-bridge-protocol.cjs`、`electron/input-bridge.cjs`、`electron/active-window-output.cjs`、`electron/main.cjs`、`native/DeskMate.InputBridge/Program.cs`、`src/pages.jsx`，以及 `tests/desktop-reliability.test.mjs`、`tests/phase3-input-bridge.test.mjs`、`tests/native-input-bridge-protocol.test.mjs`。
- 验证：定向回归 27/27；全量 `npm test` 98/98；`npm run build:desktop` 通过。新增覆盖 ACK timeout + exact readback、mismatch fail-closed、常驻桥单飞/脱敏命令、精确目标校验和 SendInput modifier 释放。本轮未修改固件或冻结合同，未扫描端口、读取/写入 Flash/NVS、烧录、erase 或 monitor。
- 下一步：启动新打包 DeskMate，真机验证 KEY6 单字段保存后当前页面直接显示“已保存并回读确认”，并验证一次语音输出耗时和目标变化剪贴板回退；T06 组合 HIL 完成前不开始 T07。

## 2026-08-29 · T06 desktop config status and voice output latency fixed

- 做了什么：修复两个用户真机联调后确认的桌面问题。配置提交在固件保存 ACK 后增加三次有界回读验证，第一次瞬时失败可恢复；板上读取状态与同步状态拆开，成功后清除旧脱敏差异，保存已确认但回读仍失败时显示“已保存，回读待确认”，真实指纹不一致继续立即失败关闭。语音活动窗口输出把“核对当前前台窗口 + Ctrl+V”合并为一次 PowerShell 调用，保留录音触发时捕获的目标窗口、目标变化拒绝和剪贴板回退。
- 为什么与怎么理解：截图和真机结果证明配置实际已保存、离开页面再进入即可读取，因此旧“读取失败/同步失败”是保存后瞬时回读与 UI 状态混用，不是 NVS 保存失败。语音慢点位于转写完成后的输出阶段，旧路径连续启动两个 PowerShell 进程；本轮没有改 STT、整理模型或固件。
- 产出路径：`electron/config-readback.cjs`、`electron/active-window-output.cjs`、`electron/main.cjs`、`src/pages.jsx`、`src/styles.css`、`tests/desktop-reliability.test.mjs`；可复用边界补入 `flow/lessons.md`。
- 验证：新增 7 个桌面可靠性回归；全量 `npm test` 94/94、`npm run build:desktop` 和 `git diff --check` 通过。没有修改 EasyInput 固件、冻结合同、外部参考、小智、BLE/Wi-Fi、音频或 DeskMate Link；没有扫描端口、读取/写入 Flash/NVS、烧录、erase 或 monitor。构建输出保持忽略且不提交。
- 下一步：使用本次新打包的 DeskMate 验证一次按键保存和一次语音活动窗口输出；桌面修复不需要重新烧录当前 `7907d6f` 固件。T06 组合 HIL 关闭前不开始 T07。

## 2026-08-29 · Espressif MCP support and manual T06 pressure-test guide added

- 做了什么：按用户提供的乐鑫官方入口，在项目级 `.codex/config.toml` 注册 `espressif-documentation`、`esp-component-registry` 和 `espressif-engineering` 三个可选远程 MCP；文档/组件查询只在写操作时提示，工程排障每次调用均提示确认且所有服务 `required = false`，服务不可用不会阻断 DeskMate 开发。OpenAI Docs 确认受信任项目可使用 `.codex/config.toml` 配置 Streamable HTTP MCP。
- 为什么与怎么理解：MCP 适合查询精确 ESP-IDF API、组件兼容性和形成排障路径，但不能把第三方回答当成代码、合同或 HIL 证据。新增 `flow/guides/espressif-mcp-troubleshooting.md` 固定问题路由、脱敏清单、建议复核门和 T06 保存/重启五轮手动压力矩阵；用户明确选择自己操作配置界面，本轮 Agent 不代写 NVS。
- 产出路径：`.codex/config.toml`、`flow/guides/espressif-mcp-troubleshooting.md`、根 `AGENTS.md`。本机仅追加 DeskMate 项目信任记录后，`codex-cli 0.147.0` 的 `codex mcp list/get` 已识别三个服务为 enabled；该结果证明配置被加载，不证明远端认证或实际查询已成功。新 MCP 需新 Codex 任务或客户端刷新后进入工具清单，当前已运行任务不能据配置变化声称服务可调用。
- 当前硬件事实：新 app 启动后用户确认按键和灯效恢复，DeskMate 配置页显示已读取；这关闭了旧 NVS 配置导致的启动阻断，但 KEY8 保存、Host Action、完整重启回读和五轮压力测试仍为 `HIL_PENDING`。
- 下一步：用户按指南手动执行 KEY8 保存、Host Action、完整重启和 T03/T04 回归；如失败立即停止重复保存/烧录，保留脱敏的首个失败边界，再由新任务调用对应乐鑫 MCP辅助形成问题清单并补失败测试。T06 HIL 关闭前不开始 T07。

## 2026-08-29 · T06 configuration-save recovery app flashed; HIL pending

- 烧录身份：源码 HEAD `7907d6f8412e549fc312eed23deeb31ba5dcda53`；ESP-IDF `v5.5.5` / `esp32s3` app 为 327,952 字节（`0x50110`），SHA-256 `8CDAF8B2786D26DF1253E68E7A3EC1A1987199551CB8C7DFC454C090EF09BAE6`。
- 授权与目标：用户先按精确 HEAD、SHA-256 和 `0x010000..0x06010F` 授权 app-only 写入，再确认本轮只读识别得到的 `COM6` ESP32-S3 目标身份；私有设备身份不写入仓库。
- 写入结果：仅从 `0x010000` 写入上述 app，327,952 字节完成且 esptool 报告 `Hash of data verified`，随后 hard reset。Flash 扇区实际擦除范围为 `0x010000..0x060FFF`，仍完全位于固定 3 MiB factory app 分区；未擦除整片，未写 bootloader、分区表、NVS、PHY、声音区或 eFuse。
- 当前门禁：`TEST_CONFIRMED / BUILD_CONFIRMED / APP_FLASH_CONFIRMED / HIL_PENDING`。烧录成功不等于故障已经真机关闭；尚未验证旧 NVS 配置启动恢复、KEY8 Host Action 保存、重启回读、按键/灯效持续工作或 T03/T04 回归，也未运行 monitor 或读取 Flash/NVS。
- 下一步：用户先确认正常启动及八键/灯效；DeskMate 读取配置成功后，将 KEY8 选择为 Chrome 并保存，确认保存后按键与灯效不中断且配置仍可读；再完整关机重启，验证配置回读和 Host Action，最后回归语音、旋钮与断线安全。失败时停止重复写入，取得脱敏边界证据后再改代码；T06 HIL 关闭前不开始 T07。

## 2026-08-29 · T06 configuration-save board failure fixed in code

- 做了什么：针对用户真机将 KEY8 配置为 Host Action 并保存后，按键与灯效全部停止且完整重启仍不能恢复的问题，替换 `config_core.cpp` 的完整递归动态 JSON DOM；新实现先严格验证最多 2048 字节的 UTF-8/JSON，再仅按冻结配置路径流式提取运行时投影，继续原字节保存完整 JSON。新增接近上限的 Host Action 配置回归，覆盖 `0x10` 分块组装、双槽 NVS 保存/回读、运行时投影、`0x11` 完整读取和模拟重启恢复。
- 为什么与怎么理解：旧实现会为整份配置递归构造含 `std::string`/`std::vector` 的对象树，并在保存、回读、应用和启动加载阶段重复解析；ESP-IDF 又以 `-fno-exceptions` 构建。普通配置未必触发故障，但加入 Host Action 后配置增大，动态分配与递归栈风险足以解释“保存即失效、重启仍失效”。固定 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的同类路径保留原 JSON并按路径解析，本轮按此行为清晰重实现，没有复制 Maker runtime 或使用其 build 产物。该根因是代码和目标 ELF支持的高可信结论，仍须新镜像真机复测后才能标为 HIL 确认。
- 产出路径：`firmware/easyinput-controller/components/input_core/src/config_core.cpp`、`firmware/easyinput-controller/host_test/config_core_tests.cpp`、`firmware/easyinput-controller/host_test/firmware_source_contract_tests.cpp`；来源补充见 `docs/provenance/t06-easyinput-host-actions-implementation-2026-08-29.md`，可复用经验见 `flow/lessons.md`。
- 验证：Visual Studio Build Tools 2022 / MSVC 19.44 Host CTest `7/7`；桌面 `npm test` `87/87`、`npm run build:desktop`；精确 ESP-IDF `v5.5.5` / `esp32s3` / Minimal build / 固定 16 MB 分区的 dirty 候选构建均通过。`git diff --check`、AGENTS/CLAUDE 一致性和密钥初筛通过。最终提交后的干净镜像仍须重建并在交付回复中报告 HEAD、大小、SHA-256 与 app-only 范围。
- 硬件边界：本轮没有扫描端口、识别设备、读取 Flash/NVS、烧录、erase、monitor 或执行 HIL；旧 `af2263f` 镜像不得重复烧录。新候选必须先提交推送并从干净 HEAD 重建，再取得针对精确 HEAD、SHA-256 和 app-only 范围的新授权。
- 下一步：授权后只 app-only 写入新候选并验证启动、配置读取、KEY8 选择 Chrome 后保存、按键/灯效继续工作、重启后配置仍可读且 Host Action 生效，再回归 T03/T04。语音“正在写入目标窗口”延迟作为独立桌面问题记录，不把它与本次板端保存失效混为同一根因；T06 HIL 关闭前不开始 T07。

## 2026-08-29 · T06 closure check completed and branch handed off

- 做了什么：完成 T06 收工自检，复核根级 `AGENTS.md`、Project Flow、双电脑交接规范、分支状态和既有验证证据；T06 固定文字与安全打开应用实现、合同、来源记录、Host/桌面/ESP-IDF 验证及旧板 app-only 烧录事实均已提交。收工前远端分支为 `codex/easyinput-t06-host-actions`，HEAD `4d6fd81b8e8e3f03effe5727aba1dcf5e25fc57b`；本条为纯交接文档更新，最终推送 HEAD 在交付回复中报告。
- 为什么与怎么理解：T06 代码和构建已经结束，但用户准备更换实体板，固定文字、UUID 打开应用及 T03-T05 组合真机矩阵尚未执行，因此当前只能保持 `TEST_CONFIRMED / BUILD_CONFIRMED / APP_FLASH_CONFIRMED / HIL_PAUSED_FOR_BOARD_REPLACEMENT`，不能把写入哈希通过等同于 T06 真机验收通过。
- 产出路径：冻结合同 `contracts/deskmate-host/easyinput-host-action-v1.md`；实现来源与许可证 `docs/provenance/t06-easyinput-host-actions-implementation-2026-08-29.md`；跨电脑交接 `docs/handoffs/second-computer-t06-host-actions-2026-08-29.md`；详细硬件边界与镜像证据见紧随其后的 T06 记录。
- 问题解决：最终镜像、源码 HEAD、大小、SHA-256、app-only 数据范围和实际擦写扇区均已如实记录；构建产物未进入 Git，端口和私有设备身份未进入仓库。用户发出暂停后没有继续识别、读取、写入或 monitor。
- 文档判断：本轮未改变仓库结构、架构、产品方向或视觉设计，无需更新 `AGENTS.md` / `DESIGN.md`；没有新增稳定决策或独立可复用故障模型，无需追加 `flow/decisions.md` / `flow/lessons.md`。
- 下一步：等待用户换好新板。接手时先 fetch 并核对本分支最终远端 HEAD，独立审计和重建；如需写入新板，必须重新识别目标，并展示届时的精确 HEAD、app SHA-256 和 app-only 范围，取得新的明确授权后才烧录和执行 T06 HIL。T06 HIL 关闭前不开始 T07。

## 2026-08-29 · T06 final app flashed; HIL paused for board replacement

- 分支与镜像：`codex/easyinput-t06-host-actions`，烧录源码 HEAD `b99f012c9faa5bdc65531df9237727b78a794a9b`。最终 ESP-IDF v5.5.5 / esp32s3 app 为 329,552 字节（`0x50750`），SHA-256 `C20B37E056A1DF8D677C6EA48D88A1F3EE99991AC3B920AA15F9930F9159B0BA`。
- 硬件操作：用户明确确认后，先只读核对目标为 ESP32-S3，再仅将上述 app 写入 `0x010000..0x06074F`；esptool 报告 329,552 字节写入完成并通过 `Hash of data verified`。实际擦写扇区边界为 `0x010000..0x060FFF`。未擦除整片，未写 bootloader、分区表、NVS、PHY、声音区或 eFuse；设备端口和私有身份不进入 Git。
- 当前门禁：用户随后说明准备更换一块板，要求暂停烧录。收到该消息后未再识别、读取、烧录或 monitor；本次尚未执行固定文字、UUID 打开应用或 T03-T05 组合真机回归，不能声明 T06 HIL 通过。
- 状态：`TEST_CONFIRMED / BUILD_CONFIRMED / HOST_ACTION_V1_FROZEN / APP_FLASH_CONFIRMED / HIL_PAUSED_FOR_BOARD_REPLACEMENT`。后续新板必须重新核对目标身份，并针对届时的精确 HEAD、app SHA-256 和 app-only 范围取得新的明确授权；不得沿用本次旧板授权，不开始 T07。

## 2026-08-29 · T06 host actions implementation handed off for independent audit

- 分支与代码：`codex/easyinput-t06-host-actions`，T06 实现提交 `3b232f5ea3395991a15d14a18d4f1dfcabd58257`；本条纯文档收口提交后的完整交付 HEAD 以远端分支和交付报告为准，实现树不再变化。T03/T04 已锁定，T05 核心配置/语音触发已由原主电脑完成用户接受的真机确认。
- 合同与来源：`HOST_ACTION_V1_FROZEN` 位于 `contracts/deskmate-host/easyinput-host-action-v1.md`。固定只读参考为 `F:\Codex\easyinput-wzm\easy-input-maker` 提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`，许可证 PolyForm Noncommercial 1.0.0；逐文件采用、修改和目标路径见 `docs/provenance/t06-easyinput-host-actions-implementation-2026-08-29.md`，未复制参考脏工作树或 build 产物。
- 实现范围：固件新增固定文字/Host Action `0x11` kind `0x01/0x05` 有界流、唯一 TinyUSB IN owner 生命周期、UUID/UTF-8 严格校验、USB epoch/断线/溢出失败关闭；原生桥只向主进程提供脱敏元数据；Electron 主进程负责固定文字前台注入和本机 `.exe`/`.lnk` UUID 白名单执行；renderer 仅提供固定文字编辑、应用选择与脱敏结果。T03 held PTT/atomic tap/断线释放、T04 GPIO12 灯效与 GPIO8 共享电源、T05 配置事务保持不变。
- 验证：`npm ci --include=dev`、桌面 `npm test` 87/87（含 T02-T05 回归）和 `npm run build:desktop` 通过；Visual Studio 2022/MSVC 19.44.35228.0、Host CTest 7/7；精确 `ESP-IDF v5.5.5`、Python 3.11.15、target `esp32s3`、Minimal build 和固定 16 MB 分区通过。实现提交 app 为 329,552 字节（`0x50750`），SHA-256 `CD1FAE599B1ABF85455F563268E5831DEC32DCDC3E29852A89F12FA955153F37`；文档提交改变嵌入版本，因此交付前再从最终 HEAD 重建一次，并在 Git 外报告最终大小、哈希和 app-only 范围。
- 产物边界：dirty 工作树 app `329,552` 字节、SHA-256 `7C2649352CEFDC5D4B4C13054C50D5254F27852BC4F23150B24AD27E76A7E27F` 仅为历史证据，不能烧录；最终文档提交会改变 Git revision，必须重建和重新计算。构建目录、release 输出、sdkconfig、managed_components、bin/elf/map 均忽略且不得提交。
- 硬件与风险：未扫描端口、未识别设备、未读取/写入 Flash/NVS、未烧录、未 erase、未 monitor、未执行 HIL，未修改 EasyInput Maker 或小智参考目录。固定文字注入、UUID 应用启动和 T03-T05 组合回归仍需原主电脑独立审计与授权后的 HIL；已知 `window.confirm` 视觉债务保留。
- 状态：`TEST_CONFIRMED / BUILD_CONFIRMED / HOST_ACTION_V1_FROZEN / HIL_NOT_AUTHORIZED`。下一步：提交并推送本分支，接手方先 fetch、核对完整 HEAD、审计来源和范围，再重建；未经针对最终 HEAD、镜像哈希和精确 app-only 范围的新授权，不得烧录或进入 T07。

## 2026-08-28 · T05 app flashed and core configuration/voice HIL accepted

- 分支与代码：`codex/easyinput-t05-config-read-fix`，源码 HEAD `14e46f8233ca49fa11d2d63922d5094797e114a5`。最终 ESP-IDF v5.5.5 / esp32s3 app 为 325,760 字节（`0x4F880`），SHA-256 `66DBA78C025E53EFCEA35031FF2D436A85DA2EE98A49FA7CC11E276324CF0905`。
- 硬件操作：用户按精确 HEAD、哈希和 `0x010000..0x05F87F` 授权后，仅 app-only 写入 factory app；esptool 报告写入数据哈希验证通过并 hard reset。未写 bootloader、分区表、NVS 原始区域、PHY、声音区或 eFuse，未整片擦除，未操作小智。端口和设备标识不进入 Git。
- 真机结果：配置页已能读取板上配置；K2/K4 继续作为 Maker 兼容快捷键且允许录入单键，界面将 Return/Backspace/Space 显示为“回车/退格/空格”；用户确认配置可以修改并进入脱敏预览/确认/提交链路。K1 已恢复并能正常触发 DeskMate 语音输入流程；当前语音识别服务因本机未重新配置 API 而返回“尚未配置”，这不是实体键或固件回归。
- 桌面版本：烧录后最初仍运行旧的 `release/config-read-fix` 包，导致界面继续显示英文；已关闭旧进程并启动当前 HEAD 的 `release/win-unpacked`，并直接核对 app.asar 包含中文显示和“单键或组合键”录入逻辑。
- 验证继承：该 HEAD 的固件 Host CTest `6/6`、桌面 `npm test` `78/78`、`npm run build:desktop`、ESP-IDF v5.5.5 固定 16 MB 分区构建及静态检查均通过。用户将当前核心功能判定为“基本合格”，明确要求更新仓库后进入下一阶段。
- 保留边界：系统 `window.confirm` 与 DeskMate 视觉不一致，作为下一阶段开始前的桌面界面债务记录；尚未取得 API 配置后的完整 STT 证据，也未把重启回读、损坏恢复或完整 T03/T04 压力矩阵写成通过。后续改动必须保持配置读取、K1/K3 held 生命周期、K2/K4 单键、八键、旋钮、灯效和 T03 断线释放回归。
- 状态：`CONFIG_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / APP_FLASH_CONFIRMED / CONFIG_READ_HIL_CONFIRMED / CORE_CONFIG_EDIT_HIL_CONFIRMED / VOICE_TRIGGER_HIL_CONFIRMED / USER_ACCEPTED_FOR_NEXT_STAGE`。下一步从本记录提交创建 `codex/easyinput-t06-host-actions`，先完整阅读 T06 任务卡并冻结/核对 HOST_ACTION 合同；不得提前开发 BLE、音频、DeskMate Link 或小智。

## 2026-08-28 · T05 configuration read fixed; voice and single-key regression candidate ready for clean image

- 结果：用户真机已确认配置页显示“键盘系统 已读取”，证明配置读取阻断已关闭。随后定位到三个 T05 回归：加载配置时 K1/K3 的 `voice_ptt_hold` / `edit_ptt_hold` 只保留动作类型却丢失 HID chord；K2/K4 的 Maker 单键快捷键被 renderer 的“必须有修饰键”规则拒绝；“保存当前按键”只提示本机保存而没有进入板端事务同步。
- 修复：K1 恢复 `Ctrl+Shift+Space`、K3 恢复 `Ctrl+Shift+E`，继续使用 T03 held-source 生命周期；KEY2/KEY4 继续保持 Maker 的快捷键合同，允许回车、退格、空格、Tab、Esc、方向键、数字、字母、F1～F24 及合法组合键。界面将 Return/Backspace/Space 显示为“回车/退格/空格”，全局语音快捷键仍要求修饰键。每键保存现在走重新读取、脱敏 preview、用户确认、单次 token commit 和回读流程。
- 参考：固定只读核对 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的 `keymap.cpp`、`hid_keycode.cpp` 及对应 Host tests；只采用行为证据并在 DeskMate 内清晰重实现，未读取脏工作树或使用参考 build 产物。
- 验证：Visual Studio 2022 x64 Host CTest `6/6`；桌面 `npm test` `78/78`；`npm run build:desktop` 通过；精确 `ESP-IDF v5.5.5`、target `esp32s3`、Minimal build、固定 16 MB 分区构建通过，dirty app 为 `0x4F880`（325,760 字节），factory 余量 90%；`git diff --check`、AGENTS/CLAUDE、来源、密钥/隐私和构建产物忽略检查通过。
- 状态：`CONFIG_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / CONFIG_READ_HIL_CONFIRMED / VOICE_AND_SINGLE_KEY_FIX_PENDING_APP_FLASH / T06_BLOCKED`。本轮尚未扫描端口、识别设备、读取 Flash/NVS、烧录、erase、monitor 或执行新镜像 HIL。提交推送后必须从最终干净 HEAD 重建，展示 HEAD、app SHA-256 与 app-only 精确范围，并取得针对该镜像的新确认后才可烧录。

## 2026-08-28 · T05 second config-read fix failed HIL; laptop handoff prepared

- 做了什么：提交 `e10211ffedd1a27e6ec1608be9b38872a70d72ae`，补齐配置状态响应 kind `0x04` 的 TinyUSB transfer-complete 身份与 Host 回归；以 ESP-IDF v5.5.5 重建并按用户明确授权 app-only 写入当前 EasyInput。镜像 325,408 字节，SHA-256 `3074B78E6A4AD3688291E542BCA3298239BBD164427CAD925C18D9134B49D3ED`，数据范围 `0x010000..0x05F71F`，擦写扇区至 `0x05FFFF`；写入哈希和私有身份复核通过，未写 NVS/分区/eFuse，未操作小智。
- 真机结果：用户正常关机重开后 DeskMate 仍显示 `config-read-timeout`。随后完整退出 DeskMate 与原生桥，用独立 `DeskMate.InputBridge.exe` 只读复现：`boardConnected=true`，但没有 `config-progress/config-capabilities/config-snapshot`。因此不是 renderer 缓存或软件未重启；`fac1fa8` 与 `e10211f` 两个候选均被 HIL 否决，不得再次重复烧录。
- 怎么理解：当前证据只能把问题定位到 `0x13` Feature 请求进入固件、owner 队列、首个 `0x11` 输入报告或 Windows Raw Input 接收边界之一；既有 Host 测试制造的 64 字节 completion 形态不足以证明真实回调。下一轮必须先观测每个边界和 Maker 固定实现差异，不能提交第三个猜测性修复。
- 产出路径：`docs/handoffs/second-computer-t05-config-read-hil-blocker-2026-08-28.md`、`flow/tasks/T05-easyinput-config-nvs.md`、`flow/lessons.md`、`docs/README.md` 及本记录。DeskMate 已在诊断结束后重新启动。
- 当前状态：`CONFIG_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / CONFIG_READ_HIL_FAILED_AFTER_TWO_APP_FIXES / ROOT_CAUSE_EVIDENCE_REQUIRED / T06_BLOCKED`。
- 下一步：另一台笔记本从 GitHub 的准确 HANDOFF HEAD 接管，按交接先取得首个丢失边界证据并修复 T05；完成只读、单字段 NVS 往返、重启回读、恢复和 T03/T04 回归后锁定 T05，再从锁定 HEAD 开始 T06 固定文字/打开应用。

## 2026-08-28 · T05 Windows configuration read timeout reproduced and fixed in code

- 真机结果：DeskMate 能识别当前 EasyInput，T03 按键和 T04 灯效可用，但进入按键配置页后显示“读取失败 / 键盘配置读取失败”，主进程返回 `config-read-timeout`。使用同一发布原生桥做脱敏只读复现：设备连接为 true，`0x13` 能经 `HidD_SetFeature` 被 Windows 接受，但固件没有返回能力分块；因此不是用户操作、普通断线或 renderer 展示问题，T05 配置 HIL 失败且 T06 继续阻断。
- 根因：T05 的 `tud_hid_set_report_cb` 只接受 TinyUSB 把 Report ID 作为独立参数传入的 Feature Report。Windows 还可能以首字节携带 `0x13` Report ID 的形态交付；固定 Maker `7619bd1` 的 `usb_hid.cpp` 与 `status_hid_protocol.cpp` 明确兼容两种形态，而产品侧遗漏了这一行为。
- 修复：在分支 `codex/easyinput-t05-config-read-fix` 增加有界 Feature Report 归一化，只接受 `0x10/0x13`、一致的独立/内嵌 Report ID、冻结长度与零填充；TinyUSB callback 仍只复制到唯一静态队列，不解析 JSON/NVS。新增 Windows 独立 ID、内嵌 ID、最大填充、冲突 ID、非零尾部及 `0x10` 回归向量。
- 验证：修复代码提交 `fac1fa821ff024265dda73202b9f2d603bd4b749` 的固件 Host CTest `6/6` 通过；精确 ESP-IDF `v5.5.5`、target `esp32s3`、隔离 SDKCONFIG、Minimal build 和固定分区构建通过。app 为 `0x4F710`（325,392 字节），SHA-256 `333C8FEA47E54D5B0A014189717B1DAEEB4E2E3A912CACFF2FFA3FFA70725874`；分区表 SHA-256 仍为 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`。`git diff --check` 通过。未读取或写入 Flash/NVS，未烧录、擦除、monitor 或写 eFuse。
- 状态与下一步：`CONFIG_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / CONFIG_READ_HIL_FAILED / FIX_BUILD_CONFIRMED / APP_FLASH_NOT_AUTHORIZED / T06_BLOCKED`。候选仅需 app-only 数据范围 `0x010000..0x05F70F`，写入工具最多覆盖扇区至 `0x05FFFF`；只有取得针对上述代码提交、哈希和范围的明确授权后才可烧录并重测配置读取。

## 2026-08-28 · T05 stack-fix restores keys and LED feedback

- 用户在 app-only 烧录并正常启动后确认：实体按键功能已经恢复，T04 输入灯效也已经恢复。这证明此前首次 NVS 加载期间的启动栈溢出已不再阻止基础输入与灯效运行。
- 本次只记录用户可观察的真机事实；旋钮行为、完整配置读取、单字段保存、重启回读、掉电恢复和 T03 断线回归尚未完成，因此不得将 T05 标记为完整 HIL 通过。
- 当前交接状态：`REVIEW_CHANGES_REQUIRED / TEST_CONFIRMED / BUILD_CONFIRMED / APP_FLASH_CONFIRMED / PARTIAL_HIL_CONFIRMED / T06_BLOCKED`。继续工作时以 GitHub 分支 `codex/easyinput-t05-config-nvs` 为唯一交换通道，不使用整目录覆盖；先完成剩余 T05 HIL，再决定是否关闭 T05。

## 2026-08-28 · T05 stack-fix app flashed; functional HIL pending

- 烧录源码提交：`b67371fe91847c9be3b0f6f1e3e29eb6657a5bc5`；精确 `ESP-IDF v5.5.5` / `esp32s3` 发布镜像为 325296 字节（`0x4F6B0`），SHA-256 `D7AE882F417777533CF3994E916B1F7A3B96E1DE0A80EEFBAA3E30505E091E37`。用户针对该 HEAD、哈希及 `0x010000..0x05F6AF` app-only 范围明确授权后执行。
- 写入结果：只从 `0x010000` 写入 app；esptool 按 4 KiB 扇区实际擦除 `0x010000..0x05FFFF`，仍完全位于固定 3 MiB factory app 分区内；写入 325296 字节并完成数据哈希校验，随后自动 hard reset。未写 bootloader、分区表、NVS、PHY、声音区或 eFuse，未整片擦除。
- 烧录前只读验明目标为 ESP32-S3，具体端口和设备标识不进入 Git。烧录后验证 helper 因本机 PowerShell Security 模块无法加载而未建立验证 session；后续有界只读日志采集也未取得应用健康标志，因此不能把烧录退出 0 冒充功能 HIL。
- 当前状态：`REVIEW_CHANGES_REQUIRED / TEST_CONFIRMED / BUILD_CONFIRMED / APP_FLASH_CONFIRMED / HIL_PENDING / T06_BLOCKED`。下一步由用户观察正常启动，再测试八键、灯效、旋钮以及配置读取/保存/重启回读；通过前不开始 T06。

## 2026-08-28 · T05 startup stack overflow fixed; final release image pending

- 旧 T05 镜像 1cf3a4e 在首次加载 NVS 配置时循环重启。串口回溯落在 nvs_get_u8 -> ConfigNvsStore::load() -> app_main()；旧 load 栈帧约 10.4 KiB，save_config_transaction 约 4.2 KiB，config_owner_task 约 6.3 KiB，input_owner_task 约 6.7 KiB，超过约 3.5 KiB 主任务栈和 4 KiB owner task 栈。该镜像及其旧烧录授权已作废。
- 修复把 NVS A/B 槽、加载结果、legacy JSON 和事务工作区放入唯一 ConfigNvsStore 的静态有界成员；加载、槽选择和保存改为通过稳定引用/调用方工作区写入；配置与输入 owner 的大 command/result/document 改为唯一静态缓冲；消除大聚合临时重置。没有单纯增大任务栈，也没有建立第二套输入或配置状态机。
- 回归门禁：Visual Studio 2022/MSVC 19.44 Host CTest 6/6；桌面 npm test 73/73；npm run build:desktop 通过。代码提交 1da73b2 的干净 ESP-IDF v5.5.5/esp32s3/MINIMAL_BUILD/固定分区构建通过，app 为 325296 字节；ELF 实测 app_main 224 字节、ConfigNvsStore::load 112、save_config_transaction 96、config_owner_task 96、input_owner_task 432 字节。
- 当前状态：REVIEW_CHANGES_REQUIRED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED / T06_BLOCKED。本进度提交会改变嵌入的 app 版本，因此发布镜像仍须从文档后的最终干净 HEAD 和绝对隔离 SDKCONFIG 重建；最终 SHA-256 与 app-only 范围在 Git 外报告并重新取得授权，不再以追加提交使镜像失效。未扫描端口、未识别设备、未读写 Flash/NVS、未烧录、未擦除、未 monitor、未 HIL。

## 2026-08-28 · T05 recovery work imported; local verification pending

- 已从 `F:/Codex/deskmate-t05-hardware-recovery` 的提交 `348b22828158b9c1ff5faf1ae8ac1bf93d1193ec` 导入 T05 返工代码；该提交已原样备份到远端保护分支 `codex/easyinput-t05-config-nvs-hardware`，正式分支原状态保留在本地引用 `codex/easyinput-t05-before-recovery`。
- 恢复目录的另一台电脑报告了 T05 代码门、Host、桌面和 ESP-IDF 构建证据；本机尚未独立重建，不能把该报告当作本机确认。
- 当前状态保持 `REVIEW_CHANGES_REQUIRED / CONFIG_V1_FROZEN / TEST_PENDING / BUILD_PENDING / HIL_NOT_AUTHORIZED / T06_BLOCKED`；未扫描端口、未识别设备、未读取/写入 Flash/NVS、未烧录、未擦除、未 monitor、未 HIL。
- 下一步：在正式仓库干净提交上重跑固件 Host、桌面、原生桥和 ESP-IDF v5.5.5/esp32s3 构建，核对固定分区和镜像 SHA-256；只有独立证据完成后，另行展示精确 app-only 写入范围并取得针对该镜像的明确烧录授权。

## 2026-08-28 · T05 recovery independently rebuilt on hardware computer

- 角色：原主电脑/硬件电脑；分支 `codex/easyinput-t05-config-nvs`；提交 `a3f0f5fb3b4ecbb3ef859fea1b93e0561f34f22e`。恢复目录提交 `348b22828158b9c1ff5faf1ae8ac1bf93d1193ec` 已原样备份到远端保护分支 `codex/easyinput-t05-config-nvs-hardware`，并通过 cherry-pick 带入正式分支；旧正式状态保留为 `codex/easyinput-t05-before-recovery`。
- 本机验证：固件 Host CTest `6/6`；桌面 `npm test` `73/73`；`npm run build:desktop` 通过；精确 `ESP-IDF v5.5.5`、target `esp32s3` 独立 SDKCONFIG 构建通过。预提交构建对应提交 `a3f0f5f`，应用镜像 `304848` 字节 (`0x4A6D0`)，其 SHA-256 仅作历史证据；文档提交后必须重新构建，不能把该旧镜像用于烧录。固定分区 SHA-256 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`。
- 静态/范围检查：`git diff --check` 通过；根/固件 `AGENTS.md` 与 `CLAUDE.md` 一致；构建目录、`managed_components`、`sdkconfig`、镜像和发布清单均被忽略，未进入提交；外部 EasyInput/小智目录未修改、未复制、未使用其 build 产物。
- 状态：代码门与本机测试/构建证据已完成，仍保持 `CONFIG_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED / T06_BLOCKED`。本轮未扫描端口、未识别设备、未读写 Flash/NVS、未烧录、未擦除、未 monitor、未 HIL。
- 下一步：推送本分支后，若要硬件验证，必须针对上述新 HEAD、SHA-256 和范围重新确认目标 EasyInput 身份及 app-only 写入授权；之后按只读配置读取、单字段保存/重启回读和 T03/T04 快速回归执行。不得把之前旧镜像授权或另一台电脑截图作为本机证据。

## 2026-08-28 · T05 third independent audit blocks hardware and hands off rework

- 审计对象：codex/easyinput-t05-config-nvs@2c1cf8d6a9d4f3c79f0adb44bbbaad8318a02122，冻结基线 a2adc9818da07119e59a6f14d125fc23576696c9；未合并 main，未开始 T06。
- 已确认：Feature Report 精确长度、严格 JSON/UTF-8、cursor 投影、配置切换全释放、save epoch、稀疏 patch、脱敏差异和读取进度刷新已进入候选。
- 阻断：原生读取仍有跨线程/旧分块竞态；0x13 flag 未分流且能力被桌面硬编码；NVS init 失败会中止应用；同 epoch 保存未串行；NVS 故障矩阵与 board-first UI 不完整。
- 复验：固件 Host 6/6、桌面 73/73、原生桥 Release 0 warning/0 error、桌面构建通过；精确环境 ESP-IDF v5.5.5 / esp32s3。既有 app 303744 bytes、SHA-256 F7CCF2F44A67034AC0081B5823A7FCBEFB47AFFC7AC93FCC53FCCDCD468FB737 仅为审计证据，不得烧录。
- 交付：第三轮审计和另一台电脑返工交接已写入 docs/reviews 与 docs/handoffs。状态保持 REVIEW_CHANGES_REQUIRED / CONFIG_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED / T06_BLOCKED。未访问硬件。

## 2026-08-28 · T05 local continuation after copied worktree

- 接手：当前分支 `codex/easyinput-t05-config-nvs`，复制来的实现与远端候选逐文件一致；未合并或 rebase `main`，未开始 T06。
- 本轮修复：UI 只提交用户实际编辑的 `KEY1`～`KEY8`/旋钮 JSON 路径；原生桥对每个已验证读取块发脱敏 `config-progress`，Electron 从最后有效进度刷新 3 秒超时；固件整数解析在乘法前拒绝溢出。
- 验证：ESP-IDF v5.5.5 / esp32s3 激活后 Host CTest `6/6`；`npm ci --include=dev`、`npm test` `73/73`；原生桥 Release 编译 `0` 警告 / `0` 错误；`npm run build:desktop` 通过；独立绝对 SDKCONFIG、Minimal build、固定 16 MB 分区的 IDF 构建通过，app `0x4A280`（303,744 bytes）。
- 状态：继续保持 `REVIEW_CHANGES_REQUIRED / CONFIG_V1_FROZEN / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED / T06_BLOCKED`，等待原主电脑第三轮独立审计；未扫描端口、未识别设备、未读取/写入 Flash/NVS、未烧录、未擦除、未 monitor、未 HIL。
- 来源：固定 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`（PolyForm Noncommercial 1.0.0），本轮仍为产品侧清晰重实现；外部参考目录未修改、未复制、未使用 build 产物。实现细节见 `docs/provenance/t05-easyinput-config-nvs-implementation-2026-08-27.md`。

## 2026-08-27 · T05 third rework awaiting independent audit

- 分支：`codex/easyinput-t05-config-nvs`，未合并或 rebase `main`；本轮继续修复第二轮审计阻断，未开始 T06。
- 修复：0x13/0x10 Feature Report 精确 63-byte payload 边界和尾部填充；有界非异常 JSON/UTF-8/escape/surrogate/number parser；合法读取 flags `0x00/0x01/0x02`；旋钮 cursor projection 生效；配置替换先排队全零 HID 报告；保存命令/结果绑定 USB epoch；NVS legacy 只读导入可在新 namespace 不可用时继续，持久损坏来源标记为 Recovery；原生读取先登记、断线清理、完整 64-byte/metadata/padding 校验；桌面能力门与脱敏 JSON Pointer diff。
- 新增回归：固件严格 JSON 畸形/重复键/非法 UTF-8/代理项/尾部数据、读取 flags/reserved、配置切换全释放与 cursor 行为；保留完整 T02～T04 回归。Host CTest `6/6`，桌面 `npm test` `71/71`。
- 构建：精确 ESP-IDF `v5.5.5` / `esp32s3`，隔离绝对 SDKCONFIG、固定 16 MB 分区构建通过；最终 app 大小与 SHA-256 以交付报告为准；分区表 SHA-256 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`。
- 状态：`REVIEW_CHANGES_REQUIRED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED` / `HIL_NOT_AUTHORIZED` / `T06_BLOCKED`，等待原主电脑第三轮独立审计；未扫描端口、未识别设备、未读取或写入 Flash/NVS、未烧录、未擦除、未 monitor、未 HIL。
- 来源：Maker 固定提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`，PolyForm Noncommercial 1.0.0；本轮产品侧清晰重实现，外部参考目录未修改、未复制、未使用其 build 产物。详见 `docs/provenance/t05-easyinput-config-nvs-implementation-2026-08-27.md`。

## 2026-08-27 · T05 second rework awaiting independent audit

- 分支：`codex/easyinput-t05-config-nvs`，基于原候选 `a795d309cb88a3a740c25c159e132609e1583d73`，未合并或 rebase `main`。
- 本轮关闭：`config-snapshot` 作为控制事件传递；旧整份 `syncKeyboardConfig` IPC fail closed 且 renderer 不再暴露；preview 前重读设备；原生读取绑定 textual/numeric request ID、严格递增与 duplicate-last 幂等、冲突/旧块/超长拒绝；配置 NVS 工作移入独立 `config_owner` 队列；旋钮配置的按压 chord、cursor HID 方向和既有 router 路由。
- 新增测试：桌面 `config-snapshot` parser/filter 控制链回归；桌面全量 `71/71`；固件 Host CTest `6/6`；精确 ESP-IDF `v5.5.5` / `esp32s3` build 通过，app `0x49210` 字节。
- 状态：`REVIEW_CHANGES_REQUIRED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED` / `HIL_NOT_AUTHORIZED`。严格 JSON/UTF-8/schema 异常矩阵与 NVS 掉电/故障注入仍需原主电脑第二轮独立审计，不能锁定 T05。
- 安全：未扫描端口、未识别设备、未读写 Flash/NVS、未烧录、未擦除、未 monitor、未 HIL；不得开始 T06。

## 2026-08-27 · T05 implementation pass awaiting independent audit

- 做了什么：在 `codex/easyinput-t05-config-nvs` 上完成 `CONFIG_V1_FROZEN` 的第一版实现：0x10 分块写入、0x13/0x11 kind 0x06 完整读取、CRC16、静态 callback 命令队列、输入优先的配置响应 transfer 生命周期、纯 HID 配置投影、双槽 `deskmate` NVS 事务/回读/marker 恢复、只读 legacy 导入，以及 Electron 主进程的脱敏读取、严格白名单合并和确认 token 接口。
- 来源与边界：依据 Maker 固定提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的配置 receiver/payload/state/status/NVS 行为审计重实现；未修改或复制两个外部参考目录。T06 Host Action/固定文字执行、BLE/Wi-Fi、音频、DeskMate Link、桌面 UI 业务均未实现。
- 验证：已激活并真实检查 `ESP-IDF v5.5.5`、Python `3.11.15`、target `esp32s3`；`cmake`/`ctest` 6/6 Host tests 通过；隔离目录 `firmware/easyinput-controller/build-t05` 的 `idf.py -C firmware/easyinput-controller -B firmware/easyinput-controller/build-t05 build` 通过，应用镜像 `0x48e00` 字节，最小 factory app 余量 91%。
- 状态：`REVIEW_CHANGES_REQUIRED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED`，等待原主电脑独立审计；当前未执行端口扫描、设备识别、Flash/NVS 读写、烧录、擦除、monitor 或 HIL。
- 交接：详见 `docs/handoffs/second-computer-t05-config-nvs-implementation-2026-08-27.md`。

## 2026-08-27 · T05 second independent audit returns the candidate; reference-first gate reinforced

- 做了什么：在隔离 worktree 独立审计 `origin/codex/easyinput-t05-config-nvs@c6c6c64d7c595375eb74f3651b50df2950801aff`，逐项复核固件 Feature callback、配置解析/运行时投影、USB epoch、NVS 双槽、Windows 原生分块、Electron token 与 React 确认流程，并固定对照 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的 `config_payload`、`config_state` 和 Host 负向测试。完整结论写入 `docs/reviews/t05-easyinput-config-nvs-second-audit-2026-08-27.md`。
- 为什么：用户明确纠正“正式固件重新开发”不等于忽略已有成熟参考从零猜测；候选虽然 Host 6/6、桌面 71/71 和 IDF 构建通过，但自行编写的简化 JSON/`std::stoi` 解析、Feature 长度复制、配置切换、分块生命周期和 NVS 恢复仍未满足冻结合同，不能用正常路径绿测替代畸形输入、断线和掉电证据。
- 怎么理解：T05 的产品功能是“读取板上整份配置，只修改用户确认的纯 HID 键位/旋钮路径，双槽事务保存，重启恢复并回读确认”，不是重新发明按键和旋钮。T03/T04 输入与灯效已经锁定；T05 只是让原来可用的映射变成安全可配置。当前问题主要来自实现流程没有在编码前先移植 Maker 适用失败向量，而不是产品功能本身发生了大变化。
- 产出路径：`docs/reviews/t05-easyinput-config-nvs-second-audit-2026-08-27.md`、`docs/handoffs/second-computer-t05-config-nvs-second-rework-2026-08-27.md`、更新后的 `flow/tasks/T05-easyinput-config-nvs.md`、`flow/plan.md`、`flow/lessons.md`、`docs/README.md` 和本记录。根级 `AGENTS.md` 已含固定参考优先规则，无需重复修改；没有新合同决策需要写入 `flow/decisions.md`。
- 验证：`npm ci --include=dev`、桌面 71/71、桌面 Release 构建、固件 Host CTest 6/6、ESP-IDF v5.5.5/`esp32s3` 固定分区构建和 `git diff --check` 均通过。独立 app 为 299456 字节、SHA-256 `C9C7625EB4142668879BAA15FB2CD38E1BE4E93800B2D5103E4271AF55374993`，未复现笔记本报告的 299536 字节/`FFD1...E13`，因此尚不能形成发布镜像。ASCII 路径、跟踪构建产物和密钥检查通过；仅发现安全存储字段名与合成测试值。
- 问题解决：确认第一轮修复确实关闭了快照事件丢失、旧 IPC 绕过和同步 NVS owner 等问题，同时把剩余阻断收敛为一次测试先行返工：精确 Feature 长度、Maker 负向解析向量、旋钮 cursor/配置切换全释放、原生读取有序生命周期、epoch 绑定、能力状态、完整 NVS 故障矩阵和路径级确认差异。它们跨越固件、原生桥、Electron 和 UI，不属于适合本机零碎修复的小问题。
- 下一步：另一台电脑继续原 `codex/easyinput-t05-config-nvs` 分支，先补上述红测和 Maker→DeskMate 行为差异表，再修生产代码并推送后停止；原主电脑做第三轮独立审计。状态为 `SECOND_AUDIT_REWORK_REQUIRED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED / T06_BLOCKED`。本轮未扫描端口、识别设备、读取或写入 Flash/NVS、erase、monitor、烧录或 HIL；T05 真机锁定前不得开始 T06。

## 2026-08-27 · T05 first independent audit requires rework; no flash and no T06

- 做了什么：从 GitHub 精确取得 `origin/codex/easyinput-t05-config-nvs` 的 `a795d309cb88a3a740c25c159e132609e1583d73`，确认它基于锁定交接 `a2adc9818da07119e59a6f14d125fc23576696c9`，在隔离 worktree 完成固件、原生桥、Electron、React、NVS 与测试审计，并写入 `docs/reviews/t05-easyinput-config-nvs-first-audit-2026-08-27.md`。
- 为什么：T05 是首次允许完整配置和 NVS 持久写入的安全门；仅凭 6/6、70/70 和可构建不能证明读取、无损合并、事务恢复与 T03/T04 实时输入边界成立，必须先检查测试是否真正覆盖冻结合同。
- 怎么理解：候选存在六组阻断：`config-snapshot` 被 filter 降级导致读取必超时；UI/IPC 仍直接整份写入而绕过预览与 token；NVS 同步事务阻塞唯一输入 owner；旋钮 press/cursor 配置未执行且配置切换缺少可观察全释放；原生分块未绑定 numeric request/epoch、重复和长度处理不符合合同；Feature callback 越界风险与手写 JSON/`stoi` 非失败关闭。状态为 `REVIEW_CHANGES_REQUIRED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_NOT_AUTHORIZED`。
- 产出路径：`docs/reviews/t05-easyinput-config-nvs-first-audit-2026-08-27.md`、更新后的 `flow/tasks/T05-easyinput-config-nvs.md`、`docs/README.md` 和本记录；候选分支未合并，`main` 产品代码未改变。
- 验证：固件 Host CTest 6/6；桌面 `npm test` 70/70、`npm run build:desktop`；精确 ESP-IDF v5.5.5 / `esp32s3` 隔离构建通过，固定五分区不变，审计 app 298432 字节、SHA-256 `4CDD04118F32AC1A0B0EE4F5606322B159AF41C80D088882A50345B61F15E022`。新增只读复现证明合法 `config-snapshot` 经 parser/filter 后得到 `diagnostic`。`git diff --check`、AGENTS/CLAUDE 一致通过。
- 问题解决：本轮把“工具链通过”和“产品合同通过”分开，拒绝把覆盖不足的绿测升级为可烧录证据；未扫描端口、识别设备、读取或写入 Flash/NVS、flash、erase、monitor 或 HIL。
- 下一步：另一台电脑继续原 `codex/easyinput-t05-config-nvs` 分支按审计文档返工，补齐读取 manager、原生分块、UI 安全确认、独立配置 owner、旋钮投影和 NVS 故障矩阵后推送并停止。本机第二轮独立审计通过后才准备 T05 app/NVS 授权卡；真机验收并锁定 T05 前不得开始 T06。

## 2026-08-27 · T04 locked and T05 configuration/NVS opened for the second computer

- 做了什么：依据用户确认的完整压力矩阵，把 T04 从 `PENDING_HIL` 锁定为 `AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / HIL_CONFIRMED / T04_LOCKED`，并将 `codex/easyinput-t04-input-led-feedback` 快进合入 `main`。已验收固件源码 HEAD 为 `75c65788524523325a4526718ad865ddf9f7a072`，app SHA-256 为 `578A73E8E5FEB675096DAC88F4A512D3EF5CAFE2604D4ED869F457648E45813C`。随后冻结 `CONFIG_V1_FROZEN`，完成 T05 Maker 配置/NVS 差异审计、任务卡和第二电脑交接；准确的 GitHub `origin/main` 交接哈希随本次提交推送结果和用户复制文字交付。
- 为什么：T04 的 S1～S7/旋钮灯效、长按、50 次输入、五轮断线、20 次语音键及 DeskMate 组合回归均已通过，继续停留在 T04 没有收益。T05 必须先解决 Maker 整份配置覆盖、`0x13` 只有状态指纹、未知网络/音频字段保护和掉电恢复，才能安全开放软件“同步到键盘”。
- 怎么理解：T05 复用 Maker `0x10` 写入兼容格式，新增冻结的 `0x13` flag `0x02` 完整读取和 `0x11` kind `0x06` 响应；Electron 主进程独占原始配置并做无损合并，固件使用 `deskmate` 双槽 NVS，旧 `ai_keyboard/config_v2` 只读导入且禁止 `nvs_flash_erase`。本包只激活纯 HID 映射；固定文字、Host Action/打开应用及其他 Windows 动作统一留到 T06。
- 产出路径：`docs/testing/t04-input-led-feedback-acceptance-2026-08-27.md`、`contracts/deskmate-host/easyinput-config-v1.md`、`docs/provenance/t05-easyinput-config-nvs-reference-audit.md`、`flow/tasks/T05-easyinput-config-nvs.md`、`docs/handoffs/second-computer-t05-config-nvs-2026-08-27.md`、更新后的 `flow/plan.md`、`flow/decisions.md`、T06 任务卡、文档索引和固件局部入口。
- 验证：T04 合并前确认 `main` 是分支祖先且两个工作树干净；固定 Maker 提交的 config receiver/payload/state/status、status HID、NVS store 和 Host tests 已只读核对。合并后固件 Host CTest 5/5、桌面 `npm test` 68/68、`npm run build:desktop` 和精确 ESP-IDF v5.5.5 / `esp32s3` 隔离构建通过；隔离构建逐项输出固定 NVS/PHY/3 MiB factory/双声音 bank。Markdown 链接、ASCII 路径、AGENTS/CLAUDE 一致、密钥/构建产物和 `git diff --check` 继续作为提交门。本轮没有扫描端口、识别设备、读取或写入 Flash/NVS、flash、erase 或 monitor。
- 问题解决：完整配置中的 Wi-Fi/音频/未知字段不会进入 renderer 或被局部 JSON 覆盖；NVS 不再采用单槽写入或初始化失败整片擦除；T05 与 T06 按“纯 HID 配置”及“Windows 主机动作”拆包，避免配置事务和应用执行同时扩大故障面。默认 IDF 构建首次被根目录旧 `sdkconfig` 的单分区值触发 fail-closed，未修改该生成文件，改用显式 `-DSDKCONFIG=<隔离目录>` 后按仓内 defaults 构建通过。当前样机 S8 仍是单板硬件阻断，健康替换板到货后补测，不修改八键/GPIO48 合同。
- 下一步：另一台笔记本从用户复制文字给出的准确 `origin/main` 全哈希创建 `codex/easyinput-t05-config-nvs`，按冻结合同完成固件、Windows 主进程/桥、React 脱敏 UI、Host/桌面/IDF 测试和自审，推送后立即停止；不得接触硬件、合并 `main` 或开始 T06。原主电脑随后独立审计，另行申请 app/NVS 备份、烧录与配置写入授权。

## 2026-08-27 · T04 independently audited and prepared for the clean release gate

- 做了什么：原主电脑在隔离 worktree 审查 `fbd4c20` 的完整 T04 diff、冻结合同、任务卡及固定 Maker 参考。确认 T03 语义事件先进入唯一 USB runtime，灯效随后异步消费；GPIO8 只有一个物理写入口，GPIO12 RMT、颜色/时序、fail-soft 边界和固定分区方向正确。审计补齐四 owner 的共享电源租约底座，使 `DeviceAwake`、LED 以及未来麦克风/扬声器具有同一所有权模型；本包仍未初始化音频。
- 为什么：T04 任务明确要求为后续音频保留共享电源所有权接口。原候选只有 Awake 常开动作，若直接烧录虽然灯效可能工作，但 T08 音频接入时需要重构 GPIO8 边界。小修现在完成并用 Host test 锁定，避免再次形成第二个电源 owner。
- 怎么理解：本轮没有改变 T03 输入/HID、灯色、动画、引脚、USB 身份或分区。文档把 RMT reset 从误写的 300 us 修正为两个 6000 tick 低半段、总低电平 600 us；发布清单同时增加当前干净 HEAD、工程路径、构建目录和 embedded app version 一致性校验，拒绝把旧构建冒充新镜像。
- 产出路径：`firmware/easyinput-controller/components/input_core/include/peripheral_power_lease.h`、对应实现与 Host test、`main/peripheral_power.*`、`tools/write-release-manifest.ps1`、`docs/reviews/t04-input-led-feedback-independent-audit-2026-08-27.md`、更新后的 provenance、T04 任务卡和本记录。
- 验证：精确 ESP-IDF v5.5.5 环境下 Host CTest 5/5；全新目录 `esp32s3`/Minimal build 通过且固定 16 MB 分区不变；桌面 `npm test` 68/68、`npm run build:desktop` 通过；`git diff --check`、ASCII 路径、构建产物忽略和固件局部 AGENTS/CLAUDE 一致通过。板级声明扫描 1 PASS/1 已知 constexpr 识别 WARN/0 FAIL，人工引脚复核通过。
- 问题解决：补上共享租约和 stale-build manifest 防线；未把小问题退回另一台电脑。最终提交后必须从干净 HEAD 双构建得到逐字节一致 app，生成忽略的 release manifest，再展示 app-only 烧录卡。未扫描端口、识别设备、读取 Flash/NVS、flash、erase、monitor 或 HIL。
- 下一步：状态为 `AUDIT_CONFIRMED / TEST_CONFIRMED / BUILD_CONFIRMED / PENDING_HIL`。干净 release gate 通过后向用户展示最终 HEAD、app SHA-256、`0x010000` 起的精确 app-only 范围和恢复边界；得到新的明确授权后才识别当前 EasyInput 并烧录。真机灯效与 T03 全回归通过后才能标记 `T04_LOCKED` 并开始 T05。

## 2026-08-27 · T04 input LED feedback passes development-laptop gates

- 做了什么：在 `codex/easyinput-t04-input-led-feedback` 按 `INPUT_LED_V1_FROZEN` 完成 T04。T03 已确认语义事件先进入原 USB runtime，再非阻塞发布到独立 LED 任务；新增 S1～S8 八色 140/35 ms 波纹、旋钮 160/40 ms 左右方向流、300/60 ms 按压脉冲、5 像素 GRB 序列化和最终黑帧。灯效使用最新事件优先的有界邮箱，初始化、邮箱或 RMT 失败只增加脱敏饱和计数，不改变 HID、输入 ring 或 USB 生命周期。
- 电源与传输：建立 GPIO8 唯一物理写入口。冷启动依次预装 GPIO8 inactive latch、将 GPIO9/10/12/13/14/15 置低并让 GPIO11 禁用/浮空、配置 GPIO8 output/high、用调度器阻塞至少 50 ms，再初始化 GPIO12 RMT。Awake 期间共享域保持开启，灯灭只发黑帧；未初始化麦克风、扬声器、I2S、BLE、Wi-Fi、NVS、分区或其他外设。RMT 固定 20 MHz、5 像素/121 symbols、WS2812 `6/18` 与 `16/12` tick；reset symbol 的两个低电平半段各 6000 tick，总低电平 600 us；一项 TX queue 和有界完成等待。
- 测试：在真实 `ESP-IDF v5.5.5` 环境的 CMake 3.30.2/MSVC 下执行规定的 configure、build、CTest，`input_core_tests`、`input_runtime_tests`、`led_feedback_tests`、`firmware_source_contract_tests` 共 4/4 通过。新增覆盖八色/时序/逐帧黄金向量、释放静默、长按、同时按键、最新事件替换、非法编码器半步、GRB、计时回绕、fail-soft 隔离，以及 GPIO8 顺序/唯一所有权、GPIO11、RMT 和固定分区源码合同。
- 构建：每个 PowerShell 进程先加载 EIM 登记的精确 v5.5.5 并真实运行 `idf.py --version`。使用全新隔离 sdkconfig 对 `esp32s3`、Minimal build 执行 `idf.py ... build` 通过；`CONFIG_APP_REPRODUCIBLE_BUILD=y` 已真实生效。dirty-tree 候选 app 为 `0x3E440`（255,040 bytes），3 MiB factory 余量 92%，只作为构建证据，不作为烧录授权镜像；分区表 SHA-256 仍为 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`。
- 来源与发布：逐目标文件来源、固定 Maker 提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`、PolyForm Noncommercial 1.0.0、ESP-IDF Apache-2.0、采用方式和排除项记录于 `docs/provenance/t04-easyinput-input-led-feedback.md`。新增 `tools/write-release-manifest.ps1`，只允许从干净 HEAD 生成不含本机路径/设备信息的 app 大小、SHA-256、写入范围和分区哈希清单；生成清单与镜像保持 Git 忽略。
- 自审：任务范围、板级声明、禁止运行时、AGENTS/CLAUDE 逐字一致、来源/许可证、密钥、ASCII 路径、构建产物忽略和 `git diff --check` 通过。固定参考只读 HEAD 正确；未修改 Windows、小智、DeskMate Link、冻结合同、T03 输入/USB语义或两个外部参考目录。
- 状态与下一步：仅声明 `TEST_CONFIRMED / BUILD_CONFIRMED / PENDING_INDEPENDENT_AUDIT_AND_HIL`。本轮没有扫描端口、识别设备、读取 Flash/NVS、flash、erase、monitor 或 HIL。提交推送后从最终干净 HEAD 再构建并生成 release manifest；原主电脑仍须独立审计、重建并展示最终 HEAD、app SHA-256、app-only 范围和恢复方案，取得用户明确授权后才可烧录。T04 锁定前不开始 T05。

## 2026-08-27 · T04 rebased to physical-input LED feedback and handed to the second computer

- 做了什么：按用户新增需求固定读取 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的 `input_feedback`、`led_strip_status`、`peripheral_power` 与对应 Host tests，确认原功能是 GPIO12 上 5 颗 GRB WS2812：S1～S8 八种低亮度 140 ms 波纹、旋钮方向流和按压确认脉冲。现已冻结 `INPUT_LED_V1_FROZEN`，建立新的 T04 任务卡、参考审计和第二台电脑交接。
- 为什么：灯光能直接说明实体输入是否经过防抖被固件识别，尤其可区分当前样机 S8 的硬件无事件与上层动作失败；它是 T03 输入闭环的紧邻功能，应在配置/NVS 前独立完成。参考固件已经有成熟实现与测试，不能重复 T03 的从零猜测和多轮真机返工。
- 怎么理解：T04 只增加输入灯效与 GPIO8 最小共享电源安全底座，不改变 T03 HID。GPIO8 是 LED/麦克风/扬声器共享域，由唯一控制器在 Awake 期间保持开启；灯灭发送黑帧，不按键开关电源。音频、Boot/连接/Agent 灯效和配置均不进入本包。原配置/NVS 顺延为 T05，Host Action/打开应用顺延为 T06。
- 产出路径：`docs/contracts/easyinput-input-led-feedback-v1.md`、`docs/provenance/t04-easyinput-input-led-feedback-reference-audit.md`、`flow/tasks/T04-easyinput-input-led-feedback.md`、`flow/tasks/T05-easyinput-config-nvs.md`、`flow/tasks/T06-easyinput-host-actions.md`、`docs/handoffs/second-computer-t04-input-led-feedback-2026-08-27.md`、`flow/plan.md`、`flow/decisions.md`、根级/固件局部规则和本记录。
- 验证：本轮只做只读参考审计和项目文档/合同变更；固定参考提交的关键源文件与测试已核对。执行 Markdown 相对链接、ASCII 路径、AGENTS/CLAUDE 局部一致、旧活动任务链接和 `git diff --check` 检查；未访问硬件，未扫描端口，未读取或写入 Flash/NVS，未 flash/erase/monitor，未修改固件或桌面代码。
- 问题解决：避免把灯效塞进配置事务导致故障面扩大；S8 仍保留 GPIO48/八键产品合同，当前坏样机没有稳定输入就自然不亮，不为灯效伪造事件。共享电源的 50 ms 等待明确只是同板固定参考的当前策略，仍需后续 HIL，而不是普适电气常数。
- 下一步：另一台笔记本从最新 `origin/main` 创建 `codex/easyinput-t04-input-led-feedback`，严格按 T04 任务卡完成代码、Host/source-contract tests、精确 ESP-IDF v5.5.5 构建、来源和自审后推送并停止；不接触硬件、不开始 T05。原主电脑随后独立审计、重建，并在另行取得 app-only 烧录授权后执行灯效与 T03 完整真机回归。

## 2026-08-27 · T03 independently audited, accepted and locked on the original computer

- 做了什么：原主电脑从 `origin/codex/easyinput-t03-cold-boot-reconnect@ed842aa` 建立隔离工作树，逐项审查 `39ac64e..ed842aa` 的合同、来源、28 个变更文件和最终 atomic tap 实现；固定读取 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的 `HidTap`、snapshot 与 FIFO 测试，确认 DeskMate 只采用行为结构并在自身单一路由/队列中清晰重实现。审计未发现阻断性代码问题，T03 现正式锁定。
- 为什么：此前 6～7 轮猜测性 USB lifetime 修复耗费大量时间，且 Host 通过仍被真机否决；本次把“参考优先、一次 HIL 失败后停止继续猜测”固化进根级和固件局部规则，避免 T04/T05 重复同类过程。
- 怎么理解：S1/S3 仍是 held PTT；S2/S4/S5～S8 在稳定按下时原子排入 press 与精确 restore，实体释放只 rearm。用户在最终 `5c09880` 镜像上连续五次得到 `123abc`；S8 仅是当前样机既有硬件阻断，软件八键/GPIO48 合同继续保留。T03 状态为 `TEST_CONFIRMED / BUILD_CONFIRMED / HIL_CONFIRMED / T03_LOCKED`。
- 产出路径：`docs/reviews/t03-final-independent-audit-2026-08-27.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md`、`flow/tasks/T04-easyinput-config-nvs.md`、`flow/plan.md`、`flow/lessons.md`、根级及固件局部 `AGENTS.md`、固件 `README.md` 与本记录。
- 验证：精确 `5c09880` 干净工作树 Host CTest 3/3、ESP-IDF v5.5.5/esp32s3 构建通过，app 大小 `0x37310`，固定分区 SHA-256 仍为 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278`；交接 HEAD `ed842aa` 再构建通过；桌面 `npm test` 68/68、`npm run build:desktop` 通过；板级扫描 1 PASS/1 已知声明识别 WARN/0 FAIL；范围、来源、ASCII 路径、构建产物和 AGENTS/CLAUDE 一致检查通过。没有访问或写入硬件。
- 问题解决：清除了返回文档中不应进入 Git 的端口/MAC 后缀；确认当前构建启用编译时间戳，所以同一 `5c09880` 的新构建大小一致但 SHA-256 不会复现已烧录镜像，不能把源码重建冒充逐字节镜像复现。该构建可复现性缺口已写入 lessons，须在下一次烧录前关闭。
- 下一步：另一台笔记本从锁定后的最新 `main` 建立 `codex/easyinput-t04-config-nvs`，先做 Maker 配置/NVS 参考差异表与 `CONFIG_V1_FROZEN` 合同评审，再编码；完成代码、自审和无硬件验证后推送并停止，由原主电脑独立审计、获授权烧录和真机回归，T04 锁定前不开始 T05。

## 2026-08-27 · T03 atomic HID tap passes five reconnect repetitions

- 结果：当前分支 `codex/easyinput-t03-cold-boot-reconnect` 的最终提交 `5c0988097c44194269bb1c7b23fa24277fae6680` 已烧录并完成 app-only 数据哈希校验。用户在正常断电重启后完成五次断线矩阵：记事本输入 `123`，按住 S6 拔 USB，保持按住重连，等待约 3 秒，松开 S6，再用电脑键盘输入 `abc`；五次均得到 `123abc`，未出现全选或 Ctrl 残留。第 1、2 轮由只读 Raw Input/PnP 监控同步确认，第 3～5 轮由用户连续操作后确认通过。
- 监控证据：第 1、2 轮均观察到 EasyInput 的 `Ctrl` 与 `C` 在约 5 ms 内成对 down/up，随后设备断开并重新连接；重连后的 `A/B/C` 均来自 `other-keyboard`。监控进程为只读诊断，未读取 Flash、未输出用户文本或设备敏感资料，测试完成后已停止。
- 根因与修复：旧版 stateful S6 在 HID lifetime 消失时可能只留下旧设备的 Ctrl-down；新 lifetime 的全零报告、重复释放、transfer-complete、GPIO40 DCD 重连均不能可靠替旧 lifetime 产生 Ctrl-up。最终按 Maker 固定提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 中 synthetic tap 的结构清晰重实现：S2/S4/S5～S8 在稳定 Press 时原子排入临时 chord 与精确 restore，S1/S3 仍为 held PTT。
- 本轮证据：Host CTest `3/3` 通过；精确 ESP-IDF `v5.5.5`、target `esp32s3` 构建通过，app `0x37310`（226,064 bytes），3 MiB factory 余量 93%；镜像 SHA-256 `82731f1a72892fcefedf3f3dc920013de8110c384cab2f6a0edea4ec97e2913e`。
- 烧录边界：仅向用户确认的 EasyInput 写入 app `0x010000..0x04730F`；工具按 4 KiB 扇区擦除至 `0x047FFF`，仍在 factory app 分区内。端口与硬件身份只保存在 Git 外私有恢复记录。未擦除整片，未写 bootloader、分区表、NVS、PHY、声音区或 eFuse。
- 状态：`TEST_CONFIRMED / BUILD_CONFIRMED / HIL_CONFIRMED / T03_COMPLETE`。S8/GPIO48 仍保留原软件合同，当前样机 S8 的既有硬件问题不纳入本次软件结论。T04/T05 尚未实现，资料已准备交还原主电脑独立审计。

## 2026-08-27 · T03 ordinary command keys reworked as atomic HID taps

- 根因：`cf9fdf8` 的 GPIO40/TinyUSB DCD 软断开/连接和 500 ms 全释放重申在第一轮真机断线测试仍留下 Ctrl。结合此前多轮监控，结论是新 HID lifetime 的零报告不能可靠替已经消失的旧 lifetime 产生 Ctrl-up；第一次偶尔通过只是 Windows/PnP 时序差异。固定 Maker 默认 S6 同样是 stateful down/up，不能直接解决该 HIL；可采用的是其独立 synthetic `HidTap` 的 press/restore 结构。
- 合同与实现：用户确认修订 `INPUT_V1_FROZEN`。S1/S3 继续 held PTT；S2/S4/S5～S8 在稳定 Press 上把临时 chord 叠加当前 held snapshot，并在现有 16 项 USB FIFO 原子排入 press 和精确 restore；实体 Release 只 rearm。只剩一个槽时整对拒绝并全释放恢复，不新增第二套输入状态机、USB owner 或传输。
- Host：精确 v5.5.5 环境下执行规定 CMake configure/build/CTest，`input_core_tests`、`input_runtime_tests`、`firmware_source_contract_tests` 共 3/3 通过。新增覆盖物理松键前已恢复、重复/rearm、S1 并发精确恢复、两槽准入、HID 延迟 ready、发送失败和旧 endpoint 最后完成报告为全零。
- 构建：`idf.py --version` 为 `ESP-IDF v5.5.5`，target `esp32s3`，Minimal build ON；隔离 sdkconfig 构建通过。dirty-tree app `0x37310`（226,064 bytes），3 MiB factory 余量 93%；分区仍为 NVS 24 KiB、PHY 4 KiB、factory 3 MiB、sound A/B 各 576 KiB。
- 来源与静态检查：逐文件来源更新于 `docs/provenance/t03-easyinput-usb-input-runtime.md`，固定 Maker 提交与 PolyForm Noncommercial 1.0.0 已记录；没有复制 Maker 复杂运行时或 build 产物。板级源码复核、任务范围、密钥、ASCII 路径、构建产物、AGENTS/CLAUDE 一致和 `git diff --check` 通过；未修改两个外部参考、小智、桌面、配置/NVS、音频、BLE/Wi-Fi、DeskMate Link 或分区。
- 状态：只能声明 `TEST_CONFIRMED / BUILD_CONFIRMED / T03_ATOMIC_TAP_PENDING_CLEAN_HEAD_AND_HIL`。本轮尚未扫描端口、识别设备、读取 Flash、flash/erase/monitor 或执行 HIL。提交推送并从干净 HEAD 重建后，必须展示最终 HEAD、app SHA-256 和 app-only 精确范围，取得针对该镜像的新确认后才可补刷；T03 通过前 T04/T05 关闭。

## 2026-08-27 · T03 battery-powered USB DCD reconnect candidate passes local gates

- 做了什么：在既有唯一 `UsbInputRuntime` 和 owner task 内修复电池供电拔插的底层 USB 生命周期。GPIO40 低有效 SEN_VIN 继续由 25 ms 稳定滤波确认；稳定失去 USB 时 owner 调用 TinyUSB `tud_disconnect()`，稳定恢复时调用 `tud_connect()`，平台动作失败会重试且重复状态幂等。mount、输入丢失恢复和无 Press owner 的实体释放还会在首份全零键盘报告完成后，以 25 ms 间隔做 500 ms 有界全释放重申；HID 未 ready 或首份报告仍在途时不会提前消耗该窗口。
- 为什么：监控已经证明旧连接发送过 S6 的 Ctrl+C，重枚举后 Windows 没交付对应 Ctrl-up；候选 `a97d85e`、`dd7bb69`、`8ce5712` 和 `16bad4f` 的应用层 mount/epoch/一次性零报告均在第二次断线矩阵失败。样机有电池，拔 USB 不会重启，而旧实现只撤销应用层 endpoint，未让 TinyUSB DCD 物理软断开；这会让底层端点状态跨拔插存活。本候选首次关闭该缺口，同时保留冻结的八键、默认动作和不重放 held chord 合同。
- 测试：在每个 PowerShell 进程加载 EIM 登记的精确 v5.5.5 环境后，执行任务卡规定的 CMake configure/build/CTest，`input_core_tests`、`input_runtime_tests`、`firmware_source_contract_tests` 共 3/3 通过。新增覆盖 DCD connect/disconnect 去重与失败重试、HID 延迟 ready 不消耗恢复窗口、25 ms/500 ms 精确边界、`uint32_t` 回绕、GPIO40 原始掉线幂等恢复和旧滚轮清除。
- 构建：`idf.py --version` 为精确 `ESP-IDF v5.5.5`，target `esp32s3`；隔离目录 `build-usb-lifecycle-v5.5.5` 全新构建通过。dirty 候选 app 为 `0x371E0`（225,760 bytes），3 MiB factory 余量 93%；分区仍为 NVS 24 KiB、PHY 4 KiB、factory 3 MiB、sound A/B 各 576 KiB。最终提交后必须从干净 HEAD 重建并重新计算 SHA-256 与 app-only 结束地址。
- 来源与安全：固定只读核对 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的 `board_pins.h`、`app_main.cpp`、`usb_hid.cpp/.h`、snapshot delivery 和 queue 代码；同时核对锁定 ESP-IDF/esp_tinyusb/tinyusb 的 VBUS、`tud_disconnect/connect` 与 DWC2 实现，逐文件采用方式见 `docs/provenance/t03-easyinput-usb-input-runtime.md`。未修改外部参考、小智、桌面、冻结合同、分区、NVS、音频或 GPIO8；未扫描端口、识别设备、flash、erase、monitor 或读取 Flash。
- 状态：只能声明 `TEST_CONFIRMED / BUILD_CONFIRMED / T03_USB_DCD_RECONNECT_PENDING_HIL`。T03 仍开放，T04/T05 关闭。提交、推送和干净重建后，必须先展示最终 HEAD、app SHA-256 和精确 app-only 范围并取得新授权，才可补刷并连续执行五次断线矩阵。

## 2026-08-26 · T03 cold-boot reconnect mount delivery rework passes local gates

- 做了什么：修复真实 TinyUSB mount 回调被 GPIO40 单次物理存在采样拒绝的生命周期缺口。mount callback 现在始终建立并发布新 endpoint epoch；GPIO40 只继续承担 25 ms 断开确认和旧生命周期撤销，不再伪造或丢弃 mount。增加有界的 mount/unmount/物理状态日志，未记录按键、报告内容或用户数据。
- 测试：Host CMake/build/CTest 3/3 通过（`input_core_tests`、`input_runtime_tests`、`firmware_source_contract_tests`）；新增回归覆盖 mount 到达时物理存在采样暂时为 false、没有第二个 mount callback 时全释放报告仍可在 HID ready 后交付，并更新 source contract 断言不再存在 `try_mount`。
- 构建：精确 `ESP-IDF v5.5.5`、target `esp32s3`，独立构建目录 `build-codex-v5.5.5` 通过；app `0x36EA0`（224,928 bytes），factory 余量 93%；最终干净提交构建后的 SHA-256 在本候选交接时记录；精确 app-only 范围为 `0x010000..0x046E9F`（结束地址含）。
- 静态与安全：`git diff --check`、T03 范围、ASCII 路径、来源/密钥/用户数据和构建产物检查通过；`firmware/easyinput-controller/AGENTS.md` 与 `CLAUDE.md` 逐字一致。未扫描端口、识别设备、flash、erase、monitor 或读取 Flash/NVS，未修改外部参考、小智、桌面、冻结合同或分区。
- 状态：只能声明 `TEST_CONFIRMED / BUILD_CONFIRMED`；T03 仍为 `T03_COLD_BOOT_MOUNT_DELIVERY_PENDING_HIL`，真机尚未验证，T04/T05 继续关闭。新镜像如需硬件验证，必须展示本提交 HEAD、SHA-256 和上述 app-only 范围后重新取得明确烧录授权。

## 2026-08-26 · T03 second reconnect still leaves Ctrl sticky after 8ce5712 flash

- 做了什么：用户授权后，将 `8ce571228c4814e684ea1d5119b21413c8bf8428` 的 app-only 镜像写入 `0x010000`，数据长度 `0x36DA0`，esptool 数据哈希校验通过；正常重启后 Windows 重新枚举 `VID 303A / PID 1006` Keyboard、Mouse 和 Vendor HID。完整证据写入 `docs/handoffs/t03-second-reconnect-failure-2026-08-26.md`。
- 真机结果：按 `123`→按住 S6→拔 USB→保持按住重连→等待 3 秒→松开→输入 `abc`，第一次通过，第二次再次发生 Ctrl 粘连，A 触发全选；立即停止，没有继续凑五次。
- 结论：`8ce5712` 的 mount 首帧全释放加持键重连二次全释放仍不是可靠 HIL 修复。Host 3/3 与 ESP-IDF v5.5.5 / `esp32s3` 构建证据有效，但不能覆盖真实失败；T03 状态为 `T03_HIL_FAILED_CTRL_STICKY_SECOND_REPETITION_AFTER_8CE5712_FLASH`，T04/T05 继续关闭。
- 下一步：先补真实 USB 生命周期的有界观测或更强 desired/accepted 键盘交付状态，确认 mount、`tud_hid_ready`、报告接受/完成/失败、GPIO40 物理存在和 Windows HID 消费的顺序，再提出新候选。新镜像必须重新展示 HEAD、SHA-256、精确 app-only 范围并重新授权；不再盲目重复烧录。

## 2026-08-26 · T03 cold-boot release reassertion candidate passes local gates; HIL pending

- 做了什么：在现有唯一 `UsbInputRuntime` 内补充有序的 mount 释放序列。每次真实 mount 先排一份全释放报告；若冷启动扫描发现实体键仍按住，首份报告完成后再排一份全释放报告，释放屏障完成前继续抑制按键和滚轮。普通空 mount 仍只发送一份零报告；unmount/reset 会清理序列状态。新增冷启动晚到扫描、重连持键、旧完成事件、实体释放后新 Ctrl+C 和滚轮不重放回归。
- 为什么：昨日监控确认 USB 确实重枚举，但重连后没有观察到 EasyInput Ctrl-up；TinyUSB transfer-complete 只证明控制器接受，不能证明 Windows 已消费并清除旧 Ctrl 状态。对持键重连重复一次全释放报告，补足现有状态机的主机清除窗口，不建立第二套输入状态机。
- 测试：Host CMake/build/CTest 共 3/3 通过（`input_core_tests`、`input_runtime_tests`、`firmware_source_contract_tests`）；`git diff --check`、AGENTS/CLAUDE 逐字一致、范围/密钥/构建产物检查通过。
- 构建：精确 `ESP-IDF v5.5.5`、target `esp32s3` 隔离构建通过，仓内分区为 NVS `0x9000/24K`、PHY `0xF000/4K`、factory `0x10000/3M`、sound A/B 各 576K；dirty 工作树候选 app `0x36DA0`（224,672 bytes），提交后从干净 HEAD 重建最终镜像并计算 SHA-256。
- 状态：只能声明 `TEST_CONFIRMED / BUILD_CONFIRMED`；T03 仍为 `T03_COLD_BOOT_RELEASE_REASSERTION_PENDING_HIL`，真机 Ctrl 断线矩阵尚未通过，T04/T05 继续关闭。未扫描端口、未识别设备、未 flash/erase/monitor、未读取 Flash/NVS，未修改外部参考、小智、桌面、冻结合同或分区。
- 下一步：提交并推送当前分支，干净 HEAD 重建后展示最终 HEAD、app SHA-256 和精确 app-only 范围；只有取得针对该新镜像的明确授权后才可进行硬件验证。连续五次 `123`→按住 S6→拔线重连→等 3 秒→松开→`abc` 全部得到 `123abc` 且旧功能回归通过前，不关闭 T03、不进入 T04/T05。

## 2026-08-25 · T03 monitored reconnect failure captured; no new flash

- 做了什么：在明确告知用户监控已启动后，运行一次有界的只读 `DeskMate.InputBridge --diagnose`，用户完成 `123`→按住 S6→拔 USB→保持按住重连→等待约 3 秒→松开→`abc`。结果仍为 Ctrl 粘连/全选；完整时间线记录于 `docs/handoffs/t03-cold-boot-reconnect-monitored-failure-2026-08-25.md`。
- 证据：`14:41:46.547` EasyInput 断开，`14:41:50.741` 完整重连；断开前捕获连续 EasyInput Ctrl+C down，重连后电脑键盘 A/B 为 `other-keyboard`，未见 EasyInput Ctrl-up。PnP/Raw Input 证明 USB 确实重枚举，但桥接器不能读取原始 HID 报告字节。
- 判断：T03 仍为 `T03_HIL_FAILED_CTRL_STICKY`。高可信方向是 TinyUSB transfer-complete 被错误当作 Windows 已应用全释放；重连首份全零报告可能与主机 HID 轮询/接口稳定存在时序竞态。该机制尚未由原始报告抓包最终证明，不能宣称已修复。
- 本次状态：撤回了本轮尚未验证的二次全释放实验改动，工作树保持仅有文档记录；没有构建、提交、烧录、端口识别、Flash/NVS 读写或 monitor。T04/T05 继续关闭。
- 明天起点：先补 Host 模型验证“实体仍按住的重连释放报告在 transfer complete 后重新确认”，对照 Maker 的 desired/accepted 传递语义做最小修复；通过 Host/IDF 自审后再申请新的烧录授权。

## 2026-08-25 · T03 reconnect transfer-identity rework passes Host and IDF gates; new flash authorization pending

- 做了什么：在既有唯一 `UsbInputRuntime` owner 状态机内修复 USB HID 在途报告身份竞态。TinyUSB 完成/失败回调现在复制 Report ID、payload 长度、payload 内容和当前 callback epoch；owner 只有在四项身份全部匹配时才退休队列头或执行失败恢复。新增旧连接 Ctrl 报告迟到、旧连接全零报告与新连接全零报告同字节、错误长度/Report ID 回归，保持实体按住期间 fail-closed，实体释放后强制追加全释放报告。
- 为什么：真机第二、三次断线仍出现 Ctrl 粘连；仅按 epoch/布尔在途标记不足以解释旧 endpoint 回调迟到。相同全零报告无法仅靠字节区分，因此额外验证即使旧全零误命中新 mount 首帧，实体按住仍不能解锁，必须完成释放后的第二帧全零后才接受新 Ctrl+C。
- 测试：精确 ESP-IDF v5.5.5 环境执行 Host CMake/build/CTest，`input_core_tests`、`input_runtime_tests`、`firmware_source_contract_tests` 共 3/3 通过；新增 stale completion/failure、同字节 zero、持键屏障端到端覆盖。
- 构建：`idf.py --version` 为 `ESP-IDF v5.5.5`；target `esp32s3` 隔离构建通过，app `0x36D10`（224,528 bytes），factory 余量 93%；分区仍为 NVS 24 KiB、PHY 4 KiB、factory 3 MiB、sound A/B 各 576 KiB。提交后从最终干净 HEAD 再建同一镜像并计算 SHA-256。
- 静态与安全：`git diff --check`、范围、ASCII 路径、来源、密钥和构建产物检查通过；未扫描端口、识别设备、flash、erase、monitor、读取 Flash/NVS，未修改外部参考、小智、桌面、冻结合同或分区。当前只能声明 `TEST_CONFIRMED` / `BUILD_CONFIRMED`，T03 保持开放，T04/T05 关闭。
- 下一步：提交并推送交接记录；展示最终 HEAD、app SHA-256 和精确 app-only 写入范围，取得新的明确烧录授权后才做硬件验证。旧授权不适用。

## 2026-08-25 · T03 GPIO40 physical USB lifetime rework passes Host gate; final build and authorization pending

- 做了什么：第二次真实断线复测再次出现 Ctrl 粘连后，保持 T03 开放并停止真机操作。固定读取 Maker `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`，确认 EasyInput V2 的 GPIO40 是低有效 USB/SEN_VIN 物理存在信号；在现有唯一 `UsbInputRuntime` 内清晰重实现 25 ms 断开确认、物理断开撤销旧 endpoint、物理恢复不伪造 mount，以及每个真实 TinyUSB mount callback 建立新 epoch。
- 为什么：板子可由自身电源继续运行，拔 USB 不保证冷启动，也不保证 TinyUSB 先回调 unmount；旧实现把重复 mount 当作幂等并完全忽略 GPIO40，可能沿用旧 endpoint lifetime，符合第一次通过、第二次失败的间歇性真机事实。
- 测试：Host CMake/build/CTest 3/3 通过。新增覆盖 GPIO40 低有效/25 ms 精确边界和计时回绕、物理不存在拒绝 mount、持续运行且缺失 TinyUSB unmount、物理恢复不 mount、不重放旧滚轮、真实重复 mount 推进 epoch、held S6 抑制、无 Press owner 的释放零报告、旧 completion/fail/stale mount，以及连续两个完整断线重连循环。
- 构建：精确 ESP-IDF v5.5.5 / `esp32s3` 隔离构建已通过，冻结分区仍为 NVS `0x9000/24K`、PHY `0xF000/4K`、factory `0x10000/3M`、sound A/B 各 576K；干净提交构建 app `0x36A50`（223,824 bytes），factory 余量 93%。文档状态提交后还需再重建一次最终镜像，当前不得复用旧授权。
- 安全边界：未扫描端口、识别设备、flash、erase、monitor 或读写 Flash；未修改分区、NVS、PHY、声音区、eFuse、小智、桌面、冻结合同或外部参考目录。本轮现已具备 `TEST_CONFIRMED` / `BUILD_CONFIRMED` 代码与构建证据；真机仍未验证，旧授权不适用新镜像。
- 下一步：完成来源/范围/密钥/ASCII/构建产物检查，提交并推送原分支，从干净 HEAD 重建 app，展示 HEAD、SHA-256 和精确 app-only 范围并重新取得授权。获授权补刷后连续五次 `123`→按住 S6→拔线重连→等 3 秒→松开→`abc`，任一次失败立即停止；T03 通过前不进入 T04/T05。

## 2026-08-25 · T03 cold-boot candidate fails second reconnect repetition after app-only reflash

- 做了什么：用户明确授权后，重新核对 `codex/easyinput-t03-cold-boot-reconnect@a97d85e9bbafc6d76a7942d381d360d5ebd58d56` 与 app SHA-256 `20B1AF1D66D092E3BF17D6A16C4A22FF18F0D269F63149A251C3A6C737ADCE31`，只把 223,456-byte app 写入 `0x010000..0x0468DF`，写入工具完成数据哈希校验。完整关机/正常开机后，Windows Keyboard、Mouse 与 HID 接口均以 `VID 303A / PID 1006` 正常枚举。
- 真机结果：按指定矩阵在记事本执行 `123`→按住 S6→拔 USB→保持按住重连→等待至少 3 秒→松开→电脑键盘输入 `abc`。第一次得到 `123abc`；第二次再次发生 Ctrl 粘连。测试立即停止，没有继续凑满五次。
- 结论：`a97d85e` 的冷启动实体快照/释放确认屏障仍不是可靠 HIL 修复，状态改为 `T03_HIL_FAILED_CTRL_STICKY_SECOND_REPETITION`。Host 3/3 与 ESP-IDF v5.5.5 构建证据继续有效，但不能覆盖真实失败；T03 不关闭，T04/T05 继续关闭。
- 安全边界：本次只写授权 app 范围；未擦除整片，未修改 bootloader、分区表、NVS、PHY、双声音 bank 或 eFuse，未操作小智。失败后未继续扫描端口、识别设备、monitor 或写 Flash。
- 下一步：先基于这次间歇性失败重新审计 TinyUSB transfer-complete 与 Windows 实际接收之间的证据缺口，以及断电/重枚举时序；建立能够复现“第一次通过、第二次失败”的更严格模型和可观测证据后再提出新候选。任何再次补刷都必须重新展示 HEAD、app SHA-256、app-only 范围并取得明确授权。

## 2026-08-25 · T03 cold-boot Ctrl release barrier passes Host and IDF build; authorized HIL pending

- 做了什么：从最新 `main@39ac64e2dbd099f9de076a019e456f822c683aef` 建立并继续 `codex/easyinput-t03-cold-boot-reconnect`。在现有唯一 `UsbInputRuntime` 中接入 `InputCore` 防抖后的八键实体掩码，并增加冷启动释放确认屏障：mount 首帧全释放之后，若启动时曾观察到按键按住，必须等实体键释放后追加的全释放报告收到 transfer-complete，才重新接受按键和滚轮。没有建立第二套输入状态机。
- 为什么：上一版只在 mount 时发送零报告，真实拔线会让 ESP32-S3 冷启动；S6 在第一次稳定扫描前已经按下时没有本次运行的 Press owner，后续释放可能没有第二个零报告，Windows 因而仍保留 Ctrl。
- 测试：精确激活 `ESP-IDF v5.5.5` 环境后执行 Host CMake/build/CTest，`input_core_tests`、`input_runtime_tests`、`firmware_source_contract_tests` 共 3/3 通过。新增回归覆盖 fresh InputCore/runtime 且 S6 上电已按住、mount 早于首次实体扫描、held 期间输入抑制、无 Press owner 的释放、HID 未 ready/延迟 ready、发送拒绝、transfer complete/failure、重复 mount、释放早于 mount 首帧完成、旧滚轮不重放，以及释放完成后的新 S6 才重新发送 Ctrl+C。
- 构建：在 ESP-IDF v5.5.5 / target `esp32s3` 下使用隔离 sdkconfig 重建成功；冻结分区为 NVS `0x9000/24K`、PHY `0xF000/4K`、factory `0x10000/3M`、sound A/B 各 576K。当前工作树预构建 app 为 `0x368E0`（223,456 bytes），factory 余量 93%；它只用于代码构建门，不作为最终烧录哈希，最终镜像将在干净提交 HEAD 上重建。
- 来源与范围：更新 `docs/provenance/t03-easyinput-usb-input-runtime.md`，本轮只修改 EasyInput T03 输入/runtime/Host test/模块状态与本记录；外部 Maker 与小智目录未修改、未复制，未使用其 build 产物。
- 硬件状态：尚未扫描端口、识别设备、flash、erase、monitor 或读写 Flash。本轮只声明 `TEST_CONFIRMED` / `BUILD_CONFIRMED`；必须先推送干净提交、重建最终 app、展示 HEAD/SHA-256/app-only 范围并取得用户明确授权，之后才可补刷和连续执行五次 `123`→按住 S6→拔线重连→等 3 秒→松开→`abc`。
- 下一步：完成静态检查、提交和推送；从干净 HEAD 重建最终 app 并申请 app-only 烧录授权。五次结果均为 `123abc` 且旧功能回归通过后才能关闭 T03 并进入 T04。

## 2026-08-25 · Second laptop continuation clarified: T03 then independent T04/T05, original computer audits later

- 做了什么：补充跨电脑交接的后半程，新增受门禁阻挡的 T04 配置/NVS 与 T05 Host Action 任务卡，并把第二台笔记本的叠加分支顺序写入 T03 交接：先修并锁定 T03，再独立完成 T04、T05 的合同冻结、开发、自审、获授权真机验收和推送。
- 为什么：上一版交接只强调“T03 失败时不得提前做 T04/T05”，容易被理解成另一台电脑永远不能继续；用户的真实安排是硬件临时随笔记本外出，由那台电脑连续推进三包，回来后再由原主电脑做独立综合审计。
- 怎么理解：门禁顺序没有放松。T03 未通过不能进入 T04；T04 的完整配置读取合同未冻结，固定 Maker `0x13` 状态/指纹不能冒充完整配置；T05 必须建立在锁定的 T04 上。另一台电脑使用 T03→T04→T05 三个叠加分支，不合并 `main`、不开始 T06。
- 产出路径：`flow/tasks/T04-easyinput-config-nvs.md`、`flow/tasks/T05-easyinput-host-actions.md`、`docs/handoffs/second-computer-t03-cold-boot-reconnect-handoff-2026-08-25.md`、`flow/plan.md`、`docs/README.md` 与本记录。
- 验证：仅修改协作与任务文档；确认 T04/T05 在仓库中此前没有任务卡，确认当前 Host Contract 只有 `INPUT_V1_FROZEN`，配置和 Host Action 仍为 `NOT_FROZEN`。未访问硬件、未构建、未烧录。
- 问题解决：交接现已同时表达“当前不能越过 T03”和“T03 通过后继续独立完成 T04/T05”；后续审计责任明确归回原主电脑，避免另一台自审被冒充为最终合并审计。
- 下一步：第二台电脑拉取最新 `main`，按交接先开 T03 分支；T03 锁定后从其 HEAD 开 T04，再从 T04 HEAD 开 T05。每包推送证据但不合并，用户回来后由原主电脑依次审查三个 diff 和组合回归。

## 2026-08-25 · T03 app-only reconnect fix failed HIL; second hardware laptop takes over T03

- 做了什么：用户按本板合同完整关机/开机后，Windows 只读枚举确认 `VID 303A / PID 1006` 的 Keyboard、Mouse、HID 状态正常且下载端口消失；随后重复“记事本 `123` → 按住 S6 → 拔 USB → 保持按住重连 → 等 3 秒 → 松开 → 电脑键盘输入 `abc`”，Ctrl 仍粘连，`A` 仍触发全选。新增第二台硬件笔记本专用交接文档并更新 T03 状态。
- 为什么：写入与镜像校验成功只证明 app 已正确落盘，真实断线行为仍失败，不能锁定 T03，更不能把 T04/T05 叠加到未解决输入合同上。用户即将携带硬件与另一台笔记本继续开发，需要把失败事实和安全边界先推到 GitHub。
- 怎么理解：`dd7bb69` 的 mount 首帧全释放不是有效 HIL 修复。高可信但待证明的差异是 Host 测试保留同一运行时对象，而 USB 拔线让 ESP32-S3 冷启动且 S6 在启动时已按住；还需验证物理初始采样、`tud_hid_ready()`、transfer-complete 与释放屏障。当前状态为 `T03_HIL_FAILED_CTRL_STICKY_AFTER_APP_REFLASH`，T04/T05 关闭。
- 产出路径：`docs/handoffs/second-computer-t03-cold-boot-reconnect-handoff-2026-08-25.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md`、`docs/testing/t03-first-flash-authorization-card-2026-08-24.md`、`firmware/easyinput-controller/README.md`、`flow/plan.md`、`flow/lessons.md` 与本记录。
- 验证：补刷后 Windows HID 正常启动 PASS；相同 S6 断线测试 FAIL。既有自动化仍为桌面 68/68、固件 Host 3/3、ESP-IDF v5.5.5 构建通过，但这些证据已被真实 HIL 证明缺少冷启动向量。未进行新的 Flash/读取/擦除或小智操作。
- 问题解决：未解决的问题已如实保持开放；S8 继续单列为当前样机烧录前硬件阻断，语音单次请求失败继续单列为可恢复服务异常。Git 外 Flash/NVS/私有身份/日志和构建镜像不上传。
- 下一步：另一台电脑从最新 `origin/main` 创建 `codex/easyinput-t03-cold-boot-reconnect`，先补冷启动 held-key 与传输时序测试，再做最小固件修复、自审和构建；任何补刷需再次展示 app-only 清单并取得用户授权。五次真实断线复测全部通过前不锁定 T03，不开始 T04/T05。

## 2026-08-25 · T03 reconnect fix app-only reflash verified; normal boot retest pending

- 做了什么：用户按精确授权句确认后，短按并松开当前 EasyInput 的 BOOT；本机重新核对唯一下载端口、ESP32-S3 型号、原完整备份中的私有身份和候选镜像哈希，只把 `dd7bb69` 的 app 镜像写入 `0x010000..0x04662F`，随后验证数据哈希并再次匹配私有身份。
- 为什么：T03 断线压力测试暴露 Windows 残留 Ctrl；只需替换 app 即可验证 mount 首帧全释放修复，不应再次改写已经校验一致的 bootloader、分区或用户持久区。
- 怎么理解：写入成功不等于应用已启动或 HIL 已通过。当前板通过手动 BOOT 进入下载模式，必须按本板合同完整关机再开机；最终物理恢复后不再运行 esptool 验身，只用 Windows 枚举和用户行为证明新程序运行。
- 产出路径：Git 外恢复目录保存私有写入日志与写后身份记录；Git 内更新 `docs/testing/t03-first-flash-authorization-card-2026-08-24.md`、T03 任务、固件 README 和本记录。镜像及私有身份未进入 Git。
- 验证：app 222,768 字节，SHA-256 `0F4ABC7FA9A3A1A1FCBF457FA468931468940AFDC49460B8302E1B1DFEB517C8`；esptool 数据哈希验证 PASS；写前/写后身份均与原备份匹配；其他写入范围为零。
- 问题解决：补刷门已关闭，状态进入 `FLASH_VERIFIED_PENDING_NORMAL_BOOT_RETEST`。没有擦除、分区变更、NVS/PHY/声音区/eFuse 写入或小智访问。
- 下一步：用户用板上电源开关关机，等待 2～3 秒后正常开机，绝不再次按 BOOT；随后验证 Windows HID 枚举并复测“按住 S6 拔线/重连/释放后输入 `abc`”、快速旋钮和剩余语音循环。通过后再处理 S8 当前样机豁免并锁定 T03。

## 2026-08-25 · T03 reconnect blocker fixed in code; app-only reflash pending authorization

- 做了什么：依据用户真机压力测试复现语义，确认“按住 S6 拔线并重连后，普通 `A` 仍触发全选”是 host-visible Ctrl 粘连；在 `UsbInputRuntime::on_mount()` 中让新 mount epoch 首先排入全释放键盘报告，并用生产路径 Host 测试锁定首帧、旧队列丢弃和 held-key 抑制。同期完善桌面转写失败分类与历史标记，并把胶囊转写阶段的误导性 `0%` 改为“处理中”。
- 为什么：固件只清内部 router/queue 不能撤销 Windows 在设备突然消失前记住的 modifier；这是 T03 防粘键合同的真机阻断。语音压力中的一次请求失败随后恢复，属于可恢复服务异常，不能与 HID 生命周期缺陷混为同一根因。
- 怎么理解：`main@dd7bb69` 是补刷候选，不是 HIL 已通过版本。当前已通过的真机项包括 S1～S7、旋钮纵向/横向、DeskMate 语音输出、历史复制和快捷键捕获；S8 仍是当前单板烧录前已知硬件阻断。T03 保持 `HIL_REWORK_READY_PENDING_APP_ONLY_REFLASH`，T04/T05 仍关闭。
- 产出路径：`firmware/easyinput-controller/components/input_core/src/input_runtime.cpp`、`firmware/easyinput-controller/host_test/input_runtime_tests.cpp`、`src/services/voicePipeline.js`、`src/pages.jsx`、`electron/overlay-preload.cjs`、相关测试，以及 `docs/testing/t03-first-flash-authorization-card-2026-08-24.md`。
- 验证：桌面 `npm test` 68/68；固件 Host CTest 3/3；ESP-IDF v5.5.5 / ESP32-S3 隔离构建通过，app 222,768 字节，SHA-256 `0F4ABC7FA9A3A1A1FCBF457FA468931468940AFDC49460B8302E1B1DFEB517C8`；`npm run build:desktop` 和打包版烟测通过。未访问设备、未补刷。
- 问题解决：代码层已修复 remount 首帧缺少全释放的问题；语音失败现在以安全类别落历史，后续会话可恢复。仍需真机证明 Windows Ctrl 不再残留，并完成剩余 S1 压力次数。
- 下一步：向用户展示 app-only 补刷范围 `0x010000..0x04662F` 并取得新的明确授权；随后只补刷 app，正常重启后复测 S6 断线场景、快速旋钮和剩余语音循环。全部通过并处理 S8 当前样机豁免后才锁定 T03、整理并推送交接基线，开放另一台电脑的 T04/T05。

## 2026-08-25 · DeskMate voice trigger confirmed; ASR blocked by migrated user-data identity

- 做了什么：依据用户真机截图确认 S1 可正常开始/停止 DeskMate 录音，胶囊能观察到麦克风声音活动；只读追踪“录音完成，等待转写服务”到 STT 降级链路，并在当前 Windows 用户的两个限定应用配置区内仅核对加密凭据是否存在、JSON 是否完整和哪个 localStorage 最近活动，未读取、解密或输出 API Key。
- 为什么：该文案同时覆盖“未配置、密钥不可读、网络请求失败、响应无文字”等多种错误，不能凭截图把问题归咎于固件或 API 失效；项目迁移后应用身份变化也可能让 Windows 加密凭据留在旧 user-data 目录。
- 怎么理解：按键、固件、电脑麦克风和本地声音活动检测均工作；“已听到声音，正在识别”是录音期的本地活动提示，不代表云端 ASR 已调用。当前运行的 `deskmate` 配置区最近活动但没有 `bailian-credentials.json`，旧 `deskmate-ui-demo` 配置区仍有格式完整的加密凭据，因此根因是迁移后的当前应用未配置百炼，不是已证明的 Key 失效。
- 产出路径：`docs/setup/qwen-asr.md`、`flow/lessons.md` 与本记录；没有复制凭据、录音、识别正文或用户数据，也没有调用外部 ASR。
- 验证：当前配置区凭据文件缺失；旧配置区凭据 JSON 存在、加密 Key 字段存在、模型为 `qwen3-asr-flash`；当前配置区 localStorage 在本轮运行时更新，旧配置区约 3.4 天未更新。代码确认所有非 success/no-text 结果都会保存统一占位文案。
- 问题解决：推荐用户在当前 DeskMate 的“设置与诊断 → 账户”重新粘贴自己的百炼 Key并“加密保存并启用”；不直接复制或解密旧密文。后续软件任务应让历史和胶囊显示脱敏后的真实 STT 错误类型，并为 app identity 迁移设计显式、用户确认的安全迁移。
- 下一步：用户重新保存 Key 后先做 1 次短语音验收；若仍失败，再查看脱敏诊断中的 `configuration/timeout/request-failed` 并运行不暴露密钥的连接测试。ASR 成功后继续 T03 的旋钮、断线重连与 20 次 S1；T04 仍关闭。

## 2026-08-25 · T03 normal boot and seven-key HIL confirmed; S8 current-unit hardware block recorded

- 做了什么：用户按板级合同完成关机再开机后，本机只从 Windows PnP 侧确认新固件正常枚举为 `VID 303A / PID 1006`，得到 Keyboard、Mouse 和两个 HIDClass 记录且状态全部正常，下载模式设备已消失；随后用不记录文字的专用窗口逐项验证 S1～S7 正确产生并释放冻结默认动作。
- 为什么：必须把“Flash 写入成功、应用正常启动、USB 枚举和实体输入真机行为”分层取证；同时用户补充当前测试实板的 S8 在烧录前即不亮、无响应，不能把它误记成 T03 回归或把当前单板缺陷扩大成所有 EasyInput 的八键设计变更。
- 怎么理解：当前固件确已运行，S1～S7 为真机通过；S8/GPIO48 的固件路径和产品八键合同继续保留，但当前实板无法提供 S8 HIL，状态为 `HIL_IN_PROGRESS_7_KEYS_PASS_S8_CURRENT_UNIT_HW_BLOCK`。原 EasyInput 0.1.26 只能继续使用依赖标准 HID 快捷键的部分；T03 明确拒绝 Vendor Feature，并未实现配置/NVS、Host Action、网络、板载音频、灯光或声音，因此不能声明原软件完整兼容。
- 产出路径：`docs/testing/t03-first-flash-authorization-card-2026-08-24.md`、`docs/architecture/deskmate-v1-hardware-baseline.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md`、`firmware/easyinput-controller/README.md`、局部 AGENTS/CLAUDE 与本记录；测试窗口只在 Git 外恢复目录，未记录输入正文或设备路径。
- 验证：`303A:1006` 应用枚举 PASS，4 个接口记录、0 个非 OK、下载设备不存在；用户观察和截图确认 S1=`Ctrl+Shift+Space`、S2=`Enter`、S3=`Ctrl+Shift+E`、S4=`Backspace`、S5=`Ctrl+A`、S6=`Ctrl+C`、S7=`Ctrl+V` 均完成按下/释放，S8 无电气响应。
- 问题解决：卡在 S8 的临时验收窗口已停止；S8 记录为“当前测试单元已知硬件阻断”，不改全局 GPIO/八键合同，也不阻塞 S1～S7、旋钮和断线恢复继续验收。是否把量产目标降为七键属于另一个产品决策，本轮不擅自修改。
- 下一步：继续验证旋钮纵向双向、按压切换横向、快速旋转、断线/重连和 20 次 S1；随后启动 DeskMate 做语音/焦点/历史复制回归。全部可测项通过后再决定 S8 采用修板复测还是当前原型硬件豁免；T04 仍关闭。

## 2026-08-25 · T03 three-range first flash verified, pending normal boot and HIL

- 做了什么：在用户对最终三段清单再次明确确认后，重新枚举唯一 EasyInput 下载端口，私下复核其 ESP32-S3 身份与备份对象一致，复验完整恢复备份、三份镜像哈希、干净源码提交和远端主线，然后只写入 bootloader、既有布局的分区表和 T03 app 三段；写后在下载模式再次私下核对同一硬件身份。
- 为什么：首次写入必须把“授权对象、可恢复证据、候选镜像、真实写入范围和写后对象”闭合，不能因用户已经按过 BOOT 就跳过身份与哈希门禁，也不能把烧录工具成功冒充应用/HIL 已通过。
- 怎么理解：三段写入和 esptool 数据校验已经完成；NVS、PHY、双声音 bank、整片擦除、eFuse、分区迁移和小智均未触及。当前板仍在手动下载模式，状态仅为 `FLASH_VERIFIED_PENDING_NORMAL_BOOT_HIL`，还不是 `HIL_CONFIRMED`。
- 产出路径：`docs/testing/t03-first-flash-authorization-card-2026-08-24.md`、`docs/reviews/t03-first-flash-prewrite-audit-2026-08-25.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md` 与本记录；完整 Flash/NVS 备份、私有身份、写入日志和写后 session 继续只保存在 Git 外恢复目录，不提交、不上传。
- 验证：目标数量 1、芯片 ESP32-S3、写前/写后私有身份一致；三份镜像 SHA-256 与最终 manifest 一致；写入 `0x0..0x515F`、`0x8000..0x8BFF`、`0x10000..0x4660F`，三段均获 esptool `Hash of data verified`；未执行 erase-all 或 eFuse 写入。
- 问题解决：本轮没有新的代码、结构、架构或视觉变更；预写阶段发现并修复的分区风险已由既有 D023 和回归覆盖，因此不新增决策或 lessons。
- 下一步：用户用板上电源开关“关机 → 等 2～3 秒 → 正常开机”，不要再按 BOOT。恢复正常启动后，本机先验证 Windows 枚举 `VID 303A / PID 1006`，再逐项执行八键、旋钮、断线重连、20 次语音键和 DeskMate 回归；全部通过前不启动 T04。

## 2026-08-25 · T03 first-flash recovery gate and partition correction completed

- 做了什么：收到用户 T03 首次烧录卡授权后，只识别当前 EasyInput，确认单一 ESP32-S3/16 MB Flash，完成 16,777,216 字节整片 Flash/NVS 备份、可读性和重复 SHA-256 校验；烧录前解析实板分区表，发现 T03 默认 1 MiB factory 表会删除现有 3 MiB factory 与 `sound_a/sound_b`，因此保持零次写入并在本机修正分区合同。
- 为什么：构建通过和应用空间充足不能证明可安全烧录；用户授权明确禁止改分区，且声音 bank 是后续 EasyInput 功能的既有存储合同，不能由当前输入包静默删除。
- 怎么理解：T03 仍只实现实体输入到 USB HID；新增 `partitions.csv` 只是保持现有 Flash 布局，不初始化或改写 NVS/声音资源。首次烧录必须同时满足“完整可恢复备份、候选分区表与实板逐字节一致、写入范围不碰持久数据、最终用户确认”。
- 产出路径：`firmware/easyinput-controller/partitions.csv`、CMake/sdkconfig/Host 分区保护、`docs/reviews/t03-first-flash-prewrite-audit-2026-08-25.md`、`docs/testing/t03-first-flash-authorization-card-2026-08-24.md`、`docs/architecture/deskmate-v1-hardware-baseline.md`、`flow/decisions.md` D023 与本记录；私有备份只在 Git 外恢复目录，不提交、不上传。
- 验证：完整备份 SHA-256 `51B0ECAD795E077FCB8F3964459733CA817FD68B4ACDD755E136549C5CE8C991`；安全修正提交 `2d2f867dba95835f19af35cd0fd872b96748c2db`；Host CTest 3/3；ESP-IDF v5.5.5/ESP32-S3 干净提交构建，app `0x36610`、3 MiB app 余量 93%；最终分区表 SHA-256 `7C541B70DCAC8F920C2D11589F06745E1B033FA9B95B8343DE2748BB8312A278` 且与实板备份逐字节一致；板级扫描 1 PASS/1 已知 constexpr WARN/0 FAIL。设备写入次数仍为 0。
- 问题解决：首次低速整片读取在执行上限前未完成，终止后遗留读取进程占用端口；仅结束与本次恢复路径、COM 口和 esptool 同时匹配的进程，重新核对相同硬件身份后以 921600 完整读取。另发现换 build 目录仍复用源码根生成 sdkconfig，改用隔离 `SDKCONFIG` 后构建保护生效，两项经验已写入 `flow/lessons.md`。
- 下一步：向用户展示最终三段写入范围与哈希并取得最后一次确认；随后 fresh 复核同一私有身份，只写 `0x0..0x515F`、`0x8000..0x8BFF`、`0x10000..0x4660F`，关机再开机恢复正常启动，执行八键/旋钮/断线重连/20 次语音键及 DeskMate 回归。HIL 通过前不启动 T04。

## 2026-08-25 · T03 merge closure self-check completed

- 做了什么：按根级 `AGENTS.md` 与 Project Flow 收工 Hook 复核 T03 合并后的仓库状态、最新交接、稳定决策、踩坑记录、模块入口、任务卡和首次烧录授权卡；确认 `main@fb9a17573a8cf4be76db6aadc8ce4e67fa8c0bd9` 已与远程一致，并修正模块文档中仍残留的“等待合并”状态。
- 为什么：上一轮代码、审计与主线推送已完成，但 `firmware/easyinput-controller/AGENTS.md`、`CLAUDE.md`、`README.md` 和 T03 任务卡仍写成 `READY_FOR_MAIN_MERGE_PENDING_HIL_AUTHORIZATION`，会让下一会话误以为还要再次合并。
- 怎么理解：T03 当前唯一真实状态是 `MERGED_PENDING_HIL_AUTHORIZATION`；代码门已经关闭，硬件门尚未打开。`CODE_REVIEW_CONFIRMED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED` 不能冒充 `HIL_CONFIRMED`，也不授权识别设备、读取 Flash/NVS 或烧录。
- 产出路径：`firmware/easyinput-controller/AGENTS.md`、`firmware/easyinput-controller/CLAUDE.md`、`firmware/easyinput-controller/README.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md`、`flow/plan.md` 与本记录；审计证据继续见 `docs/reviews/t03-easyinput-usb-input-runtime-third-audit-2026-08-24.md`，下一门见 `docs/testing/t03-first-flash-authorization-card-2026-08-24.md`。
- 问题解决：稳定流程决策已在 `flow/decisions.md` D022，生命周期队列/epoch 经验已在 `flow/lessons.md`，本轮没有新的结构、架构、视觉方向或外部资料，不需要改根级 `AGENTS.md`、`DESIGN.md`，也不重复新增决策或踩坑条目。
- 下一步：等待用户明确授权 T03 首次烧录卡；授权后也必须先只识别目标 EasyInput、备份并校验 Flash/NVS、展示目标和写入范围，再进行首次写入与 T03 HIL。授权前不启动 T04，不操作小智。

## 2026-08-24 · T03 third audit fixed locally and merged to main

- 做了什么：审计另一台电脑的第三轮候选 `dbf621fc2ba3dcaf64ab2794708186f5ad8150a0`；确认描述符完整黄金向量与有序生命周期实现有效，并按用户“局部小问题本机直接修”的原则，在原分支直接修复重复 mount epoch 与生命周期队列溢出，提交 `aac2ec9` 后合入 `main`。
- 为什么：重复 `tud_mount_cb` 原先会推进 callback epoch、但 runtime 会忽略重复 mount，后续完成回调因此无法匹配；声明容量 16 的环形队列实际只有 15 个可用槽，且发布失败被静默忽略。这两项都属于边界清楚、可由 Host 回归证明的局部缺陷，无需再跨电脑往返。
- 怎么理解：callback 生命周期状态现为 Host 可测的单一实现；重复 mount 保持同一 epoch，真实 remount 才推进。队列提供完整 16 个槽，第 17 条会饱和计数；owner 检测溢出后丢弃不可信序列、清除在途报告、按 callback 快照恢复并等待实体键释放，避免粘键与旧滚轮重放。
- 产出路径：`firmware/easyinput-controller/`、`docs/provenance/t03-easyinput-usb-input-runtime.md`、`docs/reviews/t03-easyinput-usb-input-runtime-third-audit-2026-08-24.md`、`docs/testing/t03-first-flash-authorization-card-2026-08-24.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md` 与 `flow/plan.md`。
- 验证：CMake 3.30.2 / MSVC Host CTest 3/3；ESP-IDF v5.5.5、target `esp32s3`、Minimal build ON，应用镜像 `0x36610`、最小 app 分区余量 `0xc99f0`（79%）；板级扫描 1 PASS / 1 已知 constexpr WARN / 0 FAIL，人工复核 S1～S8=`2,47,38,41,1,6,7,48`、编码器=`17/16/18`、USB=`19/20`；范围、来源、密钥、ASCII、规则一致、构建产物与 `git diff --check` 均通过。
- 问题解决与下一步：T03 达到 `CODE_REVIEW_CONFIRMED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED`，但尚未 `HIL_CONFIRMED`。本轮未连接/识别设备、未扫描端口、未读取 Flash、未执行 flash/erase/monitor。Maker 没有已确认的独立恢复 `.bin`，因此首次写入前必须先取得用户对“只识别目标设备并备份 Flash/NVS、校验备份、随后烧录 T03”的明确授权；T03 真机矩阵通过前不启动 T04。

## 2026-08-24 · T03 第二轮独立审计继续退回修改

- 做了什么：拉取并在隔离 worktree 审计 `origin/codex/easyinput-usb-input-runtime@24bf3e776c34290c85fc68916513971be970894e`，复核首轮修复、USB 生命周期适配、描述符测试、来源与范围；在本机显式加载冻结工具链重跑 Host 与 ESP-IDF 构建。
- 为什么：首轮两处阻断虽已修正，但进入第一次烧录前必须证明 callback 顺序和完整描述符都受冻结测试保护，不能只依赖另一台电脑的 3/3 与构建结论。
- 怎么理解：旧 key-down 重放和 interface 字符串索引已经关闭，Host 3/3、ESP-IDF v5.5.5 / esp32s3 构建可复现；但独立 mount/unmount 布尔标志会合并并颠倒快速生命周期事件，且所谓“精确黄金向量”只有 device 全量比较，configuration/string/report 仍是局部或语义抽查。T03 保持 `REVIEW_CHANGES_REQUIRED`，不合并、不烧录、不开始 T04。
- 产出路径：`docs/reviews/t03-easyinput-usb-input-runtime-second-audit-2026-08-24.md`、`docs/handoffs/second-computer-easyinput-usb-input-runtime-second-rework-2026-08-24.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md`、`flow/lessons.md`。
- 问题解决：确认返工新增的 ring 全丢弃及 held/released 回归有效，`iInterface=0` 与 `managed_components/` 忽略正确；新发现的生命周期顺序丢失和黄金向量不完整已给出精确返工边界。裸 PowerShell 中 `cmake` 不在 PATH，按冻结规则在同一进程加载 v5.5.5 profile 后验证成功。
- 验证：Host CTest 3/3；ESP-IDF v5.5.5、target esp32s3、Minimal build 成功，镜像 `0x362a0`（221,856 字节），app 余量 `0xc9d60`（79%）；板级扫描 1 PASS/1 已知 constexpr WARN/0 FAIL，人工引脚复核通过；范围、来源、ASCII、AGENTS/CLAUDE、忽略产物与 `git diff --check` 通过。未连接/识别设备，未扫描端口，未读 Flash，未运行 flash/erase/monitor/HIL；隔离 worktree 与产物已删除。
- 下一步：另一台电脑继续原 T03 分支只修生命周期有序传递和四组完整描述符黄金向量，推送新 HEAD 后停止；本机第三轮独立审计通过前不合并 main、不准备烧录授权卡、不开始 T04。

## 2026-08-24 · T03 首轮独立审计退回修改

- 做了什么：拉取并在隔离 worktree 审计 `origin/codex/easyinput-usb-input-runtime@b57d6671a921877835723eebee4252fcdc5c9b92`，核对来源、范围、板级引脚、USB/HID 生命周期、测试、依赖和仓库卫生；用本机精确工具链重跑 Host 与 IDF 构建，并增加临时溢出回归验证恢复语义。
- 为什么：另一台电脑的 3/3 测试与构建通过只能证明现有测试覆盖内成立；第一次烧录前必须独立证明断线、溢出和描述符不会产生粘键或枚举隐患。
- 怎么理解：T03 主体方向正确、原有 Host 3/3 和 ESP-IDF v5.5.5 构建均可重现，但还不是可烧录候选。输入事件 ring 丢 Release 后，owner 先恢复又继续 drain 旧 Press，会重新发出 key-down；HID interface 使用字符串索引 4，而固件只注册 0～2。状态改为 `REVIEW_CHANGES_REQUIRED`，不合并、不烧录、不开始 T04。
- 产出路径：`docs/reviews/t03-easyinput-usb-input-runtime-audit-2026-08-24.md`、`docs/handoffs/second-computer-easyinput-usb-input-runtime-rework-2026-08-24.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md` 和 `flow/lessons.md`。
- 问题→解决：新增临时回归按“S1 Press + 31 个 detent 填满 ring + Release 被丢弃 + 当前 mask=0”稳定复现恢复全零后仍有旧报告，现有 `input_runtime_tests` 因新断言失败；审计临时改动未写回候选分支。另确认 `TUD_HID_DESCRIPTOR` 的 iInterface=4 悬空，并要求补完整描述符黄金向量与 `managed_components/` 忽略项。
- 验证：原候选 Host CTest 3/3 通过；精确 ESP-IDF v5.5.5 / esp32s3 / Minimal build 成功，镜像 `0x36200`、app 余量 `0xc9e00`（79%）。板级扫描 1 PASS、1 WARN、0 FAIL，WARN 是扫描器不识别 `constexpr`；人工引脚复核通过。范围、ASCII、来源、密钥、构建产物、AGENTS/CLAUDE 和 `git diff --check` 通过。本轮未连接/识别设备，未扫描端口，未读 Flash，未运行 flash/erase/monitor/HIL；隔离审计 worktree 及生成产物已删除。
- 下一步：另一台电脑继续原分支按返工提示修复并推送新 HEAD 后停止；本机进行第二轮独立审计。只有回归、描述符、Host 测试和精确 IDF 构建全部通过，才准备 Maker 恢复方案并向用户提交首次烧录授权卡。

## 2026-08-24 · T03 输入合同、任务卡与第二电脑交接已就绪

- 做了什么：把下一功能包正式定义为 T03“实体输入 → USB HID 最小闭环”，冻结 `INPUT_V1_FROZEN` 合同切片，建立另一台电脑可执行的任务卡与复制提示词，并同步项目计划、三端指导书、模块入口及 Codex/Claude 两端规则。
- 为什么：T02 只证明了输入纯逻辑和构建基础，当前固件仍丢弃事件；直接烧录既没有可观察验证价值，也会覆盖现有可用固件。T03 必须先补齐实体采集、默认动作路由、TinyUSB 生命周期、断线防粘键和诊断快照。
- 怎么理解：完整 EasyInput 固件尚未完成。现在只允许另一台电脑在 `codex/easyinput-usb-input-runtime` 实现 `INPUT_V1_FROZEN`；配置/NVS、Host Action/打开应用、BLE/Wi-Fi、音频、GPIO8、DeskMate Link、小智及桌面代码全部继续关闭。合同采用逐切片冻结，不把未讨论能力伪装成已定稿。
- 产出路径：`contracts/deskmate-host/easyinput-input-v1.md`、`flow/tasks/T03-easyinput-usb-input-runtime.md`、`docs/handoffs/second-computer-easyinput-usb-input-runtime-2026-08-24.md`、`flow/plan.md`、`flow/decisions.md` D021、`firmware/easyinput-controller/` 局部入口和 `docs/README.md`。
- 问题→解决：根级 `CLAUDE.md` 落后于 `AGENTS.md`，已补齐三端边界、安全与双电脑规则并恢复逐字一致；模块 AGENTS/CLAUDE 也同步切换到 T03。文档检查通过：ASCII 路径、Markdown 本地链接、根级/模块级规则一致、敏感信息扫描和 `git diff --check` 均通过。本轮没有连接、识别、读取或烧录硬件，未运行 flash/erase/monitor。
- 下一步：把本记录和 T03 准备提交推送到 `main`；另一台电脑从最新 `origin/main` 创建 `codex/easyinput-usb-input-runtime` 严格执行 T03，完成后推送并停止。本机随后独立审计与重建，准备原 Maker 恢复方案，再单独向用户申请首次烧录/HIL 授权；T03 锁定前不开始 T04。

## 2026-08-24 · T02 合并收工自检完成

- 做了什么：按根级 `AGENTS.md` 和 Project Flow 收工规范复核 T02 第二轮审计、合并提交 `216616d`、远程同步、文档分层、仓库卫生及全部验证证据；确认本地 `main` 与 `origin/main` 一致。
- 为什么：把“另一台电脑返工、本机独立复审、主线合并”收束为可供下一会话直接接力的单一事实，避免把代码/构建通过误解为真机已经可用。
- 怎么理解：T02 只锁定 EasyInput 的输入纯逻辑、held-key HID 内部表示和 ESP-IDF 构建基线；当前固件入口仍丢弃采集事件，没有真实 USB 输出或诊断通道，所以 `CODE_REVIEW_CONFIRMED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED` 不等于可烧录或 HIL 通过。
- 产出路径：`firmware/easyinput-controller/`、`flow/tasks/T02-easyinput-input-foundation.md`、`docs/reviews/t02-easyinput-input-foundation-second-audit-2026-08-24.md`、`docs/provenance/t02-easyinput-input-foundation.md`。
- 问题→解决：纠正了返工记录中“板级扫描全部 PASS”的表述为 1 PASS、1 WARN、0 FAIL并人工复核引脚；确认新 PowerShell 进程必须先激活 ESP-IDF v5.5.5 环境，随后 Host 2/2、IDF build、桌面 66/66 与桌面打包均通过。未连接、读取或烧录硬件。
- 下一步：建立单独的下一功能包，先实现边沿安全的按键/旋钮硬件适配与可观察诊断出口；另一台电脑做短分支代码、host test 和无硬件构建，本机复审后再单独准备恢复证据并申请首次烧录/HIL 授权。

## 2026-08-24 · T02 返工独立复审通过并合入主线

- 做了什么：在隔离 worktree 独立审计 `origin/codex/easyinput-input-foundation@7edb0a66187a1e02c26d64aa1470595f659a44ad`，复核首轮问题的修复、任务范围、来源记录和仓库卫生，并在本机精确工具链重新执行 host test 与固件构建。
- 结果：CMake/CTest 3.30.2、MSVC 19.44 下 2/2 host test 通过；ESP-IDF v5.5.5、target `esp32s3`、`Minimal build - ON` 构建成功，镜像 `167216` 字节（`0x28d30`）。T02 达到 `CODE_REVIEW_CONFIRMED` / `TEST_CONFIRMED` / `BUILD_CONFIRMED`。
- 修复确认：`esp_driver_gpio`/`esp_timer` 依赖明确；计时改用单调毫秒且每轮至少让出一个 FreeRTOS tick；held-key 报告覆盖 modifiers、六 usage、并发、幂等、释放与 fail-closed 溢出；测试失败不再弹出 MSVC 模态窗口；来源文件移到根级 `docs/provenance/`，局部规则重新一致。
- 板级检查：自动扫描实际为 1 PASS、1 WARN、0 FAIL，不是“全部 PASS”；WARN 仅因扫描器不识别 C++ `constexpr` 引脚声明。人工复核 S1～S8=`2,47,38,41,1,6,7,48`、编码器=`17/16/18`、USB 声明=`19/20` 正确，GPIO0/GPIO8 未使用。
- 安全边界：本轮未连接、识别或读取设备，未扫描端口，未执行 flash、erase 或 monitor。当前 `main` 只采样并丢弃输入事件，尚无可观察诊断输出，因此该结论不是可烧录、HIL 或真机功能通过。
- 产出：`docs/reviews/t02-easyinput-input-foundation-second-audit-2026-08-24.md`；返工代码与来源记录合入 `main`。下一包应先建立边沿安全的输入适配与可观察诊断出口，再申请独立恢复/烧录/HIL 任务。

## 2026-08-24 · 默认硬件验收主机确认

- 决策：EasyInput 与小智默认连接当前运行 `F:\Codex\deskmate` 主会话的电脑；另一台电脑默认负责短分支代码、host test、模拟器和无硬件构建。
- 例外：用户外出或明确指定临时换机时，才把当轮硬件验收切到另一台；恢复、设备身份、烧录授权和 HIL 门禁保持不变。
- 产出：`flow/decisions.md` D020 与 `flow/plan.md` 双电脑职责已同步。
- 下一步：另一台电脑继续修复 T02；新提交推送后由本机复审、重建，代码门通过后再单独讨论本机真机验收。

## 2026-08-24 · T02 首轮独立审计退回修改

- 做了什么：拉取并只读审计 `origin/codex/easyinput-input-foundation@315e7e2bb2d9298aec3a12cac849445973eb956d`，在隔离 worktree 使用本机精确 ESP-IDF v5.5.5、MSVC、CMake/CTest 重跑候选代码；形成审计报告和另一台电脑返工提示词。
- 结果：原有 host test 1/1 通过，但加入“松键必须清除 modifiers”断言后稳定失败；`idf.py build` 因 `main` 未声明 `esp_driver_gpio` 依赖而失败，因此 T02 当前为 `REVIEW_CHANGES_REQUIRED`，不得合并或烧录。
- 其他问题：主循环以 `tick++` 冒充毫秒，而生成配置为 `CONFIG_FREERTOS_HZ=100`、`pdMS_TO_TICKS(1)=0`；HID 仅能表达单 usage，尚未覆盖并发 held state；MSVC 原始 assert 会弹模态框；模块内误建 `docs/`；AGENTS/CLAUDE 已漂移。
- 板级与安全：静态板级扫描 1 PASS、1 WARN、0 FAIL；WARN 是扫描器不能识别 C++ constexpr，引脚由人工复核正确，GPIO0/GPIO8 未使用。远端提交无密钥、用户数据或构建产物。本轮未连接/识别设备，未读取或写入 Flash，未烧录、erase、monitor。
- 产出：`docs/reviews/t02-easyinput-input-foundation-audit-2026-08-24.md`、`docs/handoffs/second-computer-easyinput-rework-2026-08-24.md`；审计临时 worktree 和生成产物已删除。
- 下一步：另一台电脑继续原分支，安装/激活精确 ESP-IDF v5.5.5，修复审计项并真实通过 host test/build 后推送新提交；本机再次独立审计。任一电脑都可在后续承担 HIL，但必须在代码门通过后另行确认恢复与烧录授权。

## 2026-08-24 · T02 audit rework confirmed

- 状态：`TEST_CONFIRMED` / `BUILD_CONFIRMED`。候选提交 `315e7e2` 的审计问题已在原分支修复；证据仅限无硬件测试与构建，等待另一台电脑再次独立复审。
- 修复：`main` 精确依赖 `esp_driver_gpio`/`esp_timer` 并启用 IDF `MINIMAL_BUILD`；GPIO 配置错误 fail fast；采样改用 `esp_timer_get_time()` 单调毫秒与 `vTaskDelay(1)`。HID 改为平台无关的 held-key 状态，支持 modifiers、最多六 usage、并发/幂等/单键释放/全释放与 fail-closed 溢出。
- 测试：使用 CMake/CTest 3.30.2、MSVC 19.44 运行 `cmake -S firmware/easyinput-controller/host_test -B firmware/easyinput-controller/host_test/build -DCMAKE_BUILD_TYPE=Debug`、`cmake --build firmware/easyinput-controller/host_test/build --config Debug`、`ctest --test-dir firmware/easyinput-controller/host_test/build -C Debug --output-on-failure`，2/2 通过；测试失败通过 stderr 与非零退出报告，不使用会弹窗的原始 `assert`。
- 构建：EIM 已有环境真实报告 `ESP-IDF v5.5.5`；运行 `idf.py -C firmware/easyinput-controller build` 成功，target `esp32s3`，日志为 `Minimal build - ON`，镜像 `0x28d30` 字节，1 MiB app 分区余量 84%。生成的 `dependencies.lock` 固定 IDF 5.5.5/esp32s3；build、sdkconfig、bin、elf、map 未提交。
- 静态检查：返工电脑报告板级扫描 PASS；后续独立复审确认实际输出为 1 PASS、1 WARN、0 FAIL，WARN 是扫描器不识别 C++ `constexpr`。S1～S8=`2,47,38,41,1,6,7,48`、编码器=`17/16/18`、USB 声明=`19/20` 经人工复核正确；GPIO0/GPIO8 未使用，USB 运行时未配置。`git diff --check`、密钥、范围、ASCII 路径与构建产物检查通过；`AGENTS.md`/`CLAUDE.md` 逐字一致；来源记录移至 `docs/provenance/t02-easyinput-input-foundation.md`。
- 安全：未连接、识别或读取设备，未扫描端口，未执行 flash、erase、monitor；两个外部参考目录未修改或复制。下一步只由另一台电脑复审本分支；复审通过后仍须单独建立恢复、烧录与 HIL 授权任务。

## 2026-08-24 · T02 EasyInput input foundation implementation

- 做了什么：在分支 `codex/easyinput-input-foundation` 的 `firmware/easyinput-controller/` 建立 ESP-IDF 5.5.5 / ESP32-S3 工程骨架；实现八个独立低有效按键、20 ms 防抖、多键事件、编码器 Gray-code 四相 detent/非法跳变丢弃/按压防抖，以及平台无关的 8 字节 Boot Keyboard HID 内部表示。
- 为什么：完成 T02 的无硬件可审计代码包，为有硬件电脑独立重跑和审查提供最小输入基础；本轮没有打开配置、音频、BLE/Wi-Fi、NVS、分区、DeskMate Link 或其他功能包。
- 产出：`firmware/easyinput-controller/CMakeLists.txt`、`sdkconfig.defaults`、`main/idf_component.yml`、`components/input_core/`、`main/main.cpp`、`host_test/`、`.gitignore`、`docs/provenance.md` 和更新后的模块 `README.md`。
- GPIO 合同：S1～S8 为 `2,47,38,41,1,6,7,48`；编码器 A/B/按压为 `17/16/18`；USB D-/D+ 仅记录 `19/20`；GPIO0、GPIO8 未使用。未配置 GPIO19/20 外设驱动，未初始化共享音频/LED 电源域。
- 来源：全部代码为按 T02 合同的独立重实现；逐文件来源、参考固定提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`、许可证和采用方式见 `firmware/easyinput-controller/docs/provenance.md`。外部参考目录未修改、未复制、未使用其 build 产物。
- 验证：已执行 `cmake -S host_test -B host_test/build -DCMAKE_BUILD_TYPE=Debug`、`cmake --build host_test/build --config Debug`、`ctest --test-dir host_test/build -C Debug --output-on-failure`，但本机均因命令不存在而未运行；`idf.py --version` 同样不可用，故本轮不能声明 `TEST_CONFIRMED` 或 `BUILD_CONFIRMED`。无设备访问、无端口扫描、无烧录/读取/monitor。
- 状态：代码待工具链可用环境重跑 host test 和精确 ESP-IDF 5.5.5 `idf.py build`；本记录不把未执行结果冒充通过。下一步由有硬件电脑安装/激活冻结工具链后独立审查、重跑并决定是否申请真机验收。

## 2026-08-24 · 双电脑开发起点已推进入仓前状态

- 做了什么：审计并提交此前的桌面修复、三端资料和 V1 硬件基线，形成提交 `dbae59e`；随后建立 `firmware/easyinput-controller/`、`firmware/xiaozhi-yuntai/`、两个合同目录、模拟器目录、局部 AGENTS/CLAUDE 入口、外部恢复基线索引和第一张无硬件任务卡 T02。
- 为什么：另一台电脑必须从正式产品仓的同一事实起点开发，不能在 Maker 或小智参考目录中直接修改，也不能等整个固件写完再一次性审计。
- 当前第一包：`flow/tasks/T02-easyinput-input-foundation.md`。只做 ESP-IDF 5.5.5 构建骨架、八键、旋钮、防抖、USB HID 内部表示和 host test；完成后推送 `codex/easyinput-input-foundation` 并停止。
- 外部资料：另一台电脑按相同路径放置 `F:\Codex\easyinput-wzm\easy-input-maker` 和 `F:\Codex\xiaozhi-yuntai`。它们只读使用，不上传到 GitHub；产品仓只保存路径、提交/哈希和来源记录，见 `docs/provenance/reference-baselines-2026-08-24.md`。
- 恢复证据：Maker 参考固定提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01`，但工作区有未提交资料/host-test 改动且尚无独立恢复镜像；小智无 Git 身份，本机 `build-baseline-20260823` 的五个候选二进制只记录大小和 SHA-256，不上传，也未冒充已验证恢复集合。
- 交接产出：可直接复制给另一台电脑的提示词位于 `docs/handoffs/second-computer-easyinput-start-2026-08-24.md`；正式模块局部入口会把无硬件证据限定为 `TEST_CONFIRMED/BUILD_CONFIRMED`。
- 验证：新增骨架前 `npm test` 66/66；`npm run build:desktop` 通过；候选提交通过密钥、ASCII 路径、构建产物与 `git diff --check` 检查。骨架只含 Markdown/规则，未修改运行时代码。
- 安全边界：没有识别设备、没有接线、没有读取/写入 Flash、没有烧录、没有监视串口、没有驱动舵机；两个外部参考目录均未修改。
- 下一步：提交并推送当前骨架和 T02；另一台电脑 clone 最新 `main` 后严格执行 T02。本机等待其分支，随后做独立代码审计和重复构建，不立即烧录。

## 2026-08-24 · V1 硬件基线与双电脑开发指导书 V2 落地

- 做了什么：把用户确认的方案 A、音频归属、物理叠放、独立供电、三线 UART 和小智云端退出路线沉淀为独立硬件基线；生成并嵌入一张高密度信息图；把原三端指导书重排为“EasyInput 小包开发/审计/单板 HIL → 桌面闭环 → Link 模拟器 → 小智小包开发/审计/HIL → 首次三线联动”的可执行 V2。
- 冻结决定：Windows 日常只连接 EasyInput；EasyInput 是 V1 唯一启用的麦克风与扬声器端点，小智本板音频物理保留但 DeskMate 模式不初始化；小智只做 OLED、表情/状态和双舵机安全动作；两板独立供电，J4 `3V3` 留空，`TXD0→RX / RXD0←TX / GND↔GND` 只传控制、状态和 ACK，不传音频。
- 两电脑流程：无硬件笔记本通过 GitHub 短分支实现代码、host test、模拟器和 IDF build；接硬件电脑逐包独立审查、重建并在另行授权后执行 HIL。不得等整套固件写完才审计，也不得把 `BUILD_CONFIRMED` 冒充真机通过。
- 产出：`docs/architecture/deskmate-v1-hardware-baseline.md`、`docs/assets/hardware/deskmate-v1-hardware-baseline-infographic.png`、`docs/guides/deskmate-three-end-development-guide-2026-08-24.md`、31 页 `docs/guides/DeskMate-three-end-development-guide-2026-08-24.docx`，以及可重复生成的 `scripts/build-development-guide-docx.py`。
- 同步：更新 `AGENTS.md`、`flow/plan.md`、`flow/decisions.md`、`docs/architecture/hardware-connectivity.md` 和 `docs/README.md`；D017～D019 固定 V1 音频、供电与双电脑证据边界。
- 验证：Word 由本机 Office 导出 PDF，以 144 DPI 检查全部 31 页；信息图完整、无空白孤页、表格无截断。a11y audit 为 0 findings，图片为 5.90×7.37 英寸 inline 并带替代文本，标题层级为 18 个 Heading 1 + 55 个 Heading 2。DOCX SHA-256 `DC7ED65503DECFE589F44048E39CC0AECD7BB314512BB93E4FF3F5C9AFB768F5`；信息图 SHA-256 `D4A1BFCAB79B3D0E6CEBB694F15915D07F831000EB419AD2571D07BCC9A28C67`。
- 安全边界：本轮只改文档与生成脚本；没有连接设备、没有接线、没有读取/写入 Flash、没有烧录、没有驱动舵机。当前已经可以启动无硬件的阶段 1～2；焊接、电平和真机阶段仍需照片/测量与单独授权。
- 下一步：在另一台笔记本从 GitHub clone `deskmate`，建立第一个 EasyInput 正式固件小包（板型声明、构建骨架、八键/旋钮/HID host test）；推送独立分支后由本机审查和重建，再决定是否申请第一次 EasyInput 单板烧录。

## 2026-08-24 · 三端开发指导书、UART 路线与长期记忆规划冻结

- 做了什么：综合 DeskMate 当前桌面基线、EasyInput V2.0 板级合同、Maker 参考固件、小智源码/技术地图/组装实物证据和旧版三端指导书，生成一份面向新手、可逐阶段执行的 26 页最新版 Word 指导书；同时把 UART 物理路线、长期记忆/说话人边界和功能包回归门禁同步到项目规则、charter、plan、architecture、decisions 和 lessons。
- 核心结论：EasyInput 是外部总控，小智是安全执行节点，Windows 软件是语音、AI、长期记忆和总编排器；首版两板采用三线 3.3 V TTL UART，`TX→RX / RX←TX / GND↔GND`，J4 `3V3` 留空，两板独立供电，UART 不传实时音频。正式接线前必须先迁移日志、完成 codec/模拟器、坏帧/重启和电平/供电验收。
- 开发流程：相似能力组成一个小功能包；每包按“定向测试 → 两端/三端连通 → 所有已锁定功能回归 → 记录并锁定”推进。任一步失败就停留修复，不叠加下一个功能包；摄像头、温湿度等扩展放在主链稳定后。
- 本地陪伴：人物档案、情节/语义记忆、声纹向量、检索、备份、导出和删除全部在 Windows 本地管理；低置信度询问身份，儿童由监护人管理，声纹不作为高风险操作的唯一凭证，两块板只接收脱敏标签和高层状态。
- 产出：`docs/guides/DeskMate-three-end-development-guide-2026-08-24.docx`（SHA-256 `23E4268D1EFB4262947DB0A8A5150AA1306F77C6AFAF0B2B268DE40307EA7E9F`）、可维护源 `docs/guides/deskmate-three-end-development-guide-2026-08-24.md` 和生成脚本 `scripts/build-development-guide-docx.py`。
- 验证：Word 经本机 Office 导出为 PDF 并以 144 DPI 渲染 26 页，逐页视觉检查完成；中途修复独立列表错误续号；a11y audit 为 0 findings，9 张表全部通过 9,360 dxa 固定几何审计，标题层级为 18 个 Heading 1 + 48 个 Heading 2。文档/流程任务未改运行时代码，因此未重跑 npm 测试或桌面构建。
- 安全边界：没有连接设备、没有带电接线、没有读取或写入 Flash、没有烧录、没有驱动舵机；外部固件、原始照片、旧 Word 和构建产物均未复制进产品仓。
- 下一步：先完成 DeskMate 当前桌面人工验收和 Maker 配置安全读改写闭环；然后按指导书阶段 2～5 建立正式两套固件骨架、冻结 DeskMate Link v1 并完成电脑模拟器，最后再申请第一次三线 display-only 真机联动。

## 2026-08-24 · 小智实物、端口与动作控制增量收口

- 做了什么：完整读取 `F:\Codex\xiaozhi-yuntai\docs\xiaozhi-yuntai-today-handoff-copy-2026-08-24.md`，并复核其直接引用的硬件/后台控制地图、更新后安全地图、接口清单和能力矩阵；把新增可信事实、检索路径、哈希、端口边界、人脸跟随目标和动作仲裁约束收口到 DeskMate 的精简参考索引、硬件连接图、计划和稳定决策。
- 为什么：用户已经完成小智云台组装和现场控制，未来要把它接入 EasyInput 总控；DeskMate 需要知道去哪里查、哪些接口能做什么，同时不能把教程照片或调试口误写成已冻结的板间协议。
- 怎么理解：顶部 USB-C 是烧录入口，底部 USB-C 是充电入口；GPIO11/12 是 yaw/pitch 舵机内部 PWM，GPIO41/42、GPIO5/4/6、GPIO15/16/7 分别被 OLED、麦克风和功放占用。UART0 115200 与 USB Serial/JTAG 当前只有日志/调试能力，没有 DeskMate 应用 framing；板间传输仍须在 LAN/UART/USB CDC/BLE/云 MCP 中基于硬件证据选择。
- 新目标：首版人脸检测优先放在电脑侧，只发送归一化坐标/高层动作；小智端由唯一动作仲裁器统一处理对话动作、人脸跟随、回中和待机动画，强制限幅、限速、超时、丢脸回中与急停。用户未安装 PAJ7620U2，它也不能替代摄像头。
- 产出：更新 `docs/references/xiaozhi-yuntai-integration-reference.md`、`docs/architecture/hardware-connectivity.md`、`flow/plan.md`、`flow/decisions.md`；未复制外部固件、原始 DOCX、照片、提取图片或构建产物。
- 验证与边界：只读核对外部资料；交接 SHA-256 `EFDC290798E3AF1AEB27269418B725E1368CE1363680C7B87B8720C451274F51`，新增硬件地图 SHA-256 `31662C52E0887B4A24160D83D8DCE0744555E5A5E11BBBA6B3DFEBA804DE630B`。未连接设备、未读取或写入 Flash、未烧录、未执行舵机动作。
- 下一步：继续完成桌面人工复测；准备板间方案时先取得小智 PCB/接口电气证据，比较传输候选并起草只读 `get_capabilities/get_status` 合同与宿主模拟器，再讨论接线和真机操作。

## 2026-08-23 · 桌面人工测试问题修复与安全同步门禁

- 做了什么：根据用户首轮人工复测，修复备用语音快捷键的物理组合键捕获/确认、历史复制误报、全局语音触发强制跳页和默认不输出到当前输入框；重构按键映射为结构化动作，补齐旋钮旋转/短按配置和“打开应用”的搜索、选择、测试打开与 UUID 映射；实现 Maker `0x10` 配置编码、`0x11` 配置确认/Host Action 解码和 Windows 原生厂商 HID 长度校验。
- 为什么：原界面有可见控件但多处仍是演示行为，导致用户无法按正常输入产品的方式验证；同时 Maker 配置是整份覆盖，不能为了恢复同步按钮而冒险清空板上已有网络/音频配置。
- 关键行为：VoiceWorkflow 全程保持单例挂载，快捷键和实体键只弹底部胶囊且不切页面；当前窗口输出默认开启并保留剪贴板回退；复制只在 Electron 剪贴板返回成功后提示成功；应用路径只存在主进程，固件/渲染进程只使用 UUID。
- 安全边界：本机按键、旋钮和打开应用设置可保存、可测试；“同步到键盘”按钮已恢复但当前明确拦截实际写入，直到完成读取并合并板上完整网络、音频和按键配置。未烧录、未写 Flash、未向实板发送厂商 HID 配置、未改外部参考仓。
- 产出：`src/domain/shortcutCapture.js`、`src/domain/keymap.js`、`electron/easyinput-config.cjs`、`electron/app-actions.cjs`、`electron/input-bridge*.cjs`、`native/DeskMate.InputBridge/Program.cs`、相关 UI/IPC/状态迁移与测试；完整人工清单在 `docs/testing/voice-loop-acceptance.md`。
- 来源：只读复核 `F:\Codex\easyinput-wzm\easy-input-maker@7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的协议证据；该参考工作区本身有未提交内容，本轮未修改、未复制外部源码或二进制。详细记录见 `docs/references/upstream-sources.md`。
- 验证：`npm test` 66/66；输入桥自包含发布成功；`DeskMate.InputBridge.exe --self-test` 正确输出 F22、Host Action、配置确认与断开事件；`npm run build:desktop` 通过；打包版 `--deskmate-smoke-test` 退出码 0；`git diff --check` 仅报告既有 CRLF→LF 提示，无空白错误。
- 下一步：由用户按人工清单复测快捷键、Codex 输入、历史复制、不跳页、旋钮和打开应用；随后实现厂商 HID 的安全“读取完整配置 → 差异确认 → 合并写入 → 保存确认”闭环，再开放真机同步。

## 2026-08-23 · 小智五份地图收口与软硬件产品边界更正

- 做了什么：完整读取 `F:\Codex\xiaozhi-yuntai\docs` 的基线报告、能力矩阵、硬件安全地图、接口清单和技术地图；新增 DeskMate 正式集成交接与小智精简参考索引，并同步修正根规则、charter、plan、总体架构、硬件连接、路线、上游来源和稳定决策。
- 为什么：用户确认 `F:\Codex\deskmate` 最终同时交付 Windows 软件、EasyInput 总控固件和小智云台固件；外部两个固件目录只是参考源。此前“只做 companion、固件长期独立”的交接已不符合产品边界。
- 怎么理解：目标主链为“Windows 软件 ↔ EasyInput 总控固件 ↔ 小智云台固件”。EasyInput 板承担外部硬件总控，小智板通过高层控制器安全执行表情/双舵机/屏幕/本板音频；板间传输仍为 UNKNOWN，需先冻结 host contract 与 DeskMate Link v1。参考源码不整仓复制，正式迁入需逐文件来源和许可证审计。
- 产出（路径）：`docs/handoffs/integrated-project-start-2026-08-23.md`、`docs/references/xiaozhi-yuntai-integration-reference.md`、`docs/architecture/system-overview.md`、`flow/charter.md`、`flow/plan.md`、`flow/decisions.md`、`AGENTS.md` 及相关索引。
- 验证：五份外部地图均完整读取；小智 ESP-IDF 5.5.3 的 2,266/2,266 构建仅作为外部 `BUILD_CONFIRMED` 证据；本轮本仓仅改 Markdown，`git diff --check` 通过，新增/修改文档的本地 Markdown 链接全部可解析，未运行代码测试、未访问设备、未烧录或驱动舵机。
- 问题→解决：早期交接保留了“两个固件是独立交付”的旧判断，已新增最终真相源并在旧交接顶部标为被取代；Maker 项目自有代码为 PolyForm Noncommercial、小智根源码为 MIT，已把来源/许可证门禁写入根规则和决策。
- 下一步：先由用户人工复验迁移后的 DeskMate 桌面软件，再冻结正式模块目录、来源清单和两块实板可用接口；随后从 `get_capabilities/get_status` 的无机械风险纵向切片开始本项目开发。

## 2026-08-23 · 小智云台独立分析指导交接

- 做了什么：只读核对 `F:\Codex\xiaozhi-yuntai` 的当前板型、构建配置、板级引脚、启动/网络/音频/表情/舵机/MCP 入口和旧构建元数据，新增一份可直接交给独立 Codex 任务的固件消化、组装调试、能力验收与技术地图指导书，并补充总交接和文档索引指针。
- 为什么：小智不是 EasyInput 式 Windows 配套 App 设备；它主要在 ESP32-S3 上独立运行并经 Wi-Fi 接入 `xiaozhi.me`。如果新任务只看舵机文件或直接烧录，会混淆板内能力、云端依赖、机械/供电风险和未来 DeskMate 本地接口。
- 怎么理解：先把小智作为独立产品建立“来源/配置 → 当前路径构建 → 断电接线 → 分层上电 → 单项真机证据 → 技术地图”的可信基线；当前源码确认首次 AP+浏览器配网、WebSocket 或 MQTT+UDP、MCP 和双舵机能力，但尚未确认本地 DeskMate 控制协议，不能猜 UART/BLE 接口。
- 产出（路径）：`docs/handoffs/xiaozhi-yuntai-analysis-guide-2026-08-23.md`；入口更新于 `docs/handoffs/development-start-handoff-2026-08-23.md` 和 `docs/README.md`。
- 问题→解决：当前小智目录没有 `.git`，`sdkconfig`/`dependencies.lock` 又在忽略范围内，且旧 `build/project_description.json` 仍绑定 `D:\oldxiaozhi\...`；指导书要求先盘点有效配置、使用 lock 中 IDF 5.5.3 建立本路径构建证据，并把源码、构建、设备和用户观察分级，禁止把旧 build 或构建通过冒充真机通过。
- 下一步：在小智独立任务中先执行指导书首轮提示词，只读建立目录/启动/接口地图并重建软件基线；用户提供实物照片和原理图后再做断电接线、供电与机械限位核对，烧录必须另行给出设备授权卡。

## 2026-08-23 · EasyInput Maker 技术地图交接

- 做了什么：依据 Maker 当前仓库、公开文档、核心 header/source、宿主测试和 EasyInput V2.0 板级知识，新增一份面向 DeskMate 新会话的 Maker 技术地图；补充总交接与文档索引指针。
- 为什么：新的三端开发不能靠复制整个固件或让 Agent 临时猜入口，需要把目录职责、纯逻辑/平台分层、配置/Keymap/事件/USB/BLE/Wi-Fi/状态/声音接口、硬件护栏和测试入口集中交付。
- 怎么理解：DeskMate 读取并实现 Maker 协议的电脑端适配；Maker 保持独立上游。`components/keyboard` 是协议与业务逻辑第一入口，`main/platform` 是 ESP-IDF/硬件适配，`host_test` 是预期行为证据；Host Action `0x05` 只负责打开应用，不能被改造成小智通信协议。
- 产出（路径）：`docs/handoffs/easyinput-maker-technical-map-2026-08-23.md`；总入口更新于 `docs/handoffs/development-start-handoff-2026-08-23.md` 和 `docs/README.md`。
- 问题→解决：Maker 工作区存在未提交宿主测试兼容与 flow/教学记录，技术地图明确禁止自动清理；历史 60/60、构建、烧录和 HID 枚举与仍未完成的 Host Action 真实功能矩阵已分层记录；GPIO、BOOT、GPIO8、USB、音频和 J4 UART0 均按当前板级证据标注。
- 下一步：小智独立会话先建立其非 Git 源码拷贝的可追溯基线并产出同结构技术地图；随后 DeskMate 会话使用两份地图冻结 DeskMate Link v1 和第一条 `KEY1 → DeskMate → happy_nod` 最小闭环。

## 2026-08-23 · DeskMate 三端开发新会话交接

- 做了什么：只读核对独立 DeskMate 软件仓库、EasyInput Maker 固件仓库和新复制的小智云台源码，新增一份可直接交给新会话的三端状态、边界、12 步开发路线和首轮任务说明；同时把该交接加入文档索引。
- 为什么：用户将转入新的 DeskMate 开发会话，需要把课程资料、正式软件、两个固件以及“历史通过”和“本轮未验证”分开，避免新 Agent 复制混仓、一次性大改或误用旧构建。
- 怎么理解：`F:\Codex\deskmate` 已经是正式产品根，不应再嵌套第二套项目；Maker 与小智继续作为独立兄弟工程。开发节奏是“分别建立可信基线和能力地图 → 一条最小三端闭环 → 一个技能一个技能扩展”，不是全部单板功能做完后才联调，也不是三端一次性重写。
- 产出（路径）：`docs/handoffs/development-start-handoff-2026-08-23.md`；索引更新于 `docs/README.md`。
- 问题→解决：发现 Maker 当前含未提交的 Windows 宿主测试兼容与 flow 记录，已明确禁止擅自清理；发现小智源码拷贝没有 `.git` 且旧 build 绑定 `D:\oldxiaozhi\...`，已把建立可追溯基线和新路径重建列为前置门；DeskMate 迁移包虽有 60/60 和构建记录，但用户尚未亲自复验，保持为首轮任务。
- 下一步：新会话先只执行交接中的第 1～2 步——读取项目规则、核对三个起点、在 DeskMate 根重跑迁移后测试与桌面构建并由用户人工检查现有功能；迁移完整性确认前不修改两个固件。

## 2026-08-23 · Standalone repository migration

- 做了什么：从旧的混合学习仓库抽取 DeskMate 最新 Phase 3D 可运行代码，迁移到 `F:\Codex\deskmate`；建立英文目录结构、Project Flow 控制面、产品/架构/协议/测试/设计索引和新 Git 历史。
- 为什么：旧工作区包含空格、中文目录、课程资料、参考仓库和多个阶段任务，容易把构建产物、学习资料与正式产品混在一起。
- 怎么理解：`DeskMate` 现在是唯一产品边界；课程资料留在旧区域，外部固件只通过固定提交与协议文档引用。
- 主要产出：根目录应用源码，`flow/`，`docs/`，`design/`，`AGENTS.md`，`DESIGN.md`，`README.md`。
- 已确认基线：旧源分支 `codex/easyinput-desktop-continue`，提交 `25b52540e0ec3e129760b15f3591d286be41d31b`；迁移前 `npm test` 60/60、桌面构建通过。
- 新仓库验证：Project Flow 上游 Stop Hook 测试通过；`npm ci --include=dev` 通过；`npm test` 60/60；`npm run build:desktop` 通过；打包程序 `--deskmate-smoke-test` 退出码 0；提交候选不存在中文路径或常见密钥值。
- 外部事实：Maker 固件固定提交已公开板载麦克风 UDP 与厂商 HID 合同；当前产品仍默认电脑麦克风，真实 Agent 与未来硬件仍是模拟/待接入。
- 问题与解决：Windows tar 对中文路径解码失败，改用临时 Git worktree；Project Flow 测试缺少 jq，使用临时固定版本 jq 1.7.1 完成测试，不把工具带入仓库。
- 下一步：按 `flow/plan.md` 实现 Phase 3E 协议编解码和模拟板；有硬件的电脑最后做真机验收。
