import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  IconAdjustmentsHorizontal as AdjustmentsHorizontal,
  IconAlertCircle as AlertCircle,
  IconAppWindow as AppWindow,
  IconArrowDown as ArrowDown,
  IconArrowLeft as ArrowLeft,
  IconArrowRight as ArrowRight,
  IconArrowUp as ArrowUp,
  IconBluetooth as Bluetooth,
  IconBellRinging as BellRinging,
  IconBook2 as Book2,
  IconBrain as Brain,
  IconCheck as Check,
  IconCloudDownload as CloudDownload,
  IconCode as Code,
  IconCopy as Copy,
  IconDeviceFloppy as DeviceFloppy,
  IconDownload as Download,
  IconEye as Eye,
  IconEyeOff as EyeOff,
  IconFileExport as FileExport,
  IconFolderOpen as FolderOpen,
  IconGauge as Gauge,
  IconHistory as History,
  IconKeyboard as Keyboard,
  IconLink as Link,
  IconLock as Lock,
  IconMessageCircle2 as MessageCircle,
  IconMicrophone2 as Microphone2,
  IconMoodHappy as MoodHappy,
  IconMoodNerd as MoodNerd,
  IconMoodSmile as MoodSmile,
  IconMoon as Moon,
  IconMusic as Music,
  IconPlayerPause as PlayerPause,
  IconPlayerPlay as PlayerPlay,
  IconPlus as Plus,
  IconRefresh as Refresh,
  IconRobot as Robot,
  IconSend as Send,
  IconSettings2 as Settings2,
  IconSparkles as Sparkles,
  IconSun as Sun,
  IconTemperature as Temperature,
  IconTrash as Trash,
  IconUpload as Upload,
  IconUser as User,
} from "@tabler/icons-react";
import { agents, expressionPresets, historyItems } from "./appData.js";
import { CompanionFace, expressionAssetUrl } from "./CompanionFace.jsx";
import { ChoreographyEditor } from "./ChoreographyEditor.jsx";
import { useAppStore } from "./store/appStore.js";
import { useRecorder } from "./hooks/useRecorder.js";
import { useEasyInputRecorder } from "./hooks/useEasyInputRecorder.js";
import { clearRecordingBlobs, deleteRecordingBlob, getRecordingBlob, saveRecordingBlob } from "./store/recordingStore.js";
import { mockAdapters } from "./adapters/index.js";
import { voiceAdapters } from "./adapters/voiceAdapters.js";
import { BailianSttAdapter, BailianTextOrganizer, ConfigurableTextOrganizer, HttpSttAdapter, MockSttAdapter } from "./adapters/sttAdapters.js";
import { DeviceSimulator } from "./adapters/deviceSimulator.js";
import { deviceEventBus } from "./domain/deviceEvents.js";
import { actionLabel, createKeyboardConfig, ENCODER_PRESS_ACTIONS, KEY_ACTIONS, limitUtf8Bytes, normalizeEncoder, normalizeKeyBinding } from "./domain/keymap.js";
import { keyboardConfigReadMessage, readKeyboardConfigWithRetry } from "./domain/keyboardConfigRead.js";
import { MANUAL_AGENT_OPTIONS, MANUAL_AGENT_STATES, manualAgentName, manualAgentState, normalizeAgentControl } from "./domain/agentControl.js";
import { shortcutDisplay, shortcutFromKeyboardEvent } from "./domain/shortcutCapture.js";
import { initialVoiceSession, voiceSessionReducer } from "./domain/voiceSession.js";
import { microphoneSourceFailureMessage, normalizeMicrophoneSource, startMicrophoneSession } from "./domain/microphoneSource.js";
import { normalizeAgentDelivery, normalizeLinkDiagnostics } from "./domain/linkDiagnostics.js";
import { COMPANION_DEFAULTS, companionPreferencesToDraft, parseCompanionPreferenceDraft } from "./domain/companionPreferences.js";
import { agentStateEvidence, manualAgentStateFailureMessage, previewSoftwareExpression, requestManualAgentState } from "./domain/expressionLinkUx.js";
import { dashboardHardwareStatus } from "./domain/dashboardStatus.js";
import { deviceServiceStatus } from "./domain/deviceServiceStatus.js";
import { createDiagnosticReport } from "./services/diagnostics.js";
import { processVoiceRecording } from "./services/voicePipeline.js";
import { mapAiStateToPetIntent } from "./domain/petIntent.js";
import {
  Button,
  Card,
  ConfirmationDialog,
  EmptyState,
  IconButton,
  Keycap,
  Metric,
  Notice,
  PageIntro,
  SearchField,
  SectionTitle,
  Segmented,
  Select,
  SettingRow,
  Slider,
  StatusBadge,
  Toggle,
} from "./ui.jsx";

const moodIcons = {
  focus: MoodNerd,
  listen: MoodSmile,
  think: Brain,
  happy: MoodHappy,
  sleep: Moon,
  alert: AlertCircle,
};

function ShortcutRecorder({ value, onConfirm, global = false, allowSingle = false }) {
  const [capturing, setCapturing] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [message, setMessage] = useState("");
  const stopCapture = useCallback(() => {
    setCapturing(false);
    setCandidate("");
    setMessage("");
    if (global) voiceAdapters.desktop.setShortcutCapture(false).catch(() => {});
  }, [global]);
  const startCapture = async () => {
    setMessage("");
    setCandidate("");
    if (global) await voiceAdapters.desktop.setShortcutCapture(true);
    setCapturing(true);
  };
  useEffect(() => {
    if (!capturing) return undefined;
    const capture = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!allowSingle && event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) { stopCapture(); return; }
      const result = shortcutFromKeyboardEvent(event, { allowSingle });
      if (result.error) { setCandidate(""); setMessage(result.error); }
      else if (result.shortcut) { setCandidate(result.shortcut); setMessage("请确认是否使用这个快捷键"); }
      else { setCandidate(""); setMessage(result.display ? `已按下 ${result.display}，请继续按一个字母、数字或功能键` : "请按下组合键"); }
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [allowSingle, capturing, stopCapture]);
  useEffect(() => () => { if (global) voiceAdapters.desktop.setShortcutCapture(false).catch(() => {}); }, [global]);
  const confirm = async () => {
    if (!candidate) return;
    try {
      await onConfirm(candidate);
      stopCapture();
    } catch (error) {
      setMessage(error.message || "快捷键无法注册");
    }
  };
  return (
    <div className="shortcut-recorder">
      <button type="button" className={`shortcut-recorder__field ${capturing ? "is-capturing" : ""}`} onClick={startCapture}>{capturing ? shortcutDisplay(candidate) || (allowSingle ? "请按下单键或组合键…" : "请按下新的组合键…") : shortcutDisplay(value) || "点击录制快捷键"}</button>
      {capturing && <div className="shortcut-recorder__confirm"><small>{message || (allowSingle ? "请按下单键或组合键；使用取消按钮退出" : "请同时按下修饰键和一个按键；Esc 取消")}</small><div><Button variant="ghost" onClick={stopCapture}>取消</Button><Button variant="primary" disabled={!candidate} onClick={confirm}>确认</Button></div></div>}
    </div>
  );
}

function ApplicationPicker({ binding, onChange, notify }) {
  const [apps, setApps] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [voicePolicy, setVoicePolicy] = useState({ loaded: false, enabled: false });
  const load = useCallback(async () => {
    setLoading(true);
    try { setApps(await voiceAdapters.desktop.listApplications()); }
    catch { notify("无法读取 Windows 应用列表"); }
    finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    if (!binding.appActionId) { setVoicePolicy({ loaded: true, enabled: false }); return () => { active = false; }; }
    voiceAdapters.desktop.getApplicationVoicePolicy(binding.appActionId).then((value) => {
      if (active) setVoicePolicy({ loaded: Boolean(value?.id), enabled: value?.voiceEnabled === true });
    }).catch(() => { if (active) setVoicePolicy({ loaded: false, enabled: false }); });
    return () => { active = false; };
  }, [binding.appActionId]);
  const select = async (token) => {
    try {
      const result = await voiceAdapters.desktop.registerApplication(token);
      if (!result?.id) throw new Error("应用注册失败");
      onChange({ ...binding, appActionId: result.id, appName: result.label });
      setVoicePolicy({ loaded: true, enabled: result.voiceEnabled === true });
    } catch (error) { notify(`选择失败：${error.message}`); }
  };
  const choose = async () => {
    try {
      const result = await voiceAdapters.desktop.chooseApplication();
      if (result?.cancelled) return;
      if (!result?.id) throw new Error("应用注册失败");
      onChange({ ...binding, appActionId: result.id, appName: result.label });
      setVoicePolicy({ loaded: true, enabled: result.voiceEnabled === true });
    } catch (error) { notify(`选择失败：${error.message}`); }
  };
  const test = async () => {
    const result = await voiceAdapters.desktop.testApplication(binding.appActionId);
    notify(result?.ok ? `已打开 ${result.label || binding.appName}` : `无法打开应用：${result?.reason || "未知错误"}`);
  };
  const setVoiceEnabled = async (enabled) => {
    const result = await voiceAdapters.desktop.setApplicationVoiceEnabled(binding.appActionId, enabled);
    if (!result?.ok) return notify(`语音权限未保存：${result?.reason || "未知错误"}`);
    setVoicePolicy({ loaded: true, enabled: result.voiceEnabled === true });
    notify(result.voiceEnabled ? `已允许语音直接打开 ${result.label}` : `已关闭 ${result.label} 的语音直接打开`);
  };
  const filtered = apps.filter((app) => app.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 30);
  return (
    <div className="application-picker">
      {binding.appActionId && <div className="application-picker__selected"><AppWindow size={20} /><strong>{binding.appName || "已选择应用"}</strong><Button variant="ghost" onClick={test}>测试打开</Button></div>}
      {binding.appActionId && <SettingRow title="允许陪伴语音直接打开" description="仅此已登记应用；旧注册项和新注册项默认关闭。路径、参数、网址与 Shell 始终拒绝。"><Toggle checked={voicePolicy.enabled} disabled={!voicePolicy.loaded} onChange={(value) => { void setVoiceEnabled(value); }} /></SettingRow>}
      <SearchField value={query} onChange={setQuery} placeholder={loading ? "正在读取应用…" : "搜索已安装应用"} />
      <div className="application-picker__summary"><span>{query.trim() ? "搜索结果" : "已安装应用"}</span><small>{loading ? "读取中" : `${filtered.length} 项`}</small></div>
      <div className="application-picker__list" role="listbox" aria-label="可选择的 Windows 应用">
        {!loading && filtered.length === 0 && <div className="application-picker__empty">{query.trim() ? "没有匹配的应用" : "暂未发现可用应用"}</div>}
        {filtered.map((app) => <button type="button" role="option" aria-selected={binding.appName === app.label} title={app.label} key={app.token} onClick={() => select(app.token)}><AppWindow size={16} /><span>{app.label}</span></button>)}
      </div>
      <div className="application-picker__footer"><Button icon={FolderOpen} variant="ghost" onClick={choose}>选择其他应用</Button><Button variant="ghost" onClick={load}>刷新</Button></div>
    </div>
  );
}

function BindingEditor({ binding, onChange, options = KEY_ACTIONS, notify }) {
  const current = normalizeKeyBinding(binding);
  const changeAction = (action) => onChange({ action });
  return <>
    <label>按下动作<Select value={current.action} onChange={changeAction} ariaLabel="按键动作">{options.map((action) => <option value={action.id} key={action.id}>{action.label}</option>)}</Select></label>
    {current.action === "hotkey" && <label>快捷键<ShortcutRecorder allowSingle value={current.shortcut || "点击录制快捷键"} onConfirm={async (shortcut) => onChange({ ...current, shortcut })} /></label>}
    {current.action === "fixed-text" && <label>固定文字<textarea value={current.text || ""} onChange={(event) => onChange({ ...current, text: limitUtf8Bytes(event.target.value) })} placeholder="输入按键要写出的文字" /><small>{new TextEncoder().encode(current.text || "").length} / 960 字节</small></label>}
    {current.action === "open-app" && <ApplicationPicker binding={current} onChange={onChange} notify={notify} />}
    {current.action === "companion-call" && <div className="application-picker__selected"><MessageCircle size={20} /><strong>AI 陪伴呼唤</strong><Button variant="ghost" onClick={async () => { const result = await voiceAdapters.desktop.testCompanionCallAction(); notify(result?.ok ? "测试动作已响应，请查看陪伴会话状态" : result?.reason === "companion-call-busy" ? "陪伴会话正在切换，请稍候" : `测试动作失败：${result?.reason || "桌面桥不可用"}`); }}>测试此动作</Button></div>}
  </>;
}
const DEVICE_FACE_URL = `${import.meta.env.BASE_URL}assets/deskmate-focus-face.png`;

function ExpressionTile({ preset, selected, onClick, compact = false }) {
  const source = preset.assetUrl || expressionAssetUrl(preset.id);
  return (
    <button className={`expression-tile expression-tile--${preset.color} ${selected ? "is-selected" : ""} ${compact ? "is-compact" : ""}`} onClick={onClick}>
      <span className="expression-screen"><img src={source} alt={`${preset.name}表情`} /></span>
      <span><strong>{preset.name}</strong>{!compact && <small>{preset.description}</small>}</span>
      {selected && <span className="expression-check"><Check size={14} /></span>}
    </button>
  );
}

function AgentStateTestPanel({ notify, navigate, index = "03" }) {
  const { state, patch, event } = useAppStore();
  const control = normalizeAgentControl(state.agentControl);
  const evidence = agentStateEvidence(state.runtime?.inputBridge);
  const [request, setRequest] = useState({ status: "idle", label: "尚未发送", at: "" });
  const updateControl = (value) => patch({ agentControl: normalizeAgentControl({ ...control, ...value }) });
  const sendState = async (requestedState) => {
    const selected = manualAgentState(requestedState);
    updateControl({ state: requestedState });
    setRequest({ status: "sending", label: `正在发送 ${selected.label}…`, at: "" });
    const result = await requestManualAgentState({ desktop: voiceAdapters.desktop, control, requestedState });
    if (!result.ok) {
      const label = manualAgentStateFailureMessage(result.reason);
      setRequest({ status: "error", label, at: new Date().toISOString() });
      notify(label);
      return;
    }
    const progress = requestedState === "completed" ? 100 : requestedState === "idle" ? 0 : state.aiEvent.progress;
    event({ type: requestedState, agent: result.agentName, progress, detail: `手动状态 · ${selected.label}` });
    setRequest({ status: "success", label: `EasyInput 写入 ACK 成功 · ${selected.label}`, at: new Date().toISOString() });
    notify(evidence.link.status === "connected" ? "EasyInput 已接受状态；Link 已连接，请观察小智屏幕确认显示" : "EasyInput 已接受状态，但 Link 未连接，不能证明小智已经显示");
  };
  const requestIsNewest = request.at && (!evidence.delivery.at || Date.parse(request.at) >= Date.parse(evidence.delivery.at));
  const showRequest = request.status === "sending" || requestIsNewest;
  const deliveryLabel = showRequest ? request.label : evidence.easyInputLabel;
  const deliveryTone = showRequest && request.status === "success" ? "success" : showRequest && request.status === "error" ? "warning" : evidence.delivery.status === "acknowledged" ? "success" : "neutral";
  return (
    <Card className="companion-hardware-state-test">
      <div className="companion-hardware-state-test__header">
        <SectionTitle index={index} title="小智工作状态测试" description="通过既有 Agent State 通道真实写入 EasyInput；重复点击当前状态也会产生一次新发送。" />
        <StatusBadge tone={evidence.link.status === "connected" ? "success" : "demo"}>Link · {evidence.linkLabel}</StatusBadge>
      </div>
      <div className="manual-agent-state-grid" aria-label="发送小智真实工作状态">{MANUAL_AGENT_STATES.map((item) => <button type="button" className={control.state === item.id ? "is-selected" : ""} aria-pressed={control.state === item.id} disabled={request.status === "sending"} key={item.id} onClick={() => { void sendState(item.id); }}><strong>{item.label}</strong><span>{item.transport}</span><small>{item.description}</small></button>)}</div>
      <div className="agent-state-evidence" aria-live="polite">
        <div><small>当前选择</small><strong>{manualAgentState(control.state).label}</strong></div>
        <div><small>EasyInput 写入</small><StatusBadge tone={deliveryTone}>{deliveryLabel}</StatusBadge></div>
        <div><small>小智 DeskMate Link</small><StatusBadge tone={evidence.link.status === "connected" ? "success" : "demo"}>{evidence.linkLabel}</StatusBadge></div>
        <div><small>显示证据</small><strong>{evidence.link.status === "connected" ? "需观察小智屏幕确认" : "当前不能确认"}</strong></div>
      </div>
      <div className="companion-hardware-state-test__footer"><p>EasyInput ACK 只证明写入被总控接受，不等于小智已经显示。Link 未连接时绝不把它当成小智显示成功。</p><Button icon={Gauge} variant="ghost" onClick={() => navigate?.("settings/diagnostics")}>查看系统诊断</Button></div>
    </Card>
  );
}

