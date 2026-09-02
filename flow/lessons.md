# Lessons learned

## A protocol direction sign is not a user-facing motion label

- Symptom: the full control route succeeds and horizontal buttons behave correctly, but `上` visibly nods down and `下` raises the head even though all requests complete.
- Practice: keep the frozen signed wire primitive unchanged, then bind product words to signs only from user-present observation of the installed mechanism. Cover every semantic direction through the real coordinator path rather than testing a single representative sign.
- Rule: numeric axis polarity is transport data, not physical meaning. Correct semantic inversion at one explicit transform boundary; do not compensate in firmware, labels, limits or several duplicated call sites.

## A protocol epoch can outlive its desktop client process

- Symptom: the Windows UI reconnects successfully and both HID collections plus the downstream Link are healthy, yet the first request after restarting DeskMate is rejected as `stale`.
- Practice: identify which side owns duplicate suppression and how long that epoch survives. Persist the client high-water before use, reserve IDs in blocks, recover redundant journals deterministically and keep any upgrade rebase bounded to a harmless read-only request.
- Rule: a process-local counter is unsafe whenever the peer retains its maximum request ID across client restarts. Never resolve that mismatch by replaying a command, wrapping the counter or weakening the endpoint's stale-request defense.

## A safe hold control is a terminal-gated scheduler, not repeated button clicks

- Symptom: simplifying a calibration console into four direction buttons can accidentally create overlapping ARM/step requests, queued movement after release, a repeat rate above the intended ceiling or a UI that stays armed after transport failure.
- Practice: keep one main-process session owner, let each semantic tick finish select/ARM/output before scheduling the next, and make the continuation predicate observable between those internal requests. Release cancels the next tick; failures other than an explicit center gate end the session; emergency stop waits only for the current terminal and then wins.
- Rule: renderer pointer state is never movement authority. A hold gesture grants permission for one terminal-gated step at a time, at a bounded cadence, and every focus/lifecycle/disconnect boundary revokes future permission without replay.

## A generic transport failure must not erase a frozen endpoint error

- Symptom: a read-only request is accepted by EasyInput, but the Windows panel only shows `link-error` and falls back to an undifferentiated unavailable state, hiding whether the peer lacks the message or merely has an unready owner.
- Practice: keep the stable generic transport result and decode only the protocol's frozen error enum as a bounded second layer. Validate the flag, code/name pairing, request correlation and absence of an endpoint payload before exposing it; export only the latest sanitized fact.
- Rule: intent, controller acceptance, Link transport and endpoint result are separate evidence layers. More precise failure evidence may improve diagnosis, but it must never unlock output or become movement-success evidence.

## Composite HID devices must be selected by top-level collection, not VID/PID alone

- Symptom: one EasyInput function fails with `HidD_SetFeature` while ordinary keys and another vendor report still work; reconnect events can also make the whole board appear unavailable even though only one collection changed.
- Practice: freeze VID, PID, Usage Page, Usage and exact `HIDP_CAPS` report lengths for each report family. Register every Input-bearing vendor collection with Raw Input, and expose enumeration plus per-collection writable evidence independently.
- Rule: multiple top-level collections belonging to one USB device are separate Windows interfaces. “Same VID/PID and large enough buffer” is not a routing contract, and one missing collection must not fabricate total device or downstream Link failure.

## A persisted provider setting is not proof of provider behavior

- Symptom: settings and new-session diagnostics both show an eight-second endpoint, yet the cloud service still answers after its short default pause.
- Practice: trace the exact outbound request and compare the whole relevant object with the provider's current official sample. Keep the provider request minimal, preserve separately accepted transport modes, and require one real utterance before closing the gate.
- Rule: local readback proves persistence; session snapshot proves request ownership; neither proves remote acceptance. Do not hide a provider mismatch with a local response delay, and do not change an independently HIL-selected mode while repairing another field.

## A successful renderer bundle is not a successful first render

- Symptom: Electron opens a normal window and loads packaged assets, but React leaves a white content area because a store action referenced during render is undeclared.
- Practice: keep the existing bundle and source-contract tests, then also load the real App module and execute its first render in an automated browser-neutral smoke test. Verify at least one stable shell marker.
- Rule: packaging proves that modules and assets can be assembled; it does not prove that render-time identifiers, hook dependencies or initial state reads are valid.

## Saved settings are not active-session evidence

- Symptom: a UI could show a newly selected pause value while the already connected provider still used the value captured when its session started. A flat diagnostic copied from renderer settings therefore presented preference as runtime fact.
- Practice: edit a draft, persist through one explicit write/readback transaction, and snapshot a revision at session creation. Export saved and session-applied numeric values separately; use content-free interval/count metrics when runtime timing needs evidence.
- Rule: an active realtime session never hot-switches identity or timing because a form changed. Reconnect belongs to the same frozen session; only a new session may consume later saved values.

## Grid stretch can turn a bounded visual into a layout regression

- Symptom: a tall settings column stretched its sibling card; `height: 100%`, a large minimum height and a flex-growing face then produced an elongated character far beyond its intended proportions.
- Practice: give columns independent self-height ownership, keep the visual in a bounded aspect-ratio box and preserve semantic source order when collapsing to one column.
- Rule: visual proportions must be owned by the visual component. A neighboring card's content height is never an input to face geometry.

## Utterance endpointing and conversation inactivity are different clocks

- Symptom: increasing one generic timeout either still cuts off pauses before a sentence is complete or leaves an abandoned continuous session online too long.
- Practice: send the documented silence threshold in the provider's companion StartSession request, and keep a separate local timer that is armed only while accepting user speech. Cancel it synchronously when a non-empty final utterance arrives, before queued handlers can race.
- Rule: `thinking`, playback and drain are active work, not user inactivity. A physical call during listening resets inactivity; during an answer it uses the single explicit interruption path and never becomes a hidden start/stop toggle.

## A serialized event queue still needs synchronous turn ownership

- Symptom: the provider can emit `tts.start` and a delayed/reflected ASR final back-to-back while the awaited handler still shows `listening`; aggregate logs then show cancelled speaker blocks without proving which user turn caused them.
- Practice: advance a closed half-duplex phase in the provider callback before enqueueing work, attach that immutable arrival phase to the event, and let only `listening` accept microphone/ASR. Count TTS completion only after local played/drain acknowledgement.
- Rule: serialization preserves handler order but does not make handler state current at callback arrival. Ordinary ASR must never double as cancellation authority; only an explicit user control may abandon an answer.

