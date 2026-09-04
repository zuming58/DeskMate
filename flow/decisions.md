# Decisions

## D088 - The realtime Bridge is the mandatory front door for every completed utterance

- Date: 2026-09-04
- Decision: every accepted companion `asr.final` is synchronously presented to one Bridge before the turn may remain provider free chat. Trusted task status is resolved from `codex-task-brief-v1` snapshots before any general answer; application and motion controls remain closed allowlists. A Bridge-owned turn suppresses provider-generated chat output and sends its exact bounded answer through the configured Doubao session.
- Latency: ordinary conversation is still explicitly inspected by the Bridge but is immediately returned as pass-through without a second model request. Only an ambiguous control-like sentence may use the bounded intent classifier. This avoids adding text-model latency to every normal conversational turn while removing the former post-hoc observer race.
- Timing: end-of-utterance silence and whole-session idle listening are independent. The user-facing default/selected endpoint wait is five seconds; 60 seconds means how long an otherwise quiet companion session remains available for another utterance and must never delay an already completed utterance.
- Announcements: proactive Codex brief speech has one persisted software switch. Turning it off does not delete or stop bounded reports and does not disable explicit status queries. When enabled, permitted brief states use provider-native Doubao speech and the existing voice-owner arbitration.
- Boundary: Bridge diagnostics remain content-free. Task identity still comes only from the reporting task's opaque key and visible label; DeskMate does not monitor processes, folders, prompts, replies, commands, window titles or raw chat transcripts. This decision changes Windows software only and does not change firmware, Host HID, DeskMate Link, audio transport or motion behavior.

## D087 - Codex progress questions are deterministic provider-owned turns

- Date: 2026-09-03
- Decision: an explicit spoken Codex progress/status question bypasses the language-model intent classifier. DeskMate resolves it only against the in-memory `codex-task-brief-v1` snapshots and the content-free `codex-hook-v1` fallback. After the official Doubao `ASREnded` boundary, it sends the exact local answer through provider `ChatTTSText`; generated free-chat partial/final text for that turn is suppressed so a plausible but untrusted answer cannot win.
- Multi-task selection: every reporting task owns an opaque `taskKey` plus a user-visible `taskLabel`. A unique normalized label or label term selects one task; multiple active tasks, or multiple labels sharing the spoken term, require disambiguation. For 60 seconds after that prompt the next utterance may contain only the complete task name. DeskMate retains at most eight recent snapshots and keeps spoken candidate lists bounded.
- Boundary: DeskMate knows only tasks that actively report through the repository-local reporter. It does not infer identity or progress from process lists, project folders, prompts, replies, tool parameters, window titles or chat content. A global all-project Codex view remains a later separately installed and authorized reporter/plugin. This is Windows-only and changes no firmware, HID, Link or motion behavior.

## D086 - Trusted Codex briefs use the Doubao companion session, not system TTS

- Date: 2026-09-03
- Decision: audible `codex-task-brief-v1` announcements must use the configured Doubao realtime provider. Renderer/browser `speechSynthesis`, Windows system TTS and a second speech stack are forbidden for this path. A first brief starts a bounded companion session through provider `SayHello`; a subsequent brief may use provider `ChatTTSText` only when the existing session is listening.
- Conversation: provider playback keeps microphone upload blocked. After the playback drain, the same versioned companion state machine returns to `listening` and resumes the selected microphone, so the user may speak directly without a wake phrase. This does not implement always-on wake: once the session ends or reaches its no-speech timeout, a button, F22/EasyInput call action or another trusted brief is still required to start listening again.
- Arbitration: a brief must not preempt dictation, another voice owner or a companion that is speaking/thinking/busy. In those cases the bounded report is still stored and shown but is not spoken. The repair changes Windows software only and does not change audio transport, HID, DeskMate Link or either firmware.

## D085 - Automatic contextual motion is opt-in, semantic and non-queueing

- Date: 2026-09-03
- Decision: T15C is a Windows-only coordinator over the user-accepted T15D semantic choreography path. One persisted total switch defaults off; optional idle search defaults off separately. Companion start maps to one `attention`, continuous thinking to one `search` after four seconds, a completed deterministic confirmation to one `nod`, and trusted Codex completion to one `nod` while the existing completed Agent state owns the expression.
- Priority: emergency/fault and recovery remain above manual control; manual and explicit voice motion remain above context; idle is lowest. If a higher-priority owner, voice workflow, another motion, disconnect, emergency or fault blocks an automatic request, it is dropped without queueing or replay.
- Idle: the first version uses one fixed 90-second interval, inside the approved 60–120 second range. Active voice or companion work suppresses it. Dance is never automatic and still requires an explicit button, explicit voice intent or the user-activated custom dance.
- Boundary: no HID/Link contract or firmware changes. The coordinator emits only `attention`, `nod` and `search` through `ChoreographyService`; it cannot send PWM, GPIO, pulse width, arbitrary angle or manual-step streams. User-present physical acceptance remains open even after code/build verification.

## D084 - Motion adjustment uses independent bounded degrees and speed caps

- Date: 2026-09-03
- Decision: D083's three shared profile labels are superseded. `动作设置` exposes four numeric controls shared by quick actions, custom choreography and explicit voice motion: Yaw amplitude `4..40°`, Pitch amplitude `4..20°`, Yaw speed cap `20..100°/s`, and Pitch speed cap `20..100°/s`. Defaults are `20°`, `15°`, `80°/s`, `80°/s`.
- Reference: the read-only original Xiaozhi board configuration fixes Yaw at center `90°` with `50..130°` limits and Pitch at center `90°` with `70..110°` limits. The exact source snapshot and behavior comparison are recorded in `docs/provenance/t15d-adjustable-motion-reference-audit-2026-09-03.md`.
- Ownership: Windows sends center-relative semantic amplitudes and per-axis speed caps with the complete beat program. EasyInput validates and forwards only. Xiaozhi maps direction tokens to targets, applies the per-axis speed caps in the single scheduler, and clamps again through `MotionSafetyCore` and the accepted Stage 2 adapter.
- Boundary: degrees are user-facing logical semantics, not measured shaft position and not raw servo control. No contract accepts PWM, pulse width, duty cycle, GPIO, absolute electrical targets or unbounded speed. Existing center, stop, disconnect, fault and emergency behavior remains mandatory.
- Compatibility: Host V2 keeps HID `0x1A/0x1B` and Link V2 uses additive `0x26/0x27`. Windows emits only V2; both firmware ends retain V1 decoding for rollback. Both boards require separately authorized app-only updates before the new settings can affect the real device.

## D083 - Motion adjustment is a bounded endpoint-owned profile, not raw servo control

- Date: 2026-09-03
- Decision: Settings contains one shared `动作设置` surface for fixed quick actions, custom choreography and explicit voice motion. The only controls are strength `柔和/标准/明显` and tempo `舒缓/标准/利落`; changes apply from the next physical action. A saved choreography may separately become the default program for the semantic `dance` action.
- Mapping: Windows sends only closed enum values. Xiaozhi maps strength to fixed Stage 2 poses (Yaw about 6/8/10 degrees, Pitch up about 2/3/4 degrees and down about 3/5/6 degrees) and maps tempo to beat holds of 1.5/1.0/0.5 times the editor duration. Xiaozhi still owns interpolation, limits, center and stop behavior.
- Boundary: the renderer, IPC, HID and Link contracts accept no arbitrary angle, velocity, PWM, pulse width, duty cycle or GPIO. Settings do not change manual control, bypass readiness, weaken emergency stop or prove measured motion. Physical effectiveness remains a user-present HIL gate after separately authorized app-only updates to both boards.
- Superseded by D084 for the setting representation and numeric mapping. Its shared-surface, endpoint-ownership and safety conclusions remain valid.

## D082 - Memory management is a shared top-level surface with a fixed first-version organizer

- Date: 2026-09-03
- Decision: long-term memory management belongs to one standalone primary-navigation page because both completed companion turns and successful real dictation feed it. AI Companion may create one source of events but does not own the review, schedule, index, export, forget or knowledge-base controls.
- Rules: the first-version organizer prompt is product-owned rather than user-editable. Successful source text stays unchanged in authoritative SQLite; the model creates source/day summaries and review candidates from untrusted data; only user-approved candidates become long-term memory and enter the local chunk/embedding index. Managed Markdown remains a derived projection below the user-selected directory.
- Boundary: the fixed prompt excludes sensitive attributes, credentials, full paths, device identifiers, voice-edit instructions, mock and failed input. Source participation and schedule remain configurable, but allowing arbitrary prompt text would make retention behavior unpredictable and is not added in this slice.

## D081 - Specific recoverable motion results outrank generic endpoint state

- Date: 2026-09-03
- Decision: when a valid runtime-motion status contains generic `state=not-ready` together with specific `result=recenter-required`, Windows classifies it as recoverable and runs the existing automatic stop-and-center preparation before RUN. Generic `not-ready` remains fail-closed when no recognized recovery result is present.
- Evidence: the flashed Xiaozhi endpoint truthfully reports adapter available, no fault, no emergency latch, output enabled and logical center not yet accepted after startup. The earlier ordering returned before center preparation even though the full three-end status path was healthy.
- Boundary: this is a Windows interpretation correction only. It does not weaken fault/emergency/adapter gates, invent readiness, replay commands, change any HID/Link byte or prove physical movement. RUN still waits for a correlated completed READY terminal after centering.

## D080 - Runtime motion uses its own FF00:0009 Windows HID collection

