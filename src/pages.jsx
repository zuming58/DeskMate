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
import { useAppStore } from "./store/appStore.js";
import { useRecorder } from "./hooks/useRecorder.js";
import { clearRecordingBlobs, deleteRecordingBlob, getRecordingBlob, saveRecordingBlob } from "./store/recordingStore.js";
import { mockAdapters } from "./adapters/index.js";
import { voiceAdapters } from "./adapters/voiceAdapters.js";
import { BailianSttAdapter, BailianTextOrganizer, ConfigurableTextOrganizer, HttpSttAdapter, MockSttAdapter } from "./adapters/sttAdapters.js";
import { DeviceSimulator } from "./adapters/deviceSimulator.js";
import { deviceEventBus } from "./domain/deviceEvents.js";
import { actionLabel, createKeyboardConfig, ENCODER_PRESS_ACTIONS, KEY_ACTIONS, normalizeEncoder, normalizeKeyBinding } from "./domain/keymap.js";
import { shortcutFromKeyboardEvent } from "./domain/shortcutCapture.js";
import { initialVoiceSession, voiceSessionReducer } from "./domain/voiceSession.js";
import { createDiagnosticReport } from "./services/diagnostics.js";
import { processVoiceRecording } from "./services/voicePipeline.js";
import { mapAiStateToPetIntent } from "./domain/petIntent.js";
import {
  Button,
  Card,
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

function ShortcutRecorder({ value, onConfirm, global = false }) {
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
      if (event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) { stopCapture(); return; }
      const result = shortcutFromKeyboardEvent(event);
      if (result.error) { setCandidate(""); setMessage(result.error); }
      else if (result.shortcut) { setCandidate(result.shortcut); setMessage("请确认是否使用这个快捷键"); }
      else { setCandidate(""); setMessage(result.display ? `已按下 ${result.display}，请继续按一个字母、数字或功能键` : "请按下组合键"); }
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [capturing, stopCapture]);
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
      <button type="button" className={`shortcut-recorder__field ${capturing ? "is-capturing" : ""}`} onClick={startCapture}>{capturing ? candidate || "请按下新的组合键…" : value || "点击录制快捷键"}</button>
      {capturing && <div className="shortcut-recorder__confirm"><small>{message || "请同时按下修饰键和一个按键；Esc 取消"}</small><div><Button variant="ghost" onClick={stopCapture}>取消</Button><Button variant="primary" disabled={!candidate} onClick={confirm}>确认</Button></div></div>}
    </div>
  );
}

function ApplicationPicker({ binding, onChange, notify }) {
  const [apps, setApps] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setApps(await voiceAdapters.desktop.listApplications()); }
    catch { notify("无法读取 Windows 应用列表"); }
    finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const select = async (token) => {
    try {
      const result = await voiceAdapters.desktop.registerApplication(token);
      if (!result?.id) throw new Error("应用注册失败");
      onChange({ ...binding, appActionId: result.id, appName: result.label });
    } catch (error) { notify(`选择失败：${error.message}`); }
  };
  const choose = async () => {
    try {
      const result = await voiceAdapters.desktop.chooseApplication();
      if (result?.cancelled) return;
      if (!result?.id) throw new Error("应用注册失败");
      onChange({ ...binding, appActionId: result.id, appName: result.label });
    } catch (error) { notify(`选择失败：${error.message}`); }
  };
  const test = async () => {
    const result = await voiceAdapters.desktop.testApplication(binding.appActionId);
    notify(result?.ok ? `已打开 ${result.label || binding.appName}` : `无法打开应用：${result?.reason || "未知错误"}`);
  };
  const filtered = apps.filter((app) => app.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 30);
  return (
    <div className="application-picker">
      {binding.appActionId && <div className="application-picker__selected"><AppWindow size={20} /><strong>{binding.appName || "已选择应用"}</strong><Button variant="ghost" onClick={test}>测试打开</Button></div>}
      <SearchField value={query} onChange={setQuery} placeholder={loading ? "正在读取应用…" : "搜索已安装应用"} />
      <div className="application-picker__list">{filtered.map((app) => <button type="button" key={app.token} onClick={() => select(app.token)}><AppWindow size={17} /><span>{app.label}</span></button>)}</div>
      <div className="application-picker__footer"><Button icon={FolderOpen} variant="ghost" onClick={choose}>选择其他应用</Button><Button variant="ghost" onClick={load}>刷新</Button></div>
    </div>
  );
}

function BindingEditor({ binding, onChange, options = KEY_ACTIONS, notify }) {
  const current = normalizeKeyBinding(binding);
  const changeAction = (action) => onChange({ action });
  return <>
    <label>按下动作<Select value={current.action} onChange={changeAction} ariaLabel="按键动作">{options.map((action) => <option value={action.id} key={action.id}>{action.label}</option>)}</Select></label>
    {current.action === "hotkey" && <label>快捷键<ShortcutRecorder value={current.shortcut || "点击录制快捷键"} onConfirm={async (shortcut) => onChange({ ...current, shortcut })} /></label>}
    {current.action === "fixed-text" && <label>固定文字<textarea maxLength={512} value={current.text || ""} onChange={(event) => onChange({ ...current, text: event.target.value })} placeholder="输入按键要写出的文字" /></label>}
    {current.action === "open-app" && <ApplicationPicker binding={current} onChange={onChange} notify={notify} />}
  </>;
}
const DEVICE_FACE_URL = `${import.meta.env.BASE_URL}assets/deskmate-focus-face.png`;

function ExpressionTile({ preset, selected, onClick, compact = false }) {
  const Icon = moodIcons[preset.mood] || MoodSmile;
  return (
    <button className={`expression-tile expression-tile--${preset.color} ${selected ? "is-selected" : ""} ${compact ? "is-compact" : ""}`} onClick={onClick}>
      <span className="expression-screen"><Icon size={compact ? 28 : 38} stroke={1.6} /></span>
      <span><strong>{preset.name}</strong>{!compact && <small>{preset.description}</small>}</span>
      {selected && <span className="expression-check"><Check size={14} /></span>}
    </button>
  );
}