## Protocol input mode must describe intentional silence, not only the audio format

- Symptom: every TTS block is accepted and played, local drain succeeds and the transport remains open, yet the provider emits a dialog error immediately after the answer.
- Practice: compare the application's mute policy with the provider's current session modes and error table. A strict half-duplex client can be wire-format correct while violating the provider's expectation that microphone packets remain continuous.
- Rule: when an audio client deliberately pauses upload, declare the documented silence/keep-alive policy. Do not solve an upstream idle timeout by uploading speaker echo, inventing reconnect, treating an error as completion or switching to push-to-talk semantics.
## Branch-local Flow updates do not automatically advance the project mainline

- Symptom: the primary checkout still appeared to stop near T06/T07 even though software, EasyInput and Xiaozhi work had reached T12/T11E/T10C. Each short branch carried a newer plan/progress entry, but later software history and the hardware integration history had diverged and no owner reconciled them.
- Practice: at every implementation handoff, record exact branch/HEAD and acceptance evidence, then have the main Agent check ancestry and copy only verified facts into one clean control branch. Keep implementation acceptance, user HIL and mainline integration as three separate states.
- Rule: the newest `flow/plan.md`, newest commit time or green feature tests are not sufficient to declare a project milestone. A project milestone exists only after the integration owner records a common baseline and its unresolved gates in the authoritative control plane.

## A safety lease must expire before duplicate classification and status reporting

- Symptom: a one-use ARM token can appear active beyond its lease if expiry is checked only when a new non-duplicate output arrives; repeated ARM traffic or status polling would otherwise preserve stale UI state.
- Practice: advance the lease clock before action-id deduplication and before emitting the independent status snapshot. Expiry clears only volatile authorization and never creates output.
- Rule: time-bounded actuator authorization is state, not a request-side validation detail. Every externally observable owner path must first make expiry effective, while emergency stop remains independently executable at highest priority.

## Reference motion code is behavior evidence, not calibration evidence

- Symptom: a reference project contains nominal centers, ranges, GPIOs and direct LEDC initialization, but copying them would move real servos before the installed supply path, direction and mechanical limits are verified.
- Practice: reuse only bounded behavior such as per-axis limits, small steps and recenter semantics. Keep power, common ground, center, direction and limits behind explicit product gates, and keep the first motion package disconnected from PWM.
- Rule: source-confirmed servo constants cannot become device-confirmed calibration. A production call site and physical adapter require separate user-present electrical and mechanical evidence.

## A test-only state machine is not runtime evidence

- Symptom: an early speaker package contained a detailed playback lifecycle class that only Host tests called, while the production service used a separate atomic state path.
- Practice: remove unused behavioral models instead of presenting their tests as runtime coverage. Test immutable audio parameters and the real cross-task arbiter, and lock production ownership, power, network and sound-bank boundaries with source contracts.
- Rule: a green unit test is evidence only for code reachable from the product or for an explicitly declared pure contract; parallel test-only behavior must not inflate the acceptance claim.

## ESP-IDF timeout units must follow the called API

- Symptom: LAN heartbeat and control ACK remained healthy, but a real microphone session produced zero audio frames even though the capture task was running.
- Root cause: `i2s_channel_read` accepts milliseconds and converts them to FreeRTOS ticks internally. Passing `pdMS_TO_TICKS(80)` gave the API about 8 ms on the current 100 Hz tick configuration, shorter than one 20 ms audio frame.
- Rule: confirm the exact frozen-version signature and lock the production call-site unit with a source-contract test; never pre-convert a timeout merely because an adjacent FreeRTOS API takes ticks.

## A UDP endpoint lock must cover the real multi-packet path

- Symptom: heartbeat and control ACK were healthy, while desktop audio frames stayed at zero and `sourceRejects` kept increasing.
- Root cause: control packets and PCM used separate UDP sockets and therefore different ephemeral source ports; the desktop correctly rejected PCM after locking the acknowledged endpoint.
- Rule: heartbeat, ACK and business data for one locked `IP:port` session must reuse one socket, with a source-contract test preventing a second sender socket.

## Optional network audio must retry configuration, not only reconnection

- Symptom: an initial Wi-Fi configuration failure could leave a fail-soft audio task retrying reconnect without reapplying the rejected station configuration; healthy first socket creation was also miscounted as recovery.
- Rule: track configuration application separately from connectivity, retry the operation that failed, and count recovery only after an observed fault returns to service.

## A reconnect can hide a provider error while breaking conversation continuity

- Symptom: a long response plays fully, then the product shows `connecting` and repeats the welcome instead of accepting the next turn.
- Practice: compare the lifecycle with the official continuous-session sample. Treat turn completion, provider error and transport loss as distinct boundaries; only the last one may select transport reconnect. Preserve an allowlisted error class before attempting any behavior repair.
- Rule: when the product promise is one continuous session, a fresh connection is a failed recovery even if audio continues. Never label reconnection as success merely because an adjacent error followed audible playback.

## Recovery needs evidence ownership, not only event adjacency

- Symptom: a provider may emit an error immediately after a fully audible answer, but the same event number can also represent an invalid frame, failed session or late callback from a replaced provider.
- Practice: require successful local-drain evidence, consume it once, bind it to both conversation token and provider epoch, and preserve fail-closed handling for every other vector. Count recovery outcomes without retaining provider content.
- Rule: a narrowly recoverable external-service quirk must be selected by independent HIL evidence and bounded by forward progress; matching two event names is not a recovery contract.
- Superseded detail: T11D.3 proved that even tightly owned adjacency/drain evidence does not authorize a new session for provider event `599`; D052 now keeps it fail-closed.

## Serialized handling still needs pre-queue arrival evidence

- Symptom: an answer can finish audibly and only then show a provider error, while the actual terminal frame may have arrived earlier during an awaited local speaker drain. Handler completion order alone cannot explain the wire arrival order.
- Practice: assign a monotonic counter before enqueueing provider work, then retain only allowlisted event/terminal/phase enums and coarse error buckets. Keep last TTS-end and terminal sequences separately.
- Rule: observability must be captured before the await boundary that can reorder visible effects, but protocol payloads, raw codes and identifiers are not required to prove that order.