- Date: 2026-09-03
- Decision: EasyInput runtime motion Feature/Input reports `0x18/0x19` belong exclusively to top-level collection `FF00:0009`. Manual calibration `0x16/0x17` remains exclusively on `FF00:0007`; configuration `0x10..0x15` remains on `FF00:0002`. The Windows native bridge must select the exact collection tuple and report lengths for each family and expose their availability separately.
- Evidence: on the flashed T15 device, a frozen manual status request succeeds through `FF00:0007`, while a frozen motion status request fails at `HidD_SetFeature` before firmware because the native contract incorrectly routes `0x18` to `FF00:0007`. The descriptor and firmware already expose motion on `FF00:0009`, so this is a Windows-only correction and does not authorize or require a firmware write.
- Boundary: collection enumeration proves only that the Windows interface exists. Preset success still requires correlated Windows intent, EasyInput acceptance, DeskMate Link terminal state and user-observed physical motion; a writable collection must not be treated as endpoint or mechanical evidence.

## D079 - Companion and dictation memory share one reviewed store but remain separate sources

- Date: 2026-09-03
- Decision: DeskMate extends its existing Electron-owned SQLite memory store instead of adding a second memory subsystem. Every source event is explicitly `companion` or `dictation`; daily summaries, pending candidates, review state, deletion and knowledge-base projection retain the source so the user can manage them together or separately.
- Capture: companion uses completed real conversation turns. Dictation uses only the final text already committed by DeskMate voice input/organization and never reopens the microphone or captures audio, clipboard contents, target-window titles or paths. Existing rows migrate to `companion`; ingestion and daily processing are idempotent.
- Scheduling: each source has an independent participation switch. A local daily time defaults to 23:30 while the app is running; missed dates are processed on the next start. Summary generation is keyed by source, local day and an input digest, produces no empty documents and remains retryable when the configured model is unavailable.
- Trust and projection: model output is a candidate only and cannot enter long-term context until the user reviews it. Source text is untrusted data, not instructions. SQLite stays authoritative; source/day summaries are projected to `DeskMate/daily/<source>/YYYY-MM-DD.md` only below the managed directory selected by the user, with stable IDs, source metadata, conflict protection and no scan of unrelated content.
- Projection trigger: after a scheduled or manual digest commits, Electron automatically projects the current SQLite snapshot when a knowledge-base directory is configured. Missing configuration is an explicit non-error skip. Projection conflicts or write failures never roll back the digest and surface only fixed, bounded warning codes with manual retry through “同步双链”.
- Boundary: both sources default enabled but may be disabled independently, including both off. Voice edit, mock STT, failed/cancelled transcription and audio bytes remain excluded. This is Windows-only and does not change either firmware, audio transport, HID, DeskMate Link, OLED or servo behavior.

## D078 - Custom choreography is a bounded endpoint-owned beat program

- Date: 2026-09-02
- Decision: T15D adds a separate Custom dance editor while retaining the four T15 quick actions. A program contains 2–8 aligned beats across Yaw, Pitch and Expression rows. Same-column values start together; columns run sequentially at one bounded 400/600/800/1000 ms beat duration and the full program repeats 1–3 times.
- Motion semantics: Yaw is hold/left/center/right and Pitch is hold/up/center/down. Xiaozhi maps those tokens to its Stage 2 safe poses; Windows never sends angle, range, speed, PWM, pulse width, duty cycle or GPIO and never simulates choreography by replaying manual one-degree commands.
- Expression semantics: each beat may hold or select one of the existing seven Agent display states. Xiaozhi temporarily owns a choreography display lease, then restores the latest external Agent state on normal completion, stop or recovery. Emergency stop and fault remain highest priority.
- Sequencing: the Windows editor, persistence, validation and software preview may proceed in parallel, but real execution controls stay fail closed. New Host/Link report IDs and firmware wire are not frozen until the current four T15 fixed presets pass user-present physical HIL; every new firmware image still needs separate app-only authorization.

## D076 - Runtime presets are semantic endpoint-owned trajectories

- Date: 2026-09-02
- Decision: the accepted T10D-D `0x16/0x17` and `0x20/0x21` path remains a manual calibration/control surface. T15 adds a separate semantic runtime-motion path; Windows names a bounded preset and repeat count, EasyInput validates and forwards one request, and Xiaozhi alone expands it into calibrated trajectory targets through the existing `MotionSafetyCore` and real adapter.
- Presets: `attention`, `nod`, `search`, and `dance`. Repeat count is the only exposed motion parameter and is restricted to `1..3`; defaults are one for attention/search and two for nod/dance. Normal completion returns both axes to the accepted center.
- Safety/lifecycle: one preset at a time, no backlog, no replay after disconnect/restart, and no automatic motion on connection. Emergency stop/fault, recovery/recenter, manual control, explicit presets, dialogue actions and idle actions retain descending priority. The wire never contains an angle, PWM, pulse width, duty cycle or GPIO.
- Product sequencing: real preset buttons and user-present HIL precede voice or autonomous triggers. Automatic motion stays disabled until preset HIL passes.

## D077 - Voice app launch and Codex briefing use explicit bounded authorities

- Date: 2026-09-02
- Decision: a registered Windows application may launch without a per-command confirmation only after the user explicitly enables voice launch for that opaque AppAction. Existing registrations migrate disabled; raw paths, arguments, URLs, shell commands and unregistered targets remain invalid.
- Codex: `codex-hook-v1` remains authoritative for coarse lifecycle. Richer progress is accepted only from an opt-in repository-local `codex-task-brief-v1` reporter carrying an opaque task key, explicit user-facing task label, bounded state, milestone and sequence. DeskMate does not inspect prompts, replies, tool parameters/results, paths or window titles and does not install a global Codex plugin.
- Presentation: task start speaks once, ordinary milestones are throttled to at most one per 15 seconds, and waiting/completed/error may speak immediately. Voice status questions use deterministic stored facts and never ask the language model to invent progress or completion percentages.
- Compatibility: this supersedes D065's per-call confirmation only for explicitly voice-enabled registered applications. It does not weaken AppAction target validation. The T15 transport is now integrated, but motion intents remain disabled until the four physical presets and emergency-stop sequence pass user-present HIL.

## D075 - Emergency-stop clearing is an explicit verified restart transaction

- Date: 2026-09-02
- Decision: a latched manual-control emergency stop is never cleared by application startup, reconnect, status polling or an ordinary start. Windows may discover the latch with a read-only query, but only the user-visible `解除急停并重新开始` action with the environment confirmation checked may request one clear.
- Transaction: every recovery click performs fresh status → `clearEmergencyStop` → correlated terminal with `state=locked` and `emergencyStopped=false` → the existing serial Yaw/Pitch center establishment. Direction controls remain absent until the whole sequence succeeds.
- Boundary: clear reuses the frozen T10C operation and existing coordinator. It does not alter emergency-stop priority, wire values, firmware, motion parameters or lifecycle locks. Failure or ambiguous terminal evidence leaves the endpoint and UI fail closed.

## D074 - Manual direction labels follow observed mechanism semantics, not wire-sign intuition

- Date: 2026-09-02
- Decision: for the accepted Stage 2 assembled mechanism, Windows maps left/right to Yaw `-1/+1` and up/down to Pitch `-1/+1`. The frozen T10C direction field remains a signed one-step wire value and does not itself define words such as “raise” or “nod”.
- Evidence: user-present HIL proved the earlier up → Pitch `+1`, down → Pitch `-1` mapping inverted the visible vertical result while the route, centers and horizontal mapping worked.
- Boundary: this is a Windows semantic correction only. It does not change firmware, pulse direction, center, limits, step size, rate, ARM or safety lifecycle. Any future mechanism with different installation direction needs an explicit calibrated semantic transform; UI labels must not be inverted or inferred from raw sign alone.

## D073 - Manual-calibration request IDs outlive the Windows process

- Date: 2026-09-02
- Decision: the Electron main process owns one persistent, monotonic manual-calibration request-ID sequence. It reserves a checksummed block to both a primary and backup `userData` journal before issuing any ID, resumes above the recorded high-water after restart and never wraps from `uint32` maximum to a lower value.
- Upgrade boundary: the first persistent release starts at a high nonzero floor. A stale read-only status request may trigger only a bounded advance through predefined higher floors; commands are never automatically replayed. Corrupt journals, persistence failure and exhausted recovery space fail closed.
- Reason: EasyInput's duplicate/stale guard belongs to the USB mount epoch, which can outlive a DeskMate process. A process-local counter therefore cannot satisfy the frozen monotonic request contract after a desktop restart.

## D072 - Simple manual control is a Windows orchestration over the frozen calibration wire

- Date: 2026-09-02
- Decision: the normal manual-servo UI contains one environment confirmation/start action, four press-and-hold directions, return to center and emergency stop. It does not expose four independent attestations, ARM lease duration, token generation, axis confirmation, fixed-step buttons or three large evidence cards.
- Compatibility: DeskMate Link `0x20/0x21` and EasyInput HID `0x16/0x17` remain byte-for-byte unchanged. Windows serially expands start, hold and center into the existing select-axis, fresh one-use ARM, center, one-degree step and recenter operations. There is one request in flight, no backlog/replay and at most four hold steps per second.
- Hardware: the flashed Stage 1 1489..1511 us micro-envelope cannot support hold control. A separate Stage 2 overlay may restore the exact fixed-reference yaw 1055..1944 us and pitch 1277..1722 us envelopes previously exercised by this same assembled unit; these values stay local to Xiaozhi and normal `MOTION` remains disabled.
- Acceptance: the observed no-motion attempt is classified as a truthful `CENTER_REQUIRED` rejection with output count zero, not a PWM failure. New software must establish both centers first. Stage 2 still requires exact build evidence, new app-only authorization and user-present direction/release/center/e-stop HIL.

## D071 - Manual servo control is a semantic hold session, not an expert calibration console