export function CompanionPage({ notify, navigate, stopCompanion }) {
  const { state, patch, updateCompanion } = useAppStore();
  const [section, setSection] = useState("overview");
  const [companionDraft, setCompanionDraft] = useState(() => companionPreferencesToDraft({ name: state.settings.companionName, wakePhrase: state.settings.companionWakePhrase, endSmoothWindowMs: state.settings.companionEndSmoothWindowMs, idleTimeoutMs: state.settings.companionIdleTimeoutMs }));
  const [companionSettingsStatus, setCompanionSettingsStatus] = useState({ state: "idle", message: "" });
  const [personaDraft, setPersonaDraft] = useState({ role: "可靠、温暖的桌面工作伙伴", traits: "耐心、诚实、克制、主动但不打扰", speakingStyle: "自然、简短、清晰；先给结论，再补必要说明", boundaries: "不编造事实；不声称拥有未接入的硬件能力；不直接执行系统命令；涉及外部动作时先说明并等待确认" });
  const [personaStatus, setPersonaStatus] = useState({ state: "idle", message: "" });
  const conversation = state.runtime?.companion || { active: false, state: "idle", audioSource: {}, audioSink: {}, service: {} };
  const sessionActive = Boolean(conversation.active);
  const preferredCompanionSource = normalizeMicrophoneSource(state.settings.microphoneSource);
  const activeCompanionSource = conversation.audioSelection?.activeSource || (sessionActive ? preferredCompanionSource : "");
  const companionSourceLabel = activeCompanionSource === "easyinput" ? "EasyInput 板载麦克风" : activeCompanionSource === "computer" ? "电脑麦克风" : preferredCompanionSource === "easyinput" ? "EasyInput（开始前可回退）" : "电脑麦克风";
  const conversationExpression = { connecting: "listen", listening: "listen", thinking: "think", speaking: "focus", completed: "happy", error: "alert", stopping: "sleep" }[conversation.state];
  const expression = conversationExpression || state.currentExpression;
  const selectedPreset = expressionPresets.find((item) => item.id === expression) || expressionPresets[0];
  const serviceStatus = deviceServiceStatus({ inputBridge: state.runtime?.inputBridge, audioStatus: state.runtime?.easyInputAudio, preferredMicrophoneSource: state.settings.microphoneSource, companion: conversation, memory: state.runtime?.memory });
  const companionName = (sessionActive ? conversation.sessionPolicy?.sessionApplied?.name : state.settings.companionName) || state.settings.companionName || COMPANION_DEFAULTS.name;
  useEffect(() => {
    setCompanionDraft(companionPreferencesToDraft({ name: state.settings.companionName, wakePhrase: state.settings.companionWakePhrase, endSmoothWindowMs: state.settings.companionEndSmoothWindowMs, idleTimeoutMs: state.settings.companionIdleTimeoutMs }));
  }, [state.settings.companionName, state.settings.companionWakePhrase, state.settings.companionEndSmoothWindowMs, state.settings.companionIdleTimeoutMs]);
  useEffect(() => {
    let active = true;
    globalThis.desktopBridge?.getCompanionPersona?.().then((value) => { if (active && value?.persona) setPersonaDraft(value.persona); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const conversationCopy = {
    idle: [`你好，我是${companionName}`, conversation.sessionPolicy?.lastStopReason === "listening-idle-timeout" ? "长时间未说话，已结束。按一下可重新进入连续对话。" : "按一下进入连续对话；文字语音输入会优先中断陪伴会话。"],
    connecting: ["正在连接…", "正在建立豆包实时对话会话。"],
    listening: ["我在聆听…", conversation.transcript || "请开始说话，再按一次或 Esc 结束。"],
    thinking: ["让我想一想…", conversation.transcript || "正在理解这一轮对话。"],
    speaking: ["正在回答…", conversation.reply || "回复音频正在送往已接入的音频输出。"],
    completed: ["这一轮完成啦", "会话保持开启，马上继续倾听。"],
    stopping: ["正在结束…", "正在释放网络与音频资源。"],
    error: ["陪伴会话已停止", conversation.error || "请检查服务和音频适配状态。"],
  }[conversation.state] || [`你好，我是${companionName}`, "随时陪伴，记住你的偏好与重要事项。"];
  const blockerCopy = {
    "realtime-service-not-configured": "请先在“设备与诊断 → AI 服务”配置豆包实时语音",
    "easyinput-audio-source-pending": "EasyInput 板载麦克风尚未就绪",
    "easyinput-audio-not-configured": "请先在“设备与诊断 → EasyInput 音频设置”完成板载麦克风配置",
    "easyinput-audio-heartbeat-timeout": "未收到 EasyInput 音频心跳，请检查同一局域网和板上配置",
    "multiple-easyinput-audio-sources": "检测到多个 EasyInput 音频来源，已拒绝自动选择",
    "easyinput-audio-sink-pending": "EasyInput 扬声器播放适配器尚未接入",
    "easyinput-speaker-contract-not-frozen": "EasyInput 扬声器下行协议尚未冻结，本次使用电脑扬声器",
    "computer-audio-renderer-unavailable": "电脑音频桥尚未就绪，请重新打开 DeskMate",
    "computer-microphone-permission-denied": "电脑麦克风权限被拒绝",
    "computer-microphone-not-found": "没有找到可用的电脑麦克风",
    "computer-microphone-device-unavailable": "已选择的电脑麦克风不可用",
    "computer-speaker-start-failed": "电脑扬声器无法启动",
    "voice-workflow-active": "文字语音输入或语音编辑正在使用音频，请先结束",
    "desktop-bridge-unavailable": "请使用 DeskMate 桌面版启动陪伴对话",
    "doubao-handshake-rejected": "豆包服务拒绝了连接，请检查 App ID、Access Key 和服务开通状态",
    "doubao-handshake-service-error": "豆包连接握手失败，请检查实时语音服务配置",
    "doubao-session-service-error": "豆包会话启动失败，请检查模型、音色和资源权限",
    "doubao-service-error": "豆包实时语音服务返回错误，请稍后重试或检查控制台配置",
    "doubao-frame-header-invalid": "豆包返回了不兼容的帧头，已安全结束会话",
    "doubao-frame-layout-invalid": "豆包返回了不完整的协议帧，已安全结束会话",
    "doubao-frame-compression-invalid": "豆包返回的压缩帧无法安全解码，已结束会话",
    "doubao-frame-json-invalid": "豆包返回的数据格式无效，已安全结束会话",
    "doubao-frame-identifier-invalid": "豆包返回的会话标识无效，已安全结束会话",
  };
  const toggleSession = async () => {
    try {
      const result = sessionActive ? await stopCompanion?.("page") : await globalThis.desktopBridge?.startCompanionConversation?.({ microphoneSource: preferredCompanionSource, microphoneId: state.settings.microphoneId || "" });
      if (!result?.ok) return notify(blockerCopy[result?.reason] || `陪伴对话未启动：${result?.reason || "服务不可用"}`);
      const fallback = result.status?.audioSelection?.fallback || result.status?.audioSource?.fallback;
      if (fallback) notify(`${microphoneSourceFailureMessage(fallback.reason)}，本次陪伴会话已回退电脑麦克风`);
      else notify(sessionActive ? "陪伴对话已安全结束" : `陪伴对话已开始 · ${preferredCompanionSource === "easyinput" ? "EasyInput 麦克风" : "电脑麦克风"} + 电脑扬声器`);
    } catch (error) { notify(`陪伴对话失败：${error.message}`); }
  };
  const interruptResponse = async () => {
    try {
      const result = await globalThis.desktopBridge?.interruptCompanionConversation?.();
      notify(result?.ok ? "已打断当前回答，继续倾听" : blockerCopy[result?.reason] || "当前没有可打断的回答");
    } catch (error) { notify(`打断失败：${error.message}`); }
  };
  const saveCompanionSettings = async () => {
    const parsed = parseCompanionPreferenceDraft(companionDraft);
    if (!parsed.ok) {
      setCompanionSettingsStatus({ state: "error", message: parsed.reason });
      return;
    }
    setCompanionSettingsStatus({ state: "saving", message: "正在保存并回读…" });
    try {
      const result = await voiceAdapters.desktop.setCompanionPreferences(parsed.value);
      if (!result?.preferences) throw new Error("companion-preferences-readback-unavailable");
      const preferences = result.preferences;
      patch({ settings: { ...state.settings, companionName: preferences.name, companionWakePhrase: preferences.wakePhrase, companionEndSmoothWindowMs: preferences.endSmoothWindowMs, companionIdleTimeoutMs: preferences.idleTimeoutMs } });
      setCompanionDraft(companionPreferencesToDraft(preferences));
      updateCompanion({ preferences, savedPreferences: { revision: result.revision, endSmoothWindowMs: preferences.endSmoothWindowMs, idleTimeoutMs: preferences.idleTimeoutMs }, wakeWord: result.wakeWord });
      const message = `已保存并回读：停顿 ${preferences.endSmoothWindowMs / 1000} 秒，空闲结束 ${preferences.idleTimeoutMs === 0 ? "关闭" : `${preferences.idleTimeoutMs / 1000} 秒`}。${sessionActive ? "当前会话不变；结束并重新开始后，软件会向豆包提交新的判停请求。" : "下一次新建陪伴会话时，软件会向豆包提交新的判停请求。"}`;
      setCompanionSettingsStatus({ state: "saved", message });
      notify(message);
    } catch {
      setCompanionSettingsStatus({ state: "error", message: "设置保存或回读失败，原有配置保持不变" });
    }
  };
  const savePersona = async () => {
    setPersonaStatus({ state: "saving", message: "正在保存并回读人设…" });
    try {
      const result = await globalThis.desktopBridge?.setCompanionPersona?.(personaDraft);
      if (!result?.persona) throw new Error("companion-persona-readback-unavailable");
      setPersonaDraft(result.persona);
      setPersonaStatus({ state: "saved", message: `人设版本 ${result.persona.version} 已保存；从下一次陪伴会话生效。` });
      notify("陪伴人设已保存并回读");
    } catch { setPersonaStatus({ state: "error", message: "人设保存或回读失败，原有配置保持不变" }); }
  };
  const confirmIntent = async () => {
    const token = conversation.proposal?.token;
    if (!token) return;
    const result = await globalThis.desktopBridge?.confirmCompanionIntent?.(token);
    notify(result?.ok ? result.codex?.summary || "已执行确认的安全动作" : `动作未执行：${result?.reason || "确认已过期"}`);
    updateCompanion({ proposal: null, intent: await globalThis.desktopBridge?.getCompanionIntent?.() });
  };
  const rejectIntent = async () => {
    const token = conversation.proposal?.token;
    if (!token) return;
    await globalThis.desktopBridge?.rejectCompanionIntent?.(token);
    updateCompanion({ proposal: null, intent: await globalThis.desktopBridge?.getCompanionIntent?.() });
    notify("已取消本轮动作建议");
  };
  return (
    <div className="page page--companion">
      <PageIntro
        title="AI 陪伴"
        description="陪伴对话、记忆提醒、AI 联动、表情与动作的统一入口"
        actions={<StatusBadge tone={sessionActive ? "success" : conversation.service?.configured ? "neutral" : "demo"}>{sessionActive ? `实时陪伴中 · ${companionSourceLabel}` : `输入 · ${companionSourceLabel}`}</StatusBadge>}
      />
      <Segmented
        value={section}
        onChange={setSection}
        options={[
          { value: "overview", label: "陪伴与记忆" },
          { value: "memory", label: "记忆管理" },
          { value: "motion", label: "动作编排" },
          { value: "agents", label: "AI 联动" },
        ]}
      />
      {section === "overview" && <>
        <div className="companion-overview">
        <div className="companion-primary-column">
          <Card className="companion-stage">
          <div className="card-heading"><div><strong>DeskMate 实时陪伴</strong><small>WINDOWS · DOUBAO REALTIME</small></div><StatusBadge tone={conversation.state === "error" ? "warning" : sessionActive ? "success" : "neutral"}>{sessionActive ? ({ connecting: "连接中", listening: "聆听中", thinking: "思考中", speaking: "回答中 · 防回声", completed: "本轮完成", stopping: "结束中" }[conversation.state] || "会话中") : selectedPreset.name}</StatusBadge></div>
          <div className={`companion-stage__face ${conversation.state === "listening" ? "is-listening" : ""}`}><CompanionFace expressionId={expression} alt={`DeskMate ${selectedPreset.name}表情`} /></div>
          <div className="companion-stage__copy"><h2>{conversationCopy[0]}</h2><p>{conversationCopy[1]}</p></div>
          <div className="companion-session-controls">
            <div className="button-row companion-dialogue-actions"><Button icon={sessionActive ? PlayerPause : MessageCircle} variant="primary" className="companion-dialogue-button" disabled={conversation.stopLifecycle?.pending} onClick={toggleSession}>{conversation.stopLifecycle?.pending ? "正在结束…" : sessionActive ? conversation.stopLifecycle?.error ? "重试结束陪伴对话" : "结束陪伴对话" : conversation.state === "error" ? "重新开始陪伴对话" : "开始陪伴对话"}</Button>{sessionActive && ["thinking", "speaking", "completed"].includes(conversation.state) && <Button icon={PlayerPause} variant="ghost" onClick={interruptResponse}>打断回答并继续听</Button>}</div>
            {conversation.stopLifecycle?.error && <Notice tone="warning" title="结束未确认">结束请求未得到确认，请重试；软件已重新读取主进程状态。</Notice>}
            <div className="companion-session-evidence"><span><small>本次输入</small><strong>{companionSourceLabel}</strong></span><span><small>本次输出</small><strong>电脑扬声器</strong></span><span><small>服务连接</small><strong>{sessionActive ? "会话已连接" : conversation.service?.configured ? "凭据已配置 · 尚未连接" : "待配置"}</strong></span></div>
            {conversation.state === "speaking" && <Notice tone="info" title="严格轮流说话">防回声中，自动语音打断暂停，可手动点击“打断回答并继续听”。</Notice>}
            {conversation.audioSelection?.fallback && <Notice tone="warning" title="本轮已明确回退">{microphoneSourceFailureMessage(conversation.audioSelection.fallback.reason)}；保存的首选来源没有改变，本轮实际使用电脑麦克风。</Notice>}
            {conversation.proposal?.token && <Notice tone="warning" title="检测到桌面动作意图"><strong>{conversation.proposal.label}</strong><div className="button-row"><Button variant="primary" onClick={() => { void confirmIntent(); }}>确认执行</Button><Button variant="ghost" onClick={() => { void rejectIntent(); }}>取消</Button></div>实时对话模型不能直接执行系统动作；只有这里确认后，Electron 主进程才会调用已登记白名单。</Notice>}
            {conversation.result?.type === "open_application" && <Notice tone={conversation.result.ok ? "success" : "warning"} title={conversation.result.ok ? "已执行语音白名单动作" : "语音应用动作已拒绝"}>{conversation.result.ok ? `已打开 ${conversation.result.label}` : conversation.result.reason === "application-voice-not-enabled" ? "此应用尚未显式允许语音直接打开。请在按键配置的应用卡片中开启该权限。" : `未打开：${conversation.result.reason || "unknown"}`}</Notice>}
            {conversation.result?.type === "query_codex_status" && <Notice tone={conversation.result.codex?.needsDisambiguation ? "warning" : "info"} title="Codex 确定性状态回答">{conversation.result.answer}</Notice>}
            {conversation.result?.type === "run_motion_preset" && <Notice tone="demo" title="动作意图已识别但未执行">动作硬件合同尚未冻结，本次没有向 EasyInput 或小智发送任何动作。</Notice>}
          </div>
          </Card>
          <AgentStateTestPanel notify={notify} navigate={navigate} index="04" />
        </div>
        <div className="companion-side-stack">
          <Card>
            <SectionTitle index="01" title="陪伴与记忆" description="最终用户和助手回合先事务写入本地 SQLite，再显示为完成。" />
            <div className="companion-info-list">
              <button onClick={() => notify("提醒功能待接入本地调度器")}><span className="companion-info-icon"><BellRinging size={20} /></span><span><small>下一个提醒 · 演示</small><strong>14:30 准备产品周会材料</strong></span><StatusBadge tone="demo">今天</StatusBadge></button>
              <button onClick={() => notify("长期记忆检索待接入 DeskMate memory 目录")}><span className="companion-info-icon"><Book2 size={20} /></span><span><small>记忆片段 · 演示</small><strong>你偏好简洁直达的方案与深色主题</strong></span><StatusBadge tone="neutral">8月26日</StatusBadge></button>
            </div>
          </Card>
          <Card>
            <SectionTitle index="03" title="陪伴对话设置" description="只影响实时陪伴，不改变普通语音输入和文字整理的停顿规则。" />
            <div className="companion-settings-form">
              <label className="field-label">陪伴名称<input value={companionDraft.name} maxLength={32} onChange={(event) => setCompanionDraft({ ...companionDraft, name: event.target.value })} /></label>
              <label className="field-label">唤醒短语<input value={companionDraft.wakePhrase} maxLength={64} onChange={(event) => setCompanionDraft({ ...companionDraft, wakePhrase: event.target.value })} /></label>
              <label className="field-label">单句话内停顿<span className="number-input-with-unit"><input type="number" min="0.5" max="50" step="0.5" inputMode="decimal" value={companionDraft.endSmoothSeconds} onChange={(event) => setCompanionDraft({ ...companionDraft, endSmoothSeconds: event.target.value })} /><strong>秒</strong></span><small>范围 0.5–50 秒，以 0.5 秒递增；推荐 5 秒。此值会在新会话中作为豆包服务端判停请求发送，并非电脑本地延时。</small></label>
              <label className="field-label">无人说话自动结束<span className="number-input-with-unit"><input type="number" min="0" max="3600" step="1" inputMode="numeric" value={companionDraft.idleTimeoutSeconds} onChange={(event) => setCompanionDraft({ ...companionDraft, idleTimeoutSeconds: event.target.value })} /><strong>秒</strong></span><small>0 表示关闭；其他值为 10–3600 的整数秒，只在倾听且没有接受到输入时累计。</small></label>
              {companionSettingsStatus.message && <Notice tone={companionSettingsStatus.state === "error" ? "warning" : "info"} title={companionSettingsStatus.state === "error" ? "设置未保存" : companionSettingsStatus.state === "saving" ? "正在保存" : "保存完成"}>{companionSettingsStatus.message}</Notice>}
              <Notice tone="info" title="从下一次会话生效">保存后从下一次新建陪伴会话生效。{sessionActive ? "当前会话正在使用启动时冻结的参数，请结束并重新开始。" : "当前没有活动会话。"}</Notice>
              <Button icon={DeviceFloppy} variant="primary" disabled={companionSettingsStatus.state === "saving"} onClick={() => { void saveCompanionSettings(); }}>{companionSettingsStatus.state === "saving" ? "正在保存…" : "保存陪伴设置"}</Button>
            </div>
            <Notice tone="info" title="语音唤醒待接入 / 未启用">“{state.settings.companionWakePhrase}”只保存为未来的本地离线唤醒配置；当前不会后台打开麦克风，也不会保持豆包在线。EasyInput 的“AI 陪伴呼唤”按键可独立使用。</Notice>
          </Card>
          <Card>
            <SectionTitle index="04" title="陪伴人设" description="名称之外的人格、表达和行为边界；每次新会话冻结一个版本。" />
            <div className="companion-settings-form">
              <label className="field-label">角色定位<input maxLength={160} value={personaDraft.role} onChange={(event) => setPersonaDraft({ ...personaDraft, role: event.target.value })} /></label>
              <label className="field-label">性格特征<textarea maxLength={240} value={personaDraft.traits} onChange={(event) => setPersonaDraft({ ...personaDraft, traits: event.target.value })} /></label>
              <label className="field-label">表达风格<textarea maxLength={240} value={personaDraft.speakingStyle} onChange={(event) => setPersonaDraft({ ...personaDraft, speakingStyle: event.target.value })} /></label>
              <label className="field-label">行为边界<textarea maxLength={500} value={personaDraft.boundaries} onChange={(event) => setPersonaDraft({ ...personaDraft, boundaries: event.target.value })} /></label>
              {personaStatus.message && <Notice tone={personaStatus.state === "error" ? "warning" : "info"} title={personaStatus.state === "error" ? "人设未保存" : "人设已保存"}>{personaStatus.message}</Notice>}
              <Button icon={DeviceFloppy} variant="primary" disabled={personaStatus.state === "saving" || sessionActive} onClick={() => { void savePersona(); }}>{personaStatus.state === "saving" ? "正在保存…" : "保存人设"}</Button>
            </div>
            <Notice tone="info" title="不可覆盖的安全边界">自定义人设不会获得执行命令、读取密钥或操控未接入硬件的权限；桌面动作仍必须通过白名单确认桥。</Notice>
          </Card>
          <Card>
            <SectionTitle index="02" title="设备与服务" description="真实状态与待接入状态分开显示。" />
            <div className="companion-status-list">
              <div><span><Keyboard size={18} />EasyInput HID</span><StatusBadge tone={serviceStatus.easyInput.tone}>{serviceStatus.easyInput.label}</StatusBadge></div>
              <div><span><Robot size={18} />小智 DeskMate Link</span><StatusBadge tone={serviceStatus.xiaozhi.tone}>{serviceStatus.xiaozhi.label}</StatusBadge></div>
              <div><span><Microphone2 size={18} />豆包实时对话</span><StatusBadge tone={serviceStatus.realtime.tone}>{serviceStatus.realtime.label}</StatusBadge></div>
               <div><span><Microphone2 size={18} />EasyInput 板载麦克风</span><StatusBadge tone={serviceStatus.microphone.tone}>{serviceStatus.microphone.label}</StatusBadge></div>
               <div><span><Microphone2 size={18} />当前陪伴输入</span><StatusBadge tone={sessionActive ? "success" : "neutral"}>{companionSourceLabel}</StatusBadge></div>
               <div><span><Music size={18} />当前陪伴输出</span><StatusBadge tone="success">电脑扬声器</StatusBadge></div>
               <div><span><Music size={18} />EasyInput 扬声器</span><StatusBadge tone="demo">待协议冻结</StatusBadge></div>
              <div><span><Link size={18} />逐轮本地记忆</span><StatusBadge tone={serviceStatus.memory.tone}>{serviceStatus.memory.label}</StatusBadge></div>
            </div>
          </Card>
          <Notice tone="info" title="语音互斥边界">陪伴会话与文字语音输入共用唯一前台会话仲裁器；启动语音输入或语音编辑会立即结束陪伴会话，结束后不会自动恢复。</Notice>
        </div>
      </div>
      </>}
      {section === "memory" && <MemoryManagementPage notify={notify} />}
      {section === "motion" && <MotionPage notify={notify} embedded />}
      {section === "agents" && <AgentsPage notify={notify} embedded />}
    </div>
  );
}

function MemoryManagementPage({ notify }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [forget, setForget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState({ ready: false, storage: "unavailable", turns: 0, dailySummaries: 0, pendingCandidates: 0, longTermMemories: 0, embeddings: 0, unprocessedTurns: 0, indexedChunks: 0 });
  const [knowledgeBaseStatus, setKnowledgeBaseStatus] = useState({ configured: false, storage: "unavailable", label: "", projection: "markdown-double-link-v1", embedding: "deskmate-local-hash-embedding-v1" });
  const [memoryItems, setMemoryItems] = useState([]);
  const [indexResults, setIndexResults] = useState([]);
  const refreshMemory = useCallback(async () => {
    try {
      const [status, items, knowledgeBase] = await Promise.all([globalThis.desktopBridge?.getMemoryStatus?.(), globalThis.desktopBridge?.listMemories?.({ filter, query, limit: 100 }), globalThis.desktopBridge?.getKnowledgeBaseStatus?.()]);
      if (status) setMemoryStatus(status);
      setMemoryItems(Array.isArray(items) ? items : []);
      if (knowledgeBase) setKnowledgeBaseStatus(knowledgeBase);
    } catch { setMemoryStatus((current) => ({ ...current, ready: false, storage: "unavailable" })); }
  }, [filter, query]);
  useEffect(() => { const timer = window.setTimeout(refreshMemory, 160); return () => window.clearTimeout(timer); }, [refreshMemory]);
  const reviewCandidate = async (id, state) => {
    try {
      const result = await globalThis.desktopBridge?.setMemoryCandidateState?.({ id, state });
      if (!result?.ok) throw new Error("候选不存在或已变化");
      notify(state === "accepted" ? "已加入长期记忆" : "已忽略这条记忆候选");
      await refreshMemory();
    } catch (error) { notify(`记忆审核失败：${error.message}`); }
  };
  const saveCandidate = async () => {
    const summary = String(editing?.summary || "").trim();
    if (!summary) { notify("记忆内容不能为空"); return; }
    setBusy(true);
    try {
      const result = await globalThis.desktopBridge?.updateMemoryCandidate?.({ id: editing.id, summary });
      if (!result?.ok) throw new Error(result?.reason || "memory-update-failed");
      setEditing(null);
      notify("记忆内容已纠正");
      await refreshMemory();
    } catch (error) { notify(`记忆纠正失败：${error.message}`); }
    finally { setBusy(false); }
  };
  const prepareForget = async (target) => {
    try {
      const result = await globalThis.desktopBridge?.prepareMemoryForget?.(target);
      if (!result?.ok) throw new Error(result?.reason || "memory-confirmation-failed");
      setForget({ ...target, token: result.token, label: target.scope === "all" ? "全部本地陪伴记忆、原始回合与事务队列" : target.label });
    } catch (error) { notify(`无法准备删除：${error.message}`); }
  };
  const confirmForget = async () => {
    setBusy(true);
    try {
      const result = await globalThis.desktopBridge?.confirmMemoryForget?.({ token: forget?.token });
      if (!result?.ok) throw new Error(result?.reason || "memory-forget-failed");
      notify(forget?.scope === "all" ? "已彻底忘记全部本地陪伴记忆" : "已永久删除这条记忆");
      setEditing(null);
      setForget(null);
      await refreshMemory();
    } catch (error) { setForget(null); notify(`删除失败：${error.message}`); }
    finally { setBusy(false); }
  };
  const exportReviewed = async () => {
    try {
      const result = await globalThis.desktopBridge?.exportReviewedMemories?.();
      if (result?.cancelled) return;
      if (!result?.ok) throw new Error(result?.reason || "memory-export-failed");
      notify(`已导出 ${result.dailySummaries} 天摘要和 ${result.longTermMemories} 条长期记忆`);
    } catch (error) { notify(`记忆导出失败：${error.message}`); }
  };
  const chooseKnowledgeBase = async () => {
    try {
      const result = await globalThis.desktopBridge?.chooseKnowledgeBaseLocation?.();
      if (result?.cancelled) return;
      if (!result?.ok) throw new Error(result?.reason || "knowledge-base-location-invalid");
      setKnowledgeBaseStatus(result.status);
      notify(`知识库位置已保存：${result.status?.label || "已配置"}`);
    } catch (error) { notify(`知识库位置保存失败：${error.message}`); }
  };
  const generatePending = async () => {
    setBusy(true);
    try {
      const result = await globalThis.desktopBridge?.generatePendingMemories?.();
      if (!result?.ok) throw new Error(result?.reason || "memory-generation-failed");
      notify(result.skipped ? "当前没有待整理的真实对话回合" : `已生成每日摘要和 ${result.candidates} 条待审核候选`);
      await refreshMemory();
    } catch (error) { notify(`记忆整理失败：${error.message}`); }
    finally { setBusy(false); }
  };
  const rebuildIndex = async () => {
    setBusy(true);
    try {
      const result = await globalThis.desktopBridge?.rebuildMemoryIndex?.();
      if (!result?.ok) throw new Error(result?.reason || "memory-index-failed");
      notify(`本地索引已重建：${result.memories} 条记忆，${result.chunks} 个切片`);
      await refreshMemory();
    } catch (error) { notify(`索引重建失败：${error.message}`); }
    finally { setBusy(false); }
  };
  const syncKnowledgeBase = async () => {
    setBusy(true);
    try {
      const result = await globalThis.desktopBridge?.syncKnowledgeBase?.();
      if (!result?.ok && !Number.isInteger(result?.conflicts)) throw new Error(result?.reason || "knowledge-base-sync-failed");
      notify(result.conflicts ? `双链同步完成，但保留了 ${result.conflicts} 个用户修改冲突` : `已同步 ${result.files} 个受管 Markdown 双链文件`);
    } catch (error) { notify(`知识库同步失败：${error.message}`); }
    finally { setBusy(false); }
  };
  const searchIndex = async () => {
    const text = query.trim();
    if (!text) { setIndexResults([]); notify("请先输入检索内容"); return; }
    const results = await globalThis.desktopBridge?.searchMemoryIndex?.({ query: text, limit: 8 });
    setIndexResults(Array.isArray(results) ? results : []);
    notify(`本地混合检索返回 ${Array.isArray(results) ? results.length : 0} 个切片`);
  };
  return (
    <div className="companion-embedded memory-management">
      <div className="embedded-heading">
        <div><span>LOCAL MEMORY</span><h2>长期记忆管理</h2><p>查看每日摘要、审核记忆候选、搜索长期记忆；陪伴对话接通后自动进入这条流水线。</p></div>
        <div className="memory-heading-actions"><StatusBadge tone={memoryStatus.ready ? "success" : "demo"}>{memoryStatus.ready ? "SQLite 已就绪" : "仅桌面版可用"}</StatusBadge><Button variant="primary" disabled={busy || !memoryStatus.unprocessedTurns} onClick={() => { void generatePending(); }}>整理待处理对话</Button><Button icon={FileExport} variant="soft" disabled={!memoryStatus.ready} onClick={exportReviewed}>导出摘要与已审核记忆</Button><Button icon={Trash} variant="danger" disabled={!memoryStatus.ready} onClick={() => prepareForget({ scope: "all" })}>彻底忘记全部</Button></div>
      </div>
      <Notice tone={memoryStatus.ready ? "info" : "demo"} title={memoryStatus.ready ? "本地记忆控制已启用" : "当前没有启用记忆服务"}>{memoryStatus.ready ? `现有 ${memoryStatus.turns} 条真实会话事件，其中 ${memoryStatus.unprocessedTurns || 0} 条待整理。模型只生成候选；必须由你审核后才能进入长期记忆。` : "请在 DeskMate 桌面版查看本地记忆；数据不写入 EasyInput 或小智 Flash。"}</Notice>
      <Card className="memory-knowledge-base"><SettingRow icon={FolderOpen} title="知识库位置" description={knowledgeBaseStatus.configured ? `已选择文件夹：${knowledgeBaseStatus.label}。完整路径只保存在 Electron 主进程。` : "选择保存受管 Markdown 双链笔记的本地知识库；DeskMate 不扫描目录中的其他内容。"}><div className="memory-knowledge-base__action"><StatusBadge tone={knowledgeBaseStatus.configured ? "success" : "demo"}>{knowledgeBaseStatus.configured ? "已配置" : "尚未选择"}</StatusBadge><Button variant="soft" onClick={chooseKnowledgeBase}>{knowledgeBaseStatus.configured ? "重新选择" : "选择文件夹"}</Button><Button variant="soft" disabled={!knowledgeBaseStatus.configured || busy} onClick={() => { void syncKnowledgeBase(); }}>同步双链</Button></div></SettingRow><Notice tone="info" title="双链与索引边界">只在所选目录的 DeskMate/ 子目录写入带稳定 ID 的 Markdown 与 [[双向链接]]；外部修改发生冲突时保留用户版本。SQLite 始终是唯一真相源。</Notice></Card>
      <div className="memory-metrics">
        <Metric label="每日摘要" value={String(memoryStatus.dailySummaries)} unit="天" trend={memoryStatus.ready ? "本地数据库" : "尚未接入"} tone="blue" />
        <Metric label="待审核候选" value={String(memoryStatus.pendingCandidates)} unit="条" trend="需人工确认" tone="orange" />
        <Metric label="长期记忆" value={String(memoryStatus.longTermMemories)} unit="条" trend="可检索" tone="cyan" />
        <Metric label="本地索引" value={String(memoryStatus.indexedChunks || memoryStatus.embeddings)} unit="切片" trend="可删除重建" tone="violet" />
      </div>
      <Card className="memory-toolbar">
        <Segmented compact value={filter} onChange={setFilter} options={[{ value: "all", label: "全部" }, { value: "daily", label: "每日摘要" }, { value: "candidates", label: "候选箱" }, { value: "long-term", label: "长期记忆" }]} />
        <SearchField value={query} onChange={setQuery} placeholder="搜索日期、主题或记忆内容" /><Button variant="soft" disabled={busy || !memoryStatus.longTermMemories} onClick={() => { void rebuildIndex(); }}>重建本地索引</Button><Button variant="soft" disabled={!query.trim()} onClick={() => { void searchIndex(); }}>混合检索</Button>
      </Card>
      {indexResults.length > 0 && <Card><SectionTitle index="R" title="检索预览" description="关键词与本地可重建 embedding 的有界结果；不会向 React 暴露向量。" /><div className="memory-item-list">{indexResults.map((item) => <article key={item.chunkId}><div><span>{item.kind}</span><time>{item.day} · {Math.round(item.score * 100)}%</time></div><p>{item.content}</p></article>)}</div></Card>}
      <div className="memory-layout">
        <Card className="memory-empty-card">
          {memoryItems.length === 0 ? <EmptyState icon={Book2} title="尚无可管理的摘要或候选" description="真实对话回合会先进入本地事务库；点击“整理待处理对话”后，文本模型才会生成待审核候选，不使用演示数据填充。" action={<Button variant="soft" onClick={() => { void generatePending(); }}>整理真实对话</Button>} /> : <div className="memory-item-list">{memoryItems.map((item) => <article key={`${item.type}-${item.id}`}><div><span>{item.type === "daily" ? "每日摘要" : item.state === "accepted" ? "长期记忆" : item.state === "rejected" ? "已忽略候选" : "待审核候选"}</span><time>{item.day}</time></div>{editing?.id === item.id ? <div className="memory-editor"><textarea value={editing.summary} maxLength={10000} onChange={(event) => setEditing({ ...editing, summary: event.target.value })} aria-label="纠正记忆内容" /><div className="button-row"><Button variant="primary" disabled={busy} onClick={saveCandidate}>保存纠正</Button><Button variant="ghost" disabled={busy} onClick={() => setEditing(null)}>取消</Button></div></div> : <p>{item.content}</p>}<div className="memory-item-actions">{item.type === "candidate" && ["pending", "accepted"].includes(item.state) && editing?.id !== item.id && <Button variant="soft" onClick={() => setEditing({ id: item.id, summary: item.content })}>纠正</Button>}{item.type === "candidate" && item.state === "pending" && <><Button variant="primary" onClick={() => reviewCandidate(item.id, "accepted")}>保留</Button><Button variant="ghost" onClick={() => reviewCandidate(item.id, "rejected")}>忽略</Button></>}<Button icon={Trash} variant="ghost" onClick={() => prepareForget({ scope: "item", type: item.type, id: item.id, label: item.type === "daily" ? `每日摘要 ${item.day}` : `${item.state === "accepted" ? "长期记忆" : "记忆候选"} ${item.day}` })}>永久删除</Button></div></article>)}</div>}
        </Card>
        <Card>
          <SectionTitle index="01" title="记忆流水线" description="先可靠落盘，再异步总结；所有长期保留都由用户审核。" />
          <div className="memory-pipeline">
            <div><span><History size={18} /></span><strong>会话事件即时落盘</strong><small>每轮对话先进入本地 SQLite 事务日志，不等待每日总结。</small></div>
            <div><span><Book2 size={18} /></span><strong>每日摘要与候选箱</strong><small>空闲时和每日收尾生成摘要；未审核候选不会静默变成长记忆。</small></div>
            <div><span><Brain size={18} /></span><strong>关键词 + 向量检索</strong><small>原文、结构化事实和 embedding 分层保存，更换模型不丢来源。</small></div>
            <div><span><Lock size={18} /></span><strong>可查看、纠正与忘记</strong><small>当前已支持已审核导出、单条永久删除和全库事务清空；人物隔离留到 T13。</small></div>
          </div>
        </Card>
      </div>
      <ConfirmationDialog open={Boolean(forget)} eyebrow="PRIVACY CONTROL" title={forget?.scope === "all" ? "彻底忘记全部陪伴记忆？" : "永久删除这条记忆？"} description={forget?.scope === "all" ? "这会删除原始对话、摘要、候选、长期记忆、向量和事务队列，无法撤销。" : "这会删除当前显示条目；如果是长期记忆，其向量记录也会同时删除。"} paths={forget ? [forget.label] : []} summaryLabel="本次永久删除" notice="确认令牌仅有效 60 秒且只能使用一次；数据库在确认前发生变化时会拒绝删除。DeskMate 不创建云端副本。" confirmLabel="确认永久删除" confirmVariant="danger" busyLabel="正在永久删除…" busy={busy} onCancel={() => setForget(null)} onConfirm={confirmForget} />
    </div>
  );
}

export function DashboardPage({ navigate, notify }) {
  const { state, patch } = useAppStore();
  const expression = state.currentExpression;
  const selectedPreset = expressionPresets.find((item) => item.id === expression) || expressionPresets[0];
  const task = state.aiEvent;
  const hardware = dashboardHardwareStatus(state.runtime?.inputBridge);
  const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
  const stateCopy = {
    idle: { label: "待命", heading: "等待新任务", tone: "neutral" },
    listening: { label: "倾听中", heading: "正在接收输入", tone: "success" },
    thinking: { label: "思考中", heading: "正在分析任务", tone: "demo" },
    working: { label: "运行中", heading: "正在工作", tone: "success" },
    waiting_user: { label: "待确认", heading: "等待用户确认", tone: "warning" },
    completed: { label: "已完成", heading: "任务已完成", tone: "success" },
    error: { label: "异常", heading: "任务出现异常", tone: "warning" },
  }[task.type] || { label: "未知", heading: "状态待确认", tone: "neutral" };
  return (
    <div className="page page--dashboard">
      <PageIntro
        title="工作台"
        description="查看桌宠状态、AI 任务进度与设备运行情况"
        actions={<Button icon={Sparkles} variant="soft" onClick={() => navigate("companion")}>查看 AI 联动</Button>}
      />
      <div className="dashboard-grid">
        <Card className="pet-showcase">
          <div className="card-heading">
            <div><strong>桌宠软件预览</strong><small>DESKMATE · LOCAL PREVIEW</small></div>
            <StatusBadge tone="demo">软件预览 · {selectedPreset.name}</StatusBadge>
          </div>
          <div className="pet-visual">
            <CompanionFace expressionId={expression} alt={`DeskMate ${selectedPreset.name}表情`} />
            <span className="pet-mode"><span />{expression.toUpperCase()} · {selectedPreset.name}软件模式</span>
          </div>
          <div className="pet-footer">
            <div><small>设备姿态</small><strong>舵机未启用 · 待校准</strong></div>
            <div className="sensor-mini"><span><strong>待接入</strong><small>温度待接入</small></span><span><strong>待接入</strong><small>湿度待接入</small></span><span><strong>待接入</strong><small>环境光待接入</small></span></div>
          </div>
        </Card>
        <Card className="task-panel">
          <div className="task-panel__top"><span className="agent-label">{task.agent || "AI"}</span><StatusBadge tone={stateCopy.tone}>{stateCopy.label}</StatusBadge></div>
          <div><h2>{task.agent || "AI"} {stateCopy.heading}</h2><p>{task.detail || "等待状态适配器提供任务说明"}</p></div>
          <div className="progress-block">
            <div className="progress-ring" style={{ "--value": progress }}><strong>{progress}<span>%</span></strong><small>任务进度</small></div>
            <div><span className="blue-kicker">当前状态</span><h3>{stateCopy.heading}</h3><p>{task.detail || "尚未收到任务详情"}</p></div>
          </div>
          <Button variant="primary" className="button--wide" onClick={() => navigate("companion")}>查看陪伴与联动 <ArrowRight size={18} /></Button>
          <div className="task-divider" />
          <div className="card-heading"><strong>软件表情预览</strong><button className="text-link" onClick={() => navigate("companion")}>管理预览 <ArrowRight size={14} /></button></div>
          <div className="expression-row">
            {expressionPresets.slice(0, 3).map((item) => <ExpressionTile key={item.id} compact preset={item} selected={expression === item.id} onClick={() => previewSoftwareExpression({ patch, notify, preset: item })} />)}
          </div>
          <div className={`sync-line sync-line--${hardware.tone}`}><span />{hardware.summary}<button className="text-link" onClick={() => navigate("settings/diagnostics")}>查看系统诊断</button></div>
        </Card>
      </div>
    </div>
  );
}

export function VoicePage({ notify }) {
  const { state, patch } = useAppStore();
  const [source, setSource] = useState(state.settings.microphoneId || "");
  const preferredMicrophoneSource = normalizeMicrophoneSource(state.settings.microphoneSource);
  const [devices, setDevices] = useState([]);
  const [transcript, setTranscript] = useState("");
  const [recordingItem, setRecordingItem] = useState(null);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [desktopCaps, setDesktopCaps] = useState({ supported: false, shortcutRegistered: false });
  const [lastDeviceEvent, setLastDeviceEvent] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState("idle");
  const [boardAudioStatus, setBoardAudioStatus] = useState({ available: false, configured: false, state: "unknown", reason: "" });
  const [activeMicrophoneSource, setActiveMicrophoneSource] = useState(null);
  const [microphoneFallback, setMicrophoneFallback] = useState(null);
  const [session, dispatchSession] = useReducer(voiceSessionReducer, initialVoiceSession);
  const toggleRef = useRef(() => {});
  const cancelRef = useRef(() => {});
  const simulatorRef = useRef(new DeviceSimulator(deviceEventBus));
  const sttAbortRef = useRef(null);
  const realtimeSessionRef = useRef("");
  const realtimeAttemptRef = useRef(0);
  const realtimeWantedRef = useRef(false);
  const pendingRealtimeAudioRef = useRef([]);
  const workflowRef = useRef("input");
  const hardwareVoiceSourceRef = useRef("voice-workflow");
  const lockedMicrophoneSourceRef = useRef(null);
  const startInFlightRef = useRef(false);
  const handleComplete = useCallback(async (item) => {
    lockedMicrophoneSourceRef.current = null;
    setActiveMicrophoneSource(null);
    const workflow = workflowRef.current === "edit" ? "edit" : "input";
    dispatchSession({ type: "transition", state: "transcribing", detail: { message: "正在发送到千问语音识别" } });
    const id = globalThis.crypto?.randomUUID?.() || `recording-${Date.now()}`;
    let audioId;
    if (item.blob) {
      try {
        await saveRecordingBlob(id, item.blob);
        audioId = id;
      } catch (cause) {
        notify(`录音已完成，但音频无法持久保存：${cause.message}`);
      }
    }
    const stt = state.settings.sttMode === "mock" ? new MockSttAdapter() : state.settings.sttMode === "bailian" ? new BailianSttAdapter() : state.settings.sttMode === "http" ? new HttpSttAdapter({ endpoint: state.settings.sttEndpoint }) : voiceAdapters.stt;
    setRecordingItem({ ...item, id, audioId });
    const controller = new AbortController(); sttAbortRef.current = controller; setProcessing(true);
    const mode = workflow === "edit" ? "active-window" : state.settings.activeWindowOutputEnabled ? "active-window" : state.settings.outputMode;
    try {
      const processed = await processVoiceRecording({
        blob: item.blob,
        stt,
        organizer: new ConfigurableTextOrganizer({ smartOrganizer: new BailianTextOrganizer() }),
        organizerOptions: { mode: state.settings.formatting, rules: state.vocabulary.rules, hotwords: state.vocabulary.hotwords, customRule: state.settings.customOrganizerRule },
        editor: { edit: (instruction, options) => voiceAdapters.desktop.editSelectedText(instruction, options) },
        operation: workflow,
        signal: controller.signal,
        output: voiceAdapters.output,
        outputMode: mode,
        onPhase: (phase) => {
          if (phase === "organizing") dispatchSession({ type: "transition", state: "organizing", detail: { message: "正在使用千问整理文字" } });
          if (phase === "outputting") dispatchSession({ type: "transition", state: "outputting", detail: { message: "正在写入目标窗口" } });
        },
        saveHistory: async ({ text, transcript: result, organized, failure }) => {
          const organizer = organized ? { mode: organized.mode || "raw", model: organized.model || "unknown", durationMs: Number(organized.durationMs) || 0, status: organized.status || (organized.fallback ? "fallback" : "success"), fallback: Boolean(organized.fallback), errorType: organized.errorType || "" } : { mode: "raw", model: "none", durationMs: 0, status: "skipped", fallback: false };
          const transcription = { status: result.status, provider: result.provider || "unknown", durationMs: Number(result.durationMs) || 0, errorType: failure?.code || "", label: failure?.label || "转写成功" };
          const entry = { id, audioId, microphoneSource: item.microphoneSource || "computer", operation: workflow === "edit" ? "voice-edit" : "voice-input", time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), date: "今天", duration: `${item.duration} 秒`, count: result.status === "success" ? `${text.length} 字` : "未转写", rawText: result.text || "", text, organizer, transcription };
          patch({ history: [entry, ...state.history], diagnostics: { ...(state.diagnostics || {}), stt: { provider: transcription.provider, status: transcription.status, durationMs: transcription.durationMs, errorType: transcription.errorType }, organizer } });
          return entry;
        },
      });
      setTranscript(processed.text);
      if (workflow === "edit" && processed.transcript.status === "success" && processed.organized?.status !== "success") {
        dispatchSession({ type: "transition", state: processed.organized?.status === "cancelled" ? "idle" : "error", detail: { message: processed.organized?.message || "语音编辑失败，原文未被替换" } });
        notify(processed.organized?.status === "cancelled" ? "语音编辑已取消，选中文字未改变" : `语音编辑失败，选中文字未改变：${processed.organized?.message || "请检查千问服务配置"}`);
      } else
      if (processed.organized?.status === "cancelled") {
        dispatchSession({ type: "reset" });
        notify("文字整理已取消，原始转写仍保存在历史中");
      } else if (processed.transcript.status === "success") {
        if (processed.output.ok) {
          const organizerFallback = processed.organized?.fallback;
          const targetChanged = processed.output.reason === "target-window-changed";
          const fallbackMessage = targetChanged ? "目标窗口已变化，文字已复制到剪贴板" : "未能稳定捕获输入目标，文字已复制到剪贴板";
          const fallbackNotice = targetChanged ? "目标窗口已变化，转写已保存并复制到剪贴板" : "未能稳定捕获输入目标，转写已保存并复制到剪贴板";
          const editFallback = workflow === "edit" && processed.output.fallbackFrom;
          dispatchSession({ type: "transition", state: "completed", detail: { message: editFallback ? "原窗口已变化，编辑结果已复制到剪贴板" : workflow === "edit" ? "语音编辑已完成并替换选中文字" : processed.output.fallbackFrom ? fallbackMessage : organizerFallback ? "智能整理不可用，已安全输出原文" : "转写、整理和文字输出均已完成" } });
          notify(editFallback ? "原窗口已变化，未自动替换；编辑结果已复制到剪贴板" : workflow === "edit" ? "语音编辑完成，已替换原窗口中的选中文字" : processed.output.fallbackFrom ? fallbackNotice : organizerFallback ? "智能整理不可用，已保留并输出原始转写" : `转写完成，已输出到${processed.output.mode === "history" ? "历史" : processed.output.mode === "clipboard" ? "剪贴板" : "当前窗口"}`);
        } else {
          dispatchSession({ type: "transition", state: "error", detail: { message: "转写已保存，但文字输出失败" } });
          notify("转写已保存到历史，但文字输出失败");
        }
      } else if (processed.transcript.status === "cancelled") {
        dispatchSession({ type: "reset" });
        notify("转写已取消，录音仍保存在历史中");
      } else {
        dispatchSession({ type: "transition", state: "error", detail: { message: processed.failure?.message || "语音识别失败" } });
        notify(processed.failure?.message || (audioId ? "录音已保存，但语音识别未完成" : "录音已完成，但语音识别未完成"));
      }
    } catch (cause) {
      dispatchSession({ type: "transition", state: "error", detail: { message: cause.message || "语音处理失败" } });
      notify(`语音处理失败：${cause.message || "未知错误"}`);
    } finally {
      sttAbortRef.current = null;
      setProcessing(false);
    }
  }, [notify, patch, state.history, state.settings, state.vocabulary]);
  const appendRealtimeAudio = useCallback((audio) => {
    const sessionId = realtimeSessionRef.current;
    if (!sessionId) {
      if (realtimeWantedRef.current && pendingRealtimeAudioRef.current.length < 24) pendingRealtimeAudioRef.current.push(audio);
      return;
    }
    if (typeof globalThis.desktopBridge?.appendBailianRealtime !== "function") return;
    globalThis.desktopBridge.appendBailianRealtime({ sessionId, audio }).catch(() => {});
  }, []);
  const computerRecorder = useRecorder({ deviceId: source || undefined, onComplete: (item) => handleComplete({ ...item, microphoneSource: "computer" }), onAudioChunk: appendRealtimeAudio, onError: (message) => { dispatchSession({ type: "transition", state: "error", detail: { message } }); notify(message); } });
  const easyInputRecorder = useEasyInputRecorder({ onComplete: handleComplete, onError: (message) => { dispatchSession({ type: "transition", state: "error", detail: { message } }); notify(message); } });
  const recording = computerRecorder.status === "recording" || easyInputRecorder.status === "recording";
  const seconds = activeMicrophoneSource === "easyinput" ? easyInputRecorder.seconds : computerRecorder.seconds;
  const level = activeMicrophoneSource === "easyinput" ? easyInputRecorder.level : computerRecorder.level;
  const status = activeMicrophoneSource === "easyinput" ? easyInputRecorder.status : computerRecorder.status;
  const error = activeMicrophoneSource === "easyinput" ? easyInputRecorder.error : computerRecorder.error;
  const processingRef = useRef(processing); processingRef.current = processing;
  const beginRealtimePreview = () => {
    const attempt = ++realtimeAttemptRef.current;
    realtimeWantedRef.current = true;
    pendingRealtimeAudioRef.current = [];
    setRealtimeStatus("connecting");
    if (state.settings.sttMode !== "bailian" || typeof globalThis.desktopBridge?.startBailianRealtime !== "function") {
      setRealtimeStatus("unavailable");
      return;
    }
    globalThis.desktopBridge.startBailianRealtime().then((realtime) => {
      const sessionId = realtime?.sessionId || "";
      if (attempt !== realtimeAttemptRef.current || !realtimeWantedRef.current) {
        if (sessionId) globalThis.desktopBridge?.cancelBailianRealtime?.(sessionId).catch(() => {});
        return;
      }
      realtimeSessionRef.current = sessionId;
      setRealtimeStatus(realtime?.ok ? "ready" : "unavailable");
      if (!sessionId) return;
      const pending = pendingRealtimeAudioRef.current.splice(0);
      pending.forEach((audio) => globalThis.desktopBridge?.appendBailianRealtime?.({ sessionId, audio }).catch(() => {}));
    }).catch(() => {
      if (attempt === realtimeAttemptRef.current) setRealtimeStatus("unavailable");
    });
  };
  const invalidateRealtimeStart = () => {
    realtimeWantedRef.current = false;
    realtimeAttemptRef.current += 1;
    pendingRealtimeAudioRef.current = [];
  };
  toggleRef.current = async (requestedPhase, requestedWorkflow = "input", requestedSource = "voice-workflow") => {
    if (processingRef.current || startInFlightRef.current) return { ignored: true, reason: processingRef.current ? "processing" : "starting" };
    const phase = typeof requestedPhase === "string" && ["start", "stop"].includes(requestedPhase) ? requestedPhase : null;
    if (phase === "start" && recording) return { ignored: true, reason: "already-recording" };
    if (phase === "stop" && !recording) return { ignored: true, reason: "not-recording" };
    const starting = phase ? phase === "start" : !recording;
    if (starting) {
      startInFlightRef.current = true;
      hardwareVoiceSourceRef.current = requestedSource === "simulation" || state.settings.sttMode === "mock" ? "simulation" : "voice-workflow";
      workflowRef.current = requestedWorkflow === "edit" ? "edit" : "input";
      setLiveTranscript("");
      setMicrophoneFallback(null);
      const selectedSource = normalizeMicrophoneSource(state.settings.microphoneSource);
      let started;
      try {
        started = await startMicrophoneSession({
          preferredSource: selectedSource,
          startComputer: async () => ({ ok: await computerRecorder.start(), reason: computerRecorder.error || "computer-microphone-unavailable" }),
          startEasyInput: () => easyInputRecorder.start(),
        });
      } catch (cause) {
        started = { ok: false, reason: cause?.message || "microphone-start-failed" };
      } finally {
        startInFlightRef.current = false;
      }
      if (!started.ok) {
        lockedMicrophoneSourceRef.current = null;
        setActiveMicrophoneSource(null);
        dispatchSession({ type: "transition", state: "error", detail: { message: "没有可用的麦克风，录音未开始" } });
        notify("无法开始录音：EasyInput 和电脑麦克风均不可用");
        return { ignored: false, action: "start", started: false, reason: started.reason };
      }
      lockedMicrophoneSourceRef.current = started.activeSource;
      setActiveMicrophoneSource(started.activeSource);
      if (started.fallback) {
        const message = `${microphoneSourceFailureMessage(started.fallback.reason)}，本次已回退到电脑麦克风`;
        setMicrophoneFallback(message);
        notify(message);
      }
      const sourceLabel = started.activeSource === "easyinput" ? "EasyInput 板载麦克风" : "电脑麦克风";
      dispatchSession({ type: "transition", state: "recording", detail: { message: workflowRef.current === "edit" ? `正在通过${sourceLabel}聆听编辑要求` : `正在使用${sourceLabel}录音` } });
      if (started.activeSource === "computer") beginRealtimePreview();
      else { invalidateRealtimeStart(); setRealtimeStatus("unavailable"); }
      return { ignored: false, action: "start", started: true, activeSource: started.activeSource, fallback: started.fallback };
    }
    const lockedSource = lockedMicrophoneSourceRef.current;
    if (lockedSource === "easyinput") await easyInputRecorder.stop();
    else computerRecorder.stop();
    invalidateRealtimeStart();
    if (lockedSource === "computer" && realtimeSessionRef.current) globalThis.desktopBridge?.finishBailianRealtime?.(realtimeSessionRef.current).catch(() => {});
    return { ignored: false, action: "stop", activeSource: lockedSource };
  };
  cancelRef.current = () => {
    sttAbortRef.current?.abort();
    invalidateRealtimeStart();
    if (realtimeSessionRef.current) globalThis.desktopBridge?.cancelBailianRealtime?.(realtimeSessionRef.current).catch(() => {});
    realtimeSessionRef.current = "";
    if (lockedMicrophoneSourceRef.current === "easyinput") void easyInputRecorder.cancel();
    else computerRecorder.cancel();
    lockedMicrophoneSourceRef.current = null;
    setActiveMicrophoneSource(null);
    setProcessing(false);
    dispatchSession({ type: "reset" });
    voiceAdapters.desktop.setVoiceState({ state: "cancelled", message: "已取消当前语音输入", floating: state.settings.floating, source: hardwareVoiceSourceRef.current }).catch(() => {});
  };
  const recordingRef = useRef(recording); recordingRef.current = recording;
  useEffect(() => globalThis.desktopBridge?.onBailianRealtimeEvent?.((event) => {
    if (!event || event.sessionId !== realtimeSessionRef.current) return;
    if (["preview", "completed"].includes(event.kind)) {
      setLiveTranscript(String(event.preview || event.text || ""));
      setRealtimeStatus("receiving");
    } else if (event.kind === "error") setRealtimeStatus("unavailable");
    else if (event.kind === "ready") setRealtimeStatus("ready");
    else if (["finished", "closed"].includes(event.kind)) setRealtimeStatus("finished");
  }), []);
  useEffect(() => deviceEventBus.subscribe((event) => { setLastDeviceEvent(event); if (event.type === "voice-toggle") toggleRef.current(event.payload.phase, event.payload.workflow, event.source === "simulator" ? "simulation" : "voice-workflow"); if (event.type === "voice-cancel") cancelRef.current(); if (event.type === "connection-change" && !event.payload.connected && recordingRef.current && lockedMicrophoneSourceRef.current === "easyinput") { void easyInputRecorder.stop(); notify("EasyInput 已断线，板载麦克风录音已停止；录音中不会切换到其他来源"); } }), [easyInputRecorder.stop, notify]);
  useEffect(() => { voiceAdapters.desktop.setVoiceRecording(recording).catch(() => {}); }, [recording]);
  useEffect(() => {
    voiceAdapters.desktop.setVoiceState({ state: session.state, message: session.message, transcript: session.state === "recording" ? liveTranscript : "", seconds, level, floating: state.settings.floating, source: state.settings.sttMode === "mock" ? "simulation" : hardwareVoiceSourceRef.current }).catch(() => {});
  }, [level, liveTranscript, seconds, session.message, session.state, state.settings.floating]);
  useEffect(() => { voiceAdapters.desktop.capabilities().then(setDesktopCaps).catch(() => setDesktopCaps({ supported: false, shortcutRegistered: false })); }, [state.settings.globalShortcutsEnabled, state.settings.voiceShortcut]);
  useEffect(() => {
    let active = true;
    voiceAdapters.desktop.getEasyInputAudioStatus().then((value) => { if (active) setBoardAudioStatus(value || {}); }).catch(() => {});
    const unsubscribe = voiceAdapters.desktop.onEasyInputAudioEvent((value) => { if (active) setBoardAudioStatus(value || {}); });
    return () => { active = false; unsubscribe?.(); };
  }, []);
  useEffect(() => {
    if (!recordingItem?.blob) { setRecordingUrl(""); return undefined; }
    const url = URL.createObjectURL(recordingItem.blob);
    setRecordingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recordingItem]);
  useEffect(() => {
    let active = true;
    const list = async () => { try { const items = await navigator.mediaDevices?.enumerateDevices?.() || []; if (active) setDevices(items.filter((item) => item.kind === "audioinput")); } catch { /* permissions may hide labels */ } };
    list(); navigator.mediaDevices?.addEventListener?.("devicechange", list); return () => { active = false; navigator.mediaDevices?.removeEventListener?.("devicechange", list); };
  }, []);
  useEffect(() => { if (source && devices.length && !devices.some((device) => device.deviceId === source)) { setSource(""); patch({ settings: { ...state.settings, microphoneId: "" } }); notify("所选麦克风已拔出，已切换为系统默认设备"); } }, [devices, source]);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const processingLabel = session.state === "organizing" ? workflowRef.current === "edit" ? "正在语音编辑…" : "正在整理…" : session.state === "outputting" ? workflowRef.current === "edit" ? "正在替换…" : "正在输入…" : "正在转写…";
  return (
    <div className="page">
      <PageIntro title="语音输入" description="专注录音、实时转写与智能整理" actions={<StatusBadge tone={desktopCaps.inputBridge?.boardConnected ? "success" : "demo"}>{desktopCaps.inputBridge?.boardConnected ? "EasyInput 按键 · 原生监听" : desktopCaps.supported ? "EasyInput 按键 · 等待设备" : "Web 模式 · 硬件按键不可用"}</StatusBadge>} />
      {(import.meta.env.DEV || state.settings.keyDiagnosticsEnabled) && <Card><SectionTitle index="SIM" title="EasyInput 设备模拟器" description="仅开发/诊断模式显示，使用与桌面快捷键相同的录音状态机。" /><div className="page-actions"><Button icon={Microphone2} variant="primary" onClick={() => simulatorRef.current.toggle()}>模拟语音键</Button><Button onClick={() => simulatorRef.current.rapidPress()}>连续按键</Button><Button onClick={() => simulatorRef.current.toggle({ duplicate: true })}>重复事件</Button><Button onClick={() => simulatorRef.current.disconnect()}>断线</Button><Button onClick={() => simulatorRef.current.reconnect()}>重连</Button></div><SettingRow title="Mock STT" description="仅模拟器返回确定测试文本，不代表真实服务"><Toggle checked={state.settings.simulatorEnabled && state.settings.sttMode === "mock"} onChange={(value) => patch({ settings: { ...state.settings, simulatorEnabled: value, sttMode: value ? "mock" : "unconfigured" } })} /></SettingRow>{lastDeviceEvent && <Notice tone="demo" title={`最后事件 · ${lastDeviceEvent.source}`}>{lastDeviceEvent.type} · {new Date(lastDeviceEvent.at).toLocaleTimeString()}</Notice>}</Card>}
      <Card className="voice-console">
        <div className="voice-console__header">
          <div><span className="section-kicker"><span>01</span>语音输入</span><p>专注录音与转写</p></div>
          <div className="source-switch source-switch--stacked">
            <Microphone2 size={18} />
            <select className="voice-device-select" value={preferredMicrophoneSource} disabled={recording || processing || startInFlightRef.current} onChange={(event) => { setMicrophoneFallback(null); patch({ settings: { ...state.settings, microphoneSource: event.target.value } }); }} aria-label="麦克风来源"><option value="computer">电脑麦克风</option><option value="easyinput">EasyInput 板载麦克风（Wi-Fi）</option><option value="bluetooth" disabled>蓝牙麦克风（待接入）</option></select>
            {preferredMicrophoneSource === "computer" && <select className="voice-device-select" value={source} disabled={recording || processing || startInFlightRef.current} onChange={(event) => { setSource(event.target.value); patch({ settings: { ...state.settings, microphoneId: event.target.value } }); }} aria-label="Windows 麦克风设备"><option value="">系统默认麦克风</option>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `麦克风 ${index + 1}`}</option>)}</select>}
          </div>
        </div>
          {microphoneFallback && <Notice tone="warning" title="板载麦克风未启用">{microphoneFallback}。该回退只对本次录音生效，已保存的来源选择不会被改写。</Notice>}
          <div className={`recorder ${recording ? "is-recording" : ""}`}>
          <div className="recorder__state"><span className="pulse-dot" />{recording ? "正在录音…" : processing ? processingLabel : transcript ? "录音完成" : "准备就绪"}</div>
          <div className="waveform" aria-label="录音声波">
            {Array.from({ length: 42 }).map((_, index) => <span key={index} style={{ "--height": `${recording ? Math.max(8, level * (0.35 + ((index % 5) / 10))) : 8 + ((index * 7) % 14)}px`, "--delay": `${index * -0.04}s` }} />)}
          </div>
          <div className="recorder__time">{time}</div>
          <p className="recorder__transcript">{recording ? (activeMicrophoneSource === "easyinput" ? (level > 2 ? "EasyInput 已检测到声音；停止后显示完整文字" : "正在等待 EasyInput 板载麦克风声音…") : liveTranscript || (realtimeStatus === "unavailable" ? "正在采集电脑麦克风音频；录音结束后显示完整文字" : level > 2 ? "已检测到声音，正在实时识别…" : "等待你开始说话…")) : transcript || "按下 EasyInput 语音键或页面按钮开始录音"}</p>
          <Button icon={recording ? PlayerPause : Microphone2} variant={recording ? "danger" : "primary"} onClick={toggleRef.current} disabled={processing}>{recording ? "停止录音" : "开始录音"}</Button>
          {recording && <Button variant="ghost" onClick={cancelRef.current}>取消</Button>}
          {processing && <Button variant="ghost" onClick={cancelRef.current}>取消处理</Button>}
          {recordingUrl && <audio controls src={recordingUrl} />}
          {error && <Notice tone="warning" title="麦克风不可用">{error}</Notice>}
        </div>
      <div className="voice-statusbar"><span>状态 · {recording ? "正在录音" : processing ? processingLabel.replace("…", "") : status === "error" ? "不可用" : status === "completed" ? "录音完成" : "准备就绪"}</span><span>音量 · {level}%</span><span>悬浮窗 · {state.settings.floating ? "已开启" : "已关闭"}</span></div>
      </Card>
      <div className="two-column compact-panels">
        <Card><SectionTitle index="02" title="输出方式" /><SettingRow title="文字整理" description={state.settings.formatting === "raw" ? "保留转写原意，仅应用确定性词库规则" : state.settings.formatting === "smart" ? "千问清理口头语、重复表达和标点" : "千问按你的要求整理，失败时保留原文"}><StatusBadge tone="success">{state.settings.formatting === "raw" ? "原样输出" : state.settings.formatting === "smart" ? "智能整理" : "自定义"}</StatusBadge></SettingRow></Card>
        <Card><SectionTitle index="03" title="录音设备" /><SettingRow title={activeMicrophoneSource === "easyinput" ? "EasyInput 板载麦克风" : activeMicrophoneSource === "computer" ? (source ? (devices.find((device) => device.deviceId === source)?.label || "已选择 Windows 麦克风") : "系统默认麦克风") : preferredMicrophoneSource === "easyinput" ? "EasyInput 板载麦克风（已选择）" : source ? (devices.find((device) => device.deviceId === source)?.label || "已选择 Windows 麦克风") : "系统默认麦克风"} description={recording ? "本次录音来源已锁定，停止前不可切换" : "每次开始录音时锁定来源；板载不可用会明确回退电脑麦克风"}><StatusBadge tone={activeMicrophoneSource === "easyinput" || (preferredMicrophoneSource === "easyinput" && !boardAudioStatus.available) ? (activeMicrophoneSource === "easyinput" ? "success" : "demo") : "success"}>{activeMicrophoneSource ? "本次已锁定" : preferredMicrophoneSource === "easyinput" ? (boardAudioStatus.available ? "板载可用" : "开始时检查") : "默认可用"}</StatusBadge></SettingRow></Card>
      </div>
    </div>
  );
}

export function HistoryPage({ notify }) {
  const { state, patch } = useAppStore();
  const [query, setQuery] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [activeAudioId, setActiveAudioId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const items = state.history;
  const setItems = (next) => patch({ history: typeof next === "function" ? next(state.history) : next });
  const filtered = items.filter((item) => item.text.includes(query) || item.rawText?.includes(query) || item.time.includes(query));
  const copy = async (text) => {
    try {
      const result = await voiceAdapters.output.output(text, "clipboard");
      notify(result?.ok ? "内容已复制" : `复制失败：${result?.reason || "剪贴板不可用"}`);
    } catch (error) { notify(`复制失败：${error.message || "剪贴板不可用"}`); }
  };
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  const playRecording = async (item) => {
    try {
      const blob = await getRecordingBlob(item.audioId);
      if (!blob) throw new Error("没有找到这条录音的音频数据");
      setAudioUrl(URL.createObjectURL(blob));
      setActiveAudioId(item.id);
    } catch (cause) {
      notify(`无法试听：${cause.message}`);
    }
  };
  const removeItem = async (item) => {
    if (item.audioId) { try { await deleteRecordingBlob(item.audioId); } catch { notify("音频删除失败，文字记录仍将保留"); return; } }
    if (activeAudioId === item.id) { setAudioUrl(""); setActiveAudioId(null); }
    setItems((current) => current.filter((entry) => entry.id !== item.id));
  };
  const clearHistory = async () => {
    try { await clearRecordingBlobs(); } catch { /* history can still be cleared */ }
    setAudioUrl(""); setActiveAudioId(null); setItems([]); notify("历史记录已清空");
  };
  return (
    <div className="page">
      <PageIntro title="历史记录" description="管理、搜索和导出最近的语音输入" actions={<><Button icon={FileExport} onClick={() => notify("已生成演示导出文件")}>导出</Button><Button icon={Trash} variant="ghost" onClick={clearHistory}>清空</Button></>} />
      <Card>
        <div className="list-toolbar"><div><strong>最近记录</strong><small>共 {items.length} 条本地记录</small></div><SearchField value={query} onChange={setQuery} placeholder="搜索文字或时间" /></div>
        {audioUrl && <div className="history-player"><strong>正在试听本地录音</strong><audio controls autoPlay src={audioUrl} /><Button variant="ghost" onClick={() => { setAudioUrl(""); setActiveAudioId(null); }}>关闭</Button></div>}
        {filtered.length ? <div className="history-list">{filtered.map((item) => {
          const hasOriginal = Boolean(item.rawText && item.rawText !== item.text);
          const transcriptionFailed = Boolean(item.transcription?.status && item.transcription.status !== "success");
          const organizerLabel = transcriptionFailed ? item.transcription.label || "转写未完成" : item.organizer?.fallback ? "已保留原文" : item.organizer?.mode === "smart" ? "智能整理" : item.organizer?.mode === "custom" ? "自定义整理" : "原样输出";
          return <article className="history-item" key={item.id}>
            <time>{item.time}</time>
            <div className="history-copy">
              <div className="history-badges"><StatusBadge tone={transcriptionFailed || item.organizer?.fallback ? "demo" : "success"}>{organizerLabel}</StatusBadge>{!transcriptionFailed && item.organizer?.durationMs > 0 && <span>{item.organizer.durationMs} ms</span>}</div>
              <p>{item.text}</p>
              <small>{item.date} · {item.duration} · {item.count}</small>
              {hasOriginal && expandedId === item.id && <div className="history-original"><div><strong>原始转写</strong><Button variant="ghost" icon={Copy} onClick={() => copy(item.rawText)}>复制原文</Button></div><p>{item.rawText}</p></div>}
            </div>
            <div className="row-actions">{hasOriginal && <Button variant="ghost" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>{expandedId === item.id ? "收起" : "原文"}</Button>}{item.audioId && <IconButton icon={PlayerPlay} label="试听" onClick={() => playRecording(item)} />}<IconButton icon={Copy} label="复制整理结果" onClick={() => copy(item.text)} /><IconButton icon={Trash} label="删除" onClick={() => removeItem(item)} /></div>
          </article>;
        })}</div> : <EmptyState icon={History} title="没有找到记录" description="更换搜索词，或者开始一次新的语音输入。" />}
      </Card>
    </div>
  );
}

export function VocabularyPage({ notify }) {
  const { state, patch } = useAppStore();
  const hotwords = state.vocabulary.hotwords;
  const rules = state.vocabulary.rules;
  const setHotwords = (next) => patch({ vocabulary: { ...state.vocabulary, hotwords: typeof next === "function" ? next(hotwords) : next } });
  const setRules = (next) => patch({ vocabulary: { ...state.vocabulary, rules: typeof next === "function" ? next(rules) : next } });
  const [newWord, setNewWord] = useState("");
  const addWord = () => { if (!newWord.trim()) return; setHotwords([...hotwords, newWord.trim()]); setNewWord(""); notify("热词已添加"); };
  return (
    <div className="page">
      <PageIntro title="词库" description="提高专有名词识别率并自动修正常见表达" actions={<><Button icon={Upload}>导入</Button><Button icon={Download}>导出</Button><Button icon={DeviceFloppy} variant="primary" onClick={() => notify("词库更改已保存")}>保存更改</Button></>} />
      <div className="two-column vocabulary-layout">
        <Card>
          <SectionTitle index="01" title={`热词 · ${hotwords.length} 个`} description="让语音识别更容易听对人名、产品名和项目名。" />
          <div className="chips">{hotwords.map((word) => <button key={word} className="chip" onClick={() => setHotwords(hotwords.filter((entry) => entry !== word))}>{word}<span>×</span></button>)}</div>
          <div className="inline-form"><input value={newWord} onChange={(e) => setNewWord(e.target.value)} placeholder="添加新的专业词汇" onKeyDown={(e) => e.key === "Enter" && addWord()} /><Button icon={Plus} onClick={addWord}>添加</Button></div>
        </Card>
        <Card>
          <SectionTitle index="02" title={`替换规则 · ${rules.length} 条`} description="识别完成后自动把左侧词语替换为右侧。" />
          <div className="rule-list">{rules.map((rule, index) => <div className="rule-row" key={`${rule.from}-${index}`}><input value={rule.from} onChange={(e) => setRules(rules.map((item, i) => i === index ? { ...item, from: e.target.value } : item))} /><ArrowRight size={18} /><input value={rule.to} onChange={(e) => setRules(rules.map((item, i) => i === index ? { ...item, to: e.target.value } : item))} /><IconButton icon={Trash} label="删除" onClick={() => setRules(rules.filter((_, i) => i !== index))} /></div>)}</div>
          <Button icon={Plus} variant="ghost" onClick={() => setRules([...rules, { from: "", to: "" }])}>添加规则</Button>
        </Card>
      </div>
    </div>
  );
}

export function KeymapPage({ notify }) {
  const { state, patch } = useAppStore();
  const [selectedInput, setSelectedInput] = useState({ kind: "key", index: 0 });
  const [diagnostics, setDiagnostics] = useState([]);
  const [syncState, setSyncState] = useState({ status: "idle", readStatus: "idle", label: "本机配置 · 未同步" });
  const [configConfirmation, setConfigConfirmation] = useState(null);
  const dirtyKeys = useRef(new Set());
  const dirtyEncoder = useRef(new Set());
  const configReadEpoch = useRef(0);
  const boardConnected = Boolean(state.runtime?.inputBridge?.boardConnected);
  const bindings = state.keymap.map((item, index) => normalizeKeyBinding(item, state.keymap[index]));
  const encoder = normalizeEncoder(state.encoder);
  const updateKey = (value) => { dirtyKeys.current.add(selectedInput.index); patch({ keymap: bindings.map((binding, index) => index === selectedInput.index ? normalizeKeyBinding(value) : binding) }); };
  const updateEncoder = (value) => { Object.keys(value).forEach((key) => dirtyEncoder.current.add(key)); patch({ encoder: normalizeEncoder({ ...encoder, ...value }) }); };
  const loadKeyboardConfig = useCallback(async ({ announceFailure = false } = {}) => {
    const epoch = ++configReadEpoch.current;
    if (!boardConnected) {
      setSyncState({ status: "idle", readStatus: "waiting", label: "等待 EasyInput 连接" });
      return { ok: false, reason: "easyinput-not-connected" };
    }
    setSyncState({ status: "syncing", readStatus: "syncing", label: "正在读取键盘配置…" });
    const result = await readKeyboardConfigWithRetry({ read: () => voiceAdapters.desktop.readKeyboardConfig() });
    if (epoch !== configReadEpoch.current) return { ok: false, reason: "config-read-superseded" };
    if (result?.ok && result.config) {
      dirtyKeys.current.clear();
      dirtyEncoder.current.clear();
      patch({
        ...(Array.isArray(result.config.keymap) ? { keymap: result.config.keymap.map((item) => normalizeKeyBinding(item)) } : {}),
        encoder: normalizeEncoder(result.config.encoder),
      });
      const sourceLabel = ["DeskMate NVS", "Maker NVS", "编译默认值", "安全恢复值"][result.source] || "未知来源";
      setSyncState({ status: "success", readStatus: "success", label: `${sourceLabel} · ${result.fingerprint || "已读取"}` });
      return result;
    }
    const label = keyboardConfigReadMessage(result?.reason);
    const waiting = ["easyinput-not-connected", "easyinput-disconnected", "input-bridge-unavailable", "input-bridge-restarting", "input-bridge-exited", "config-read-timeout"].includes(result?.reason);
    setSyncState({ status: waiting ? "warning" : "error", readStatus: waiting ? "retry" : "error", label });
    if (announceFailure) notify(`${label}，请确认设备连接后重试`);
    return result;
  }, [boardConnected, notify, patch]);
  useEffect(() => {
    void loadKeyboardConfig();
    return () => { configReadEpoch.current += 1; };
  }, [loadKeyboardConfig]);
  const syncKeyboard = async () => {
    setSyncState((current) => ({ status: "syncing", readStatus: current.readStatus, label: "正在读取板上配置…" }));
    try {
      const selectedKeys = Object.fromEntries([...dirtyKeys.current].map((index) => [`KEY${index + 1}`, bindings[index]]));
      const selectedEncoder = Object.fromEntries([...dirtyEncoder.current].map((key) => [key, encoder[key]]));
      const patch = {};
      if (Object.keys(selectedKeys).length > 0) patch.keymap = selectedKeys;
      if (Object.keys(selectedEncoder).length > 0) patch.encoder = selectedEncoder;
      if (Object.keys(patch).length === 0) { setSyncState((current) => ({ status: "idle", readStatus: current.readStatus, label: "没有待同步修改" })); return; }
      const preview = await voiceAdapters.desktop.previewKeyboardConfigPatch(patch);
      if (!preview?.ok) throw new Error(preview?.reason || "读取配置失败");
      const paths = (preview.diff || []).map((item) => item.path).filter(Boolean);
      setConfigConfirmation({ token: preview.token, paths: paths.length ? paths : ["无配置变化"], busy: false });
      setSyncState((current) => ({ status: "review", readStatus: current.readStatus, label: "等待确认同步" }));
    } catch (error) { setSyncState((current) => ({ status: "error", readStatus: current.readStatus, label: "同步失败" })); notify(`同步失败：${error.message}`); }
  };
  const cancelKeyboardSync = useCallback(() => {
    if (configConfirmation?.busy) return;
    setConfigConfirmation(null);
    setSyncState((current) => ({ status: "idle", readStatus: current.readStatus, label: "已取消同步" }));
  }, [configConfirmation?.busy]);
  const confirmKeyboardSync = async () => {
    const pending = configConfirmation;
    if (!pending || pending.busy) return;
    setConfigConfirmation({ ...pending, busy: true });
    setSyncState((current) => ({ status: "syncing", readStatus: current.readStatus, label: "正在保存并回读确认…" }));
    try {
      const result = await voiceAdapters.desktop.commitKeyboardConfig(pending.token);
      if (!result?.ok && result?.saved) {
        setSyncState({ status: "warning", readStatus: "pending", label: "已保存，回读待确认" });
        notify("配置已由键盘确认保存，但本次回读暂未完成；重新进入页面可再次核对");
        setConfigConfirmation(null);
        return;
      }
      if (!result?.ok) throw new Error(result?.reason || "键盘未确认配置");
      dirtyKeys.current.clear();
      dirtyEncoder.current.clear();
      setConfigConfirmation(null);
      setSyncState({ status: "success", readStatus: "success", label: "已保存并回读确认" });
      notify("按键与旋钮配置已同步到键盘并完成回读确认");
    } catch (error) {
      setConfigConfirmation(null);
      setSyncState((current) => ({ status: "error", readStatus: current.readStatus, label: "同步失败" }));
      notify(`同步失败：${error.message}`);
    }
  };
  useEffect(() => {
    return deviceEventBus.subscribe((event) => {
      if (!state.settings.keyDiagnosticsEnabled || event.type !== "key-diagnostic") return;
      setDiagnostics((items) => [{ ...event.payload, source: event.source, at: new Date(event.at).toLocaleTimeString() }, ...items].slice(0, 8));
    });
  }, [state.settings.keyDiagnosticsEnabled]);
  return (
    <div className="page">
      <PageIntro title="按键配置" description="配置键盘按键、旋钮和快捷动作" actions={<><StatusBadge tone={syncState.status === "success" ? "success" : ["error", "warning"].includes(syncState.status) ? "warning" : "demo"}>{syncState.label}</StatusBadge><Button icon={Send} variant="primary" disabled={["syncing", "review"].includes(syncState.status)} onClick={syncKeyboard}>同步到键盘</Button></>} />
      <Notice tone="info" title="保存与同步是两件事">页面修改会自动保存到本机。同步前会重新读取板上配置，只提交按键与旋钮路径；网络、音频和未知字段保持原值。回车、退格等标准动作仍由键盘直接发送给 Windows。</Notice>
      <SettingRow title="按键诊断模式" description="只记录 F22 / 右 Alt 的来源类别、按下释放和时间；不记录普通输入、文字或设备路径"><Toggle checked={state.settings.keyDiagnosticsEnabled} onChange={(value) => patch({ settings: { ...state.settings, keyDiagnosticsEnabled: value } })} /></SettingRow>
      {diagnostics.length > 0 && <Card><div className="history-list">{diagnostics.map((item, index) => <div className="history-item" key={`${item.at}-${index}`}><time>{item.at}</time><div><p>{item.key || "语音触发"} · {item.action || "切换"}</p><small>{item.source}</small></div></div>)}</div></Card>}
      <div className="keymap-grid">
        <Card className="keymap-board">
          <div className="device-line"><span>当前电脑 <strong>Windows</strong></span><span>键盘系统 <strong>{syncState.readStatus === "success" ? "已读取" : syncState.readStatus === "syncing" ? "读取中" : syncState.readStatus === "pending" ? "待核对" : syncState.readStatus === "waiting" ? "等待连接" : syncState.readStatus === "retry" ? "可重试" : syncState.readStatus === "error" ? "读取失败" : "未读取"}</strong></span><span className="device-line__result">同步结果 <strong className={syncState.status === "success" ? "success-text" : ["error", "warning"].includes(syncState.status) ? "warning-text" : ""}>{syncState.label}</strong>{["retry", "error"].includes(syncState.readStatus) && <button type="button" className="config-read-retry" disabled={syncState.status === "syncing"} onClick={() => void loadKeyboardConfig({ announceFailure: true })}><Refresh size={13} />重新读取</button>}</span></div>
          <div className="keyboard-visual">
            <div className="key-grid">{bindings.map((binding, index) => <button key={index} className={`hardware-key ${selectedInput.kind === "key" && selectedInput.index === index ? "is-selected" : ""}`} onClick={() => setSelectedInput({ kind: "key", index })}><small>KEY{index + 1}</small><Keyboard size={25} stroke={1.5} /><strong>{actionLabel(binding)}</strong></button>)}</div>
            <button className={`dial-control ${selectedInput.kind === "encoder" ? "is-selected" : ""}`} onClick={() => setSelectedInput({ kind: "encoder" })}><AdjustmentsHorizontal size={42} stroke={1.3} /><strong>{encoder.mode === "scroll" ? "滚动页面" : "移动光标"} · {encoder.axis === "vertical" ? "上下" : "左右"}</strong><small>ENCODER</small></button>
          </div>
        </Card>
        <Card className="key-editor">
          {selectedInput.kind === "key" ? <>
            <div className="key-editor__title"><span>KEY {selectedInput.index + 1}</span><strong>按键设置</strong></div>
            <BindingEditor binding={bindings[selectedInput.index]} onChange={updateKey} notify={notify} />
            <div className="mapping-preview"><span>当前映射</span><strong>{actionLabel(bindings[selectedInput.index])}</strong><small>修改后自动保存到本机</small></div>
            <Button variant="primary" className="button--wide" disabled={["syncing", "review"].includes(syncState.status)} onClick={syncKeyboard}>保存当前按键</Button>
          </> : <>
            <div className="key-editor__title"><span>ENCODER</span><strong>旋钮设置</strong></div>
            <label>旋转模式<Segmented compact value={encoder.mode} onChange={(mode) => updateEncoder({ mode })} options={[{ value: "scroll", label: "滚动页面" }, { value: "cursor", label: "移动光标" }]} /></label>
            <label>滚动方向<Segmented compact value={encoder.axis} onChange={(axis) => updateEncoder({ axis })} options={[{ value: "vertical", label: "上下" }, { value: "horizontal", label: "左右" }]} /></label>
            <label>滚动速度<Slider label="旋钮滚动速度" min={1} max={5} suffix="" value={encoder.speed} onChange={(speed) => updateEncoder({ speed })} /></label>
            <SettingRow title="反转上下方向"><Toggle checked={encoder.reverseVertical} onChange={(reverseVertical) => updateEncoder({ reverseVertical })} /></SettingRow>
            <SettingRow title="反转左右方向"><Toggle checked={encoder.reverseHorizontal} onChange={(reverseHorizontal) => updateEncoder({ reverseHorizontal })} /></SettingRow>
            <BindingEditor binding={encoder.press} options={ENCODER_PRESS_ACTIONS} onChange={(press) => updateEncoder({ press })} notify={notify} />
            <div className="mapping-preview"><span>旋钮短按</span><strong>{actionLabel(encoder.press)}</strong><small>旋转与短按会一起同步</small></div>
          </>}
        </Card>
      </div>
      <ConfirmationDialog
        open={Boolean(configConfirmation)}
        title="确认同步到键盘"
        description="请核对本次将写入 EasyInput 的按键与旋钮配置。"
        paths={configConfirmation?.paths || []}
        busy={Boolean(configConfirmation?.busy)}
        onCancel={cancelKeyboardSync}
        onConfirm={confirmKeyboardSync}
      />
    </div>
  );
}

const MANUAL_CONTROL_PHASE_LABELS = Object.freeze({ unavailable: "设备未连接", locked: "已锁定", "idle-timeout": "已自动退出", "establishing-center": "正在建立中心", "center-required": "需先建立中心", ready: "可以控制", moving: "正在移动", "emergency-stopped": "已紧急停止" });
const CALIBRATION_OPERATION_LABELS = Object.freeze({ status: "读取状态", selectAxis: "选择轴", arm: "安全解锁", provisionalCenter: "暂定中心", singleStep: "单步", recenter: "回到中心", emergencyStop: "紧急停止", clearEmergencyStop: "清除急停" });
const CALIBRATION_TRANSPORT_LABELS = Object.freeze({ completed: "端点已响应", malformed: "请求格式错误", busy: "EasyInput 正忙", stale: "请求已过期", conflict: "请求 ID 冲突", "link-not-ready": "DeskMate Link 未就绪", "link-queue-busy": "Link 队列正忙", timeout: "请求超时", "link-error": "Link 返回错误", "peer-disconnected-or-restarted": "小智断开或重启", "invalid-response": "小智响应无效", internal: "EasyInput 内部错误" });
const CALIBRATION_ENDPOINT_LABELS = Object.freeze({ completed: "端点接受本次操作", duplicate: "端点识别为重复请求", "not-ready": "手动校准 owner 未就绪", "bad-payload": "端点拒绝无效载荷", "wrong-session": "会话已经变化", "stale-action": "动作 ID 已过期", "arm-required": "需要重新安全解锁", "arm-expired": "安全解锁已过期", "wrong-axis": "轴选择不一致", "step-out-of-range": "单步超出安全范围", "center-required": "需要先建立中心", "emergency-stopped": "急停已锁定", "emergency-stop-clear-not-confirmed": "小智没有确认解除急停", faulted: "运动 owner 故障锁定", "adapter-unavailable": "真实舵机适配器尚未接入", "adapter-failure": "舵机适配器执行失败", "action-conflict": "动作 ID 冲突", "safety-not-confirmed": "安全声明不完整", "manual-calibration-request-id-store-corrupt": "请求编号存储损坏，控制已锁定", "manual-calibration-request-id-exhausted": "请求编号空间已耗尽，控制已锁定", "manual-calibration-request-id-persist-failed": "请求编号无法安全保存，控制已锁定", "manual-calibration-request-id-unavailable": "请求编号不可用，控制已锁定" });
const CALIBRATION_LINK_ERROR_LABELS = Object.freeze({ UNKNOWN_TYPE: "当前小智固件不支持手动校准协议", BAD_PAYLOAD: "小智拒绝了校准协议载荷", NOT_READY: "协议存在，但校准 owner/真实适配器未就绪", BUSY: "小智校准 owner 正忙", SEQUENCE_CONFLICT: "DeskMate Link 序列冲突", INTERNAL: "小智端内部错误" });

function ManualCalibrationPanel({ notify }) {
  const [status, setStatus] = useState({ available: false, active: false, centerReady: false, controlsEnabled: false, phase: "unavailable", reason: "unavailable", linkState: "unavailable", heldDirection: null, inFlight: null, evidence: null });
  const [environmentConfirmed, setEnvironmentConfirmed] = useState(false);
  useEffect(() => {
    let active = true;
    const apply = (value) => { if (active && value) setStatus(value); };
    const unsubscribe = voiceAdapters.desktop.onManualControlStatus(apply);
    void voiceAdapters.desktop.getManualControlStatus().then(apply);
    void voiceAdapters.desktop.queryManualCalibration().catch(() => {});
    const onVisibility = () => { if (document.hidden) void voiceAdapters.desktop.endManualControl("document-hidden"); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
      void voiceAdapters.desktop.endManualControl("page-leave");
    };
  }, []);
  const applyResult = (result) => { if (result?.status) setStatus(result.status); return result; };
  const startOrEnd = async () => {
    if (status.active) {
      applyResult(await voiceAdapters.desktop.endManualControl("page-leave"));
      setEnvironmentConfirmed(false);
      return;
    }
    const result = applyResult(await voiceAdapters.desktop.startManualControl({ environmentConfirmed, recoverEmergencyStop: status.phase === "emergency-stopped" }));
    if (!result?.ok) notify(`无法开始手动控制：${CALIBRATION_ENDPOINT_LABELS[result?.reason] || result?.reason || "unavailable"}`);
  };
  const establishCenter = async () => {
    const result = applyResult(await voiceAdapters.desktop.establishManualControlCenter());
    if (!result?.ok) notify(`建立中心失败：${CALIBRATION_ENDPOINT_LABELS[result?.reason] || result?.reason || "unknown"}`);
  };
  const recenter = async () => {
    const result = applyResult(await voiceAdapters.desktop.recenterManualControl());
    if (!result?.ok) notify(`回到中心失败：${CALIBRATION_ENDPOINT_LABELS[result?.reason] || result?.reason || "unknown"}`);
  };
  const emergencyStop = async () => {
    const result = applyResult(await voiceAdapters.desktop.emergencyStopManualControl());
    if (!result?.ok) notify(`紧急停止未送达：${result?.reason || "unknown"}`);
  };
  const pressDirection = async (event, direction) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const result = await voiceAdapters.desktop.pressManualControlDirection(direction);
    if (!result?.ok && result?.reason !== "already-held") notify(`方向控制不可用：${result?.reason || "unknown"}`);
  };
  const releaseDirection = (event, direction) => {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    void voiceAdapters.desktop.releaseManualControlDirection(direction);
  };
  const keyboardDirection = (event, direction, pressed) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (pressed && !event.repeat) void voiceAdapters.desktop.pressManualControlDirection(direction);
    if (!pressed) void voiceAdapters.desktop.releaseManualControlDirection(direction);
  };
  const evidence = status.evidence || {};
  const terminal = evidence.terminal;
  const endpoint = terminal?.endpoint;
  const linkErrorCopy = terminal?.transport === "link-error" && terminal?.linkErrorCode > 0 ? `${CALIBRATION_LINK_ERROR_LABELS[terminal.linkError] || "未知 Link 错误"} · ${terminal.linkError} (${terminal.linkErrorCode})` : "";
  const terminalCopy = terminal ? endpoint ? `${CALIBRATION_ENDPOINT_LABELS[endpoint.result] || "状态响应"} · completed_output_count ${endpoint.completedOutputCount}` : linkErrorCopy || CALIBRATION_TRANSPORT_LABELS[terminal.transport] || terminal.transport : "尚无 terminal";
  const directions = [{ id: "up", label: "上", icon: ArrowUp }, { id: "left", label: "左", icon: ArrowLeft }, { id: "right", label: "右", icon: ArrowRight }, { id: "down", label: "下", icon: ArrowDown }];
  const emergencyRecovery = status.phase === "emergency-stopped";
  return <Card className="manual-calibration-panel">
    <div className="manual-calibration-panel__header"><SectionTitle index="02" title="小智手动控制" description="确认一次环境后即可按住方向移动；松开、失焦或断连都会停止继续发送。" /><div className="manual-calibration-panel__status"><StatusBadge tone={status.phase === "ready" || status.phase === "moving" ? "success" : "demo"}>{MANUAL_CONTROL_PHASE_LABELS[status.phase] || "状态未知"}</StatusBadge><small>DeskMate Link：{status.linkState || "unavailable"}</small></div></div>
    {!status.active && <><div className="manual-control-start"><label><input type="checkbox" checked={environmentConfirmed} onChange={(event) => setEnvironmentConfirmed(event.target.checked)} />设备周围无阻挡，我在设备旁</label><div className="manual-control-start__actions"><Button icon={PlayerPlay} disabled={!status.available || !environmentConfirmed} onClick={startOrEnd}>{emergencyRecovery ? "解除急停并重新开始（会先回中）" : "开始手动控制（会先回中）"}</Button><span className="manual-control-stop"><Button variant="primary" disabled={!status.available} onClick={emergencyStop}>立即停止</Button></span></div></div>{emergencyRecovery && <Notice tone="warning" title="急停保持锁定">只有勾选环境确认并点击“解除急停并重新开始”后，才会读取新状态、显式清除急停并重新建立双轴中心。重连和状态查询不会自动清锁。</Notice>}</>}
    {status.active && <>
      {status.phase === "center-required" && <Notice tone="warning" title="需要先建立中心">方向按键保持禁用。建立 Yaw 和 Pitch 中心成功后才能移动；不会自动连续驱动。</Notice>}
      <div className="manual-control-layout">
        {status.centerReady && <div className="manual-control-pad" aria-label="按住方向控制云台">
          {directions.map(({ id, label, icon: DirectionIcon }) => <button type="button" key={id} aria-label={`按住向${label}`} className={`manual-control-direction manual-control-direction--${id} ${status.heldDirection === id ? "is-held" : ""}`} disabled={!status.controlsEnabled} onPointerDown={(event) => { void pressDirection(event, id); }} onPointerUp={(event) => releaseDirection(event, id)} onPointerCancel={(event) => releaseDirection(event, id)} onLostPointerCapture={(event) => { if (status.heldDirection === id) releaseDirection(event, id); }} onKeyDown={(event) => keyboardDirection(event, id, true)} onKeyUp={(event) => keyboardDirection(event, id, false)}><DirectionIcon size={32} /><span>{label}</span></button>)}
          <div className="manual-control-pad__center"><Robot size={28} /><small>按住移动<br/>松开停止</small></div>
        </div>}
        <div className="manual-control-actions">
          {!status.centerReady && <Button variant="primary" disabled={Boolean(status.inFlight)} onClick={establishCenter}>建立中心</Button>}
          <Button variant="ghost" disabled={!status.controlsEnabled} onClick={recenter}>回到中心</Button>
          <span className="manual-control-stop"><Button variant="primary" disabled={!status.available} onClick={emergencyStop}>立即停止</Button></span>
          <Button variant="soft" onClick={startOrEnd}>结束手动控制</Button>
          <small>固定 1° 小步执行；上一条小智 terminal 返回后才会发送下一步。60 秒无操作自动退出。</small>
        </div>
      </div>
    </>}
    {linkErrorCopy && <Notice tone="warning" title={CALIBRATION_LINK_ERROR_LABELS[terminal.linkError] || "小智返回 Link 错误"}>{linkErrorCopy}。控制保持锁定，这不代表舵机已经移动。</Notice>}
    <details className="manual-calibration-details"><summary>调试详情</summary><div className="manual-calibration-evidence" aria-live="polite"><div><small>1 · 用户意图</small><strong>{evidence.intent ? `${CALIBRATION_OPERATION_LABELS[evidence.intent.operation] || evidence.intent.operation} · request ${evidence.intent.requestId}` : "尚未确认"}</strong><span>{evidence.intent?.confirmationId ? `confirmation ${evidence.intent.confirmationId}` : "状态查询 confirmation=0"}</span></div><div><small>2 · EasyInput accepted</small><strong>{evidence.accepted ? `已进入单请求转发槽 · accepted ${evidence.accepted.acceptedCount}` : "尚未收到 accepted"}</strong><span>accepted 不等于已转动或成功</span></div><div><small>3 · 小智 terminal</small><strong>{terminalCopy}</strong><span>{endpoint ? `owner ${endpoint.state} · axis ${endpoint.selectedAxis}` : "只有 terminal 才是端点执行/拒绝证据"}</span></div></div></details>
  </Card>;
}