## Backpressure cancellation is control flow, not playback failure

- Symptom: replacing queue drops with an awaited credit window introduces a new race: a user can interrupt or stop while an audio write is waiting for credit. Treating the cancelled wait as an ordinary write exception makes a successful manual action end in `error`.
- Practice: distinguish accepted, naturally played and explicitly cancelled outcomes. Cancel every reservation and waiter atomically before releasing credit, then let the controller ignore cancellation when the response was interrupted or its generation is no longer current.
- Rule: every blocking flow-control primitive needs a cancellation contract tested at the exact user-control boundary; bounded waiting alone is not lifecycle correctness.

## A bounded queue must not turn overload into silent success

- Symptom: a real answer ended early while the diagnostic showed speaker queue drops and no reflected ASR. The renderer's fixed backlog cap stopped every scheduled node, then accepted newer audio and later allowed the normal drain path to continue.
- Practice: bound queued time/bytes with acknowledgement or backpressure. If the bound is exceeded, end the current session with one explicit sanitized error; never discard audible history and continue as though the full answer played. Track accepted, played, rejected and high-water counts separately.
- Rule: `AudioScheduledSourceNode.ended` also follows explicit `stop()`. A stopped node or resolved drain waiter is not proof that the user heard its full buffer.

## Shared nested runtime state needs atomic slice ownership

- Symptom: main completed stop and acknowledged terminal idle, but the renderer remained in stopping while high-frequency device events continued. Multiple effects copied one render's `runtimeRef.current` and shallow-replaced the whole nested runtime, so the last callback could restore another slice's stale value.
- Practice: update companion, input bridge and audio through separate reducer actions/functional nested merges. Add session/generation plus a monotonic event sequence; reconcile IPC results/status without allowing an older snapshot to overwrite a newer event.
- Rule: refs make an old snapshot accessible; they do not make concurrent whole-object updates atomic. A lifecycle is not debuggable until IPC requests/results, main terminal state and renderer acceptance are independently observable through privacy-safe enums/counters.

## A network TTS end event is not an audible-playback boundary

- Symptom: strict half-duplex still released near the tail of a real answer, and speaker feedback could be accepted while Web Audio had queued samples left.
- Practice: bind a drain request to the current session/generation and command sequence, keep playback state through the last scheduled node, and cap the wait with fail-soft interruption.
- Rule: state machines must follow the last consumed sample, not merely the last received network frame. Every explicit stop path also needs bounded, idempotent teardown so one adapter cannot retain the foreground owner indefinitely.

## Browser echo cancellation is not a conversation policy

- Requesting echo cancellation, noise suppression and automatic gain control is useful, but a computer speaker can still return enough speech for cloud ASR to produce a final event.
- If a product cannot prove an acoustic barge-in gate, enforce turn-taking at the state-machine boundary: stop microphone upload and ignore ASR during actual playback, then resume only on `tts.end` or an explicit manual interruption.
- Keep only counts and enums in diagnostics. Reflected ASR text and raw PCM are neither necessary nor safe debugging evidence.

## A protocol codec cannot certify itself

- Symptom: a fake server built frames with the same local encoder as the client, so all tests passed while the live provider immediately failed with a generic frame error.
- Practice: verify required headers and handshake order against the authoritative service document, then test the parser with hard-coded external golden bytes for every documented layout, compression mode and failure boundary.
- Rule: an encoder/decoder round trip proves internal consistency, not interoperability. Provider payloads and identifiers must remain outside logs and user-visible error copy even while failure reasons become more specific.

## A preferred audio source can be unavailable while the fallback adapter is still startable

- Symptom: a fallback wrapper reported the unavailable preferred EasyInput status, so the conversation controller rejected the session before it ever called the wrapper's start method and the promised computer fallback never ran.
- Practice: an aggregate pre-start adapter reports startability when any approved candidate can start, but reports no active source until one adapter actually acquires the session. After acquisition, all disconnects are handled by that locked adapter and never trigger another fallback.
- Rule: availability gates must describe the composite operation they guard. Preferred-source health and actual-session ownership are separate facts.

## Capability labels must be projections of runtime facts, not page-owned copy

- Symptom: the diagnostic page could show the EasyInput-to-Xiaozhi Link as connected while the companion page still said “pending”; an accepted board microphone could also be described as not integrated merely because the computer microphone was currently selected.
- Practice: normalize each bounded runtime capability once, distinguish integrated/selected/active/unavailable, and let every page render the same presentation model. Keep host write ACK and downstream Link health as separate facts.
- Rule: a React route must not open a second subscription or invent a static label for a capability already represented in application runtime state.

## A knowledge-base folder must not become a second memory authority

- Symptom: writing conversational notes directly into a user folder is easy, but later correction, deletion, duplicate files and embedding-version changes can leave SQLite, Markdown and vectors disagreeing about what DeskMate remembers.
- Practice: keep reviewed local records and their stable IDs authoritative in SQLite. Treat Markdown double links and embeddings as versioned projections with a manifest and deterministic rebuild path. Store the full selected path only in Electron main, and expose only a bounded folder label to React.
- Rule: a projection may improve human navigation and retrieval, but it never owns review state or deletion. Correct/forget the source first, then atomically refresh or remove every derived file and vector.

## A polished dashboard must not turn fixtures into telemetry

- Symptom: fixed temperature, humidity, light, pose and “synced two seconds ago” copy looked like live hardware even when only EasyInput HID was present.
- Practice: derive the compact summary from the same sanitized Link diagnostic used by the detailed diagnostics page. Label local rendering as software preview and keep unintegrated sensor/motion fields visibly pending.
- Rule: UI polish does not lower the evidence bar. A fixture belongs in tests or an explicitly labelled simulator, never on a production status surface.

## A successful HID write is not proof of downstream device rendering

- Symptom: EasyInput could appear connected and accept an Agent State Feature Report while the EasyInput-to-Xiaozhi Link was unavailable, leaving the OLED unchanged even though the desktop looked healthy.
- Practice: display HID presence, Link state/counters and the latest write ACK separately. Refresh the existing bounded status report on reconnect; when Link becomes connected, reissue only the current unexpired intent and otherwise send idle. Serialize reconnect reads that share the native Feature Report slot.
- Rule: never label a host write as downstream synchronization. End-to-end delivery needs evidence from each transport boundary, and recovery must use the single existing state owner rather than a parallel replay queue.