- Date: 2026-09-02
- Decision: the normal Windows surface contains one environment confirmation, one start action, four press-and-hold directions, recenter and immediate stop. Electron main owns one `ManualControlCoordinator`; the renderer cannot create ARM tokens, choose leases, select axes or construct raw calibration commands.
- Orchestration: start serially establishes Yaw and Pitch centers using the existing select → fresh one-use ARM → provisional-center operations. Each held-direction tick selects the axis only when necessary, creates another fresh ARM with the complete frozen safety flags and a 5000 ms lease, then issues exactly one fixed 1° step. Recenter serially runs both axes through select → ARM → recenter. No HID or DeskMate Link wire value changes.
- Safety lifecycle: at most one semantic request is in flight and the repeat interval is at least 250 ms. Release, pointer cancellation, capture loss, window blur, hidden/page leave, device/Link loss and 60 seconds idle suppress all future output and lock the session. A center-required result keeps only the center-recovery path; every other movement/transport failure exits fail closed. Emergency stop stays available whenever the interface exists.
- Evidence: user intent, EasyInput accepted and Xiaozhi terminal remain distinct. A correlated completed endpoint may repair a stale generic Link label, but neither protocol completion nor `completed_output_count` proves direction, angle, mechanical clearance or safe physical motion. Those remain user-present HIL.

## D070 - Generic calibration transport preserves a bounded frozen Link error subtype

- 日期：2026-09-02
- 决策：Windows 手动校准继续把跨板失败归类为通用 `link-error` transport，同时只向控制器、UI 和脱敏诊断传递冻结 DeskMate Link v1 的六个错误名及对应数值。未知值、名称/数值不一致、非 error flag 携带错误值或非 `link-error` transport 携带错误值全部 fail closed。
- 原因：EasyInput accepted 只证明请求进入总控；通用 transport 只证明板间请求失败。保留受限的端点错误子类，才能不靠猜测区分“小智固件不支持消息”和“协议存在但校准 owner/真实适配器未就绪”，同时避免把任一层证据冒充机械动作结果。
- 边界：该错误只用于状态查询诊断和可操作提示，不解锁、不启用输出、不构成舵机运动或安全验收。诊断只保存最新请求的有界元数据，不保存 HID 原始报告、Link payload、设备标识或用户数据。

## D069 - Native status-stream bounds follow the frozen producer capacity

- Date: 2026-09-02
- Decision: Windows accepts EasyInput `0x11` status streams up to the firmware-owned 1536-byte buffer ceiling and at most 31 chunks of 50 data bytes. Full-config `0x13` retains its independent 2048-byte / 42-chunk ceiling.
- Boundary: 1536 bytes is the defensive wire ceiling; the current NUL-terminated firmware JSON is effectively at most 1535 bytes. Chunk count, declared length, sequence, request identity, CRC, padding, schema and enumerated fields all remain fail-closed.
- Acceptance: native regression must include a payload larger than 1023 bytes, the 31-chunk edge, and explicit rejection at 32 chunks or 1537 bytes. A successful config read is not evidence that the separate status stream was accepted, and a successful status read is not evidence of Xiaozhi display or motion.

## D068 - Windows routes EasyInput reports by exact top-level HID collection

- Date: 2026-09-02
- Decision: VID/PID alone never selects an EasyInput Feature path. Reports `0x10..0x15` require VID `303A`, PID `1006`, Usage Page `FF00`, Usage `0002`, and exact 64-byte Input/Feature platform lengths. Manual calibration Feature `0x16` and Input `0x17` require the same VID/PID and lengths on Usage `0007`.
- Lifecycle: Raw Input subscribes to both vendor usages. Runtime evidence separates any enumerated EasyInput interface, config collection writable and calibration collection writable. Losing `0007` closes only calibration; losing `0002` closes config/Agent State and Link-status reads. Returning `0002` triggers one bounded status refresh without replaying stale actions.
- Truth boundary: EasyInput enumeration and writable collections are local Windows transport facts only. They never imply DeskMate Link connected, Xiaozhi receipt, terminal completion or physical movement. Exported evidence stays bounded and excludes device paths and identifiers.
- Acceptance: pure contract tests must prove `0x14→0002`, `0x16→0007`, wrong-collection rejection, dual Raw Input registration and re-enumeration recovery. Real Link/Xiaozhi observation remains a separate HIL gate.

## D067 - External Agent automation requires an authoritative opt-in lifecycle adapter

- Date: 2026-09-02
- Decision: Codex and Hermes may publish automatic status only through their documented lifecycle hooks and the existing single `AgentStatePublisher`. Hermes uses an optional user-enabled plugin and a strict content-free local pipe. Provider identity never reaches firmware; VoiceWorkflow and companion conversation remain higher priority.
- Privacy: adapters may send only an allowlisted event name, bounded tool name and closed final outcome. Prompts, replies, commands, tool payloads/results, paths, identifiers, model/provider routing and raw errors are forbidden.
- Manual boundary: WorkBuddy names multiple unrelated products and no exact user product/version contract has been selected. It remains manual; DeskMate does not infer status from windows, processes, logs or traffic.
- Acceptance: host tests and packaging can close the software gate. Installing/enabling the Hermes plugin and observing real lifecycle/OLED behavior remain explicit user-controlled acceptance.

## D066 - Manual servo calibration requires a terminal status gate and three separate evidence layers

- Date: 2026-09-02
- Decision: Windows may expose only the frozen high-level manual-calibration operations. A correlated Xiaozhi status terminal must open the gate before commands, and every output attempt requires the existing axis/session context plus a fresh one-use arm token. There is no desktop absolute-angle, PWM, pulse-width, duty-cycle or GPIO surface.
- Evidence: user confirmation, EasyInput `accepted`, and Xiaozhi `terminal` are independent layers. The UI never calls the first two execution and never turns protocol completion into proof of physical motion. `completed_output_count` remains visible terminal evidence.
- Lifecycle: at most one request is in flight. USB disconnect/remount clears pending work, cached status and volatile authorization; the new mount epoch starts with another status query. Current production `NOT_READY` is truthful and keeps actions disabled.
- Acceptance: host vectors, malformed reports, safety attestations, one-use tokens, IPC privacy and UI gating may be automated. Enabling a production adapter or moving a servo is T10D-C and requires separate user-present electrical/mechanical authorization.

## D065 - Persona, reviewed memory and desktop actions have separate trust boundaries

- Date: 2026-09-02
- Decision: a companion session freezes one versioned persona and a bounded snapshot of accepted memories. Persona and memory are context only; neither can grant execution authority. Raw turns remain in SQLite, model-generated facts remain pending until explicit review, and complete forgetting deletes source data plus rebuildable derivatives.
- Knowledge boundary: SQLite is authoritative. DeskMate writes only a managed `DeskMate/` subtree in the encrypted user-selected root. Markdown double links and the deterministic local hash embedding index are disposable derivatives; externally edited files fail closed as conflicts.
- Action boundary: realtime speech is classified by a separate text-model bridge into a closed intent set. Opening an application is possible only through an existing opaque AppAction UUID and a one-use visible confirmation. Codex status uses official lifecycle metadata and never invents progress or reads content.
- Acceptance: automated tests may close validation, persistence, projection, index, confirmation and privacy gates. Persona quality, memory usefulness, packaged model behavior, real app launch and real Codex lifecycle remain user-present UX gates.

## D064 - Custom provider endpointing explicitly enables the official VAD gate

- Date: 2026-09-02
- Decision: every Doubao realtime companion session sends `StartSession.asr.extra.enable_custom_vad=true` together with the validated `end_smooth_window_ms`. The gate is not exposed as a separate user option because it is required to make the existing pause preference operational.
- Evidence: the current official realtime dialogue API document defines `enable_custom_vad` as the flag that enables custom user-stop detection and states that its default is `false`. The first eight-second HIL used the correct persisted/session value but omitted this flag and observed the provider's roughly two-second default behavior.
- Boundary: D060's `dialog.extra.input_mod=keep_alive` remains unchanged and compatible with temporary half-duplex microphone silence. `enable_asr_twopass`, `audio_info`, local VAD, `push_to_talk` and EndASR remain out of this repair. D064 supersedes D063's one-field request rule; D063 remains as historical evidence for the rejected first package.
- Acceptance: automated request vectors prove only the exact outbound configuration. One new user-present session must hold a 3-7 second mid-sentence pause when configured for 8 seconds before endpointing is accepted.

## D063 - Provider endpointing requests stay minimal and preserve the accepted keep-alive mode

- Date: 2026-09-02
- Decision: DeskMate sends the companion pause only as `StartSession.asr.extra.end_smooth_window_ms`. It does not combine that field with an unrelated two-pass ASR override or a speculative ASR audio descriptor.
- Boundary: D060 remains authoritative. `dialog.extra.input_mod=keep_alive` stays unchanged because strict half-duplex intentionally pauses microphone upload during playback and the earlier exact-package HIL selected this mode to avoid provider audio-idle failure.
- Evidence rule: a saved value and a session snapshot prove only local persistence and request preparation. They do not prove that the provider honored the requested endpoint until a real utterance passes user-present timing acceptance.

## D062 - Companion settings are explicit transactions and sessions own frozen revisions

- Date: 2026-09-01
- Decision: Companion identity and timing fields are edited as a renderer draft, persisted only by one explicit Save action and acknowledged only after Electron main validates, atomically writes and rereads the file. Each new conversation snapshots one revision; that identity, provider pause and listening idle policy remain fixed for the whole session and its reconnects.
- Range: provider pause is 0.5–50 seconds in 0.5-second steps. Listening idle stop is off or an integer 10–3600 seconds. These supersede D061's preset-only ranges without changing its two-clock ownership or reserved physical call action.
- Evidence: diagnostics keep saved and session-applied numeric values separate, expose only a bounded partial-to-final interval/count, and emit a final lifecycle event after an internally completed stop. Identity, wake phrase, text, audio and provider identifiers remain excluded.
- Presentation: the Companion overview uses independent self-height columns and a bounded `3:2` face. A taller settings stack cannot stretch the realtime face or displace the directly following Xiaozhi state test.

## D061 - Companion endpointing uses two clocks and one reserved physical call action