export function DashboardPage({ navigate, notify }) {
  const { state, event } = useAppStore();
  const expression = state.currentExpression;
  const selectedPreset = expressionPresets.find((item) => item.id === expression) || expressionPresets[0];
  const task = state.aiEvent;
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
        actions={<Button icon={Sparkles} variant="soft" onClick={() => notify("智能联动模式已启用")}>智能联动模式</Button>}
      />
      <div className="dashboard-grid">
        <Card className="pet-showcase">
          <div className="card-heading">
            <div><strong>桌宠实时状态</strong><small>DESKMATE · LIVE</small></div>
            <StatusBadge tone="success">{selectedPreset.name}中</StatusBadge>
          </div>
          <div className="pet-visual">
            <img src={DEVICE_FACE_URL} alt="DeskMate 桌宠专注表情" />
            <span className="pet-mode"><span />{expression.toUpperCase()} · {selectedPreset.name}模式</span>
          </div>
          <div className="pet-footer">
            <div><small>设备姿态</small><strong>正对用户 · 0°</strong></div>
            <div className="sensor-mini"><span><strong>24.6℃</strong><small>温度</small></span><span><strong>46%</strong><small>湿度</small></span><span><strong>68%</strong><small>环境光</small></span></div>
          </div>
        </Card>
        <Card className="task-panel">
          <div className="task-panel__top"><span className="agent-label">{task.agent || "AI"}</span><StatusBadge tone={stateCopy.tone}>{stateCopy.label}</StatusBadge></div>
          <div><h2>{task.agent || "AI"} {stateCopy.heading}</h2><p>{task.detail || "等待状态适配器提供任务说明"}</p></div>
          <div className="progress-block">
            <div className="progress-ring" style={{ "--value": progress }}><strong>{progress}<span>%</span></strong><small>任务进度</small></div>
            <div><span className="blue-kicker">当前状态</span><h3>{stateCopy.heading}</h3><p>{task.detail || "尚未收到任务详情"}</p></div>
          </div>
          <Button variant="primary" className="button--wide" onClick={() => navigate("agents")}>查看当前任务 <ArrowRight size={18} /></Button>
          <div className="task-divider" />
          <div className="card-heading"><strong>工作表情</strong><button className="text-link" onClick={() => navigate("expressions")}>管理表情 <ArrowRight size={14} /></button></div>
          <div className="expression-row">
            {expressionPresets.slice(0, 3).map((item) => <ExpressionTile key={item.id} compact preset={item} selected={expression === item.id} onClick={() => event({ type: item.id === "focus" ? "working" : item.id === "listen" ? "listening" : "thinking", agent: "Codex", progress: state.aiEvent.progress, detail: state.aiEvent.detail })} />)}
          </div>
          <div className="sync-line"><span />状态同步正常 · 2 秒前</div>
        </Card>
      </div>
    </div>
  );
}