## A hardware shortcut and a global keyboard shortcut must not share authority by default

- Symptom: `Ctrl+Shift+Space` was both the EasyInput firmware action and an Electron global shortcut. Any ordinary keyboard, input method or software-generated chord could therefore open the recorder and look like an unexplained hardware press.
- Practice: identify the EasyInput device with Raw Input VID/PID and emit a semantic board event only after its complete chord is released. Keep Electron global registration disabled by default and behind an explicit user setting; reject generic F22 injection as a board source.
- Rule: equivalent keystrokes are not equivalent authorities. Hardware actions must retain device provenance until the single `VoiceWorkflow` trigger filter accepts them.

## A fallback is allowed only before a recording source acquires the session

- Symptom: silently switching from a failed board microphone to the computer during an active recording would mix two physical sources, mislabel history and make disconnects look successful.
- Practice: persist a preferred source, probe it at session start, expose a pre-start failure and lock the successful adapter for the entire recording. A mid-session source failure ends the recording and never invokes another adapter.
- Rule: source fallback is a start-time product decision, not a transport recovery strategy.

## A device microphone test should prove transport without creating user data

- Symptom: replaying or recording a sample makes microphone troubleshooting convenient, but it creates voice artifacts and widens the renderer/privacy boundary before the production conversation path is ready.
- Practice: validate the frozen frame, session and source in Electron main; calculate a short-lived numeric level; expose only state, counters and that level; automatically stop the test after a bounded duration.
- Rule: microphone transport evidence does not require storing, replaying or rendering PCM. A source test also cannot stand in for a missing speaker sink or full conversation HIL.

## An unavailable hardware adapter must be explicit, not replaced by a convenient fallback

- Symptom: a desktop conversation UI can appear complete when it silently captures the computer microphone, even though the product contract says EasyInput is the only V1 audio endpoint.
- Practice: freeze source/sink interfaces, ship explicit unavailable production adapters until the firmware/bridge exists, and use simulated adapters only in automated tests. Readiness UI must name the missing source or sink.
- Rule: a test double may prove lifecycle logic, but it must never be selected automatically in production or presented as hardware integration evidence.

## Persist a final conversation turn before announcing it as complete

- Symptom: if the renderer is notified first, an exit or crash between UI display and SQLite write loses a turn that the user already saw as completed.
- Practice: use a unique provider/source event ID and one transaction for outbox processing, turn insertion, and completion. Identical retries are idempotent; conflicting reuse fails closed; interrupted processing is recoverable.
- Rule: final UI events are downstream of durable local commit, not the trigger for it.

## Real Agent state needs lifecycle evidence, not process presence

- Symptom: a running Codex executable or foreground Codex window can be idle, working, waiting for approval or finished, so process/window polling would present fabricated state and becomes ambiguous when several Agent apps are open.
- Practice: use the provider's documented lifecycle interface, normalize only metadata-backed events, and explicitly leave unobservable states manual. Strip the event at the adapter boundary before it reaches the product; never inspect transcripts or response text merely to improve an expression.
- Rule: an Agent adapter may claim “real” only for states supported by a versioned provider event. The selected Agent owns the hardware route, active voice work has priority, and blocked/stale provider events are never replayed.

## Keep Agent identity separate from the hardware state vocabulary

- Symptom: a product may support Codex, WorkBuddy, Hermes and other Agents, but the existing device contract intentionally carries only seven coarse states. Sending provider names or guessing the active provider from windows/processes would widen the privacy boundary and behave ambiguously when several Agents are open.
- Practice: keep the selected Agent identity and custom label local to the desktop, normalize all providers to the frozen state vocabulary, and expose a manual selector until real provider adapters and ownership rules exist. Let active voice work take priority over manual display requests.
- Rule: adding a provider must not create a new firmware state machine or leak provider identity to hardware. Identity selection, state inference and device rendering are separate responsibilities.

## Reference motion code is behavior evidence, not calibration evidence

- Symptom: the Xiaozhi reference contains nominal centers, ranges, GPIOs and direct LEDC initialization, so copying it would make a new product image move both servos immediately even though the real supply path, direction and mechanical limits remain unverified.
- Practice: audit the fixed reference first and reuse only bounded behavior such as per-axis limits, small steps and recenter semantics. Put power, common ground, center, direction and limits behind explicit product gates; keep the first motion package pure and disconnected from PWM.
- Rule: source-confirmed servo constants cannot become device-confirmed calibration. No production call site or actuator adapter is added until a user-present, recoverable electrical and mechanical calibration establishes the real values.

## Optional peripheral tasks must start after the transport baseline

- Symptom: T08 UART Link passed on the real two-board wiring, but the integrated T09 image showed a healthy idle OLED while EasyInput transmitted requests and received zero frames. The new image had started OLED initialization and its background task before installing the previously proven UART transport, and discarded both startup results.
- Practice: separate an optional peripheral's synchronous capability initialization from its worker-task allocation. Establish the required transport before allocating optional worker tasks, keep the capability state available for negotiation, and turn startup return values into a privacy-safe visible or status diagnostic.
- Rule: a visible optional peripheral is not evidence that the mandatory transport started. Integration tests must lock startup ordering, and optional display, animation or sensor tasks may not consume the transport baseline's resources or hide its initialization failure.

## A growing bounded status payload requires consumer-boundary regression vectors

- Symptom: firmware added privacy-safe Link, Agent and later diagnostics to an existing status JSON. The producer grew to about 1104 bytes inside its 1536-byte buffer, but the Windows consumer silently retained a stale 1023-byte / 21-chunk limit and discarded the first 23-chunk response. A separate full-config read still completed, hiding the mismatch.
- Practice: define the producer's buffer ceiling, effective usable JSON limit, derived maximum chunk count and per-kind limits once in the consumer protocol module. Test the observed 1024+ byte payload, the 31-chunk edge and the first rejected byte/chunk. Do not treat a successful full-config stream as evidence that the independent status stream is accepted.
- Rule: whenever fields are added to a bounded cross-end diagnostic payload, rerun a near-current-size golden vector through the actual native consumer. Sanitized counters must remain explicitly enumerated; raw JSON, user content and device identifiers must not be forwarded merely to simplify diagnosis.