- Date: 2026-09-01
- Decision: provider utterance endpointing is a companion-only 2/3/5-second StartSession setting, while whole-conversation inactivity is a separate 30/60/120/off local timer owned only by `listening`. Default identity is `小言`. EasyInput calls the one existing controller through reserved `host_action_v1` UUID `f11135b4-7471-47f1-808a-629ae99eb63b`; a repeated call resets listening or explicitly interrupts an answer but never toggles the conversation off.
- Reason: a short provider silence threshold cuts off thoughtful speech, while using the same timer for whole-session cleanup would terminate valid thinking/playback. Reusing the frozen opaque Host Action preserves firmware compatibility and avoids turning the companion call into an executable mapping.
- Boundary: normal dictation endpointing is unchanged. Wake-word support stays unavailable until a local Chinese engine/model, redistribution license, opt-in indication and foreground audio-owner integration are approved.

## D060 - Strict half-duplex microphone silence uses the provider keep-alive mode

- Date: 2026-09-01
- Decision: a continuous DeskMate realtime session that suppresses microphone PCM during computer-speaker playback declares `dialog.extra.input_mod = "keep_alive"`. Event `359` remains a same-session turn boundary; event `599` remains fail-closed.
- Evidence: the exact T11D.4 run had complete playback and zero local/transport failures but 600 echo-guard upstream drops followed by adjacent `DialogCommonError`. The current official provider document requires `keep_alive` when microphone upload may pause and defines `52000042 DialogAudioIdleTimeoutError` for the matching timeout.
- Privacy: `52000042` maps only to `audio-idle-timeout`; raw code/message/payload and identities remain excluded. The rejected run did not export the numeric code, so the category match is recorded as causal inference pending exact-package HIL.
- Consequence: do not replace the provider session, send push-to-talk EndASR, continuously upload speaker echo, or ignore `599` to hide the symptom.

## D059 - EasyInput manual calibration uses additive HID reports 0x16/0x17

- Date: 2026-09-02
- Decision: Windows sends one 63-byte `DMCR` request in Feature Report `0x16`; EasyInput returns 63-byte `DMCS` accepted and terminal evidence in Input Report `0x17`. Both use CRC16-CCITT-FALSE, a USB-epoch-scoped monotonic request ID and a distinct UI confirmation ID.
- Translation: command requests contain the exact frozen 19-byte T10C `0x20` payload; status requests become an empty T10C `0x21`. EasyInput neither interprets physical angles nor adds arbitrary target, step size, PWM, pulse, duty or GPIO fields.
- Lifecycle: one request is in flight; identical duplicates are idempotent, conflicts/stale/busy are explicit, and USB unmount, Link disconnect, controller reboot or peer restart clears volatile work without replay. EasyInput acceptance is forwarding evidence only; only a correlated Xiaozhi terminal response is endpoint evidence, and neither proves physical movement.
- Consequence: T10D-B software must consume the frozen reports and golden vectors. T10D-C remains a separate real-adapter/user-present hardware package with production `MOTION` disabled until its safety gates close.

## D058 - Complete the manual-motion route as three ordered packages

- Date: 2026-09-02
- Decision: T10D-A belongs to the EasyInput/main-agent track and freezes only the Desktop→EasyInput request envelope plus a strict one-in-flight translator to the existing T10C `0x20/0x21` messages. It forwards operation, axis, direction, session/action IDs, volatile token, lease and attestations without adding angle, pulse, duty or GPIO fields; fake-endpoint evidence cannot be presented as motion.
- Separation: T10D-B is a later Windows-only manual UI owned by the DeskMate software task. T10D-C is a later Xiaozhi real-adapter and user-present HIL package. Neither T10D-A nor T10D-B may enable production `MOTION`, install PWM or claim physical movement.
- Gate: T10D-C cannot begin until installed axis mapping, independent current-limited supply, common ground, reachable cutoff, unloaded center, direction and soft limits are recorded. Preset choreography and expression-linked motion come only after both axes pass manual calibration.

## D057 - The main Agent owns one project-level control plane and integration verdict

- Date: 2026-09-02
- Decision: the `EasyInput固件开发` task is the DeskMate main Agent and integration owner. The DeskMate software and Xiaozhi tasks may independently implement and maintain branch-local Flow entries, but their entries are implementation handoffs rather than the project-level plan.
- Delivery contract: every implementation task returns an exact branch and pushed HEAD, frozen/changed contracts, tests and build evidence, user-present HIL result, safety actions and remaining gates. The main Agent checks ancestry and evidence, integrates only accepted work, reruns risk-proportionate three-module gates and then updates the one authoritative `flow/plan.md` and top `flow/progress.md` entry.
- Branch rule: a clean control/integration branch is created from the latest accepted common baseline. A dirty primary checkout, an unaccepted feature branch or a branch-local Flow file cannot become source of truth merely because it is newest by timestamp.
- Current consequence: T11F remains the accepted code/build integration baseline. T12B.1 is a software candidate until its exact-package custom-VAD HIL passes and a later integration branch combines it with T11F.

## D056 - Manual servo calibration uses a one-use leased high-level action contract

- Date: 2026-09-01
- Decision: T10C adds only `SELECT_AXIS`, volatile one-use `ARM`, adapter-local provisional center, fixed-direction 1.0-degree `SINGLE_STEP`, `RECENTER` and idempotent highest-priority emergency stop. The wire never carries PWM, pulse width, GPIO, absolute angle or arbitrary step size.
- Evidence: Windows intent, EasyInput forwarding and Xiaozhi terminal completion/rejection are distinct correlated facts. A completed endpoint action is not proof of a safe or measured physical angle.
- Gate: disconnect, peer restart and lease expiry disarm and discard pending work without replay. The production owner remains absent and MOTION capability remains disabled until installed-board electrical/mechanical evidence and a separately authorized real adapter exist.

## D055 - EasyInput speaker starts as a local hardware gate with microphone priority

- Date: 2026-09-01
- Decision: the first EasyInput speaker slice is local I2S1 output only, using GPIO14/13/15, signed 16-bit 48 kHz mono-left PCM and the existing GPIO8 `Speaker` lease. Its sole producer is one synthesized low-volume startup probe; no desktop/HID/UDP/Link downlink is inferred from the fixed Maker sound-resource path.
- Arbitration: the T10E board microphone has absolute priority. A microphone generation blocks new playback, cancels an active probe, waits for I2S1 deletion and releases only exact matching speaker/microphone generations before I2S0 begins.
- Boundary: passing the local probe does not mean DeskMate real-time audio output is connected. A later package must separately freeze the desktop-to-EasyInput downlink, buffering, cancellation and recovery contract. Sound-bank reads/writes remain independent operations.

## D054 - Computer microphone is the default; EasyInput capture is selectable

- Date: 2026-08-31
- Decision: DeskMate desktop voice workflows default to the computer microphone. The verified EasyInput LAN microphone remains an optional user-selected source rather than the mandatory source for every recording.
- Session behavior: the selected source is fixed for one recording session and never changes mid-recording. If the optional EasyInput source is unavailable before a session, the desktop may visibly fall back to the computer microphone; it must not claim that board audio is active.
- Scope: EasyInput remains the sole enabled external board-audio endpoint in V1, while the existing computer microphone adapter is also allowed. Bluetooth microphone capture remains unimplemented and must not be shown as available.

## D053 - EasyInput is the only DeskMate V1 board audio capture endpoint

- Date: 2026-08-31
- Decision: T10E uses the EasyInput onboard microphone through I2S0 on GPIO9/10/11 and the existing GPIO8 `KeyboardMic` lease. Audio is PCM S16LE, 16 kHz, mono, 20 ms frames over the frozen Maker-compatible LAN control and packet formats.
- Configuration: firmware projects only the existing top-level `wifi_ssid`, `wifi_password`, `audio_host` and `audio_port` values. Incomplete configuration disables capture; it never triggers LAN scanning, broadcast or address guessing.
- Scheduling and failure: capture and UDP sending are isolated by a bounded 64-frame PSRAM queue. Network, allocation and I2S failures are audio-local and cannot block input, LED, configuration, Host Action, Agent-state or DeskMate Link behavior.
- Boundary: T10E does not add speaker playback, BLE, Xiaozhi audio, desktop code or a second GPIO8 owner.

## D052 - DialogCommonError fails closed and TTS completion remains a same-session boundary

- Date: 2026-09-01
- Decision: provider event `359` drains the current TTS response and returns directly to listening on the same WebSocket/session. Provider event `599` is a terminal `DialogCommonError`, not an end-of-turn or transport-loss signal; it never creates a replacement provider/session.
- Diagnostics: retain only a fixed `status_code` class, adjacency, arrival phase and bounded counts. Raw status code, message, payload, text, audio and identifiers remain forbidden.
- Consequence: D051 and the T11D.3 post-TTS reconnect contract are rejected by user-present evidence and superseded. Real transport loss retains its separate finite reconnect policy. A future provider behavior change requires an exact-package sanitized status class, not event adjacency alone.

## D051 - Post-TTS dialog recovery requires consumed drain evidence and provider epoch ownership

- Date: 2026-09-01
- Decision: event `599` is recoverable only for the current active provider epoch when its arrival immediately follows a `tts.end` that already completed local speaker drain. That evidence is consumed once. Every non-adjacent, pre-drain, failed-drain, stopping, stale-provider, error-frame or session-failure case stays fail-closed.
- Bound: the existing finite reconnect path owns recovery. At most two recoveries occur without a new accepted user-final turn; a real user turn proves progress and resets the streak. Stop and generation changes always win, and neither PCM nor text is replayed.
- UI: only the independent Electron overlay owns the floating live capsule. The React main window must not render a duplicate bottom bar.
- Consequence: diagnostics add only four counters and one closed result enum. The policy is selected by T11D.2 HIL evidence and must not become a generic “ignore provider errors” rule.
- Superseded: user-present T11D.3 evidence showed that this policy creates a new session, visible `connecting` and a replayed welcome. D052 replaces it.