export function ConnectionsPage({ notify, embedded = false }) {
  const { state, patch } = useAppStore();
  const [tab, setTab] = useState("overview");
  const startupSound = state.settings.startupSound;
  const setStartupSound = (value) => patch({ settings: { ...state.settings, startupSound: value } });
  const [transportCaps, setTransportCaps] = useState(null);
  const [networkSummary, setNetworkSummary] = useState(null);
  const [desktopCaps, setDesktopCaps] = useState({ supported: false });
  const [lastTrigger, setLastTrigger] = useState(null);
  useEffect(() => { mockAdapters.device.discoverTransports().then(setTransportCaps).catch(() => setTransportCaps({})); }, []);
  useEffect(() => { voiceAdapters.desktop.networkSummary().then(setNetworkSummary).catch(() => setNetworkSummary({ available: false, transports: [], lanAudio: "desktop-bridge-unavailable" })); }, []);
  useEffect(() => { voiceAdapters.desktop.capabilities().then(setDesktopCaps).catch(() => setDesktopCaps({ supported: false, shortcutRegistered: false })); }, [state.settings.voiceShortcut]);
  useEffect(() => deviceEventBus.subscribe((event) => { if (event.type === "voice-toggle" || event.type === "key-diagnostic") setLastTrigger({ source: event.source, key: event.payload.key || event.payload.shortcut || "", at: event.at }); }), []);
  const bridge = state.runtime?.inputBridge || desktopCaps.inputBridge || {};
  const audioStatus = state.runtime?.easyInputAudio || {};
  const link = normalizeLinkDiagnostics(bridge.linkDiagnostics);
  const agentDelivery = normalizeAgentDelivery(bridge.agentStateDelivery);
  const sharedStatus = deviceServiceStatus({ inputBridge: bridge, audioStatus, preferredMicrophoneSource: state.settings.microphoneSource, companion: state.runtime?.companion, memory: state.runtime?.memory });
  const qwenReady = state.settings.sttMode === "bailian";
  const outputReady = state.settings.outputMode === "history" || desktopCaps.supported;
  const audioReady = Boolean(audioStatus.setup?.configured && ["ready", "streaming"].includes(audioStatus.state));
  const audioStateLabel = sharedStatus.microphone.label;
  const linkStateLabel = sharedStatus.xiaozhi.label;
  const refreshConnections = async () => {
    const result = await voiceAdapters.desktop.refreshLinkDiagnostics();
    const caps = await voiceAdapters.desktop.capabilities().catch(() => ({ supported: false }));
    setDesktopCaps(caps);
    notify(result?.ok ? "已刷新 EasyInput 与小智 Link 状态" : `Link 状态刷新失败：${result?.reason || "unavailable"}`);
  };
  const toggleMicTest = async () => {
    const result = audioStatus.micTest ? await voiceAdapters.desktop.stopEasyInputMicTest() : await voiceAdapters.desktop.startEasyInputMicTest();
    if (!result?.ok) notify(`板载麦克风测试失败：${result?.reason || "unknown-error"}`);
    else notify(audioStatus.micTest ? "板载麦克风测试已停止" : "板载麦克风测试已开始，最长 30 秒");
  };
  return (
    <div className={embedded ? "connections-embedded" : "page"}>
      {!embedded && <PageIntro title="设备与连接" description="检查板子触发、麦克风音频、转写和文字输出链路" actions={<Button icon={Refresh} onClick={refreshConnections}>刷新能力</Button>} />}
      {embedded && <div className="embedded-heading"><div><span>DEVICE CONNECTIONS</span><h2>设备连接</h2><p>检查板子触发、麦克风音频、转写和文字输出链路。</p></div><Button icon={Refresh} onClick={refreshConnections}>刷新能力</Button></div>}
      <Segmented value={tab} onChange={setTab} options={[{ value: "overview", label: "连接概览" }, { value: "microphone", label: "麦克风" }, { value: "network", label: "Wi-Fi 与蓝牙" }, { value: "sound", label: "提示音" }]} />
      {tab === "overview" && <><Notice tone={bridge.boardConnected ? "success" : "warning"} title={bridge.boardConnected ? "EasyInput 真机语音桥已连接" : "等待 EasyInput USB 设备"}>{bridge.boardConnected ? "Raw Input 桥只接受 EasyInput 设备发出的语音与语音编辑组合键，并调用与页面按钮相同的 VoiceWorkflow；普通键盘全局快捷键默认关闭。" : "连接开发板后，Raw Input 桥只读识别 VID 303A / PID 1006 的语音组合键和 F22 兼容路径，不读取文字、序列号，也不会向板子写输入数据。"}</Notice><div className="connection-cards">
        <Card interactive><div className="connection-icon"><Link size={28} /></div><div><strong>EasyInput HID</strong><p>{lastTrigger ? `最后触发：${lastTrigger.key || "语音切换"} · ${lastTrigger.source}` : "语音键由 EasyInput 原生来源识别；普通键盘快捷键默认关闭"}</p></div><StatusBadge tone={bridge.boardConnected ? "success" : "demo"}>{bridge.boardConnected ? "已连接" : bridge.process === "running" ? "监听中" : "桥未运行"}</StatusBadge></Card>
        <Card className="link-diagnostics-card"><div className="connection-icon"><Robot size={28} /></div><div><strong>小智云台 / DeskMate Link</strong><p>状态来自 EasyInput 的冻结 Link 状态报告；EasyInput HID 已连接不等于小智已连接。</p></div><StatusBadge tone={sharedStatus.xiaozhi.tone}>{linkStateLabel}</StatusBadge><div className="link-diagnostics-grid">{[["接收帧", link.counters.rxFrames], ["发送帧", link.counters.txFrames], ["请求超时", link.counters.requestTimeouts], ["重试", link.counters.retries], ["对端重启", link.counters.peerRestarts], ["Agent accepted", link.counters.agentAccepted], ["Agent forwarded", link.counters.agentForwarded], ["断线丢弃", link.counters.agentDroppedDisconnected], ["队列丢弃", link.counters.agentQueueDrops]].map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div><div className="agent-delivery-line"><span>最近 Agent State</span><strong>{agentDelivery.status === "acknowledged" ? "EasyInput 写入 ACK 成功" : agentDelivery.status === "failed" ? `失败 · ${agentDelivery.reason || "unknown"}` : agentDelivery.status === "sending" ? "请求中" : "尚未发送"}</strong><small>{agentDelivery.targetState}{agentDelivery.at ? ` · ${new Date(agentDelivery.at).toLocaleTimeString()}` : ""}</small></div></Card>
        <Card interactive><div className="connection-icon"><Microphone2 size={28} /></div><div><strong>EasyInput 板载麦克风</strong><p>通过冻结的局域网 PCM 合同接收；原始音频只停留在 Electron 主进程内存</p></div><StatusBadge tone={sharedStatus.microphone.tone}>{audioStateLabel}</StatusBadge></Card>
        <Card interactive><div className="connection-icon"><Brain size={28} /></div><div><strong>千问语音识别</strong><p>停止录音后调用 qwen3-asr-flash</p></div><StatusBadge tone={qwenReady ? "success" : "demo"}>{qwenReady ? "已启用" : "待配置"}</StatusBadge></Card>
        <Card interactive><div className="connection-icon"><Copy size={28} /></div><div><strong>文字输出</strong><p>先保存历史，再写入原窗口；失败时自动回退剪贴板</p></div><StatusBadge tone={outputReady ? "success" : "demo"}>{outputReady ? "就绪" : "Web 仅历史"}</StatusBadge></Card>
      </div><ManualCalibrationPanel notify={notify} /><Card className="transport-readiness"><SectionTitle index="03" title="浏览器通信能力" description="这里只表示当前浏览器支持哪些接口，不代表硬件已经连接。" /><div className="chips">{transportCaps ? Object.entries(transportCaps).map(([name, supported]) => <span className={`chip chip--status ${supported ? "is-supported" : ""}`} key={name}>{name} · {supported ? "可用" : "不可用"}</span>) : <span>正在检测…</span>}</div></Card></>}
      {tab === "microphone" && <Card><SectionTitle index="01" title="EasyInput 板载麦克风" description="已接入的可选外部麦克风；诊断不会启动豆包对话，也不会保存录音。" /><Notice tone={audioReady ? "success" : "warning"} title={audioStateLabel}>{audioStatus.micTest ? `实时音量 ${audioStatus.level || 0}% · 丢包 ${audioStatus.counters?.sequenceGaps || 0}` : audioStatus.setup?.configured ? "已配置局域网接收。测试时只把音量等级发送到页面，PCM 不离开主进程。" : "请先在 Wi-Fi 与蓝牙页完成 EasyInput 音频设置。"}</Notice><div className="audio-level" aria-label={`板载麦克风音量 ${audioStatus.level || 0}%`}><span style={{ width: `${Math.max(0, Math.min(100, audioStatus.level || 0))}%` }} /></div><div className="button-row"><Button icon={Microphone2} variant="primary" disabled={!audioStatus.setup?.configured} onClick={toggleMicTest}>{audioStatus.micTest ? "停止麦克风测试" : "测试板载麦克风"}</Button><span className="muted-copy">自动测试最长 30 秒，可提前停止。</span></div></Card>}
      {tab === "network" && <div className="two-column"><Card><SectionTitle index="01" title="网络与音频接收" description="只绑定你明确选择的非回环 IPv4 网卡，不扫描局域网。" /><Notice tone="info" title={networkSummary?.available ? "电脑网络可用" : "等待网络"}>{networkSummary?.available ? `检测到网络类别：${networkSummary.transports.join(" / ") || "unknown"}。` : "未检测到可用网络接口。"}</Notice><Notice tone={audioStatus.setup?.configured ? "success" : "warning"} title={audioStatus.setup?.configured ? "EasyInput 音频已配置" : "EasyInput 音频尚未配置"}>{audioStatus.setup?.configured ? `${audioStatus.setup.adapterLabel || "所选网卡"} · 端口 ${audioStatus.setup.port} · ${audioStateLabel}` : "在隔离设置窗口中填写网络信息；主页面不会接触 Wi-Fi 密码或真实 IP。"}</Notice><Button icon={Send} variant="primary" onClick={async () => { const result = await voiceAdapters.desktop.openEasyInputAudioSetup(); if (!result?.ok) notify(`无法打开音频设置：${result?.reason || "unknown-error"}`); }}>打开 EasyInput 音频设置</Button></Card><Card><SectionTitle index="02" title="蓝牙功能" /><SettingRow icon={Bluetooth} title="蓝牙 HID 输入" description="用于按键和旋钮，不用于传输麦克风音频"><Toggle checked onChange={() => notify("蓝牙状态为模拟能力")}/></SettingRow><Notice tone="info" title="隐私边界">页面只接收状态、音量等级和计数；不接收 PCM、密码、IP、SSID 或设备路径。</Notice></Card></div>}
      {tab === "sound" && <Card><SectionTitle index="03" title="开机提示音" description="选择内置音效或导入最长 8 秒的音频。" /><div className="sound-grid">{["WaytoAGI", "来 WaytoAGI 学 AI 硬件", "又来写 bug 了", "晶亮启动", "柔和启动", "极简启动"].map((name, index) => <button key={name} className={index === 0 ? "is-selected" : ""} onClick={() => notify(`已试听“${name}”`)}><Music size={22} /><strong>{name}</strong><small>{["1.7", "2.8", "2.1", "0.6", "0.8", "0.3"][index]} 秒</small></button>)}</div><SettingRow title="开机音效" description="完整开机时播放已选音效"><Toggle checked={startupSound} onChange={setStartupSound} /></SettingRow></Card>}
    </div>
  );
}

export function AgentsPage({ notify, embedded = false }) {
  const { state, patch, event } = useAppStore();
  const mapping = state.agentExpressionMapping;
  const control = normalizeAgentControl(state.agentControl);
  const [sendState, setSendState] = useState({ status: "idle", label: "尚未发送" });
  const [providerStatus, setProviderStatus] = useState({ provider: control.agentId, receiver: "starting", connected: false, state: "idle", delivery: "not-received" });
  const petIntent = state.aiIntent || mapAiStateToPetIntent({ state: state.aiEvent.type === "waiting_user" ? "waiting" : state.aiEvent.type });
  const recentCodexTasks = Array.isArray(state.runtime?.codexTasks?.tasks) ? state.runtime.codexTasks.tasks.slice(0, 8) : [];
  const eventLabel = { idle: "待命", listening: "倾听中", thinking: "思考中", working: "工作中", waiting_user: "等待用户", completed: "已完成", error: "异常" };
  const updateMapping = (agentId, value) => {
    patch({ agentExpressionMapping: { ...mapping, [agentId]: value } });
    if (state.aiEvent.type === "working" && state.aiEvent.agent?.toLowerCase().includes(agentId === "claude" ? "claude" : agentId)) event({ ...state.aiEvent });
  };
  const updateControl = (value) => patch({ agentControl: normalizeAgentControl({ ...control, ...value }) });
  useEffect(() => {
    let active = true;
    const supportsAutomaticStatus = ["codex", "hermes"].includes(control.agentId);
    const selectedProvider = supportsAutomaticStatus && control.automaticStatusEnabled ? control.agentId : "disabled";
    void voiceAdapters.desktop.setActiveAgentProvider(selectedProvider).then((result) => {
      if (active && result?.status) setProviderStatus(result.status);
    });
    void voiceAdapters.desktop.getAgentProviderStatus(control.agentId).then((result) => { if (active && result) setProviderStatus(result); });
    return () => { active = false; };
  }, [control.agentId, control.automaticStatusEnabled]);
  useEffect(() => voiceAdapters.desktop.onAgentProviderState((payload) => {
    if (!payload || payload.provider !== control.agentId) return;
    setProviderStatus(payload);
    if (!["codex", "hermes"].includes(control.agentId) || !control.automaticStatusEnabled || !payload.connected) return;
    const stateId = payload.state === "waiting" ? "waiting_user" : payload.state;
    const selected = manualAgentState(stateId);
    const agentName = manualAgentName(control);
    patch({ agentControl: normalizeAgentControl({ ...control, state: stateId }) });
    event({ type: stateId, agent: agentName, progress: stateId === "completed" ? 100 : stateId === "idle" ? 0 : state.aiEvent.progress, detail: `${agentName} 生命周期 · ${selected.label}` });
    const deliveryLabel = payload.delivery === "voice-workflow-active" ? "语音流程优先，未发送到小智" : payload.delivery === "not-selected" ? `${agentName} 当前未选中` : `${agentName} 自动 · ${selected.label}`;
    setSendState({ status: payload.delivery === "sent" || payload.delivery === "suppressed" ? "success" : "idle", label: deliveryLabel });
  }), [control.agentId, control.automaticStatusEnabled, control.customName, event, patch, state.aiEvent.progress]);
  const sendManualState = async (requestedState = control.state) => {
    const selected = manualAgentState(requestedState);
    const agentName = manualAgentName(control);
    if (control.agentId === "custom" && !control.customName.trim()) { notify("请先填写自定义 Agent 名称"); return; }
    updateControl({ state: requestedState });
    setSendState({ status: "sending", label: "正在发送…" });
    const result = await requestManualAgentState({ desktop: voiceAdapters.desktop, control, requestedState });
    if (!result?.ok) {
      const reason = manualAgentStateFailureMessage(result?.reason);
      setSendState({ status: "error", label: reason });
      notify(reason);
      return;
    }
    const progress = requestedState === "completed" ? 100 : requestedState === "idle" ? 0 : state.aiEvent.progress;
    event({ type: requestedState, agent: agentName, progress, detail: `手动状态 · ${selected.label}` });
    const expiry = ["completed", "error"].includes(requestedState) ? "，10 秒后恢复待命" : "";
    setSendState({ status: "success", label: `EasyInput 写入 ACK 成功 · ${selected.label}${expiry}` });
    notify(`${agentName} 状态已写入 EasyInput；请结合 Link 计数确认小智转发${expiry}`);
  };
  return (
    <div className={embedded ? "companion-embedded" : "page"}>
      {!embedded && <PageIntro title="AI 联动" description="选择当前编程助手，把真实或手动工作状态发送到小智 OLED 表情" actions={<Button icon={Plus} variant="primary" onClick={() => notify("Codex 与 Hermes 已有自动适配基础；WorkBuddy 需先确认具体产品和版本")}>适配器说明</Button>} />}
      {embedded && <div className="embedded-heading"><div><span>AI LINK</span><h2>AI 联动</h2><p>Codex 与 Hermes 支持真实生命周期；其他 Agent 保留手动状态。</p></div><Button icon={Plus} onClick={() => notify("Hermes 插件必须由用户显式启用；WorkBuddy 暂不猜测接入")}>适配器说明</Button></div>}
      <Notice tone="info" title="Codex 与 Hermes 生命周期适配">Codex 使用官方 Hook；Hermes 使用需由用户显式启用的本地插件 Hook。两者只传开始任务、模型/工具执行、等待授权和每轮结果等事件名，不读取或上传提示词、回复正文、工具参数、命令、工作目录、会话标识或错误详情。WorkBuddy 产品身份未确认，当前只提供手动状态。语音输入和陪伴会话始终优先。</Notice>
      <Card className="manual-agent-control">
        <div className="manual-agent-control__header"><SectionTitle index="01" title="当前 Agent 与工作状态" description="Codex 与 Hermes 可自动更新；七个按钮继续保留为人工校验和其他 Agent 的手动入口。" /><StatusBadge tone={sendState.status === "success" ? "success" : sendState.status === "error" ? "warning" : "neutral"}>{sendState.label}</StatusBadge></div>
        <div className="manual-agent-control__agent">
          <label>当前 Agent<Select value={control.agentId} onChange={(agentId) => { updateControl({ agentId }); setSendState({ status: "idle", label: "尚未发送" }); }} ariaLabel="当前 Agent">{MANUAL_AGENT_OPTIONS.map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</Select></label>
          {control.agentId === "custom" && <label>Agent 名称<input maxLength={48} value={control.customName} onChange={(changeEvent) => updateControl({ customName: changeEvent.target.value })} placeholder="例如 Cursor、OpenCode" /></label>}
          {["codex", "hermes"].includes(control.agentId) && <SettingRow title={`${manualAgentName(control)} 自动状态`} description={control.automaticStatusEnabled ? `使用 ${control.agentId === "codex" ? "codex-hook-v1" : "hermes-plugin-hooks-v1"}；语音与陪伴会话优先` : "已禁用；仍可使用下面的手动状态按钮"}><Toggle checked={control.automaticStatusEnabled} onChange={(automaticStatusEnabled) => updateControl({ automaticStatusEnabled })} /></SettingRow>}
        </div>
        <div className="manual-agent-state-grid" aria-label="选择并发送 Agent 工作状态">{MANUAL_AGENT_STATES.map((item) => <button type="button" className={control.state === item.id ? "is-selected" : ""} aria-pressed={control.state === item.id} disabled={sendState.status === "sending"} key={item.id} onClick={() => { void sendManualState(item.id); }}><strong>{item.label}</strong><span>{item.face}表情</span><small>{item.description}</small></button>)}</div>
        <div className="manual-agent-control__footer"><div><strong>{manualAgentName(control)} · {manualAgentState(control.state).label}</strong><small>{["codex", "hermes"].includes(control.agentId) ? !control.automaticStatusEnabled ? `${manualAgentName(control)} 自动状态已禁用` : providerStatus.connected ? `${providerStatus.work?.summary || `${manualAgentName(control)} 生命周期已连接`} · ${providerStatus.sourceVersion}` : providerStatus.receiver === "listening" ? `DeskMate 正在等待 ${manualAgentName(control)} 的首个真实事件${control.agentId === "hermes" ? "；需先在 Hermes 中显式启用插件" : ""}` : `${manualAgentName(control)} 生命周期接收器不可用` : "自动适配未启用；点击任意状态会立即手动发送"}</small>{["codex", "hermes"].includes(control.agentId) && providerStatus.work?.needsAttention && <StatusBadge tone="warning">需要你处理</StatusBadge>}</div><Button icon={Send} variant="primary" disabled={sendState.status === "sending"} onClick={() => { void sendManualState(control.state); }}>{sendState.status === "sending" ? "发送中…" : "重新发送当前状态"}</Button></div>
      </Card>
      <Card><SectionTitle index="02" title="当前桌宠意图" description="手动状态成功发送后，软件预览与小智表情使用同一状态语义；舵机仍保持关闭。" /><div className="state-flow"><span>表情 · {petIntent.faceExpression}</span><span>动作 · {petIntent.motionIntent}</span><span>亮度 · {petIntent.screenBrightnessIntent}</span><span>关注 · {petIntent.attentionIntent}</span></div></Card>
      <Card><SectionTitle index="02A" title="Codex 近期任务简报" description="可选 codex-task-brief-v1 只接收任务标签、粗状态和不超过 80 字的里程碑；不读取提示词、回复、工具参数、路径或窗口标题。" />{recentCodexTasks.length ? <div className="companion-info-list">{recentCodexTasks.map((task) => <div key={`${task.taskLabel}-${task.sequence}`}><span><small>{task.state} · sequence {task.sequence}</small><strong>{task.taskLabel}</strong>{task.milestone && <small>{task.milestone}</small>}</span></div>)}</div> : <Notice tone="info" title="等待可选简报报告器">现有 codex-hook-v1 粗状态继续有效；尚未收到细粒度任务简报。</Notice>}</Card>
      <div className="agent-grid">{agents.map((agent) => {
        const active = control.agentId === agent.id;
        const displayState = active ? eventLabel[state.aiEvent.type] : "可选择";
        const displayProgress = active ? state.aiEvent.progress : 0;
        return <Card key={agent.id} className={`agent-card agent-card--${agent.tone} ${active ? "is-selected" : ""}`}>
          <div className="agent-card__head"><span className="agent-icon"><Code size={24} /></span><StatusBadge tone={active ? "success" : "neutral"}>{displayState}</StatusBadge></div>
          <h3>{agent.name}</h3><p>{active ? state.aiEvent.detail : "点击下方按钮切换为当前 Agent"}</p>
          {displayProgress > 0 && <div className="agent-progress"><span style={{ width: `${displayProgress}%` }} /><small>{displayProgress}%</small></div>}
          <label>软件预览工作表情<Select value={mapping[agent.id]} onChange={(value) => updateMapping(agent.id, value)}>{expressionPresets.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select></label>
          <Button icon={active ? Check : Refresh} variant={active ? "soft" : "secondary"} onClick={() => { updateControl({ agentId: agent.id }); setSendState({ status: "idle", label: "待发送" }); }}>{active ? "当前 Agent" : "切换到此 Agent"}</Button>
        </Card>;
      })}</div>
      <Card><SectionTitle index="03" title="状态来源边界" description="Codex 与 Hermes 使用官方生命周期 Hook；其余 Agent 仍为人工选择，最终统一为同一套七状态。" /><div className="state-flow"><span>Codex / Hermes Hook / 手动状态</span><ArrowRight /><span>DeskMate 状态总线</span><ArrowRight /><span>EasyInput</span><ArrowRight /><span>小智 OLED</span></div></Card>
    </div>
  );
}

export function ExpressionsPage({ notify, embedded = false }) {
  const { state, patch, event } = useAppStore();
  const selected = state.currentExpression;
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [customPreset, setCustomPreset] = useState(null);
  useEffect(() => () => { if (customPreset?.assetUrl) URL.revokeObjectURL(customPreset.assetUrl); }, [customPreset]);
  const filtered = expressionPresets.filter((item) => {
    const inCategory = category === "all" || (category === "work" ? ["focus", "listen", "think"].includes(item.id) : ["happy", "sleep", "sad", "alert"].includes(item.id));
    return inCategory && (!query.trim() || `${item.name}${item.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  });
  const displayPresets = customPreset && category === "all" && !query.trim() ? [...filtered, customPreset] : filtered;
  const assignments = [{ key: "working", label: "AI 工作中" }, { key: "waiting_user", label: "等待用户输入" }, { key: "thinking", label: "复杂推理" }, { key: "completed", label: "任务已完成" }];
  const updateStatusMapping = (key, value) => {
    patch({ expressionMapping: { ...state.expressionMapping, [key]: value } });
    if (state.aiEvent.type === key) event({ ...state.aiEvent });
  };
  const importExpression = (uploadEvent) => {
    const file = uploadEvent.target.files?.[0];
    uploadEvent.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) { notify("请选择 2 MB 以内的图片文件"); return; }
    if (customPreset?.assetUrl) URL.revokeObjectURL(customPreset.assetUrl);
    setCustomPreset({ id: "custom-preview", name: file.name.replace(/\.[^.]+$/, ""), description: "本次运行的本地预览，未同步小智", color: "cyan", assetUrl: URL.createObjectURL(file) });
    notify("自定义表情已载入本次软件预览；未写入小智设备");
  };
  return (
    <div className={embedded ? "companion-embedded" : "page"}>
      {!embedded && <PageIntro title="Windows 软件表情预览库" description="管理本地画面预览和状态映射；这里的按钮不会控制小智" actions={<label className="button button--primary expression-upload"><Upload size={17} /><span>导入表情</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={importExpression} /></label>} />}
      {embedded && <div className="embedded-heading"><div><span>WINDOWS PREVIEW ONLY</span><h2>Windows 软件表情预览库</h2><p>默认、眨眼、开心、难过、生气、思考和聆听只改变 DeskMate 软件画面。</p></div><label className="button expression-upload"><Upload size={17} /><span>导入预览</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={importExpression} /></label></div>}
      <Notice tone="demo" title="只做软件预览">本区域不会发送 Agent State，也不会控制小智 OLED。请回到“陪伴与记忆”中的“小智工作状态测试”发送真实七状态。</Notice>
      <div className="library-toolbar"><Segmented value={category} onChange={setCategory} options={[{ value: "all", label: "全部" }, { value: "work", label: "工作状态" }, { value: "life", label: "情绪状态" }]} /><SearchField value={query} onChange={setQuery} placeholder="搜索表情" /></div>
      <div className="expression-library">{displayPresets.map((preset) => <ExpressionTile key={preset.id} preset={preset} selected={preset.id === "custom-preview" ? false : selected === preset.id} onClick={() => { if (preset.id === "custom-preview") return notify(`软件预览：正在查看“${preset.name}”；未发送到小智`); previewSoftwareExpression({ patch, notify, preset }); }} />)}</div>
      <Card className="assignment-card"><SectionTitle index="02" title="软件预览状态映射" description="选择工作状态对应的 Windows 预览表情；这里不会发送硬件状态。" /><div className="assignment-grid">{assignments.map((assignment) => <div key={assignment.key}><span>{assignment.label}</span><Select value={state.expressionMapping[assignment.key]} onChange={(value) => updateStatusMapping(assignment.key, value)}>{expressionPresets.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select></div>)}</div></Card>
    </div>
  );
}

export function ExpressionEditorPage({ notify }) {
  const { state, patch } = useAppStore();
  const { eyeSize, eyeGap, brightness, blink, color } = state.expressionEditor;
  const updateEditor = (value) => patch({ expressionEditor: { ...state.expressionEditor, ...value } });
  return (
    <div className="page">
      <PageIntro title="表情编辑" description="调整眼睛、嘴型、颜色和动画节奏" actions={<><Button icon={Eye} onClick={() => notify("预览已同步到虚拟桌宠")}>实时预览</Button><Button icon={DeviceFloppy} variant="primary" onClick={() => notify("表情“专注 Pro”已保存")}>保存表情</Button></>} />
      <div className="editor-grid">
        <Card className="editor-preview"><div className="card-heading"><strong>实时预览</strong><StatusBadge tone="demo">虚拟设备</StatusBadge></div><div className={`editor-face editor-face--${color}`} style={{ "--eye-size": `${eyeSize}%`, "--eye-gap": `${eyeGap}px`, opacity: 0.55 + brightness / 220, backgroundImage: `url(${DEVICE_FACE_URL})` }}><MoodNerd size={230} stroke={1.25} /></div><div className="preview-note">硬件屏幕协议接入后，将使用相同参数生成端侧动画。</div></Card>
        <Card className="editor-controls">
          <SectionTitle index="01" title="眼睛" />
          <SettingRow title="眼睛尺寸" description="控制两只眼睛的整体大小"><Slider label="眼睛尺寸" value={eyeSize} onChange={(value) => updateEditor({ eyeSize: value })} /></SettingRow>
          <SettingRow title="眼间距" description="适配不同宽度的显示屏"><Slider label="眼间距" value={eyeGap} onChange={(value) => updateEditor({ eyeGap: value })} min={32} max={96} suffix=" px" /></SettingRow>
          <SettingRow title="自动眨眼" description="空闲时随机眨眼，更有生命感"><Toggle checked={blink} onChange={(value) => updateEditor({ blink: value })} /></SettingRow>
          <SectionTitle index="02" title="颜色与亮度" />
          <div className="color-options">{["cyan", "blue", "violet", "green", "amber"].map((item) => <button aria-label={`${item} 颜色`} className={`${item} ${color === item ? "is-selected" : ""}`} onClick={() => updateEditor({ color: item })} key={item} />)}</div>
          <SettingRow title="显示亮度" description="最终值还会受到环境光上限约束"><Slider label="显示亮度" value={brightness} onChange={(value) => updateEditor({ brightness: value })} /></SettingRow>
        </Card>
      </div>
    </div>
  );
}

export function MotionPage({ notify, embedded = false }) {
  const { state, patch } = useAppStore();
  const { preset, repeatCount } = state.motion;
  const presetLabel = ({ attention: "关注", nod: "点头", search: "寻找", dance: "跳舞" })[preset] || "动作";
  const updateMotion = (value) => patch({ motion: { ...state.motion, ...value } });
  const [motionStatus, setMotionStatus] = useState({ ok: false, reason: "motion-status-not-read", endpointReportedComplete: false, endpoint: null });
  const [runningPreset, setRunningPreset] = useState("");
  const [safetyAction, setSafetyAction] = useState("");
  const selectPreset = (nextPreset) => updateMotion({ preset: nextPreset, repeatCount: ["nod", "dance"].includes(nextPreset) ? 2 : 1 });
  const refreshStatus = useCallback(async () => {
    try {
      const result = await voiceAdapters.desktop.getMotionStatus();
      const next = result || { ok: false, reason: "motion-status-unavailable", endpointReportedComplete: false, endpoint: null };
      setMotionStatus(next);
      return next;
    } catch {
      const unavailable = { ok: false, reason: "motion-status-unavailable", endpointReportedComplete: false, endpoint: null };
      setMotionStatus(unavailable);
      return unavailable;
    }
  }, []);
  useEffect(() => {
    let active = true;
    let retryTimer = null;
    const readWithRetry = async (attempt = 0) => {
      if (!active) return;
      const result = await refreshStatus();
      if (active && !result?.ok && attempt < 2) retryTimer = setTimeout(() => { void readWithRetry(attempt + 1); }, 1200 * (attempt + 1));
    };
    void readWithRetry();
    const unsubscribe = voiceAdapters.desktop.onMotionPresetStatus((value) => { if (active && value) setMotionStatus(value); });
    return () => { active = false; if (retryTimer) clearTimeout(retryTimer); unsubscribe?.(); };
  }, [refreshStatus]);
  const runPreset = async (nextPreset) => {
    const nextRepeat = nextPreset === preset ? repeatCount : (["nod", "dance"].includes(nextPreset) ? 2 : 1);
    if (nextPreset !== preset) selectPreset(nextPreset);
    setRunningPreset(nextPreset);
    try {
      const result = await voiceAdapters.desktop.runPreset({ preset: nextPreset, repeat: nextRepeat, source: "UI" });
      if (result) setMotionStatus(result);
      notify(result?.ok && result?.endpointReportedComplete ? `${({ attention: "关注", nod: "点头", search: "寻找", dance: "跳舞" })[nextPreset]}端点已完成并回中；请观察真机确认动作` : `动作未完成：${result?.reason || "endpoint-not-complete"}`);
    } catch (error) {
      notify(`动作请求失败：${error?.message || "motion-request-failed"}`);
    } finally {
      setRunningPreset("");
      void refreshStatus().catch(() => {});
    }
  };
  const runSafetyAction = async (kind) => {
    setSafetyAction(kind);
    try {
      const action = kind === "stop" ? voiceAdapters.desktop.stopAndCenter("UI") : kind === "estop" ? voiceAdapters.desktop.emergencyStop("UI") : voiceAdapters.desktop.clearEmergencyStopAndCenter("UI");
      const result = await action;
      if (result) setMotionStatus(result);
      notify(result?.ok ? ({ stop: "已停止并发送回中命令", estop: "急停已锁存", clear: "急停已解除并发送回中命令" })[kind] : `操作失败：${result?.reason || "motion-operation-failed"}`);
    } catch (error) {
      notify(`操作失败：${error?.message || "motion-operation-failed"}`);
    } finally {
      setSafetyAction("");
      void refreshStatus().catch(() => {});
    }
  };
  const endpoint = motionStatus?.endpoint || {};
  const endpointState = String(endpoint.state || "unavailable").toLowerCase();
  const emergencyStopped = endpoint.emergencyStopped === true || endpoint.emergencyStopLatched === true;
  const motionAvailable = motionStatus?.ok === true || endpointState !== "unavailable";
  const unavailableMessage = ({
    "easyinput-not-connected": "没有检测到 EasyInput，请确认设备已经重新上电并连接。",
    "motion-preset-interface-unavailable": "已检测到 EasyInput，但没有找到实体动作接口。请重新检测；若仍失败，需要核对当前固件。",
    "input-bridge-unavailable": "Windows 输入桥尚未就绪，请重新检测动作链。",
    "motion-status-unavailable": "软件暂时没有读到实体动作状态，请点击“重新检测动作链”。",
  })[motionStatus?.reason] || "实体动作状态暂时不可用，请重新检测动作链。";
  const statusLabel = emergencyStopped ? "急停已锁存" : runningPreset || endpointState === "running" ? "实体动作运行中" : motionStatus?.endpointReportedComplete ? "端点已完成 · 待人眼确认" : motionAvailable ? "真实动作链已响应" : "真实动作链未就绪";
  return (
    <div className={embedded ? "companion-embedded" : "page"}>
      {!embedded && <PageIntro title="实体动作" description="通过 EasyInput 转发小智本地预设；软件不发送角度、PWM 或 GPIO。" actions={<><StatusBadge tone={emergencyStopped ? "warning" : motionAvailable ? "success" : "demo"}>{statusLabel}</StatusBadge><Button icon={Refresh} onClick={() => { void refreshStatus(); }}>刷新状态</Button></>} />}
      {embedded && <div className="embedded-heading"><div><span>REAL MOTION PRESETS</span><h2>实体动作</h2><p>选择动作和次数，再点击一次“开始执行”。正常结束后会自动回中。</p></div><span className="motion-heading-actions"><StatusBadge tone={emergencyStopped ? "warning" : motionAvailable ? "success" : "demo"}>{statusLabel}</StatusBadge><Button icon={Refresh} onClick={() => { void refreshStatus(); }}>重新检测动作链</Button></span></div>}
      <Notice tone={motionStatus?.endpointReportedComplete ? "success" : motionAvailable ? "info" : "warning"} title={motionStatus?.endpointReportedComplete ? "端点报告本次动作已完成" : motionAvailable ? "真实动作控制待人工观察" : "真实动作链尚未就绪"}>{motionStatus?.endpointReportedComplete ? "协议已确认全部循环和最终回中命令被小智适配器接受；是否真实转动、方向和机械回中仍以你现场观察为准。" : motionAvailable ? "选择一个动作和重复次数，再点击“开始执行”。一次只执行一个动作，忙碌时不会排队或稍后重放。" : unavailableMessage}</Notice>
      <div className="motion-grid">
        <Card className="motion-stage"><div className={`motion-avatar ${runningPreset ? `is-playing is-${runningPreset === "attention" ? "attentive" : runningPreset}` : ""}`}><CompanionFace expressionId={state.currentExpression} alt="软件画面预览；实体动作以真机观察为准" /></div><Notice tone="demo" title="这里只显示软件画面预览">这里没有上下左右控制，也不能证明舵机已经动作；实体结果以右侧执行按钮和你看到的小智真机为准。</Notice></Card>
        <Card><SectionTitle index="01" title="快速动作" description="第一步选固定动作，第二步选次数，第三步点击开始；轨迹、限幅和回中都在小智端固定。" /><label className="field-label">1. 选择动作<Segmented value={preset} onChange={selectPreset} options={[{ value: "attention", label: "关注" }, { value: "nod", label: "点头" }, { value: "search", label: "寻找" }, { value: "dance", label: "跳舞" }]} /></label><label className="field-label">2. 选择重复次数<Segmented value={String(repeatCount)} onChange={(value) => updateMotion({ repeatCount: Number(value) })} options={[1, 2, 3].map((value) => ({ value: String(value), label: `${value} 次` }))} /></label><Notice tone="info" title="默认次数">关注和寻找默认 1 次；点头和跳舞默认完整重复 2 次。每一轮都会先回到逻辑中心，再计入完成次数。</Notice><Button icon={PlayerPlay} variant="primary" className="button--wide motion-run-button" disabled={Boolean(runningPreset) || Boolean(safetyAction) || emergencyStopped} onClick={() => { void runPreset(preset); }}>{runningPreset ? `正在执行：${presetLabel} × ${repeatCount}` : `3. 开始执行：${presetLabel} × ${repeatCount}`}</Button><div className="motion-safety-actions"><Button icon={PlayerPause} disabled={safetyAction === "stop"} onClick={() => { void runSafetyAction("stop"); }}>停止并回中</Button><Button icon={AlertCircle} variant="danger" disabled={safetyAction === "estop"} onClick={() => { void runSafetyAction("estop"); }}>立即急停</Button>{emergencyStopped && <Button icon={Refresh} disabled={Boolean(safetyAction)} onClick={() => { void runSafetyAction("clear"); }}>解除急停并回中</Button>}</div><Notice tone="demo" title="自动动作暂未开放">语音动作和情境自动动作必须等四个实体按钮完成真机验收后再启用；当前不会因连接、对话或空闲自动运动。</Notice></Card>
      </div>
      <ChoreographyEditor currentExpression={state.currentExpression} notify={notify} />
      <Card><SectionTitle index="03" title="本次协议状态" description="这里不显示原始设备路径、PWM、GPIO 或舵机脉宽。" /><div className="diagnostic-list"><div><span><Check size={18} /></span><strong>端点状态</strong><StatusBadge tone={motionStatus?.ok ? "success" : "demo"}>{endpointState}</StatusBadge></div><div><span><Check size={18} /></span><strong>循环进度</strong><StatusBadge tone="neutral">{Number(endpoint.completedRepeat) || 0} / {Number(endpoint.requestedRepeat) || 0}</StatusBadge></div><div><span><Check size={18} /></span><strong>逻辑回中命令</strong><StatusBadge tone={endpoint.logicalCenter === true || endpoint.logicalCenterAccepted === true ? "success" : "neutral"}>{endpoint.logicalCenter === true || endpoint.logicalCenterAccepted === true ? "已接受" : "未确认"}</StatusBadge></div></div></Card>
    </div>
  );
}

export function SensorsPage({ notify }) {
  const { state, patch } = useAppStore();
  const { autoBrightness, faceTracking } = state.sensors;
  const updateSensors = (value) => patch({ sensors: { ...state.sensors, ...value } });
  const bars = useMemo(() => Array.from({ length: 28 }).map((_, index) => 28 + ((index * 19) % 56)), []);
  return (
    <div className="page">
      <PageIntro title="环境感知" description="查看温湿度、环境光与用户方向检测" actions={<StatusBadge tone="demo">传感器模拟数据</StatusBadge>} />
      <div className="metric-grid"><Metric label="环境温度" value="24.6" unit="℃" trend="舒适范围" tone="orange" /><Metric label="空气湿度" value="46" unit="%" trend="较昨日 +2%" tone="blue" /><Metric label="环境光" value="328" unit="lx" trend="建议亮度 68%" tone="cyan" /><Metric label="用户方向" value="0" unit="°" trend="位于设备正前方" tone="violet" /></div>
      <div className="two-column sensor-layout">
        <Card><SectionTitle index="01" title="24 小时环境趋势" /><div className="sensor-chart">{bars.map((height, index) => <span key={index} style={{ height: `${height}%` }} title={`${index}:00`} />)}</div><div className="chart-legend"><span><i className="blue" />环境光</span><span><i className="orange" />温度</span><span>00:00</span><span>12:00</span><span>现在</span></div></Card>
        <Card><SectionTitle index="02" title="自动调节" /><SettingRow icon={Sun} title="屏幕自动亮度" description="根据环境光调节桌宠屏幕亮度"><Toggle checked={autoBrightness} onChange={(value) => updateSensors({ autoBrightness: value })} /></SettingRow><SettingRow icon={User} title="面向用户" description="根据方向传感器或视觉模块转向用户"><Toggle checked={faceTracking} onChange={(value) => updateSensors({ faceTracking: value })} /></SettingRow><SettingRow icon={Temperature} title="温湿度提醒" description="超出舒适范围时显示提醒表情"><Toggle checked onChange={() => notify("温湿度提醒已保持开启")} /></SettingRow><Notice tone="info" title="人脸方向检测建议">单独使用红外距离传感器难以区分人脸和手部。后续可选用摄像头视觉模块，或使用左右两组 ToF / PIR 做粗略方向判断。</Notice></Card>
      </div>
    </div>
  );
}

export function SettingsPage({ notify, initialSection = "" }) {
  const { state, patch, reset, replace, exportConfig } = useAppStore();
  const [section, setSection] = useState(["input", "format", "appearance", "account", "connections", "diagnostics"].includes(initialSection) ? initialSection : "input");
  const [bailianKey, setBailianKey] = useState("");
  const [showBailianKey, setShowBailianKey] = useState(false);
  const [bailianWorkspace, setBailianWorkspace] = useState("");
  const [bailianStatus, setBailianStatus] = useState({ configured: false, storage: "unknown" });
  const [showServiceSecrets, setShowServiceSecrets] = useState(false);
  const [aiServiceStatus, setAiServiceStatus] = useState({ storage: "unknown", text: { configured: false, provider: "bailian", model: "qwen3.7-flash" }, realtime: { configured: false, provider: "doubao" } });
  const [textService, setTextService] = useState({ provider: "deepseek", endpoint: "https://api.deepseek.com/chat/completions", model: "deepseek-v4-flash", apiKey: "" });
  const [realtimeService, setRealtimeService] = useState({ provider: "doubao", endpoint: "wss://openspeech.bytedance.com/api/v3/realtime/dialogue", appId: "", accessKey: "", appKey: "", resourceId: "volc.speech.dialog", model: "1.2.1.1", voice: "zh_female_vv_jupiter_bigtts" });
  const [settingsDesktopCaps, setSettingsDesktopCaps] = useState({ supported: false, editShortcutRegistered: false });
  const settingsAudioStatus = state.runtime?.easyInputAudio || {};
  const format = state.settings.formatting;
  const theme = state.settings.theme;
  const floating = state.settings.floating;
  const updateSettings = (value) => patch({ settings: { ...state.settings, ...value } });
  const refreshBailianStatus = useCallback(async () => { try { const value = await globalThis.desktopBridge?.getBailianStatus?.(); if (value) { setBailianStatus(value); setBailianWorkspace(value.workspaceId || ""); } } catch { setBailianStatus({ configured: false, storage: "unavailable" }); } }, []);
  const refreshAiServiceStatus = useCallback(async () => { try { const value = await globalThis.desktopBridge?.getAiServiceStatus?.(); if (!value) return; setAiServiceStatus(value); if (value.text?.configured) setTextService((current) => ({ ...current, provider: value.text.provider, endpoint: value.text.endpoint, model: value.text.model, apiKey: "" })); if (value.realtime?.configured) setRealtimeService((current) => ({ ...current, provider: value.realtime.provider, endpoint: value.realtime.endpoint, resourceId: value.realtime.resourceId, model: value.realtime.model, voice: value.realtime.voice, accessKey: "", appKey: "" })); } catch { setAiServiceStatus((current) => ({ ...current, storage: "unavailable" })); } }, []);
  useEffect(() => { refreshBailianStatus(); }, [refreshBailianStatus]);
  useEffect(() => { refreshAiServiceStatus(); }, [refreshAiServiceStatus]);
  useEffect(() => { voiceAdapters.desktop.capabilities().then(setSettingsDesktopCaps).catch(() => setSettingsDesktopCaps({ supported: false, editShortcutRegistered: false })); }, [state.settings.globalShortcutsEnabled, state.settings.voiceShortcut]);
  const saveBailian = async () => { try { const value = await globalThis.desktopBridge?.saveBailianCredentials?.({ apiKey: bailianKey, workspaceId: bailianWorkspace }); if (!value) throw new Error("请在 DeskMate 桌面版中配置"); setBailianKey(""); setBailianStatus(value); updateSettings({ sttMode: "bailian", sttEndpoint: "" }); notify("千问语音识别账号已使用 Windows 加密保存"); } catch (error) { notify(`保存失败：${error.message}`); } };
  const clearBailian = async () => { try { const value = await globalThis.desktopBridge?.clearBailianCredentials?.(); if (!value) throw new Error("请在 DeskMate 桌面版中操作"); setBailianStatus(value); updateSettings({ sttMode: "unconfigured" }); notify("本机千问 API Key 已删除"); } catch (error) { notify(`删除失败：${error.message}`); } };
  const saveTextService = async () => { try { const value = await globalThis.desktopBridge?.saveTextModelService?.(textService); if (!value) throw new Error("请在 DeskMate 桌面版中配置"); setAiServiceStatus(value); setTextService((current) => ({ ...current, apiKey: "" })); notify("文本大模型接口已加密保存，智能整理与语音编辑将使用该服务"); } catch (error) { notify(`保存失败：${error.message}`); } };
  const clearTextService = async () => { try { const value = await globalThis.desktopBridge?.clearTextModelService?.(); if (!value) throw new Error("请在 DeskMate 桌面版中操作"); setAiServiceStatus(value); notify(bailianStatus.configured ? "已移除自定义文本模型，将回退到百炼 qwen3.7-flash" : "文本大模型配置已删除"); } catch (error) { notify(`删除失败：${error.message}`); } };
  const saveRealtimeService = async () => { try { const value = await globalThis.desktopBridge?.saveRealtimeVoiceService?.(realtimeService); if (!value) throw new Error("请在 DeskMate 桌面版中配置"); setAiServiceStatus(value); setRealtimeService((current) => ({ ...current, accessKey: "", appKey: "" })); notify("实时语音凭据已加密保存；只有开始陪伴会话时才会联网"); } catch (error) { notify(`保存失败：${error.message}`); } };
  const clearRealtimeService = async () => { try { const value = await globalThis.desktopBridge?.clearRealtimeVoiceService?.(); if (!value) throw new Error("请在 DeskMate 桌面版中操作"); setAiServiceStatus(value); notify("实时语音配置已删除"); } catch (error) { notify(`删除失败：${error.message}`); } };
  const exportDiagnostics = async () => { const caps = await voiceAdapters.desktop.capabilities(); const network = await voiceAdapters.desktop.networkSummary(); let microphonePermission = "unknown"; try { microphonePermission = (await navigator.permissions.query({ name: "microphone" })).state; } catch { /* unsupported permission query */ } const companion = state.runtime?.companion || {}; const report = createDiagnosticReport({ runtime: caps.supported ? "electron" : "web", inputBridge: state.runtime?.inputBridge || caps.inputBridge, shortcut: { value: state.settings.voiceShortcut, enabled: state.settings.globalShortcutsEnabled, registered: Boolean(caps.shortcutRegistered) }, microphone: { source: normalizeMicrophoneSource(state.settings.microphoneSource), selected: state.settings.microphoneId ? "custom-device" : "system-default", permission: microphonePermission }, network, lanAudio: { status: settingsAudioStatus.state, configured: settingsAudioStatus.setup?.configured, networkReady: settingsAudioStatus.networkReady, heartbeat: settingsAudioStatus.heartbeat, micTest: settingsAudioStatus.micTest, counters: settingsAudioStatus.counters }, conversation: { state: companion.state, serviceConfigured: companion.serviceConfigured ?? companion.service?.configured, connected: companion.active, input: companion.audioSelection?.activeSource || companion.audioSelection?.requestedSource, fallback: Boolean(companion.audioSelection?.fallback), error: companion.error, savedPreferences: companion.savedPreferences, sessionPolicy: companion.sessionPolicy, asrTiming: companion.asrTiming, counters: companion.computerAudio?.counters, sinkCancelReasons: companion.computerAudio?.sinkCancelReasons, lastSinkCancelReason: companion.computerAudio?.lastSinkCancelReason, echoGuard: companion.echoGuard, build: companion.build, mainState: companion.mainState, eventSequence: companion.eventSequence, stopLifecycle: companion.stopLifecycle, providerLifecycle: companion.providerLifecycle, turnLifecycle: companion.turnLifecycle }, deviceEvent: deviceEventBus.lastEvent ? { source: deviceEventBus.lastEvent.source, type: deviceEventBus.lastEvent.type, at: deviceEventBus.lastEvent.at } : null, stt: state.diagnostics?.stt || { status: state.settings.sttMode === "unconfigured" ? "unconfigured" : state.settings.sttMode }, organizer: state.diagnostics?.organizer ? { model: state.diagnostics.organizer.model, durationMs: state.diagnostics.organizer.durationMs, status: state.diagnostics.organizer.status, fallback: state.diagnostics.organizer.fallback, errorType: state.diagnostics.organizer.errorType || "" } : { model: "qwen3.7-flash", status: state.settings.formatting === "raw" ? "disabled" : "not-run" } }); const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }); const link = document.createElement("a"); const url = URL.createObjectURL(blob); link.href = url; link.download = "deskmate-diagnostics.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); notify("已导出脱敏诊断 JSON"); };
  const downloadConfig = () => { const blob = new Blob([exportConfig()], { type: "application/json" }); const link = document.createElement("a"); const url = URL.createObjectURL(blob); link.href = url; link.download = "deskmate-config.json"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0); notify("配置 JSON 已导出"); };
  const importConfig = (event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { replace(JSON.parse(reader.result)); notify("配置已导入"); } catch (error) { notify(`导入失败：${error.message}`); } }; reader.readAsText(file); event.target.value = ""; };
  const sttDiagnostic = state.settings.sttMode === "bailian" ? { label: "千问 ASR", value: bailianStatus.configured ? "已配置" : "缺少密钥", tone: bailianStatus.configured ? "success" : "demo" } : state.settings.sttMode === "mock" ? { label: "Mock STT", value: "模拟", tone: "demo" } : state.settings.sttMode === "http" ? { label: "HTTP STT 端点", value: "待验证", tone: "demo" } : { label: "语音转写服务", value: "未配置", tone: "demo" };
  const textModelReady = aiServiceStatus.text?.configured || bailianStatus.configured;
  const activeTextModel = aiServiceStatus.text?.configured ? aiServiceStatus.text.model : bailianStatus.configured ? "qwen3.7-flash" : "未配置";
  const organizerDiagnostic = state.settings.formatting === "raw" ? { label: "文字整理", value: "本地原样输出", tone: "success" } : { label: "文本模型整理", value: !textModelReady ? "缺少密钥" : state.diagnostics?.organizer?.fallback ? "上次已回退原文" : state.diagnostics?.organizer?.status === "success" ? `正常 · ${state.diagnostics.organizer.durationMs} ms` : activeTextModel, tone: textModelReady && !state.diagnostics?.organizer?.fallback ? "success" : "demo" };
  const inputBridge = state.runtime?.inputBridge || {};
  const settingsAgentDelivery = normalizeAgentDelivery(inputBridge.agentStateDelivery);
  const sharedStatus = deviceServiceStatus({ inputBridge, audioStatus: settingsAudioStatus, preferredMicrophoneSource: state.settings.microphoneSource, companion: state.runtime?.companion, memory: state.runtime?.memory });
  const collectionLabel = (value) => !inputBridge.boardConnected ? "设备未枚举" : value === true ? "可写" : value === false ? "不可用" : "状态未知";
  const diagnosticItems = [{ label: "Windows 输入桥", value: inputBridge.process === "running" ? "运行中" : inputBridge.process || "未知", tone: inputBridge.process === "running" ? "success" : "demo" }, { label: "EasyInput HID", value: sharedStatus.easyInput.label, tone: sharedStatus.easyInput.tone }, { label: "配置 HID 集合 · FF00:0002", value: collectionLabel(inputBridge.configCollectionWritable), tone: inputBridge.configCollectionWritable === true ? "success" : "demo" }, { label: "校准 HID 集合 · FF00:0007", value: collectionLabel(inputBridge.calibrationCollectionWritable), tone: inputBridge.calibrationCollectionWritable === true ? "success" : "demo" }, { label: "小智 DeskMate Link", value: sharedStatus.xiaozhi.label, tone: sharedStatus.xiaozhi.tone }, { label: "最近 Agent State 写入", value: settingsAgentDelivery.status === "acknowledged" ? `EasyInput ACK 成功 · ${settingsAgentDelivery.targetState}` : settingsAgentDelivery.status === "failed" ? `失败 · ${settingsAgentDelivery.reason || "unknown"}` : settingsAgentDelivery.status === "sending" ? "请求中" : "尚未发送", tone: settingsAgentDelivery.status === "acknowledged" ? "success" : "demo" }, { label: "当前麦克风来源", value: normalizeMicrophoneSource(state.settings.microphoneSource) === "easyinput" ? "EasyInput 板载麦克风" : "电脑麦克风", tone: "success" }, sttDiagnostic, organizerDiagnostic, { label: "文字输出", value: state.settings.activeWindowOutputEnabled ? "原窗口 + 剪贴板回退" : state.settings.outputMode === "clipboard" ? "剪贴板" : "历史", tone: "success" }, { label: "EasyInput 板载麦克风", value: sharedStatus.microphone.label, tone: sharedStatus.microphone.tone }];
  return (
    <div className="page">
      <PageIntro title="设置与诊断" description="管理快捷键、输入方式、外观和系统诊断" actions={<><Button icon={Upload} onClick={() => document.getElementById("config-import").click()}>导入配置</Button><input id="config-import" type="file" accept="application/json" hidden onChange={importConfig} /><Button icon={Download} onClick={downloadConfig}>导出配置</Button><Button icon={Refresh} onClick={() => { reset(); notify("设置已恢复为默认值"); }}>恢复默认</Button></>} />
      <div className="settings-layout">
        <Card className="settings-nav">{[{ id: "input", icon: Keyboard, label: "输入与快捷键" }, { id: "format", icon: Book2, label: "文字整理" }, { id: "appearance", icon: Sun, label: "外观与悬浮窗" }, { id: "account", icon: Sparkles, label: "AI 服务" }, { id: "connections", icon: Link, label: "设备连接" }, { id: "diagnostics", icon: Gauge, label: "系统诊断" }].map((item) => <button className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)} key={item.id}><item.icon size={19} /><span>{item.label}</span><ArrowRight size={16} /></button>)}</Card>
        {section === "connections" ? <div className="settings-panel settings-panel--connections"><ConnectionsPage notify={notify} embedded /></div> : <Card className="settings-panel">
          {section === "input" && <><SectionTitle index="01" title="快捷键" /><SettingRow title="EasyInput 小键盘语音键" description="只接受 VID 303A / PID 1006 的原生 Raw Input 组合键或 F22；普通电脑键盘的同名组合键不会触发"><Toggle checked={state.settings.boardF22Enabled} onChange={(value) => updateSettings({ boardF22Enabled: value })} /></SettingRow><SettingRow title="EasyInput 小键盘语音编辑键" description="只接受 EasyInput 板发出的 Ctrl+Shift+E；先在原窗口选择文字，再按第三键口述编辑要求"><StatusBadge tone={inputBridge.boardConnected ? "success" : "demo"}>{inputBridge.boardConnected ? "原生监听" : "等待设备"}</StatusBadge></SettingRow><SettingRow title="普通键盘全局快捷键" description="默认关闭，避免 Ctrl+Shift+Space 或 Ctrl+Shift+E 被其他键盘、软件或输入法误触；关闭不影响 EasyInput 小键盘"><Toggle checked={state.settings.globalShortcutsEnabled} onChange={(value) => updateSettings({ globalShortcutsEnabled: value, ...(value ? {} : { rightAltEnabled: false }) })} /></SettingRow>{state.settings.globalShortcutsEnabled && <><SettingRow title="备用语音快捷键" description="只在开启普通键盘全局快捷键时注册"><ShortcutRecorder global value={state.settings.voiceShortcut} onConfirm={async (candidate) => { const result = await voiceAdapters.desktop.registerShortcut(candidate); if (!result?.registered || result.shortcut !== candidate) throw new Error(result?.reason || "快捷键被其他应用占用"); updateSettings({ voiceShortcut: result.shortcut }); notify(`备用语音快捷键已保存为 ${result.shortcut}`); }} /></SettingRow><SettingRow title="右 Alt 触发" description="可兼容旧方案，但可能影响 AltGr 和正常输入，因此默认关闭"><Toggle checked={state.settings.rightAltEnabled} onChange={(value) => updateSettings({ rightAltEnabled: value })} /></SettingRow>{state.settings.rightAltEnabled && <Notice tone="warning" title="右 Alt 已启用">Raw Input 桥不会吞掉右 Alt；部分应用仍可能把它当作 AltGr。若输入异常，请关闭此选项。</Notice>}</>}<SettingRow title="快捷键操作方式" description="按一下开始，再按一下结束；只在释放事件触发并带 350ms 防抖"><StatusBadge tone="success">切换模式</StatusBadge></SettingRow><SettingRow title="转写后文字输出" description="无论输出成功与否，都会先保存历史记录"><Segmented compact value={state.settings.outputMode} onChange={(value) => updateSettings({ outputMode: value })} options={[{ value: "history", label: "仅历史" }, { value: "clipboard", label: "复制" }]} /></SettingRow><SettingRow title="写入原输入窗口" description="默认写回触发语音时所在的输入窗口；目标变化或自动输入失败时回退到剪贴板"><Toggle checked={state.settings.activeWindowOutputEnabled} onChange={(value) => updateSettings({ activeWindowOutputEnabled: value })} /></SettingRow></>}
          {section === "format" && <><SectionTitle index="02" title="文字整理" /><SettingRow title="整理方式" description="智能或自定义服务不可用时安全退回原样输出"><Segmented value={format} onChange={(value) => updateSettings({ formatting: value })} options={[{ value: "raw", label: "原样输出" }, { value: "smart", label: "智能整理" }, { value: "custom", label: "自定义" }]} /></SettingRow><SettingRow title="智能整理服务" description={`原样输出只做本地词库替换；智能整理与语音编辑共用文本模型，当前为 ${activeTextModel}`}><StatusBadge tone={textModelReady ? "success" : "demo"}>{textModelReady ? "API 已配置" : "需要文本模型 API"}</StatusBadge></SettingRow>{format === "custom" && <label className="field-label">自定义整理要求<input value={state.settings.customOrganizerRule} maxLength={4000} onChange={(event) => updateSettings({ customOrganizerRule: event.target.value })} placeholder="例如：整理成简洁的任务清单；不得增加原文没有的信息" /></label>}<SettingRow title="HTTP STT 端点" description="启用后录音会发送到该服务；仅允许 HTTPS，本机服务可使用 HTTP localhost；不要填写带 Token 的 URL"><input value={state.settings.sttEndpoint} onChange={(event) => updateSettings({ sttEndpoint: event.target.value, sttMode: event.target.value ? "http" : "unconfigured" })} placeholder="https://example.invalid/stt" /></SettingRow><Notice tone={format === "raw" || textModelReady ? "success" : "warning"} title="当前规则">{format === "raw" ? "保留识别结果，只应用词库替换规则，不调用文字模型。" : !textModelReady ? "尚未配置文本模型 API，将自动保留原始转写。" : format === "smart" ? `使用 ${activeTextModel} 清理口头语、重复和标点；失败时保留原文。` : state.settings.customOrganizerRule ? "先完成基础清理，再按自定义要求整理；失败时保留原文。" : "尚未填写自定义整理要求，将退回原样输出。"}</Notice></>}
          {section === "appearance" && <><SectionTitle index="03" title="外观与悬浮窗" /><SettingRow title="外观" description="跟随系统外观，或手动固定亮色 / 暗色"><Segmented value={theme} onChange={(value) => updateSettings({ theme: value })} options={[{ value: "system", label: "跟随系统" }, { value: "light", label: "亮色" }, { value: "dark", label: "暗色" }]} /></SettingRow><SettingRow title="悬浮窗显示" description="录音时显示状态和实时识别文字"><Toggle checked={floating} onChange={(value) => updateSettings({ floating: value })} /></SettingRow><SettingRow title="背景不透明度" description="数值越高，悬浮窗背景越实"><Slider label="背景不透明度" value={state.settings.backgroundOpacity} onChange={(value) => updateSettings({ backgroundOpacity: value })} /></SettingRow></>}
          {section === "account" && <>
            <SectionTitle index="04" title="AI 服务" description="语音转写、文本理解与实时陪伴使用彼此隔离的接口和凭据" />
            <div className="service-config-stack">
              <section className="service-config-block">
                <div className="account-card"><span className="avatar"><Lock size={28} /></span><div><strong>百炼语音转写</strong><p>qwen3-asr-flash 只负责普通语音输入和语音编辑指令的转写。</p></div><StatusBadge tone={bailianStatus.configured ? "success" : "demo"}>{bailianStatus.configured ? "已配置" : "未配置"}</StatusBadge></div>
                <label className="field-label">百炼 API Key<span className="secret-field"><input type={showBailianKey ? "text" : "password"} autoComplete="off" value={bailianKey} onChange={(event) => setBailianKey(event.target.value)} placeholder={bailianStatus.configured ? "已加密保存；输入新 Key 可替换" : "sk-..."} /><button type="button" aria-label={showBailianKey ? "隐藏 API Key" : "显示 API Key"} title={showBailianKey ? "隐藏 API Key" : "显示 API Key"} onClick={() => setShowBailianKey((value) => !value)}>{showBailianKey ? <EyeOff size={20} /> : <Eye size={20} />}</button></span></label>
                <label className="field-label">业务空间 ID（可选）<input value={bailianWorkspace} onChange={(event) => setBailianWorkspace(event.target.value)} placeholder="留空使用百炼兼容域名" /></label>
                <div className="button-row"><Button variant="primary" icon={DeviceFloppy} disabled={!bailianKey.trim()} onClick={saveBailian}>加密保存转写接口</Button>{bailianStatus.configured && <Button variant="ghost" icon={Trash} onClick={clearBailian}>删除转写 Key</Button>}</div>
              </section>

              <section className="service-config-block">
                <div className="account-card"><span className="avatar"><Brain size={28} /></span><div><strong>文本大模型 · Bridge</strong><p>共用于智能整理、语音编辑；后续复用到意图 Bridge、记忆候选与每日摘要。</p></div><StatusBadge tone={textModelReady ? "success" : "demo"}>{aiServiceStatus.text?.configured ? "独立接口" : bailianStatus.configured ? "沿用百炼" : "未配置"}</StatusBadge></div>
                <SettingRow title="服务商" description="DeepSeek 使用 OpenAI 兼容 Chat Completions；也可填写其他兼容服务"><select value={textService.provider} onChange={(event) => setTextService((current) => ({ ...current, provider: event.target.value }))}><option value="deepseek">DeepSeek</option><option value="custom">自定义兼容接口</option></select></SettingRow>
                <label className="field-label">Chat Completions 完整地址<input value={textService.endpoint} onChange={(event) => setTextService((current) => ({ ...current, endpoint: event.target.value }))} placeholder="https://api.example.com/v1/chat/completions" /></label>
                <div className="service-config-grid"><label className="field-label">模型<input value={textService.model} onChange={(event) => setTextService((current) => ({ ...current, model: event.target.value }))} placeholder="模型名称" /></label><label className="field-label">API Key<span className="secret-field"><input type={showServiceSecrets ? "text" : "password"} autoComplete="off" value={textService.apiKey} onChange={(event) => setTextService((current) => ({ ...current, apiKey: event.target.value }))} placeholder={aiServiceStatus.text?.configured ? "已加密保存；输入新 Key 可替换" : "输入 API Key"} /><button type="button" aria-label={showServiceSecrets ? "隐藏服务密钥" : "显示服务密钥"} onClick={() => setShowServiceSecrets((value) => !value)}>{showServiceSecrets ? <EyeOff size={20} /> : <Eye size={20} />}</button></span></label></div>
                <Notice tone="info" title="当前调用边界">保存后，智能整理和 KEY3 语音编辑立即改用该模型；聊天、意图 Bridge、记忆摘要仍待各自功能包接入。</Notice>
                <div className="button-row"><Button variant="primary" icon={DeviceFloppy} disabled={!textService.apiKey.trim() || !textService.endpoint.trim() || !textService.model.trim()} onClick={saveTextService}>加密保存文本模型</Button>{aiServiceStatus.text?.configured && <Button variant="ghost" icon={Trash} onClick={clearTextService}>恢复百炼默认</Button>}</div>
              </section>

              <section className="service-config-block">
                <div className="account-card"><span className="avatar"><Microphone2 size={28} /></span><div><strong>实时语音 · 陪伴对话</strong><p>豆包实时对话负责低延时 ASR、对话和 TTS；密钥只在 Electron 主进程解密，不直接执行 Windows 动作。</p></div><StatusBadge tone={aiServiceStatus.realtime?.configured ? "success" : "demo"}>{aiServiceStatus.realtime?.configured ? "凭据已保存" : "待配置"}</StatusBadge></div>
                <SettingRow title="服务商" description="首个适配目标为豆包实时语音；自定义服务需要另写协议适配器"><select value={realtimeService.provider} onChange={(event) => setRealtimeService((current) => ({ ...current, provider: event.target.value }))}><option value="doubao">豆包实时语音</option><option value="custom">自定义 WebSocket</option></select></SettingRow>
                <label className="field-label">WebSocket 地址<input value={realtimeService.endpoint} onChange={(event) => setRealtimeService((current) => ({ ...current, endpoint: event.target.value }))} placeholder="wss://..." /></label>
                <div className="service-config-grid"><label className="field-label">App ID<input value={realtimeService.appId} onChange={(event) => setRealtimeService((current) => ({ ...current, appId: event.target.value }))} placeholder={aiServiceStatus.realtime?.configured ? "重新保存时请填写" : "App ID"} /></label><label className="field-label">Access Key<input type={showServiceSecrets ? "text" : "password"} autoComplete="off" value={realtimeService.accessKey} onChange={(event) => setRealtimeService((current) => ({ ...current, accessKey: event.target.value }))} placeholder={aiServiceStatus.realtime?.configured ? "已加密保存；重新保存时请填写" : "Access Key"} /></label>{realtimeService.provider === "doubao" ? <label className="field-label">App Key（协议固定）<input value="由豆包协议自动设置" readOnly /></label> : <label className="field-label">App Key<input type={showServiceSecrets ? "text" : "password"} autoComplete="off" value={realtimeService.appKey} onChange={(event) => setRealtimeService((current) => ({ ...current, appKey: event.target.value }))} /></label>}<label className="field-label">Resource ID<input value={realtimeService.resourceId} onChange={(event) => setRealtimeService((current) => ({ ...current, resourceId: event.target.value }))} /></label><label className="field-label">模型版本<input value={realtimeService.model} onChange={(event) => setRealtimeService((current) => ({ ...current, model: event.target.value }))} /></label><label className="field-label">女性音色<input value={realtimeService.voice} onChange={(event) => setRealtimeService((current) => ({ ...current, voice: event.target.value }))} /></label></div>
                <Notice tone="info" title="按需连接">凭据保存后仍不会后台联网；只有用户点击“开始陪伴对话”才建立会话。当前生产音频闭环使用所选麦克风和电脑扬声器，连接状态会在陪伴页明确显示。</Notice>
                <div className="button-row"><Button variant="primary" icon={DeviceFloppy} disabled={!realtimeService.appId.trim() || !realtimeService.accessKey.trim() || !realtimeService.endpoint.trim()} onClick={saveRealtimeService}>加密保存实时语音</Button>{aiServiceStatus.realtime?.configured && <Button variant="ghost" icon={Trash} onClick={clearRealtimeService}>删除实时语音配置</Button>}</div>
              </section>
            </div>
            <Notice tone="info" title="密钥安全">全部密钥仅在 Electron 主进程用 Windows 安全存储加密；不会进入 React、配置导出、诊断 JSON、日志或 Git。</Notice>
          </>}
          {section === "diagnostics" && <><SectionTitle index="05" title="系统诊断" /><div className="diagnostic-list">{diagnosticItems.map((item) => <div key={item.label}><span>{item.tone === "success" ? <Check size={18} /> : <AlertCircle size={18} />}</span><strong>{item.label}</strong><StatusBadge tone={item.tone}>{item.value}</StatusBadge></div>)}</div><Button icon={CloudDownload} onClick={exportDiagnostics}>导出脱敏诊断 JSON</Button></>}
        </Card>}
      </div>
    </div>
  );
}