## An app-only candidate must not hide a failed bootloader rebuild

- 现象：最终小智 T09 全量构建在 ESP-IDF 自带 bootloader 源码中触发 GCC 内部编译器错误，而产品源码、既有同源全量构建和独立 `app` 目标均正常。
- 做法：先明确失败发生在是否计划写入的对象。只有在同一固件源码已经通过完整构建、固定分区/bootloader 不变且本次授权明确为 app-only 时，才允许独立重建并验证 `app` 目标；必须把完整构建失败和 app-only 成功同时记录，不能把后者改写为全量构建通过。若 app 自身失败或 bootloader/分区也在写入范围内，立即阻断烧录。
- 规则：构建证据必须与实际写入范围一一对应；“app 候选可写”不等于“bootloader/整套镜像重新构建通过”。

## Compare partition-table semantics before hashing different read windows

- 现象：ESP-IDF 生成的 `partition-table.bin` 为 3072 字节，但从 Flash 分区表扇区读取 `0x1000` 字节会得到 4096 字节；即使有效表完全相同，整文件 SHA-256 也会因末尾 1024 字节擦除态 `0xFF` 而不同。
- 做法：先按项目合同核对地址和读取窗口，再解析两份表并比较有效分区条目；比较二进制时锁定生成文件的有效长度，并单独验证读取窗口剩余字节是否全部为 `0xFF`。任何真实条目、有效字节或填充值异常仍须 fail closed。
- 规则：不同长度的分区表文件不得只凭整文件哈希判定布局不一致；“有效表哈希 + 解析条目 + 尾部擦除态”必须作为一个完整校验门。

## Validate bounded input length before reading its discriminator

- 现象：Feature Report 归一化函数已经拒绝空指针，但在判断 `length == 0` 前先读取了 `buffer[0]`；正常平台回调不会传该组合，Host 边界仍允许零长度非空缓冲暴露逻辑越界。
- 做法：所有由 `buffer + length` 表示的协议输入都先统一验证空指针、零长度和最小头长度，再读取 Report ID、magic 或版本等判别字节；测试同时覆盖 null、zero-length、截断和正常最短帧。
- 规则：有界协议解析的第一条语句不能依赖尚未验证的判别字节。任务卡声称的 timeout、stale ACK 等失败向量也必须在真实测试清单中逐项存在，不能只由相邻的 disconnect 用例代替。

## HID Feature reports use the top-level collection length on Windows

- 现象：冻结的 `0x12` 业务 payload 只有 16 字节，但同一 HID 顶层集合还包含
  更大的 63 字节 Feature payload；如果 Windows 只向 `HidD_SetFeature` 传
  `report ID + 16`，平台合同和设备实际 callback 形态会不一致。
- 做法：从 `HIDP_CAPS.FeatureReportByteLength` 锁定 Windows 写入缓冲长度为
  64，前 17 字节放 report ID 与业务字段，其余 47 字节全零。固件在 TinyUSB
  边界同时接受独立/内嵌 report ID 的紧凑和补零形态，并严格拒绝非零 padding。
- 规则：HID 业务 payload 长度与 Windows 顶层集合传输长度必须分开记录；
  黄金向量既要锁语义字节，也要锁平台补零和 callback 归一化，不能让填充进入
  业务协议或被宽松忽略。

## Optional capability failure must not tear down the transport baseline

- 现象：小智显示端按冻结合同在 OLED 初始化或渲染失败时移除 DISPLAY enabled，但保留 CORE、AGENT_STATE 与 Link；EasyInput 首版却把 DISPLAY 当成能力握手的硬条件，并沿用不含显示状态位的旧掩码，导致合法显示降级会被误判成整条 Link 失败。
- 做法：把“建立基础链路所需能力”和“执行当前命令所需能力”分开验证。握手只要求 CORE+AGENT_STATE；发送显示状态时再要求 DISPLAY；对端的显示 enabled/fault 状态位单独纳入当前切片的严格掩码。用 implemented `0x07`、enabled `0x03`、status `0x81` 的跨端向量证明链路保持 connected 且状态发送失败关闭。
- 规则：新增可选下游能力时，不得把它自动提升为传输层生存条件。两端审计必须覆盖健康、未实现、暂时禁用和运行时故障四种能力矩阵，并分别验证“链路是否存活”与“动作是否允许”。

## UART signals are crossed by direction, not matched by label

- 现象：两块板分别单独通过 UART/协议检查，但板间 Link 一直超时；物理线最初接成 RX→RX、TX→TX。
- 做法：始终按发送者与接收者写完整关系并交叉连接：EasyInput TXD0→小智 RX、EasyInput RXD0←小智 TX，同时保留 GND 共地和 3V3 悬空。纠正后 Link 立即进入 connected，收发计数持续增长，小智重启后也能自动重连。
- 规则：UART 接线说明和验收记录不得只写“RX/TX 三根线”或“同名相接”；必须写明两端角色、方向和禁止连接的电源脚。两端单板自测通过不能代替方向正确的板间验收。

## A protocol UART must have one owner and no console bytes

- 现象：EasyInput 的 J4 使用 UART0，而 ESP32-S3 的应用日志、bootloader 日志和 ROM 启动字符也可能占用同一线路；只把协议任务接到 GPIO43/44 并不能保证对端收到的都是协议帧。
- 做法：通过 `sdkconfig.defaults` 关闭应用控制台、secondary console、bootloader 日志和默认日志，把 UART0 的初始化、收发、解析和请求生命周期集中到一个任务；不写 eFuse，因此仍把不可逆关闭 ROM 日志之外的启动字符视为噪声，由两端流式解析器按 magic、长度、CRC 和 100 ms 字节间超时恢复同步。UART 初始化失败只降级 Link，不影响输入等已锁定能力。
- 规则：共享串口协议必须同时冻结“谁拥有端口”和“线上还可能出现什么字节”；关闭日志不能替代有界、可恢复的解析器，解析器绿测也不能冒充两块板已完成电气连接。

## A configuration save acknowledgement is not a read-status failure