## D050 - Provider terminal diagnostics preserve arrival order without provider content

- Date: 2026-09-01
- Decision: every realtime provider event receives a process-local monotonic arrival sequence before entering the controller queue. Terminal events use closed enums, counters, arrival phase and an expected-stop flag; provider error codes map only to fixed coarse buckets.
- Privacy: raw code, message, payload, text, PCM, timestamps, request/message/connect/session identifiers and device/network/window evidence are not exported. Unknown values collapse to `unknown-provider-error` or `none`.
- Consequence: a `tts.end` waiting on local playback drain can be distinguished from a later error frame, dialog error, session terminal or transport close without changing runtime handling. Production recovery changes require a new HIL diagnostic that selects one terminal path.

## D049 - Speaker backlog uses played credit and renderer lifecycle is monotonically reconciled

- Date: 2026-09-01
- Decision: computer-speaker PCM uses a session/generation-bound accepted/played/cancelled credit contract. A full finite window blocks the next write; a finite timeout ends the session with a sanitized error. Scheduled audio is never silently cleared to accept newer audio, and explicit cancellation is never counted as played.
- State ownership: each renderer runtime slice has one atomic reducer action. Main companion events and status snapshots carry a monotonic sequence and generation; the page, capsule and Escape share one awaited stop/reconcile action that accepts success only when main reports inactive.
- Consequence: provider `tts.end` plus natural playback acknowledgements is the listening boundary. Diagnostics expose build identity and lifecycle enums/counters only. This supersedes the rejected T11D queue/drop and whole-runtime snapshot implementation without changing strict half-duplex or hardware contracts.

## D048 - Network TTS completion is not computer-speaker completion

- Date: 2026-09-01
- Decision: `tts.end` starts a bounded AudioSink drain and does not release `speaking/working` or the half-duplex guard. Listening and microphone upload resume only after the matching scheduled PCM has actually ended, or after a bounded timeout clears playback. Explicit stop is a separate idempotent terminal operation with bounded source, sink, provider and Agent-state teardown.
- Why: T11C HIL completed several real turns but still produced one truncated answer and one stop action that remained connected. The provider event proves network delivery, not the operating system's final played sample.
- Consequence: drain acknowledgements are request-sequence and session/generation bound. Late events cannot revive a stopped session. Default interruption remains manual; EasyInput KEY1 is not rebound.

## D047 - Computer-speaker companion defaults to strict half-duplex

- Date: 2026-09-01
- Decision: the accepted computer-speaker realtime companion uses `computer-speaker-echo-guard-v1`. While real TTS playback is active, microphone PCM is not uploaded and ASR partial/final is ignored. The explicit manual interrupt returns immediately to listening and restores upload. D048 refines the original `tts.end` boundary: network completion must first drain actual computer playback.
- Why: live T11B acceptance proved the main chain but also showed that speaker feedback could satisfy the old spoken-barge-in path and interrupt the assistant's own answer. Browser AEC constraints help but cannot be treated as sufficient acoustic evidence.
- Consequence: natural automatic barge-in is not a V1 claim and requires a separate AEC/acoustic-gate package. EasyInput KEY1 remains the existing text VoiceWorkflow trigger until a separate visible ownership/routing contract is frozen.

## D046 - Realtime provider compatibility requires external wire evidence

- Date: 2026-09-01
- Decision: the Doubao adapter follows official protocol page `1594356` and its linked sample. The fixed `X-Api-App-Key` is supplied as a provider protocol constant; users configure only their own App ID and Access Key. Connection acknowledgement precedes session start.
- Wire boundary: decoder support covers the documented flags, sequence/event layouts, connection/session identifiers, no/gzip compression and error frames with fixed size limits and failure closure. Raw frames, provider payloads, identifiers, PCM and text never enter diagnostics or user-visible errors.
- Verification: local encoder/decoder round trips are insufficient for external protocols. Acceptance requires hard-coded official or independently derived golden vectors, including negative and compressed layouts.

## D045 - Continuous companion uses the computer speaker baseline without inventing board downlink

- Date: 2026-09-01
- Decision: T11B uses the persisted computer/EasyInput microphone choice and the computer speaker to close the production continuous-dialogue loop. Computer input is the default. If EasyInput was requested, fallback to the selected computer microphone is allowed only before capture starts and must be visible; a later source failure ends the session without switching.
- Boundary: one `CompanionConversationController`, one foreground owner and one Agent State publisher remain authoritative. EasyInput speaker downlink is still `NOT_FROZEN`; no UDP, HID or DeskMate Link speaker transport may be guessed, and Xiaozhi audio is not a substitute.
- Interruption and privacy: manual or confirmed spoken interruption clears local playback and discards late response frames without sending an undocumented provider cancellation event. Credentials stay in Electron main. PCM crosses only the session/generation-bound Web Audio IPC bridge and never enters React state, diagnostics, logs, SQLite or exports.

## D044 - Companion surfaces share one runtime truth and Codex automation remains explicitly owned

- Date: 2026-09-01
- Decision: the companion overview, device connections and system diagnostics derive EasyInput HID, DeskMate Link, EasyInput LAN microphone, realtime service and memory labels from one bounded runtime presentation model. A page may choose layout, but it may not maintain a second subscription or hard-coded readiness label for the same capability.
- Expression boundary: Windows expression preview lives in the expression library and never publishes hardware state. The above-the-fold Xiaozhi work-state test continues to use the single existing Agent State publisher and keeps EasyInput ACK separate from downstream Link evidence.
- Codex ownership: `codex-hook-v1` is versioned and may be selected or explicitly disabled. Only documented lifecycle metadata maps automatically. The official hook surface currently has no general turn-failure event, so `error` remains a manual state; prompt/output text, window titles and process content are never used as substitutes.
- Recovery: repeated identical automatic events are suppressed, voice/companion ownership wins, and events dropped while disabled, displaced or disconnected are not replayed later.

## D043 - SQLite owns memory; knowledge-base files and embeddings are rebuildable projections

- Date: 2026-09-01
- Decision: DeskMate's local SQLite database is the sole authority for conversation turns, reviewed summaries, memory candidates and review state. A user-selected knowledge-base directory is an optional export/projection target, never a second writable database.
- Privacy and control: the selected absolute path stays encrypted in Electron main and React receives only a configured flag and folder label. T12A may remember the location but must not scan or write that directory. Exports contain reviewed summaries and accepted memories only; raw turns, rejected/pending candidates, vectors and source identifiers remain excluded.
- Projection: T12B will give accepted memories stable IDs and produce deterministic Markdown with `[[double links]]`. T12C will chunk accepted material, create model-versioned embeddings and support deterministic index rebuild. Markdown and vectors are derived artifacts: correction, deletion or complete forgetting starts from SQLite and must invalidate or rebuild every derivative.
- Deletion: an individual permanent delete and whole-store forget require one-use, revision-bound confirmation. Whole-store forget removes turns, summaries, candidates, outbox rows and embeddings in one transaction; an external projection may not silently preserve deleted memory.

## D042 - Workbench hardware claims require bounded runtime evidence

- Date: 2026-09-01
- Decision: the Workbench may describe Xiaozhi as connected only from the already sanitized DeskMate Link diagnostic state. EasyInput HID presence alone means only that the controller is present; missing or invalid Link diagnostics remain `unavailable`.
- Presentation: local face buttons are labelled software preview. Temperature, humidity, ambient light and servo pose stay `pending` or `disabled` until a frozen adapter supplies real bounded telemetry. Fixed demo values, fabricated pose and fake relative sync time are forbidden on the product surface.
- Migration: the exact legacy sample task `正在整理桌宠开发文档 / 68%` is reset to idle once at schema v9. Any non-identical persisted Agent event is preserved as user/runtime state.

## D041 - Software expression preview and Xiaozhi work-state control are separate products surfaces

- Date: 2026-08-31
- Decision: default, blink, happy, sad, angry, thinking and listening remain Windows-only expression previews. They never silently publish Agent State because several local expressions have no one-to-one meaning in the frozen hardware vocabulary.
- Hardware control: Xiaozhi testing exposes exactly idle, listening, thinking, working, waiting, completed and error and reuses the single existing manual Agent State publisher. Repeating the selected state is an explicit new request, not a local no-op.
- Evidence: the UI keeps EasyInput write ACK, DeskMate Link health and physical Xiaozhi display confirmation distinct. A controller ACK cannot be labelled as Xiaozhi display success, and disconnected Link states remain visibly unconfirmed.

## D040 - HID presence, DeskMate Link health and Agent write ACK are distinct facts

- Date: 2026-08-31
- Decision: the desktop exposes EasyInput HID presence, the enumerated EasyInput-to-Xiaozhi Link state, and the latest HID Agent State write result as three separate facts. A successful native write is labelled only as an EasyInput write ACK; Xiaozhi delivery is corroborated by the frozen Link state and forwarding counters, never inferred from HID presence.
- Recovery: application start, EasyInput reconnect and a Link transition to connected reread the existing capability/status report and reissue the single Agent publisher's current unexpired intent once. If the intent expired or never existed, the recovery state is idle. This creates a fresh transition and never replays expired listening, completed or error work.
- Privacy and compatibility: only the already enumerated Link state and bounded counters cross into React and diagnostics. Raw reports, paths, identifiers, network data and content remain excluded. The existing T09 transport and state publisher remain authoritative; no protocol, firmware or second Agent state machine is introduced.

## D039 - Dictation locks one explicit microphone source and board shortcuts are device-scoped