export function VoicePage({ notify }) {
  const { state, patch } = useAppStore();
  const [source, setSource] = useState(state.settings.microphoneId || "");
  const [devices, setDevices] = useState([]);
  const [transcript, setTranscript] = useState("");
  const [recordingItem, setRecordingItem] = useState(null);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [desktopCaps, setDesktopCaps] = useState({ supported: false, shortcutRegistered: false });
  const [lastDeviceEvent, setLastDeviceEvent] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState("idle");
  const [session, dispatchSession] = useReducer(voiceSessionReducer, initialVoiceSession);
  const toggleRef = useRef(() => {});
  const cancelRef = useRef(() => {});
  const simulatorRef = useRef(new DeviceSimulator(deviceEventBus));
  const sttAbortRef = useRef(null);
  const realtimeSessionRef = useRef("");
  const realtimeAttemptRef = useRef(0);
  const realtimeWantedRef = useRef(false);
  const pendingRealtimeAudioRef = useRef([]);
  const handleComplete = useCallback(async (item) => {
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
    const mode = state.settings.activeWindowOutputEnabled ? "active-window" : state.settings.outputMode;
    try {
      const processed = await processVoiceRecording({
        blob: item.blob,
        stt,
        organizer: new ConfigurableTextOrganizer({ smartOrganizer: new BailianTextOrganizer() }),
        organizerOptions: { mode: state.settings.formatting, rules: state.vocabulary.rules, hotwords: state.vocabulary.hotwords, customRule: state.settings.customOrganizerRule },
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
          const entry = { id, audioId, time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), date: "今天", duration: `${item.duration} 秒`, count: result.status === "success" ? `${text.length} 字` : "未转写", rawText: result.text || "", text, organizer, transcription };
          patch({ history: [entry, ...state.history], diagnostics: { ...(state.diagnostics || {}), stt: { provider: transcription.provider, status: transcription.status, durationMs: transcription.durationMs, errorType: transcription.errorType }, organizer } });
          return entry;
        },
      });
      setTranscript(processed.text);
      if (processed.organized?.status === "cancelled") {
        dispatchSession({ type: "reset" });
        notify("文字整理已取消，原始转写仍保存在历史中");
      } else if (processed.transcript.status === "success") {
        if (processed.output.ok) {
          const organizerFallback = processed.organized?.fallback;
          dispatchSession({ type: "transition", state: "completed", detail: { message: processed.output.fallbackFrom ? "目标窗口已变化，文字已复制到剪贴板" : organizerFallback ? "智能整理不可用，已安全输出原文" : "转写、整理和文字输出均已完成" } });
          notify(processed.output.fallbackFrom ? "目标窗口已变化，转写已保存并复制到剪贴板" : organizerFallback ? "智能整理不可用，已保留并输出原始转写" : `转写完成，已输出到${processed.output.mode === "history" ? "历史" : processed.output.mode === "clipboard" ? "剪贴板" : "当前窗口"}`);
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
  const { status, seconds, level, error, start, stop, toggle, cancel } = useRecorder({ deviceId: source || undefined, onComplete: handleComplete, onAudioChunk: appendRealtimeAudio, onError: (message) => { dispatchSession({ type: "transition", state: "error", detail: { message } }); notify(message); } });
  const recording = status === "recording";
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
  toggleRef.current = async (requestedPhase) => {
    if (processingRef.current) return { ignored: true, reason: "processing" };
    const phase = typeof requestedPhase === "string" && ["start", "stop"].includes(requestedPhase) ? requestedPhase : null;
    if (phase === "start" && status === "recording") return { ignored: true, reason: "already-recording" };
    if (phase === "stop" && status !== "recording") return { ignored: true, reason: "not-recording" };
    const starting = phase ? phase === "start" : status !== "recording";
    if (starting) {
      setLiveTranscript("");
      dispatchSession({ type: "transition", state: "recording", detail: { message: "正在使用电脑麦克风录音" } });
      beginRealtimePreview();
    }
    const result = phase === "start" ? { ignored: false, action: "start", started: await start() } : phase === "stop" ? (stop(), { ignored: false, action: "stop" }) : await toggle();
    if (result.action === "start" && !result.started) {
      invalidateRealtimeStart();
      if (realtimeSessionRef.current) globalThis.desktopBridge?.cancelBailianRealtime?.(realtimeSessionRef.current).catch(() => {});
      realtimeSessionRef.current = "";
    }
    if (result.ignored && starting) {
      invalidateRealtimeStart();
      dispatchSession({ type: "reset" });
    }
    if (result.action === "stop") {
      invalidateRealtimeStart();
      if (realtimeSessionRef.current) globalThis.desktopBridge?.finishBailianRealtime?.(realtimeSessionRef.current).catch(() => {});
    }
    return result;
  };
  cancelRef.current = () => {
    sttAbortRef.current?.abort();
    invalidateRealtimeStart();
    if (realtimeSessionRef.current) globalThis.desktopBridge?.cancelBailianRealtime?.(realtimeSessionRef.current).catch(() => {});
    realtimeSessionRef.current = "";
    cancel();
    setProcessing(false);
    dispatchSession({ type: "reset" });
    voiceAdapters.desktop.setVoiceState({ state: "cancelled", message: "已取消当前语音输入", floating: state.settings.floating }).catch(() => {});
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
  useEffect(() => deviceEventBus.subscribe((event) => { setLastDeviceEvent(event); if (event.type === "voice-toggle") toggleRef.current(event.payload.phase); if (event.type === "voice-cancel") cancelRef.current(); if (event.type === "connection-change" && !event.payload.connected && recordingRef.current) { stop(); notify("EasyInput 已断线，当前录音已安全停止并保留"); } }), [notify, stop]);
  useEffect(() => { voiceAdapters.desktop.setVoiceRecording(recording).catch(() => {}); }, [recording]);
  useEffect(() => {
    voiceAdapters.desktop.setVoiceState({ state: session.state, message: session.message, transcript: session.state === "recording" ? liveTranscript : "", seconds, level, floating: state.settings.floating }).catch(() => {});
  }, [level, liveTranscript, seconds, session.message, session.state, state.settings.floating]);
  useEffect(() => { voiceAdapters.desktop.capabilities().then(setDesktopCaps).catch(() => setDesktopCaps({ supported: false, shortcutRegistered: false })); }, [state.settings.voiceShortcut]);
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
  const processingLabel = session.state === "organizing" ? "正在整理…" : session.state === "outputting" ? "正在输入…" : "正在转写…";
  return (
    <div className="page">
      <PageIntro title="语音输入" description="专注录音、实时转写与智能整理" actions={<StatusBadge tone={desktopCaps.shortcutRegistered ? "success" : "demo"}>{desktopCaps.shortcutRegistered ? `桌面快捷键 · ${desktopCaps.shortcut}` : "Web 模式 · 全局快捷键不可用"}</StatusBadge>} />
      {(import.meta.env.DEV || state.settings.keyDiagnosticsEnabled) && <Card><SectionTitle index="SIM" title="EasyInput 设备模拟器" description="仅开发/诊断模式显示，使用与桌面快捷键相同的录音状态机。" /><div className="page-actions"><Button icon={Microphone2} variant="primary" onClick={() => simulatorRef.current.toggle()}>模拟语音键</Button><Button onClick={() => simulatorRef.current.rapidPress()}>连续按键</Button><Button onClick={() => simulatorRef.current.toggle({ duplicate: true })}>重复事件</Button><Button onClick={() => simulatorRef.current.disconnect()}>断线</Button><Button onClick={() => simulatorRef.current.reconnect()}>重连</Button></div><SettingRow title="Mock STT" description="仅模拟器返回确定测试文本，不代表真实服务"><Toggle checked={state.settings.simulatorEnabled && state.settings.sttMode === "mock"} onChange={(value) => patch({ settings: { ...state.settings, simulatorEnabled: value, sttMode: value ? "mock" : "unconfigured" } })} /></SettingRow>{lastDeviceEvent && <Notice tone="demo" title={`最后事件 · ${lastDeviceEvent.source}`}>{lastDeviceEvent.type} · {new Date(lastDeviceEvent.at).toLocaleTimeString()}</Notice>}</Card>}
      <Card className="voice-console">
        <div className="voice-console__header">
          <div><span className="section-kicker"><span>01</span>语音输入</span><p>专注录音与转写</p></div>
          <div className="source-switch">
            <Microphone2 size={18} />
            <select className="voice-device-select" value={source} onChange={(event) => { setSource(event.target.value); patch({ settings: { ...state.settings, microphoneId: event.target.value } }); }} aria-label="麦克风设备"><option value="">系统默认麦克风</option>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `麦克风 ${index + 1}`}</option>)}</select>
          </div>
        </div>
          <div className={`recorder ${recording ? "is-recording" : ""}`}>
          <div className="recorder__state"><span className="pulse-dot" />{recording ? "正在录音…" : processing ? processingLabel : transcript ? "录音完成" : "准备就绪"}</div>
          <div className="waveform" aria-label="录音声波">
            {Array.from({ length: 42 }).map((_, index) => <span key={index} style={{ "--height": `${recording ? Math.max(8, level * (0.35 + ((index % 5) / 10))) : 8 + ((index * 7) % 14)}px`, "--delay": `${index * -0.04}s` }} />)}
          </div>
          <div className="recorder__time">{time}</div>
          <p className="recorder__transcript">{recording ? (liveTranscript || (realtimeStatus === "unavailable" ? "正在采集音频；录音结束后显示完整文字" : level > 2 ? "已检测到声音，正在实时识别…" : "等待你开始说话…")) : transcript || "按下按钮或使用快捷键开始录音"}</p>
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
        <Card><SectionTitle index="03" title="录音设备" /><SettingRow title={source ? (devices.find((device) => device.deviceId === source)?.label || "已选择麦克风") : "系统默认麦克风"} description="录音过程中不会自动切换"><StatusBadge tone="success">可用</StatusBadge></SettingRow></Card>
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
  const [previewDiff, setPreviewDiff] = useState([]);
  const [syncState, setSyncState] = useState({ status: "idle", label: "本机配置 · 未同步" });
  const dirtyKeys = useRef(new Set());
  const dirtyEncoder = useRef(new Set());
  const bindings = state.keymap.map((item, index) => normalizeKeyBinding(item, state.keymap[index]));
  const encoder = normalizeEncoder(state.encoder);
  const updateKey = (value) => { dirtyKeys.current.add(selectedInput.index); patch({ keymap: bindings.map((binding, index) => index === selectedInput.index ? normalizeKeyBinding(value) : binding) }); };
  const updateEncoder = (value) => { Object.keys(value).forEach((key) => dirtyEncoder.current.add(key)); patch({ encoder: normalizeEncoder({ ...encoder, ...value }) }); };
  const syncKeyboard = async () => {
    setSyncState({ status: "syncing", label: "正在读取…" });
    try {
      const selectedKeys = Object.fromEntries([...dirtyKeys.current].map((index) => [`KEY${index + 1}`, bindings[index]]));
      const selectedEncoder = Object.fromEntries([...dirtyEncoder.current].map((key) => [key, encoder[key]]));
      const patch = {};
      if (Object.keys(selectedKeys).length > 0) patch.keymap = selectedKeys;
      if (Object.keys(selectedEncoder).length > 0) patch.encoder = selectedEncoder;
      if (Object.keys(patch).length === 0) { setSyncState({ status: "idle", label: "没有待同步修改" }); return; }
      const preview = await voiceAdapters.desktop.previewKeyboardConfigPatch(patch);
      if (!preview?.ok) throw new Error(preview?.reason || "读取配置失败");
      setPreviewDiff(Array.isArray(preview.diff) ? preview.diff : []);
      const summary = (preview.diff || []).map((item) => item.path).join("\n") || "无变化";
      const approved = window.confirm(`将修改以下脱敏路径：\n${summary}\n\n确认应用按键与旋钮修改？`);
      if (!approved) { setSyncState({ status: "idle", label: "等待确认" }); return; }
      const result = await voiceAdapters.desktop.commitKeyboardConfig(preview.token);
      if (!result?.ok) throw new Error(result?.reason || "键盘未确认配置");
      setSyncState({ status: "success", label: "键盘已确认" }); notify("按键与旋钮配置已同步到键盘并保存");
    } catch (error) { setSyncState({ status: "error", label: "同步失败" }); notify(`同步失败：${error.message}`); }
  };
  useEffect(() => {
    return deviceEventBus.subscribe((event) => {
      if (!state.settings.keyDiagnosticsEnabled || event.type !== "key-diagnostic") return;
      setDiagnostics((items) => [{ ...event.payload, source: event.source, at: new Date(event.at).toLocaleTimeString() }, ...items].slice(0, 8));
    });
  }, [state.settings.keyDiagnosticsEnabled]);
  return (
    <div className="page">
      <PageIntro title="按键配置" description="配置键盘按键、旋钮和快捷动作" actions={<><StatusBadge tone={syncState.status === "success" ? "success" : syncState.status === "error" ? "warning" : "demo"}>{syncState.label}</StatusBadge><Button icon={Send} variant="primary" disabled={syncState.status === "syncing"} onClick={syncKeyboard}>同步到键盘</Button></>} />
      <Notice tone="info" title="保存与同步是两件事">页面修改会自动保存到本机。同步前会重新读取板上配置，只提交按键与旋钮路径；网络、音频和未知字段保持原值。回车、退格等标准动作仍由键盘直接发送给 Windows。</Notice>
      {previewDiff.length > 0 && <Card><SectionTitle index="差异" title="待确认的脱敏路径" description="仅显示按键与旋钮字段，不显示原始配置。" /><pre>{previewDiff.map((item) => `${item.path}: ${JSON.stringify(item.before)} -> ${JSON.stringify(item.after)}`).join("\n")}</pre></Card>}
      <SettingRow title="按键诊断模式" description="只记录 F22 / 右 Alt 的来源类别、按下释放和时间；不记录普通输入、文字或设备路径"><Toggle checked={state.settings.keyDiagnosticsEnabled} onChange={(value) => patch({ settings: { ...state.settings, keyDiagnosticsEnabled: value } })} /></SettingRow>
      {diagnostics.length > 0 && <Card><div className="history-list">{diagnostics.map((item, index) => <div className="history-item" key={`${item.at}-${index}`}><time>{item.at}</time><div><p>{item.key || "语音触发"} · {item.action || "切换"}</p><small>{item.source}</small></div></div>)}</div></Card>}
      <div className="keymap-grid">
        <Card className="keymap-board">
          <div className="device-line"><span>当前电脑 <strong>Windows</strong></span><span>键盘系统 <strong>尚未读取</strong></span><span>同步结果 <strong className="success-text">UI 已就绪</strong></span></div>
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
            <Button variant="primary" className="button--wide" onClick={() => notify(`KEY ${selectedInput.index + 1} 的本机配置已保存`)}>保存当前按键</Button>
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
    </div>
  );
}

export function ConnectionsPage({ notify }) {
  const { state, patch } = useAppStore();
  const [tab, setTab] = useState("overview");
  const mic = state.settings.microphoneSource || "computer";
  const setMic = (value) => patch({ settings: { ...state.settings, microphoneSource: value } });
  const startupSound = state.settings.startupSound;
  const setStartupSound = (value) => patch({ settings: { ...state.settings, startupSound: value } });
  const [wifiName, setWifiName] = useState("");
  const [transportCaps, setTransportCaps] = useState(null);
  const [networkSummary, setNetworkSummary] = useState(null);
  const [desktopCaps, setDesktopCaps] = useState({ supported: false });
  const [lastTrigger, setLastTrigger] = useState(null);
  useEffect(() => { mockAdapters.device.discoverTransports().then(setTransportCaps).catch(() => setTransportCaps({})); }, []);
  useEffect(() => { voiceAdapters.desktop.networkSummary().then(setNetworkSummary).catch(() => setNetworkSummary({ available: false, transports: [], lanAudio: "protocol-unconfirmed" })); }, []);
  useEffect(() => { voiceAdapters.desktop.capabilities().then(setDesktopCaps).catch(() => setDesktopCaps({ supported: false, shortcutRegistered: false })); }, [state.settings.voiceShortcut]);
  useEffect(() => deviceEventBus.subscribe((event) => { if (event.type === "voice-toggle" || event.type === "key-diagnostic") setLastTrigger({ source: event.source, key: event.payload.key || event.payload.shortcut || "", at: event.at }); }), []);
  const bridge = state.runtime?.inputBridge || desktopCaps.inputBridge || {};
  const qwenReady = state.settings.sttMode === "bailian";
  const outputReady = state.settings.outputMode === "history" || desktopCaps.supported;
  return (
    <div className="page">
      <PageIntro title="设备与连接" description="检查板子触发、麦克风音频、转写和文字输出链路" actions={<Button icon={Refresh} onClick={() => notify("已刷新浏览器能力；系统设备检测需要桌面桥")}>刷新能力</Button>} />
      <Segmented value={tab} onChange={setTab} options={[{ value: "overview", label: "连接概览" }, { value: "microphone", label: "麦克风" }, { value: "network", label: "Wi-Fi 与蓝牙" }, { value: "sound", label: "提示音" }]} />
      {tab === "overview" && <><Notice tone={bridge.boardConnected ? "success" : "warning"} title={bridge.boardConnected ? "EasyInput 真机语音桥已连接" : "等待 EasyInput USB 设备"}>{bridge.boardConnected ? "当前真机语音键发送 Ctrl+Shift+Space；F22 作为兼容路径。两者都会调用与页面按钮完全相同的录音控制器。回车、退格、全选、复制、粘贴和撤销继续由 Windows 标准 HID 直接执行。" : "连接开发板后，Raw Input 桥只读识别 VID 303A / PID 1006 的 F22 兼容路径；全局快捷键默认使用 Ctrl+Shift+Space，不会读取文字、序列号，也不会向板子写数据。"}</Notice><div className="connection-cards">
        <Card interactive><div className="connection-icon"><Link size={28} /></div><div><strong>EasyInput HID</strong><p>{lastTrigger ? `最后触发：${lastTrigger.key || "语音切换"} · ${lastTrigger.source}` : "语音键 Ctrl+Shift+Space；F22 为兼容路径；标准编辑键由 Windows 直接处理"}</p></div><StatusBadge tone={bridge.boardConnected ? "success" : "demo"}>{bridge.boardConnected ? "已连接" : bridge.process === "running" ? "监听中" : "桥未运行"}</StatusBadge></Card>
        <Card interactive><div className="connection-icon"><Microphone2 size={28} /></div><div><strong>电脑麦克风</strong><p>Phase 3 固定使用电脑麦克风；EasyInput 语音键只触发录音，板载 Wi-Fi 音频不作伪连接</p></div><StatusBadge tone="success">录音就绪</StatusBadge></Card>
        <Card interactive><div className="connection-icon"><Brain size={28} /></div><div><strong>千问语音识别</strong><p>停止录音后调用 qwen3-asr-flash</p></div><StatusBadge tone={qwenReady ? "success" : "demo"}>{qwenReady ? "已启用" : "待配置"}</StatusBadge></Card>
        <Card interactive><div className="connection-icon"><Copy size={28} /></div><div><strong>文字输出</strong><p>先保存历史，再写入原窗口；失败时自动回退剪贴板</p></div><StatusBadge tone={outputReady ? "success" : "demo"}>{outputReady ? "就绪" : "Web 仅历史"}</StatusBadge></Card>
      </div><Card className="transport-readiness"><SectionTitle index="02" title="浏览器通信能力" description="这里只表示当前浏览器支持哪些接口，不代表硬件已经连接。" /><div className="chips">{transportCaps ? Object.entries(transportCaps).map(([name, supported]) => <span className={`chip chip--status ${supported ? "is-supported" : ""}`} key={name}>{name} · {supported ? "可用" : "不可用"}</span>) : <span>正在检测…</span>}</div></Card></>}
      {tab === "microphone" && <Card><SectionTitle index="01" title="麦克风来源" description="录音开始后不会中途切换。" /><Segmented value={mic} onChange={setMic} options={[{ value: "computer", label: "电脑优先" }, { value: "keyboard", label: "键盘优先" }]} /><Notice tone={mic === "computer" ? "success" : "warning"} title={mic === "computer" ? "电脑麦克风可用" : "键盘麦克风待接入"}>{mic === "computer" ? "当前可直接使用浏览器授权的电脑麦克风录音；EasyInput 语音键只负责触发状态切换。" : "这个选择目前只保存偏好；需要先确认原 EasyInput 的局域网音频协议，才能真正接收板子麦克风。"}</Notice></Card>}
      {tab === "network" && <div className="two-column"><Card><SectionTitle index="01" title="网络与连接" description="网线或 Wi-Fi 都可能满足同局域网条件，实际互通需真机验证。" /><Notice tone="info" title={networkSummary?.available ? "电脑网络可用" : "等待网络"}>{networkSummary?.available ? `检测到网络类别：${networkSummary.transports.join(" / ") || "unknown"}；可能具备同局域网条件。` : "未检测到可用网络接口。"}</Notice><Notice tone="warning" title="板载音频协议未确认">EasyInput 局域网音频保持 protocol-unconfirmed，不扫描 IP、端口或广播，也不显示已连接。</Notice><label className="field-label">Wi-Fi 名称<input value={wifiName} onChange={(e) => setWifiName(e.target.value)} placeholder="仅作为本地偏好，不代表已配网" /></label><Button icon={Send} variant="primary" onClick={() => notify(wifiName ? "网络偏好已保存，等待真机验证" : "请先填写 Wi-Fi 名称")}>保存本地偏好</Button></Card><Card><SectionTitle index="02" title="蓝牙功能" /><SettingRow icon={Bluetooth} title="蓝牙 HID 输入" description="用于按键和旋钮，不用于传输麦克风音频"><Toggle checked onChange={() => notify("蓝牙状态为模拟能力")}/></SettingRow><Notice tone="info" title="设备网络状态">键盘网络配置：等待真机验证。板载麦克风：协议未确认。</Notice></Card></div>}
      {tab === "sound" && <Card><SectionTitle index="03" title="开机提示音" description="选择内置音效或导入最长 8 秒的音频。" /><div className="sound-grid">{["WaytoAGI", "来 WaytoAGI 学 AI 硬件", "又来写 bug 了", "晶亮启动", "柔和启动", "极简启动"].map((name, index) => <button key={name} className={index === 0 ? "is-selected" : ""} onClick={() => notify(`已试听“${name}”`)}><Music size={22} /><strong>{name}</strong><small>{["1.7", "2.8", "2.1", "0.6", "0.8", "0.3"][index]} 秒</small></button>)}</div><SettingRow title="开机音效" description="完整开机时播放已选音效"><Toggle checked={startupSound} onChange={setStartupSound} /></SettingRow></Card>}
    </div>
  );
}

export function AgentsPage({ notify }) {
  const { state, patch, event } = useAppStore();
  const mapping = state.agentExpressionMapping;
  const petIntent = state.aiIntent || mapAiStateToPetIntent({ state: state.aiEvent.type === "waiting_user" ? "waiting" : state.aiEvent.type });
  const eventLabel = { idle: "待命", listening: "倾听中", thinking: "思考中", working: "工作中", waiting_user: "等待用户", completed: "已完成", error: "异常" };
  const updateMapping = (agentId, value) => {
    patch({ agentExpressionMapping: { ...mapping, [agentId]: value } });
    if (state.aiEvent.type === "working" && state.aiEvent.agent?.toLowerCase().includes(agentId === "claude" ? "claude" : agentId)) event({ ...state.aiEvent });
  };
  const simulateNextStatus = () => {
    const sequence = ["working", "waiting_user", "thinking", "completed", "error", "idle"];
    const next = sequence[(sequence.indexOf(state.aiEvent.type) + 1) % sequence.length];
    event({ type: next, agent: "Codex", progress: next === "completed" ? 100 : next === "idle" ? 0 : state.aiEvent.progress, detail: `模拟状态：${eventLabel[next]}` });
    notify(`Codex 已切换为“${eventLabel[next]}”`);
  };
  return (
    <div className="page">
      <PageIntro title="AI 联动" description="把编程助手的运行状态映射到桌宠灯效和表情" actions={<Button icon={Plus} variant="primary" onClick={() => notify("自定义适配器将在开发阶段开放")}>添加适配器</Button>} />
      <Notice tone="demo" title="适配器模拟数据">Codex、Claude Code、Hermes 和 Workbody 当前仅使用模拟状态；未连接真实 provider，也不会控制硬件。</Notice>
      <Card><SectionTitle index="01" title="桌宠意图（模拟）" description="状态只转换为意图，不调用屏幕、灯、舵机或传感器。" /><div className="state-flow"><span>表情 · {petIntent.faceExpression}</span><span>动作 · {petIntent.motionIntent}</span><span>亮度 · {petIntent.screenBrightnessIntent}</span><span>关注 · {petIntent.attentionIntent}</span></div></Card>
      <div className="agent-grid">{agents.map((agent) => {
        const isCodex = agent.id === "codex";
        const displayState = isCodex ? eventLabel[state.aiEvent.type] : agent.state;
        const displayProgress = isCodex ? state.aiEvent.progress : agent.progress;
        return <Card key={agent.id} className={`agent-card agent-card--${agent.tone}`}>
          <div className="agent-card__head"><span className="agent-icon"><Code size={24} /></span><StatusBadge tone={displayState === "工作中" || displayState === "已完成" ? "success" : displayState === "待命" ? "neutral" : "warning"}>{displayState}</StatusBadge></div>
          <h3>{agent.name}</h3><p>{isCodex ? state.aiEvent.detail : agent.detail}</p>
          {displayProgress > 0 && <div className="agent-progress"><span style={{ width: `${displayProgress}%` }} /><small>{displayProgress}%</small></div>}
          <label>工作时表情<Select value={mapping[agent.id]} onChange={(value) => updateMapping(agent.id, value)}>{expressionPresets.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select></label>
          <Button icon={isCodex ? Refresh : agent.state === "未连接" || agent.state === "未配置" ? Settings2 : Eye} onClick={isCodex ? simulateNextStatus : () => notify(`${agent.name} 配置面板为演示状态`)}>{isCodex ? "模拟下一状态" : agent.state === "未连接" || agent.state === "未配置" ? "配置" : "查看状态"}</Button>
        </Card>;
      })}</div>
      <Card><SectionTitle index="02" title="状态接收" description="桌宠 App 将把适配器状态统一为待命、工作、等待、完成和错误。" /><div className="state-flow"><span>AI 工具</span><ArrowRight /><span>本地适配器</span><ArrowRight /><span>DeskMate 状态总线</span><ArrowRight /><span>表情 / 动作 / 灯效</span></div></Card>
    </div>
  );
}

export function ExpressionsPage({ navigate, notify }) {
  const { state, patch, event } = useAppStore();
  const selected = state.currentExpression;
  const [category, setCategory] = useState("all");
  const filtered = category === "all" ? expressionPresets : expressionPresets.filter((item) => category === "work" ? ["focus", "listen", "think"].includes(item.id) : ["happy", "sleep", "alert"].includes(item.id));
  const assignments = [{ key: "working", label: "AI 工作中" }, { key: "waiting_user", label: "等待用户输入" }, { key: "thinking", label: "复杂推理" }, { key: "completed", label: "任务已完成" }];
  const updateStatusMapping = (key, value) => {
    patch({ expressionMapping: { ...state.expressionMapping, [key]: value } });
    if (state.aiEvent.type === key) event({ ...state.aiEvent });
  };
  return (
    <div className="page">
      <PageIntro title="表情库" description="管理内置表情、收藏与工作状态映射" actions={<Button icon={Plus} variant="primary" onClick={() => navigate("editor")}>新建表情</Button>} />
      <div className="library-toolbar"><Segmented value={category} onChange={setCategory} options={[{ value: "all", label: "全部" }, { value: "work", label: "工作状态" }, { value: "life", label: "生活状态" }]} /><SearchField value="" placeholder="搜索表情" /></div>
      <div className="expression-library">{filtered.map((preset) => <ExpressionTile key={preset.id} preset={preset} selected={selected === preset.id} onClick={() => { patch({ currentExpression: preset.id }); notify(`已预览“${preset.name}”表情`); }} />)}</div>
      <Card className="assignment-card"><SectionTitle index="02" title="当前状态映射" description="选择一个工作状态，再指定桌宠显示的表情。" /><div className="assignment-grid">{assignments.map((assignment) => <div key={assignment.key}><span>{assignment.label}</span><Select value={state.expressionMapping[assignment.key]} onChange={(value) => updateStatusMapping(assignment.key, value)}>{expressionPresets.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</Select></div>)}</div></Card>
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

export function MotionPage({ notify }) {
  const { state, patch } = useAppStore();
  const { preset, speed, range } = state.motion;
  const updateMotion = (value) => patch({ motion: { ...state.motion, ...value } });
  const [testing, setTesting] = useState(false);
  const play = () => { setTesting(true); notify("正在播放虚拟动作预览"); window.setTimeout(() => setTesting(false), 1800); };
  return (
    <div className="page">
      <PageIntro title="动作编排" description="设计左右摇头、上下点头与组合动作" actions={<Button icon={testing ? PlayerPause : PlayerPlay} variant="primary" onClick={play}>{testing ? "预览中…" : "测试动作"}</Button>} />
      <Notice tone="demo" title="虚拟动作预览">双轴舵机型号、角度零点和安全限位尚未确定，当前只展示动作编排体验。</Notice>
      <div className="motion-grid">
        <Card className="motion-stage"><div className={`motion-avatar ${testing ? `is-playing is-${preset}` : ""}`}><img src={DEVICE_FACE_URL} alt="桌宠动作预览" /></div><div className="axis-controls"><Button icon={ArrowLeft}>左转</Button><Button icon={ArrowUp}>抬头</Button><Button icon={ArrowDown}>点头</Button><Button icon={ArrowRight}>右转</Button></div></Card>
        <Card><SectionTitle index="01" title="动作参数" /><label className="field-label">动作预设<Segmented value={preset} onChange={(value) => updateMotion({ preset: value })} options={[{ value: "attentive", label: "关注" }, { value: "nod", label: "点头" }, { value: "search", label: "寻找" }]} /></label><SettingRow title="动作速度" description="速度越高，运动越利落"><Slider label="动作速度" value={speed} onChange={(value) => updateMotion({ speed: value })} /></SettingRow><SettingRow title="运动范围" description="限制头部最大转动角度"><Slider label="运动范围" value={range} onChange={(value) => updateMotion({ range: value })} min={10} max={80} suffix="°" /></SettingRow><SettingRow title="柔性起停" description="减少舵机突然启动带来的晃动"><Toggle checked onChange={() => notify("柔性起停已保持开启")} /></SettingRow></Card>
      </div>
      <Card><SectionTitle index="02" title="动作时间线" description="把表情和动作组合为一段可复用行为。" /><div className="timeline"><span className="timeline-label">0s</span><div className="timeline-track"><i style={{ left: "4%", width: "22%" }}>看向用户</i><i style={{ left: "32%", width: "18%" }}>眨眼</i><i style={{ left: "56%", width: "32%" }}>轻点头 × 2</i></div><span className="timeline-label">4s</span></div></Card>
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

export function SettingsPage({ notify }) {
  const { state, patch, reset, replace, exportConfig } = useAppStore();
  const [section, setSection] = useState("input");
  const [bailianKey, setBailianKey] = useState("");
  const [showBailianKey, setShowBailianKey] = useState(false);
  const [bailianWorkspace, setBailianWorkspace] = useState("");
  const [bailianStatus, setBailianStatus] = useState({ configured: false, storage: "unknown" });
  const format = state.settings.formatting;
  const theme = state.settings.theme;
  const floating = state.settings.floating;
  const updateSettings = (value) => patch({ settings: { ...state.settings, ...value } });
  const refreshBailianStatus = useCallback(async () => { try { const value = await globalThis.desktopBridge?.getBailianStatus?.(); if (value) { setBailianStatus(value); setBailianWorkspace(value.workspaceId || ""); } } catch { setBailianStatus({ configured: false, storage: "unavailable" }); } }, []);
  useEffect(() => { refreshBailianStatus(); }, [refreshBailianStatus]);
  const saveBailian = async () => { try { const value = await globalThis.desktopBridge?.saveBailianCredentials?.({ apiKey: bailianKey, workspaceId: bailianWorkspace }); if (!value) throw new Error("请在 DeskMate 桌面版中配置"); setBailianKey(""); setBailianStatus(value); updateSettings({ sttMode: "bailian", sttEndpoint: "" }); notify("千问语音识别账号已使用 Windows 加密保存"); } catch (error) { notify(`保存失败：${error.message}`); } };
  const clearBailian = async () => { try { const value = await globalThis.desktopBridge?.clearBailianCredentials?.(); if (!value) throw new Error("请在 DeskMate 桌面版中操作"); setBailianStatus(value); updateSettings({ sttMode: "unconfigured" }); notify("本机千问 API Key 已删除"); } catch (error) { notify(`删除失败：${error.message}`); } };
  const exportDiagnostics = async () => { const caps = await voiceAdapters.desktop.capabilities(); const network = await voiceAdapters.desktop.networkSummary(); let microphonePermission = "unknown"; try { microphonePermission = (await navigator.permissions.query({ name: "microphone" })).state; } catch { /* unsupported permission query */ } const report = createDiagnosticReport({ runtime: caps.supported ? "electron" : "web", shortcut: { value: state.settings.voiceShortcut, registered: Boolean(caps.shortcutRegistered) }, microphone: { selected: state.settings.microphoneId ? "custom-device" : "system-default", permission: microphonePermission }, network, deviceEvent: deviceEventBus.lastEvent ? { source: deviceEventBus.lastEvent.source, type: deviceEventBus.lastEvent.type, at: deviceEventBus.lastEvent.at } : null, stt: state.diagnostics?.stt || { status: state.settings.sttMode === "unconfigured" ? "unconfigured" : state.settings.sttMode }, organizer: state.diagnostics?.organizer ? { model: state.diagnostics.organizer.model, durationMs: state.diagnostics.organizer.durationMs, status: state.diagnostics.organizer.status, fallback: state.diagnostics.organizer.fallback, errorType: state.diagnostics.organizer.errorType || "" } : { model: "qwen3.7-flash", status: state.settings.formatting === "raw" ? "disabled" : "not-run" } }); const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }); const link = document.createElement("a"); const url = URL.createObjectURL(blob); link.href = url; link.download = "deskmate-diagnostics.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); notify("已导出脱敏诊断 JSON"); };
  const downloadConfig = () => { const blob = new Blob([exportConfig()], { type: "application/json" }); const link = document.createElement("a"); const url = URL.createObjectURL(blob); link.href = url; link.download = "deskmate-config.json"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0); notify("配置 JSON 已导出"); };
  const importConfig = (event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { replace(JSON.parse(reader.result)); notify("配置已导入"); } catch (error) { notify(`导入失败：${error.message}`); } }; reader.readAsText(file); event.target.value = ""; };
  const sttDiagnostic = state.settings.sttMode === "bailian" ? { label: "千问 ASR", value: bailianStatus.configured ? "已配置" : "缺少密钥", tone: bailianStatus.configured ? "success" : "demo" } : state.settings.sttMode === "mock" ? { label: "Mock STT", value: "模拟", tone: "demo" } : state.settings.sttMode === "http" ? { label: "HTTP STT 端点", value: "待验证", tone: "demo" } : { label: "语音转写服务", value: "未配置", tone: "demo" };
  const organizerDiagnostic = state.settings.formatting === "raw" ? { label: "文字整理", value: "本地原样输出", tone: "success" } : { label: "千问文字整理", value: !bailianStatus.configured ? "缺少密钥" : state.diagnostics?.organizer?.fallback ? "上次已回退原文" : state.diagnostics?.organizer?.status === "success" ? `正常 · ${state.diagnostics.organizer.durationMs} ms` : "已配置", tone: bailianStatus.configured && !state.diagnostics?.organizer?.fallback ? "success" : "demo" };
  const inputBridge = state.runtime?.inputBridge || {};
  const diagnosticItems = [{ label: "Windows 输入桥", value: inputBridge.process === "running" ? "运行中" : inputBridge.process || "未知", tone: inputBridge.process === "running" ? "success" : "demo" }, { label: "EasyInput HID", value: inputBridge.boardConnected ? "已连接" : "未连接", tone: inputBridge.boardConnected ? "success" : "demo" }, { label: "电脑麦克风录音", value: "可用", tone: "success" }, sttDiagnostic, organizerDiagnostic, { label: "文字输出", value: state.settings.activeWindowOutputEnabled ? "原窗口 + 剪贴板回退" : state.settings.outputMode === "clipboard" ? "剪贴板" : "历史", tone: "success" }, { label: "板载局域网音频", value: "协议未确认", tone: "demo" }];
  return (
    <div className="page">
      <PageIntro title="设置与诊断" description="管理快捷键、输入方式、外观和系统诊断" actions={<><Button icon={Upload} onClick={() => document.getElementById("config-import").click()}>导入配置</Button><input id="config-import" type="file" accept="application/json" hidden onChange={importConfig} /><Button icon={Download} onClick={downloadConfig}>导出配置</Button><Button icon={Refresh} onClick={() => { reset(); notify("设置已恢复为默认值"); }}>恢复默认</Button></>} />
      <div className="settings-layout">
        <Card className="settings-nav">{[{ id: "input", icon: Keyboard, label: "输入与快捷键" }, { id: "format", icon: Book2, label: "文字整理" }, { id: "appearance", icon: Sun, label: "外观与悬浮窗" }, { id: "account", icon: User, label: "账户" }, { id: "diagnostics", icon: Gauge, label: "系统诊断" }].map((item) => <button className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)} key={item.id}><item.icon size={19} /><span>{item.label}</span><ArrowRight size={16} /></button>)}</Card>
        <Card className="settings-panel">
          {section === "input" && <><SectionTitle index="01" title="快捷键" /><SettingRow title="EasyInput 语音键（Ctrl+Shift+Space）" description="当前真机已确认发送 Ctrl+Shift+Space；F22 作为兼容路径，仅在按键释放时切换录音，不拦截其他标准按键"><Toggle checked={state.settings.boardF22Enabled} onChange={(value) => updateSettings({ boardF22Enabled: value })} /></SettingRow><SettingRow title="备用语音快捷键" description="点击后直接按下新的组合键，确认成功注册后才保存；默认 Ctrl+Shift+Space"><ShortcutRecorder global value={state.settings.voiceShortcut} onConfirm={async (candidate) => { const result = await voiceAdapters.desktop.registerShortcut(candidate); if (!result?.registered || result.shortcut !== candidate) throw new Error(result?.reason || "快捷键被其他应用占用"); updateSettings({ voiceShortcut: result.shortcut }); notify(`备用语音快捷键已保存为 ${result.shortcut}`); }} /></SettingRow><SettingRow title="右 Alt 触发" description="可兼容旧方案，但可能影响 AltGr 和正常输入，因此默认关闭"><Toggle checked={state.settings.rightAltEnabled} onChange={(value) => updateSettings({ rightAltEnabled: value })} /></SettingRow>{state.settings.rightAltEnabled && <Notice tone="warning" title="右 Alt 已启用">Raw Input 桥不会吞掉右 Alt；部分应用仍可能把它当作 AltGr。若输入异常，请关闭此选项。</Notice>}<SettingRow title="快捷键操作方式" description="按一下开始，再按一下结束；只在释放事件触发并带 350ms 防抖"><StatusBadge tone="success">切换模式</StatusBadge></SettingRow><SettingRow title="转写后文字输出" description="无论输出成功与否，都会先保存历史记录"><Segmented compact value={state.settings.outputMode} onChange={(value) => updateSettings({ outputMode: value })} options={[{ value: "history", label: "仅历史" }, { value: "clipboard", label: "复制" }]} /></SettingRow><SettingRow title="写入原输入窗口" description="默认写回触发语音时所在的输入窗口；目标变化或自动输入失败时回退到剪贴板"><Toggle checked={state.settings.activeWindowOutputEnabled} onChange={(value) => updateSettings({ activeWindowOutputEnabled: value })} /></SettingRow></>}
          {section === "format" && <><SectionTitle index="02" title="文字整理" /><SettingRow title="整理方式" description="智能或自定义服务不可用时安全退回原样输出"><Segmented value={format} onChange={(value) => updateSettings({ formatting: value })} options={[{ value: "raw", label: "原样输出" }, { value: "smart", label: "智能整理" }, { value: "custom", label: "自定义" }]} /></SettingRow>{format === "custom" && <label className="field-label">自定义整理要求<input value={state.settings.customOrganizerRule} maxLength={4000} onChange={(event) => updateSettings({ customOrganizerRule: event.target.value })} placeholder="例如：整理成简洁的任务清单；不得增加原文没有的信息" /></label>}<SettingRow title="HTTP STT 端点" description="启用后录音会发送到该服务；仅允许 HTTPS，本机服务可使用 HTTP localhost；不要填写带 Token 的 URL"><input value={state.settings.sttEndpoint} onChange={(event) => updateSettings({ sttEndpoint: event.target.value, sttMode: event.target.value ? "http" : "unconfigured" })} placeholder="https://example.invalid/stt" /></SettingRow><Notice tone={format === "raw" || bailianStatus.configured ? "success" : "warning"} title="当前规则">{format === "raw" ? "保留识别结果，只应用词库替换规则，不调用文字模型。" : !bailianStatus.configured ? "尚未配置百炼 API Key，将自动保留原始转写。" : format === "smart" ? "使用 qwen3.7-flash 清理口头语、重复和标点；失败时保留原文。" : state.settings.customOrganizerRule ? "先完成基础清理，再按自定义要求整理；失败时保留原文。" : "尚未填写自定义整理要求，将退回原样输出。"}</Notice></>}
          {section === "appearance" && <><SectionTitle index="03" title="外观与悬浮窗" /><SettingRow title="外观" description="跟随系统外观，或手动固定亮色 / 暗色"><Segmented value={theme} onChange={(value) => updateSettings({ theme: value })} options={[{ value: "system", label: "跟随系统" }, { value: "light", label: "亮色" }, { value: "dark", label: "暗色" }]} /></SettingRow><SettingRow title="悬浮窗显示" description="录音时显示状态和实时识别文字"><Toggle checked={floating} onChange={(value) => updateSettings({ floating: value })} /></SettingRow><SettingRow title="背景不透明度" description="数值越高，悬浮窗背景越实"><Slider label="背景不透明度" value={state.settings.backgroundOpacity} onChange={(value) => updateSettings({ backgroundOpacity: value })} /></SettingRow></>}
          {section === "account" && <><SectionTitle index="04" title="千问服务" /><div className="account-card"><span className="avatar"><Lock size={28} /></span><div><strong>阿里云百炼 · ASR + 智能整理</strong><p>qwen3-asr-flash 负责转写，qwen3.7-flash 负责可选文字整理；共用同一份加密 API Key。</p></div><StatusBadge tone={bailianStatus.configured ? "success" : "demo"}>{bailianStatus.configured ? "已配置" : "未配置"}</StatusBadge></div><label className="field-label">百炼 API Key<span className="secret-field"><input type={showBailianKey ? "text" : "password"} autoComplete="off" value={bailianKey} onChange={(event) => setBailianKey(event.target.value)} placeholder={bailianStatus.configured ? "已加密保存；输入新 Key 可替换" : "sk-..."} /><button type="button" aria-label={showBailianKey ? "隐藏 API Key" : "显示 API Key"} title={showBailianKey ? "隐藏 API Key" : "显示 API Key"} onClick={() => setShowBailianKey((value) => !value)}>{showBailianKey ? <EyeOff size={20} /> : <Eye size={20} />}</button></span></label><label className="field-label">业务空间 ID（可选）<input value={bailianWorkspace} onChange={(event) => setBailianWorkspace(event.target.value)} placeholder="留空使用百炼兼容域名" /></label><Notice tone="info" title="账号安全">只需要百炼 API Key，不需要阿里云登录密码、AccessKey ID 或 AccessKey Secret。密钥只在 Electron 主进程中解密，不会进入配置导出或 Git。</Notice><div className="button-row"><Button variant="primary" icon={DeviceFloppy} disabled={!bailianKey.trim()} onClick={saveBailian}>加密保存并启用</Button>{bailianStatus.configured && <Button variant="ghost" icon={Trash} onClick={clearBailian}>删除本机 Key</Button>}</div></>}
          {section === "diagnostics" && <><SectionTitle index="05" title="系统诊断" /><div className="diagnostic-list">{diagnosticItems.map((item) => <div key={item.label}><span>{item.tone === "success" ? <Check size={18} /> : <AlertCircle size={18} />}</span><strong>{item.label}</strong><StatusBadge tone={item.tone}>{item.value}</StatusBadge></div>)}</div><Button icon={CloudDownload} onClick={exportDiagnostics}>导出脱敏诊断 JSON</Button></>}
        </Card>
      </div>
    </div>
  );
}