- 现象：固件已经返回保存 ACK，实体功能和重新进入页面后的读取都正常，但保存页因为紧接着的第一次回读超时，把“键盘系统”和“同步结果”一起显示成失败。
- 做法：主进程在保存 ACK 后执行有界回读重试，指纹不一致仍立即失败关闭；renderer 分开维护板上配置读取状态与本次同步状态。ACK 后若重试仍不可读，只显示“已保存，回读待确认”，不得冒充完整验证成功，也不得把既有读取状态改写成读取失败。若 ACK 本身超时，只有随后完整回读与写入前已确认不同的预期指纹精确一致时才转为成功，否则继续报告失败。
- 规则：涉及持久化的 UI 必须区分“写入未发生”“写入已确认但回读未完成”“写入并回读一致”三种状态；不能用一个布尔值同时表示传输、持久化和读取健康。

## Repeated process startup must stay out of the voice output critical path

- 现象：转写完成后长时间停留在“正在写入目标窗口”，实际输出阶段先启动一次 PowerShell 查询前台窗口，再启动一次 PowerShell 发送粘贴键。
- 做法：本机实测空 PowerShell 冷启动平均约 1.35 秒，因此仅从两次减到一次仍不足。录音触发时和输出阶段都改用同一个常驻原生输入桥：即时捕获临时窗口句柄，输出时核对该精确句柄并用 `SendInput` 发送 Ctrl+V；命令不携带剪贴板文字、窗口标题或进程路径。目标变化、超时、部分发送或 helper 失败继续 fail closed，显式释放 modifier 并回退剪贴板。
- 规则：用户可感知的语音输出关键路径应把外部进程启动次数当作明确性能预算；合并调用时不得删除原有目标身份核对或失败回退。

## Bounded firmware configuration parsing must avoid a whole-document dynamic DOM

- 现象：普通按键配置可运行，但加入 Host Action 后保存会让按键和灯效停止；配置已经写入 NVS，完整重启又会在启动加载时重复触发。
- 根因：最多 2048 字节的配置在 ESP-IDF `-fno-exceptions` 环境中被递归解析成含 `std::string`、`std::vector` 的完整动态对象树，并在保存、回读、应用和启动恢复阶段连续重建。Host 上通过的小配置无法覆盖目标机的递归栈和动态分配压力。
- 做法：保留完整原始 JSON 作为无损存储真相，先做严格 UTF-8/JSON/深度验证，再以有界扫描器只提取冻结路径的运行时投影；未知字段、多 Profile、网络和音频字段继续原字节保存。Host 回归必须使用接近 2048 字节的真实配置，贯穿分块写入、双槽保存、回读、完整读取和模拟重启，并从 ESP32 ELF核对关键解析函数栈帧。
- 规则：固件中的有界输入不等于可以安全构造完整动态 DOM；涉及保存后重启恢复的配置功能，测试数据必须接近协议上限并覆盖完整生命周期，不能只测短样例的单次解析。

## A passing HID model test does not prove the real callback boundary

- 现象：Feature Report 两种 ID 形态和 `0x04` 多分块 completion 的 Host 测试均通过，两个 app 镜像真机仍在能力读取阶段超时；独立原生桥只看到设备连接，看不到第一条进度事件。
- 做法：把链路拆成 `HidD_SetFeature → TinyUSB set callback → owner queue → first input report → transfer callback → Windows Raw Input` 六个可观测边界，先定位第一处缺失再修改。测试必须使用真机观察到的 callback 长度和 Report ID 形态，不能由生产假设反向制造“黄金向量”。
- 规则：同一 HIL 症状连续否决两个候选后立即停止烧录；下一候选必须带真实边界证据、固定 Maker 差异和缺失测试向量。

## TinyUSB Feature Report callbacks must normalize Windows report-ID delivery

- 现象：Windows `HidD_SetFeature` 返回成功、设备枚举和普通 HID 均正常，但 `0x13` 配置读取静默超时；只测“Report ID 由 callback 参数单独给出”的 Host 向量无法复现。
- 根因：同一 Feature Report 可能以两种 TinyUSB callback 形态出现：Report ID 单独传入，或 Report ID 位于 `buffer[0]`。固定 Maker 的状态请求解码器明确兼容两者，DeskMate 第一版 T05 漏掉了内嵌形态。
- 做法：在 callback 边界先归一化 Report ID/载荷，拒绝冲突 ID、未知 ID、越界长度和非零填充，再把固定长度载荷复制给唯一 owner；Host 测试必须同时覆盖独立 ID、内嵌 ID、填充上限和冲突输入。涉及 Windows HID 行为时，参考审计不能只看协议字段，还要核对平台适配器的输入形态兼容。

## ESP-IDF fixed task stacks cannot carry configuration aggregates

- 现象：T05 旧镜像在 app_main 首次 NVS 加载时重启；大容量 ConfigLoadResult、ConfigSlotRecord、legacy JSON 和保存结果沿调用链落入主任务或 4 KiB owner task 栈。即使局部声明很短，aggregate = {} 也可能生成同尺寸隐式临时对象。
- 做法：把有界配置工作区放入唯一 owner 的静态成员或静态缓冲，函数通过调用方提供的结果/工作区写入；用 Host source-contract 禁止大对象回到 app_main、配置 owner 或输入 owner 栈，并从最终 ELF 读取真实栈帧。
- 规则：ESP-IDF 栈预算必须按编译后的栈帧和隐式临时对象验证，不能只看源码或盲目增大任务栈；配置/NVS 失败仍须 fail-soft，不得以启动崩溃换取恢复。

## Maker reference logic must be consulted before inventing a replacement

- 现象：T03 早期多轮修复围绕新 HID lifetime 的全零报告、mount 顺序、transfer-complete、GPIO40 DCD 重连和重复释放反复试验，Host 测试可通过但真机仍在第二次或后续断线留下 Ctrl。
- 做法：先固定读取 Maker 提交 `7619bd13f9ddfd6e2d80e2b8e022ef0acf32ce01` 的相关 `usb_hid`、keymap、held state、queue 和 host test，再判断产品合同是否适合采用其结构。最终采用的是 Maker synthetic `HidTap` 的 bounded press→restore 思路，按 DeskMate 合同独立重实现；不复制 Maker 运行时、工作区未提交内容或 build 产物。
- 规则：后续固件问题先做参考实现的行为核对和差异说明，再提出最小产品侧改动；参考逻辑不是盲目照搬，但不能在没有核对已有成熟路径前重复猜测。
- 止损门：若首个候选被真机证据否决，而固定参考覆盖同一子系统，下一候选开工前必须完成参考源码/测试差异表并补缺失向量；不得连续提交第二个猜测性修复。参考实现不适合产品合同时，也要先写明“不采用什么、为什么”。
- T05 再次验证：候选自行实现的简化 JSON/`std::stoi` 解析在 71/71 常规测试通过时仍可被畸形数值、UTF-8、转义和嵌套结构击穿，而 Maker 固定提交已经有非抛异常解析和完整负向用例。以后“参考优先”必须发生在写生产代码之前：先把适用的参考失败向量变成本仓红测，再做独立实现；不得等审计发现后才回头读参考。