- Date: 2026-08-31
- Decision: text voice input/edit persists `computer` or `easyinput`, defaults to a concrete Windows microphone, and locks the actual source at the start of every recording. An unavailable EasyInput source may fall back once before capture begins with a visible reason; a failure after start terminates the recording and never switches sources.
- Trigger boundary: ordinary keyboard global voice/edit shortcuts are disabled by default. The EasyInput KEY1/KEY3 chords are recognized only through VID/PID-scoped Raw Input; generic F22 injection and ordinary keyboards cannot impersonate the board. Users may explicitly opt into the legacy global fallback in settings.
- Compatibility: this refines D004 after T10E microphone HIL and records the same product choice referenced as D037 on the parallel firmware branch without renumbering or overwriting this branch's existing D037. It changes no firmware and keeps the single existing `VoiceWorkflow`.
- Privacy: live board PCM, network coordinates and credentials stay in Electron main. Only one bounded completed WAV enters the existing renderer recording pipeline after the user stops text dictation.

## D038 - EasyInput audio credentials use an isolated configuration renderer

- Date: 2026-08-31
- Decision: T11A accepts SSID/password only inside a dedicated sandboxed local BrowserWindow and applies them in Electron main through the T05 read-preview-confirm-write-readback transaction. The main React renderer receives only opaque adapter labels, readiness, volume and named counters.
- Reason: network credentials and the selected host IP are required to configure the board but must not enter normal UI state, logs, SQLite, diagnostics or the companion conversation event stream.
- Boundary: only four top-level fields may change. Speaker playback remains unavailable and no computer audio fallback is permitted.

## D038 - Companion dialogue has one foreground owner and an explicit EasyInput audio boundary

- Date: 2026-08-31
- Decision: T11 uses one `CompanionConversationController` for the continuous dialogue lifecycle and one foreground-session arbiter shared with existing text voice input/edit. Dictation preempts companion; companion never resumes automatically. Doubao credentials, protocol, PCM queues, and turn persistence remain in Electron main.
- Audio boundary: production uses explicit `CompanionAudioSource` and `CompanionAudioSink` contracts. Until T10E supplies the EasyInput implementation, DeskMate reports the missing adapter and refuses to claim a live conversation. Computer and Xiaozhi audio are not silent fallbacks.
- Persistence and status: final turns are committed transactionally before final UI events. While companion is active it owns the existing T09 expression stream; displaced Codex/manual states are dropped rather than replayed.
- Consequence: future audio transports and providers can be added behind the frozen adapters without duplicating VoiceWorkflow, exposing credentials to React, or changing firmware state vocabulary.

## D037 - Codex real status uses official lifecycle hooks and explicit provider ownership

- Date: 2026-08-31
- Decision: Codex is the first automatic Agent adapter. Stable lifecycle hooks map a user turn, local tool execution, structured user input/approval wait, turn completion and session lifecycle into the existing seven-state contract. DeskMate never guesses activity from process existence, the foreground window or a title.
- Privacy: the hook helper forwards only the event name and bounded canonical tool name over a local named pipe. Prompt/response text, tool arguments/results, transcripts, session identifiers, working directory and device data remain outside DeskMate. Hooks stay synchronous and bounded because official background hooks may complete out of order.
- Ownership: the manually selected Agent remains authoritative. Codex hook events drive hardware only while Codex is selected; VoiceWorkflow has higher priority and blocked events are not replayed. WorkBuddy, Hermes and Claude Code remain manual until they have equally verifiable adapters.

## D036 - Manual Agent identity stays local while hardware receives only frozen state

- Date: 2026-08-31
- Decision: DeskMate v1 uses an explicit desktop selection for Codex, WorkBuddy, Hermes, Claude Code or a bounded custom Agent. The persisted compatibility ID remains `workbody`. The renderer requests only a validated local Agent ID and one of the seven T09 states; Electron main publishes the existing `0x12` report. Agent names never cross into HID or DeskMate Link.
- Priority: an active VoiceWorkflow owns the visible state and rejects manual overrides. Automatic multi-Agent detection is deferred until each provider has a privacy-safe adapter and concurrent ownership policy.
- Display boundary: Xiaozhi OLED represents Agent work state. EasyInput's five WS2812 LEDs remain key/encoder input feedback and are not repurposed in this slice.

## D035 - Link health crosses the native boundary only as enumerated diagnostics

- Date: 2026-08-30
- Decision: the Windows native bridge accepts `ai_keyboard.config_status.v1` status streams up to the EasyInput firmware's 1023 usable JSON bytes / 21 chunks. Full configuration remains independently bounded to 2048 bytes / 42 chunks.
- Exposure: Electron main may receive only the frozen capability booleans, Link state (`disabled`, `waiting`, `connected`, `faulted`) and named uint32 Link/Agent counters. It must reject partial, invalid or out-of-range diagnostic shapes.
- Privacy: raw status JSON, frame payloads, device paths, identifiers, network data and user content do not cross this boundary. A Link fault remains fail-soft for input, configuration and desktop voice behavior.

## D034 — Windows HID transport padding is not protocol payload

- Date: 2026-08-30
- Decision: T09 Agent-state semantics remain exactly 16 bytes. The Windows
  native bridge sends a 64-byte Feature report because the HID top-level
  collection advertises `FeatureReportByteLength=64`; bytes after report ID
  plus the 16 semantic bytes must be zero.
- Receiver rule: EasyInput accepts compact 16/17-byte TinyUSB forms and padded
  63/64-byte forms only when every transport padding byte is zero. No other
  length or padding is tolerated.
- Ownership: renderer publishes only semantic VoiceWorkflow state; Electron
  main owns encoding and the resident native bridge owns `HidD_SetFeature`.
  Mock, simulator and demo sources cannot enter this path.

## D033 — T09 reuses existing Agent-state transports

- Date: 2026-08-30
- Decision: T09 uses Maker-compatible HID Feature report `0x12` from Windows to
  EasyInput and the frozen DeskMate Link v1 `SET_AGENT_STATE` message from
  EasyInput to Xiaozhi. It does not add another Host Action or Link message.
- Ownership: the EasyInput window owns the shared contract and bridge; the
  Xiaozhi window consumes that contract and owns only the display scene model.
- Safety: T09 has no servo, audio or physical action and cannot replay stale
  state after disconnect or peer restart.

## D001 · One standalone product repository

- 日期：2026-08-23
- 决策：DeskMate 使用独立仓库 `zuming58/DeskMate`，应用代码位于仓库根目录。
- 原因：它是一个产品和发布边界；再保留 `` 套壳只会增加路径和交接成本。

## D002 · English directory names

- 日期：2026-08-23
- 决策：所有目录使用英文 ASCII 名称，文件名优先英文 kebab-case，正文允许中文。
- 原因：避免 Windows、脚本、终端编码和跨电脑协作中的路径问题。
- 说明：Project Flow 原模板的中文文件名映射为 `progress.md`、`lessons.md` 和 `guides/`，语义保持一致。

## D003 · External repositories are pinned, not vendored

- 日期：2026-08-23
- 决策：`easy-input-maker`、`easyinput-board-cy` 和 `project-flow-cy` 不完整复制到本仓库，只记录 URL、固定提交、许可证和必要合同。
- 原因：保持产品仓库纯净，同时保留可复现的来源依据。

## D004 · Computer microphone remains default

- 日期：2026-08-23
- 决策：在板载音频完成真机验收前，电脑麦克风仍是默认录音源；板载麦克风作为显式选择的第二适配器。
- 原因：现有语音闭环已经可用，新增协议不能破坏稳定路径。

## D005 · No speculative hardware writes

- 日期：2026-08-23
- 决策：未知 HID 不写；厂商报告只按固定合同实现。烧录、擦除、分区和 eFuse 操作必须另行授权。
- 原因：保护用户现有可用产品和固件。

## D006 · One product repository with three production modules

- 日期：2026-08-23
- 决策：`F:\Codex\deskmate` 是 Windows 软件、EasyInput 总控固件和小智云台固件的共同正式产品边界；外部 Maker 与小智目录只作为参考源。
- 原因：最终交付是一个协同软硬件产品，不是 Windows companion 长期调用两套外部固件。
- 说明：根级只维护一套 `flow/`、`docs/` 和 hook；正式固件模块建立后补局部规则、源码、测试和构建入口。

## D007 · EasyInput board is the external hardware controller

- 日期：2026-08-23
- 决策：目标主链为“DeskMate Windows 软件 ↔ EasyInput 总控板 ↔ 小智云台执行板”。小智负责高层表情/动作执行，DeskMate 软件和总控板均不得绕过其安全控制器直接写舵机 PWM。
- 原因：用户确认 EasyInput ESP32 将承担外部总控和板间协调职责。
- 说明：首版板间物理层后续由 D014 选为三线 3.3 V TTL UART；DeskMate Link framing 和真机电气仍须按门禁冻结和验收。

## D008 · Reference code requires provenance and license review

- 日期：2026-08-23
- 决策：不整仓复制两个参考工程；任何复制、修改或实质性派生代码都记录来源、版本/哈希、许可证、修改和目标路径。
- 原因：Maker 项目自有代码是 PolyForm Noncommercial 1.0.0，小智参考源码根许可证是 MIT，二者还包含独立许可的第三方组件和资产。
- 说明：来源不明的二进制、模型、音频、图片或构建产物不得进入产品仓。

## D009 · Voice workflow stays mounted and never forces navigation

- 日期：2026-08-23
- 决策：全局快捷键和 EasyInput 语音键只驱动唯一的版本化 VoiceWorkflow 与底部胶囊，不自动切换主窗口页面；VoiceWorkflow 在应用生命周期内保持挂载。
- 原因：页面跳转会抢走 Codex 等目标输入框的焦点，且按页面挂载控制器会丢失跨页面的语音事件。

## D010 · Application actions use opaque host-side UUIDs

- 日期：2026-08-23
- 决策：“打开应用”的路径搜索、选择、持久化和执行只在 Electron 主进程完成；渲染进程和固件只保存规范小写 UUID 与显示名。
- 原因：Windows 路径和命令行不应进入 React 状态、固件报告或诊断；未知 UUID 必须可拒绝。