## Firmware image hashes are not reproducible while compile timestamps are enabled

- 现象：原主电脑在精确 `5c09880`、ESP-IDF v5.5.5 和相同依赖下干净重建，app 大小仍为 `0x37310`，但 SHA-256 与已烧录镜像不同；生成配置显示 `CONFIG_APP_COMPILE_TIME_DATE=y` 且未启用 `CONFIG_APP_REPRODUCIBLE_BUILD`。
- 做法：把“源码提交可重建”和“已烧录二进制逐字节可复现”分开陈述。下一次申请烧录前启用并验证可复现构建，或明确保存受控、脱敏的发布产物与 manifest；在此之前不得用同提交的新构建哈希替代已烧录镜像哈希。

## T03 reconnect evidence must separate monitored and user-observed facts

- 现象：五次 HIL 中，前两轮由 Raw Input/PnP 诊断记录了连接状态和键事件，后三轮由用户连续完成后统一报告通过；诊断程序不能读取固件 HID 报告字节。
- 做法：交接文档分别标记底层监控证据与用户可见结果，不把未采集的每一轮报告伪装成监控事实；只有五次完整用户结果和既有功能回归共同通过后才关闭 T03。

## A new HID lifetime cannot reliably release an old lifetime's modifier

- 现象：Windows 已经从旧 USB HID lifetime 接收 Ctrl-down 后，物理移除设备再枚举同 VID/PID 的新 lifetime；新设备发送一次或反复全零报告、等待 TinyUSB transfer-complete，甚至显式 DCD disconnect/connect，仍可能留下旧 Ctrl。第一次通过、后续失败只是 PnP/消费时序差异，不能当作修复证据。
- 做法：没有持续 hold 产品语义的命令键应在旧 lifetime 存活时完成 press→restore，并原子预留两份 FIFO 报告；恢复帧必须精确恢复并发 held snapshot，而不是无条件全零。只有 PTT 等确需持续 hold 的键保留 stateful down/up，断线时继续 fail closed 并通过真实 HIL 验证。

## USB unplug HIL must model MCU cold boot, not only logical remount

- 现象：同一个运行时对象上的 unmount→mount Host 测试和 mount 首帧全释放都通过，但实体 USB 拔线会同时切断板子供电；修复版真机仍复现 Windows modifier 粘连。
- 做法：断线合同的自动化必须另建“固件状态全部丢失、上电时实体键已经按住”的冷启动向量，并验证初始物理采样、TinyUSB ready、传输完成、抑制期和实体释放之间的先后关系。测试通过前只能把冷启动基线遗漏标为假设，不能以同一对象 remount 代替真实断电证据。

## USB HID remount must explicitly clear host-visible modifiers

- 现象：组合键按下时直接拔掉 USB，固件虽在 unmount/mount 清空内部队列和 held source，Windows 仍可能保留旧设备最后一次看到的 modifier；重新连接后普通字母会继续表现为 `Ctrl+A` 等组合键。
- 做法：每个新的 mount epoch 在接受新实体输入前，先由唯一 USB owner 发送一份显式全释放键盘报告；同时清空旧报告/滚轮队列，并继续抑制重连时仍按住的实体键，直到它真实释放。Host 测试要锁定“按住 modifier 拔线 → 重连首帧全释放 → 释放旧键 → 新输入正常”。

## Electron app identity changes strand encrypted user data

- 现象：项目迁移或打包名称变化后，Electron `app.getPath("userData")` 可能从旧 profile 切到新 profile；`safeStorage` 密文仍在旧目录，但当前应用的状态和凭据从新目录读取，于是用户明明“以前配置过”，新版本仍表现为未配置。
- 做法：发布前冻结 app identity 和 user-data 目录；必须改名时设计显式、可审计且经用户确认的一次迁移，先只比较记录存在性和 schema，不输出或写日志记录密钥。未实现迁移时让用户在当前应用重新保存自己的 Key，不静默复制密文，也不要把所有配置/请求错误压成同一条等待文案。

## A new ESP-IDF build directory can still reuse a stale source sdkconfig

- 现象：仅更换 `-B build-*` 目录时，ESP-IDF 仍默认读取源码根下被忽略的 `sdkconfig`；新增 `sdkconfig.defaults` 不会自动覆盖旧生成值，导致“全新 build”继续使用旧分区表。
- 做法：需要验证 defaults 的隔离构建时，显式把 `SDKCONFIG` 指向新构建目录内的新文件；对分区、Flash 大小等恢复性合同同时增加 CMake fail-closed 检查和 Host source-contract 测试，不能只看 build 目录名称。

## First-flash review must diff the live partition table

- 现象：应用能够构建且空间充足，不代表烧录安全；T03 默认 1 MiB 表与实板 3 MiB factory + 双声音 bank 不同，直接执行标准 `flash` 会在功能代码正确的情况下破坏存储合同。
- 做法：首次烧录先整片备份，再解析并逐项比较实板与候选分区表；保留布局时要求生成二进制逐字节一致，并证明 bootloader、partition table、app 三段写入不触及 NVS/PHY/资源 bank。

## Cross-task lifecycle callbacks must preserve order

- 现象：用多个独立布尔 pending 标志把 mount/unmount 等 callback 交给 owner task，会把同一消费周期内的不同先后序列压成同一个集合；固定处理顺序可能让最终状态与最后一个真实事件相反。
- 做法：跨 task 的生命周期变化使用有界有序事件、单调序列或可证明等价的状态机；测试必须同时覆盖 A→B 与 B→A、重复事件和旧 lifetime 完成回调，不能只分别调用单个 callback。

## Golden vectors must compare the complete artifact

- 现象：抽查少量 descriptor 索引或只解析 Report ID/长度，无法阻止 endpoint、attributes、usage、logical range、flags 和顺序在未覆盖位置漂移，却容易被误称为“精确黄金向量”。
- 做法：黄金向量先对生产使用的完整 bytes 做逐字节比较，再增加语义解析作为第二层断言；两层证据分别回答“是否完全相同”和“为何符合合同”。

## Windows paths and archives

- 现象：包含中文路径的 Git tar 在 Windows `tar.exe` 解包时可能出现乱码和损坏提示。
- 做法：正式项目使用英文目录；需要读取旧提交时优先使用临时 Git worktree，而不是经 PowerShell 管道传输二进制 tar。

## Build directory locks

- 现象：运行中的 `DeskMate.exe` 会锁住 `release/win-unpacked`，导致 electron-builder 报 EBUSY。
- 做法：打包前关闭正在运行的 DeskMate，再重试构建；不要把它误判为源码错误。

## ESP-IDF toolchain activation is process-local

- 现象：新的 PowerShell 工具进程中直接运行 `cmake`、`ctest` 或 `idf.py` 可能提示命令不存在，即使此前另一个终端已经激活过 ESP-IDF；PowerShell 的 `$LASTEXITCODE` 也不能可靠代表“命令未找到”这一类调用失败。
- 做法：每个执行 ESP-IDF/Host 验证的新进程先显式加载冻结版本的环境入口，再检查工具版本；命令链同时检查 PowerShell 成功状态或直接抛错，不凭陈旧的 `$LASTEXITCODE` 宣称测试通过。

## Overflow recovery must discard incomplete event history

- 现象：输入 ring 已满时，如果只发送全释放报告、随后继续消费 ring 中旧事件，被丢弃的 Release 之前残留的 Press 会再次生成 key-down，造成粘键。
- 做法：任何输入事件丢弃都会让剩余事件序列失去完整性；owner 必须先丢弃整个 pending ring，再用当前实体采样重建 suppress/release 状态，并以“松开事件被丢弃”的端到端测试锁定。

## npm production defaults

- 现象：部分电脑的 npm 全局配置偏向 production，导致缺少开发依赖。
- 做法：使用 `npm ci --include=dev`。

## Hardware evidence

- 现象：Windows 枚举到 HID 或网络可用，不等于板载麦克风或厂商协议已经连接。
- 做法：界面分别展示 HID、电脑麦克风、板载音频、千问和输出状态；只有协议握手成功才声明真实连接。

## Clipboard success must be observed

- 现象：渲染进程直接调用 `navigator.clipboard` 并吞掉异常，会在系统拒绝写入时仍提示“已复制”。
- 做法：通过受控 Electron 剪贴板桥执行写入，只在返回成功后显示成功；失败保留原文并给出可见错误。

## Global workflows cannot be page-owned

- 现象：VoiceWorkflow 只在语音页挂载时，全局按键不得不先切页，既抢焦点又可能丢事件。
- 做法：全局控制器在应用生命周期内保持单例挂载，页面只决定内容是否可见，底部胶囊独立展示实时状态。

## Whole-document device configuration needs read-modify-write

- 现象：把“同步当前按键”误当成局部 patch，可能通过整份配置报告清空板上的 Wi-Fi 或音频设置。
- 做法：先读取完整配置并验证版本，再只替换用户确认的字段、展示差异、写入并核对保存确认；闭环未完成前阻止写入。

## Three-end work needs feature-package gates

- 现象：桌面、总控和云台若同时改十个无关功能，失败后无法判断是状态机、传输、路由还是执行端回归。
- 做法：按相似能力组成小包；每包立刻跑定向测试、连通测试和旧功能全量回归，证据完整后锁定。失败就留在当前包修复，不把新功能叠上去。

## Queue capacity and callback epochs must share production truth

- 现象：使用“空槽区分空/满”的环形队列时，存储长度 16 实际只有 15 个可用槽；如果 callback 忽略 publish 失败，关键生命周期事件会静默消失。另行复制一套测试处理器或由 callback 与 owner 分别推进 epoch，也会让测试通过但生产状态分叉。
- 做法：声明容量 N 时为 sentinel 另加一个存储槽，并对满队列做饱和计数与 fail-safe 状态重建；callback 状态生成和 owner 消费逻辑必须是 Host 测试直接调用的生产实现。重复事件、真实 remount、第 N 条、第 N+1 条和溢出恢复都要作为边界向量锁定。
# 2026-08-28 · Whole-worktree copying destroys provenance

- 直接把一台电脑的整个项目目录覆盖到另一台，会把过期 build、sdkconfig、未跟踪审计文档和远端状态混在一起，既拖慢审计，也无法证明哪个提交生成了镜像。
- 处理方式是把生成物移入 Git 忽略的待删除目录，仅保留可追溯源码/文档；此后只用 Git 提交交换，并在干净 HEAD 后重新构建烧录镜像。

## Performance changes must preserve a HIL-proven Windows focus boundary

- 现象：语音输出的 PowerShell 路径已经在真机上成功写回目标窗口；为减少约 1.35 秒进程启动耗时，将目标捕获和粘贴迁移到常驻原生桥后，连续候选均出现“目标窗口已变化”并回退剪贴板。250 ms 稳定采样虽通过自动化，也没有修复用户现场失败。
- 做法：性能优化不能在缺少等价 HIL 的情况下替换已通过的跨进程焦点边界。候选被真机否决后，应恢复最后已知稳定实现，再单独设计可观测、可回滚的性能改进；自动化只证明失败关闭和调用形态，不能代替真实 Windows 焦点/输入注入验收。
# Parallel branches need collision-safe decision identifiers

- 现象：Windows 软件线和硬件总控线都从同一个较早的 `flow/decisions.md` 分叉，并各自继续使用 D053-D059；最终三端合并时出现相同编号代表不同稳定决策，按编号引用会失真。
- 做法：主 Agent 合并前先检查新增决策编号的交集；发生冲突时保留控制基线编号，整体平移另一分支的新增编号并同步所有引用。后续并行窗口提交交接时必须同时报告新增决策编号范围，不能只报告代码 HEAD。