## D011 · Partial keyboard configuration must not overwrite the board

- 日期：2026-08-23
- 决策：在 DeskMate 能读取、验证并合并完整板载配置前，“同步到键盘”保持可见但实际写入被阻止；本机编辑与板上同步明确分开。
- 原因：Maker `ai_keyboard.v1` 配置是整份覆盖，仅发送按键和旋钮会丢失既有网络、音频等设置。

## D012 · Xiaozhi debug ports are not the board-to-board contract

- 日期：2026-08-24
- 决策：顶部 USB-C 仅按烧录/恢复入口管理，底部 USB-C 仅按充电入口管理；UART0 与 USB Serial/JTAG 只视为调试能力。未完成 PCB、电气暴露、冲突和恢复性核对前，不把它们或任意“未占用 GPIO”指定为 EasyInput→小智的正式链路。
- 原因：2026-08-24 的实物和教程证据确认了用途，但当前小智固件仍没有本地应用 framing，芯片外设能力也不能证明 PCB 连接可用。
- 后续：D014 在补充实物排针丝印和源码占用核对后选择了首版 UART 方案；本条仍保留“调试能力不能自动冒充应用合同”的约束。

## D013 · One motion arbiter owns all Xiaozhi servo movement

- 日期：2026-08-24
- 决策：人脸跟随、对话动作、人工回中和待机动作都进入小智固件中的唯一动作仲裁器；桌面与 EasyInput 总控只发送归一化目标、高层角度或白名单动作，永不直接发送 PWM。
- 原因：连续跟踪与离散动作会争抢同一双舵机，必须统一处理优先级、死区、滤波、限速、软限位、超时、丢脸回中和急停。
- 说明：首版人脸检测优先放在电脑侧；当前硬件没有已确认摄像头，PAJ7620U2 也未安装且不能提供人脸坐标。

## D014 · DeskMate Link v1 uses a three-wire UART control link

- 日期：2026-08-24
- 决策：首版 EasyInput↔小智采用 3.3 V TTL UART，115200 8N1、无硬件流控；EasyInput J4 TXD0 接小智 RX，RXD0 接小智 TX，GND 共地，J4 3V3 不连接，两板独立供电。UART 只传控制、状态和确认，不传实时音频。
- 原因：实物照片已确认小智侧 `GND/TX/RX` 排针候选，源码核对未发现当前板型对物理 GPIO43/44 的应用占用；UART 离线可用、确定性强、调试边界清晰，适合第一版最小闭环。
- 门禁：正式实现使用 UART1 驱动映射到物理引脚并把应用日志迁到 USB Serial/JTAG；接线前完成电平、供电、通断、坏帧/启动乱码、重启和恢复性测试。选择方案不构成接线、烧录或舵机授权。

## D015 · Long-term memory and speaker identity live on Windows

- 日期：2026-08-24
- 决策：人物档案、声纹向量、长期记忆、检索索引、备份和删除权限全部由 DeskMate Windows 软件本地管理；两块固件只接收本轮必要的脱敏人物标签与高层状态。
- 原因：这些数据需要多年迁移、纠正、导出、忘记和权限治理，且声纹属于敏感生物特征，不适合放进板载 NVS/Flash。
- 安全：登记需明确同意，儿童由监护人管理，默认不长期保存原始登记录音；低置信度询问身份，声纹不得作为高风险操作的唯一凭证。

## D016 · Feature packages are locked by regression gates

- 日期：2026-08-24
- 决策：相似功能组成一个小功能包，每包完成后必须依次通过定向测试、两端/三端连通测试和全部已锁定功能回归，记录证据后才能开始下一包。
- 原因：三端协同中一次修改大量不相关功能会让故障归因和回滚失去边界；短周期联调与持续回归能让软件、总控和云台稳步前进。

## D017 · DeskMate V1 uses EasyInput as the only active audio endpoint

- 日期：2026-08-24
- 决策：V1 采用方案 A。EasyInput 板载麦克风负责语音采集，EasyInput 功放与扬声器负责播放；小智板的麦克风、功放和扬声器物理保留，但在 DeskMate 模式下不初始化。小智只承担 OLED 表情/状态与双舵机安全动作。
- 原因：两块板会紧邻叠放，声源位置差异没有产品收益；只保留一套音频链可避免回声、抢占、音量与状态同步问题，是首版最简单、最稳定的方案。
- 说明：板间三线 UART 只传控制、状态和确认，不传实时音频；开发期电脑音频可作为显式 fallback，但不改变最终硬件归属。

## D018 · V1 keeps independent power and forbids ad-hoc power bridging

- 日期：2026-08-24
- 决策：V1 两板独立供电，仅通过 `GND/TX/RX` 三线通信，EasyInput J4 `3V3` 留空并绝缘。未来单电源属于新的电源树设计任务，不能简单焊一根 3.3 V 或 5 V 线跨板供电。
- 原因：小智双舵机的峰值电流、压降、回灌与保护边界尚未完成测量；临时跨板供电会扩大复位、过流和损坏风险。

## D019 · Two-computer development separates implementation evidence from hardware evidence

- 日期：2026-08-24
- 决策：无硬件笔记本承担短分支上的协议、固件逻辑、host test、模拟器和构建；接硬件电脑承担独立审查、重建、设备身份确认以及经授权的烧录和 HIL。每个小功能包经 GitHub 交接，不等待整套固件写完才审计。
- 原因：两个 Plus 账号和两台电脑可以并行提高吞吐，但硬件缺席时不能宣称固件完成或真机通过；小包审查可把故障范围限制在最近一次改变。

## D020 · Current workstation is the default hardware acceptance host

- 日期：2026-08-24
- 决策：默认把运行 `F:\Codex\deskmate` 当前主会话的这台电脑作为硬件验收主机，EasyInput 与小智平时接在这里；另一台电脑默认负责分支实现、host test、模拟器和无硬件构建。
- 例外：只有用户明确说明外出、临时换机或指定另一台电脑接硬件时，才把当轮设备识别、经授权烧录和 HIL 转移过去；转移不降低恢复、身份确认和烧录授权门禁。
- 原因：让硬件连接、恢复资料、审计环境和真机证据长期集中，减少频繁搬板、电脑环境差异和证据混淆。

## D021 · Cross-end contracts freeze by implementation slice

- 日期：2026-08-24
- 决策：跨端合同采用逐切片冻结；只有明确标记为 `*_FROZEN` 的切片可以进入实现，同一合同目录中仍为 `NOT_FROZEN` 的内容不得根据参考工程或猜测提前实现。T03 只冻结 EasyInput 实体输入到 Windows USB HID 的 `INPUT_V1_FROZEN` 切片，完整 Host Contract 继续保持未冻结。
- 原因：不必等配置、音频、Host Action 和 DeskMate Link 全部设计完才验证实体输入，同时又能防止另一台电脑把未讨论功能混入当前包。
- 门禁：T03 只产生代码、Host 测试和无硬件构建证据；当前电脑独立复审、恢复方案准备完毕且取得用户单独授权后，才进行第一次 EasyInput 烧录/HIL。

## D022 · Auditing fixes bounded defects locally

- 日期：2026-08-24
- 决策：另一台电脑提交候选后，当前审计电脑若发现边界清楚、不改变冻结合同、能用定向回归证明的局部缺陷，直接在原候选分支修复、复验并留下审计记录；只有协议重定、架构重做、来源/许可证冲突或硬件安全边界变化才退回另一台电脑重新开发。
- 原因：局部问题跨电脑反复返工会重复消耗审计与交接成本，而且并不增加独立性；本机“先复现、再小修、再跑完整门禁”可以保留证据链并缩短反馈回路。
- 门禁：直接修复不得借机打开下一个功能包或扩大写硬件授权；仍需更新候选分支、通过完整代码门并在主线记录本机改动。

## D023 · EasyInput preserves the canonical 16 MB Flash layout

- 日期：2026-08-25
- 决策：DeskMate EasyInput 固件永久保留当前实板与固定 Maker 基线一致的分区：24 KiB NVS、4 KiB PHY、3 MiB factory app、两个 576 KiB 声音 bank。即使当前功能包不使用 NVS 或声音资源，也不得退回 ESP-IDF 默认 1 MiB factory 表或重排范围。
- 原因：T03 首次预写检查证明默认最小构建会静默删除双声音 bank，并缩小后续正式固件可用的应用合同；这既破坏恢复性，也会让后续音频功能被迫迁移分区。
- 门禁：仓内 `partitions.csv` 为构建真相源，CMake 与 Host 测试 fail closed；首次写入和分区相关升级都必须与实板/恢复镜像比较。改变布局属于独立迁移任务，需要新的备份、升级/回退方案和用户授权。

## D024 · Ordinary EasyInput command keys use atomic HID taps

- 日期：2026-08-27
- 决策：S1/S3 继续使用实体来源拥有的 held chord，满足语音 PTT；S2/S4/S5～S8 在稳定按下边沿把临时 chord 叠加到当前 held snapshot，并在同一 USB keyboard FIFO 原子排入 press 与精确 restore。实体释放只重新武装下一次 tap。
- 原因：多轮 HIL 证明，按住 S6 拔掉一个 HID lifetime 后，Windows 可能保留旧设备的 Ctrl；新设备的 mount 全释放、重复全释放、transfer-complete、GPIO40 生命周期和 DCD 软重连都不能可靠替旧 lifetime 产生 key-up。普通命令没有持续按住的产品需求，应在用户仍按住实体键时就完成主机可见释放。
- 兼容：默认动作、VID/PID、Report ID、报告布局、GPIO 和队列总容量不变；S2/S4/S5～S8 长按不再产生 host typematic 或持续 modifier。两帧必须预留两个槽，容量不足、发送失败或断线时 fail closed；T03 五次真机矩阵通过前本决策不构成 HIL 结论。

## D025 · Input LED feedback is an independent T04 package

- 日期：2026-08-27
- 决策：把 EasyInput 的 5 颗 WS2812 实体输入反馈独立设为 T04，并同时建立 GPIO8 最小共享电源安全底座；原配置/NVS 顺延为 T05，Host Action/打开应用顺延为 T06。
- 原因：灯效能直接显示实体按键是否经过防抖被固件识别，属于 T03 输入闭环的紧邻反馈，不应与配置事务混在一个包。固定 Maker 参考已经提供按键颜色、动画、旋钮反馈、RMT 和共享电源证据，继续从零猜测会重复 T03 的教训。
- 边界：T04 只实现 `INPUT_LED_V1_FROZEN` 的输入灯效；GPIO8 由唯一控制器持有，Awake 期间保持共享域开启，灯灭使用黑帧。不开音频、不做 Boot/连接/Agent 灯效、不改 T03 HID。T04 经原主电脑独立审计与真机锁定前，不开始 T05。

## D026 · T05 configuration is lossless, transactional and pure-HID only

- 日期：2026-08-27
- 决策：T05 冻结 `CONFIG_V1_FROZEN`，通过完整板载配置读取、Electron 主进程无损 read-modify-write、脱敏差异确认、DeskMate 双槽 NVS 和写后回读开放配置同步；React 不接触完整配置、网络/音频字段或设备路径。
- 原因：Maker `ai_keyboard.v1` 是整份覆盖，`0x13` 的状态/指纹不是完整配置；局部构造 JSON 会破坏既有字段，单槽直接覆盖也无法对掉电和坏配置提供确定恢复。
- 边界：T05 只激活纯 HID 按键与旋钮动作，继续复用 T03 held PTT/atomic tap 和 T04 灯效/GPIO8 owner。固定文字、Host Action/打开应用及其他 Windows 主机动作保留原始配置但不执行，统一留到 T06；旧 `ai_keyboard/config_v2` 只读导入，禁止自动擦除 NVS。
# 2026-08-28 · Cross-computer exchange uses Git only

- 两台电脑之间只通过 GitHub 的准确提交和短分支交换产品代码；不再整目录复制覆盖工作树。
- 每次换电脑前必须在 `flow/progress.md` 顶部记录角色、分支、HEAD、验证、硬件操作、未决风险和下一步；详细规范见 `flow/guides/two-computer-handoff.md`。

## D027 · Companion tools share one primary destination and one expression renderer

- 日期：2026-08-29
- 决策：T06 锁定后，桌面主导航收敛为工作台、语音输入、AI 陪伴、历史记录、词库、按键配置、设备与诊断。设备连接嵌入设备与诊断；AI 联动、表情库、动作编排和记忆管理嵌入 AI 陪伴；表情编辑与环境感知不再作为主入口。默认、眨眼、开心、难过、生气、思考、聆听七种状态共用一套真实光栅图片和一个 `CompanionFace` 渲染器。
- 原因：保持 T06 已验收功能入口不变的同时，减少侧栏碎片化；统一脸部资产可让品牌、软件预览和未来 OLED 状态使用同一语义，避免各页面出现不同机器人形象。
- 边界：本地记忆数据库和审核结构已经实现，但陪伴对话写入、自动摘要、embedding、提醒、上传持久化、小智屏幕与舵机仍未接入。当前陪伴按钮和动作只做软件预览，不创建第二套麦克风流程、不发送硬件命令，也不构成 DeskMate Link、OLED 或舵机合同冻结。

## D028 · Voice edit reuses VoiceWorkflow and AI services remain split by plane

- 日期：2026-08-29
- 决策：Maker KEY3 的 `Ctrl+Shift+E` 由 Windows host 实现为 VoiceWorkflow 的 `edit` 模式；Electron 主进程先捕获精确前台窗口与选中文字，转写口述指令，再使用与智能整理共享的文本模型改写。文本大模型与实时语音分别配置和加密保存；实时语音输出不得直接执行 Windows 动作，必须经过类型化 Bridge 与既有 Host Action 白名单。
- 原因：固定参考固件只产生快捷键和音频生命周期，不含选区读取或模型逻辑；复用同一语音状态机可保证文字输入打断陪伴对话且不抢麦克风。文本理解与实时语音拆分后，可独立选择便宜快速的整理/Bridge 模型和低延时对话服务。
- 边界：百炼 ASR 继续独立负责转写。OpenAI 兼容文本模型已用于智能整理和 KEY3 语音编辑；意图 Bridge、自动记忆摘要、embedding 和豆包实时会话仍未启用。所有密钥只在 Electron 主进程解密，不进入 React、配置导出、诊断或 Git。

## D029 · Companion memory is local SQLite with reviewable promotion

- 日期：2026-08-29
- 决策：DeskMate 以 Electron `userData` 下的 SQLite WAL 作为陪伴记忆唯一权威存储；每轮会话先同步事务落盘，再异步生成每日摘要和候选。候选必须可审核后才提升为长期记忆；原文、摘要、结构化候选和 embedding 分表保存。`F:\wiki` 以后只能作为经审核 Markdown 的导出/同步适配器，不作为第二个未经追踪的事实源。
- 原因：即时事务可以在突然关机时保留已完成轮次，候选审核避免啰嗦对话被无声固化，分层存储允许更换 LLM/embedding 后重建索引而不丢来源。
- 边界：当前已实现数据库/schema、状态、搜索列表和候选审核；实时陪伴尚未产生会话，因此空库必须显示为 0。自动摘要调度、敏感信息过滤、embedding、人物隔离、备份恢复和 wiki 同步仍需独立功能包与验收。

## D030 · T07 Desktop UI V1 is the shared firmware-development baseline

- 日期：2026-08-29
- 决策：用户确认智能整理与 KEY3 语音编辑可用后，把 `docs/contracts/t07-desktop-ui-v1.md` 标记为 `T07_DESKTOP_UI_V1_FROZEN`。工作台、语音输入、AI 陪伴、历史记录、词库、按键配置、设备与诊断七入口及其内部页面归属、统一七表情脸和单一 VoiceWorkflow 成为 EasyInput 与小智两条后续固件开发共同依赖的桌面基线。
- 原因：两条固件线将并行开发；如果各自继续修改导航和桌面状态入口，会重新制造已经解决的 T06/T07 界面分叉，并让三端联调无法确定唯一 Host 行为。
- 边界：修复缺陷、无障碍/响应式修正和把已冻结的能力状态接入现有页面仍可进行。改变七入口、页面归属、共享脸或 VoiceWorkflow，或移除 T06 能力，必须显式开启新的 UI 版本并重跑完整桌面回归。实时陪伴、自动记忆、DeskMate Link、小智 OLED/舵机仍是待冻结功能，不能因界面存在就宣称完成。

## D031 · T08 splits firmware ownership but keeps one Link contract owner

- 日期：2026-08-29
- 决策：T08 允许 EasyInput 与小智固件在两个窗口并行开发，但代码所有权严格分离：本窗口只改 `firmware/easyinput-controller/`，另一窗口只改 `firmware/xiaozhi-yuntai/`。跨端 `contracts/deskmate-link/` 在冻结前由 EasyInput 窗口单点拥有，并生成语言无关黄金向量；小智端只能消费准确合同提交，不得独立设计第二套协议。
- 原因：两端并行可以缩短到首次硬件握手的路径，但若两边同时编辑 framing、消息 ID、重试和错误语义，会形成表面各自通过、实际字节不兼容的两套实现。单一合同加同一黄金向量保留并行速度，同时消除协议漂移。
- 边界：两个窗口都不得修改 T07 桌面冻结基线或对方固件。合同冻结前小智只做 UART/控制台核对、工程和 Host 骨架；首次接线仍需两端构建通过、电气/恢复门和独立授权，且只做无 OLED、无音频、无舵机的只读握手。

## D032 · DeskMate Link v1 freezes a bounded controller-initiated UART slice

- 日期：2026-08-29
- 决策：首版 Link 固定为 115200 8N1 的三线 3.3 V TTL UART；EasyInput 是唯一请求发起者，同时只允许一个在途请求。帧使用 `DMLK` magic、版本、方向、消息 ID、非零序列、最大 128 字节 payload 和 CRC16-CCITT-FALSE。T08 只开放 HELLO、能力、状态和无硬件副作用的 Agent 状态存储/确认。
- 原因：先冻结最小、可逐字节测试且没有机械风险的切片，可以让两个窗口真正并行，同时把启动噪声、断线、重复、超时、对端重启和旧动作不重放一次定义清楚。
- 边界：UART0 转为 Link 后关闭应用与 bootloader 日志，不写 eFuse；ROM 启动噪声由流式解析器重同步。DISPLAY、MOTION、AUDIO 能力在后续切片验收前保持未启用；首次接线只读，不执行 OLED、舵机或音频。

## D033 · Companion half-duplex authority is fixed at provider arrival

- 日期：2026-09-01
- 决策：实时陪伴只在 `listening` 接受麦克风 PCM 与 ASR；`thinking`、`speaking` 和本地 playback drain 全部关闭上行。判断依据是 provider callback 到达时同步推进的封闭阶段，不是等待串行 handler 执行后才变化的 React/控制器显示状态。
- 原因：`tts.start/audio` 与 ASR 可以在同一个事件循环中连续到达；若阶段只在异步 handler 内更新，后到的回声 ASR 会读取旧 `listening` 并被当成新用户轮次。旧代码又对每个 accepted ASR final 无条件取消 sink，能直接截断已排队回答。
- 边界：普通 ASR final 只开启用户轮次，不拥有取消权。当前只有显式“打断回答并继续听”可以在会话内取消 TTS；自然语音抢话仍未开放。provider `interrupt()` 只清本地累积文本，不构成服务端取消确认。
