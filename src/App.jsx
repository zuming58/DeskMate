import { useEffect, useRef, useState } from "react";
import {
  IconBell as Bell,
  IconBook as BookOpen,
  IconBrain as Brain,
  IconChevronLeft as ChevronLeft,
  IconChevronRight as ChevronRight,
  IconCircleCheck as CircleCheck,
  IconKeyboard as Keyboard,
  IconLayoutDashboard as LayoutDashboard,
  IconMenu2 as Menu2,
  IconMessageCircle2 as MessageCircle,
  IconMicrophone2 as Microphone2,
  IconSettings2 as Settings2,
  IconSparkles as Sparkles,
  IconX as X,
} from "@tabler/icons-react";
import { pageMeta } from "./appData.js";
import { CompanionFace } from "./CompanionFace.jsx";
import { AppStoreProvider, useAppStore } from "./store/appStore.js";
import { mockAdapters } from "./adapters/index.js";
import { voiceAdapters } from "./adapters/voiceAdapters.js";
import { createDeviceEvent, deviceEventBus } from "./domain/deviceEvents.js";
import { formatDashboardDate } from "./domain/dashboardStatus.js";
import { createComputerCompanionAudioEngine } from "./domain/computerCompanionAudio.js";
import {
  AgentsPage,
  CompanionPage,
  ConnectionsPage,
  DashboardPage,
  ExpressionEditorPage,
  ExpressionsPage,
  HistoryPage,
  KeymapPage,
  MotionPage,
  SensorsPage,
  SettingsPage,
  VocabularyPage,
  VoicePage,
} from "./pages.jsx";

const navigation = [
  { id: "dashboard", label: "工作台", icon: LayoutDashboard },
  { id: "voice", label: "语音输入", icon: Microphone2 },
  { id: "companion", label: "AI 陪伴", icon: MessageCircle },
  { id: "history", label: "历史记录", icon: BookOpen },
  { id: "vocabulary", label: "词库", icon: Brain },
  { id: "keymap", label: "按键配置", icon: Keyboard },
  { id: "settings", label: "设备与诊断", icon: Settings2 },
];

function BrandMark() {
  return <span className="brand-mark"><CompanionFace allowBlink={false} alt="DeskMate" /></span>;
}

function Sidebar({ current, navigate, collapsed, setCollapsed, mobileOpen, setMobileOpen, boardConnected, expressionId }) {
  return (
    <aside className={`sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
      <div className="sidebar__brand">
        <BrandMark />
        <div className="brand-copy"><strong>DESKMATE</strong><span>AI 工作台伙伴</span></div>
        <button className="sidebar__mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭菜单"><X size={20} /></button>
      </div>
      <div className="sidebar__rule" />
      <nav className="sidebar__nav" aria-label="主导航">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={current === item.id ? "is-active" : ""}
              onClick={() => { navigate(item.id); setMobileOpen(false); }}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={21} stroke={1.65} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <button className="sidebar__collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "展开侧栏" : "收起侧栏"}>{collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}<span>收起导航</span></button>
      <div className="device-card">
        <div className="device-card__screen"><CompanionFace expressionId={expressionId} alt="DeskMate 设备表情" /></div>
        <div className={`device-card__status ${boardConnected ? "" : "device-card__status--pending"}`}><span />{boardConnected ? "EasyInput 已连接" : "等待 EasyInput 板子"}</div>
        <small>{boardConnected ? "USB HID · Ctrl+Shift+Space / F22 监听就绪" : "请通过 USB 连接开发板"}</small>
      </div>
    </aside>
  );
}

function AppHeader({ current, setMobileOpen }) {
  const meta = pageMeta[current];
  return (
    <header className="app-header">
      <button className="mobile-menu" aria-label="打开菜单" onClick={() => setMobileOpen(true)}><Menu2 size={22} /></button>
      <div className="breadcrumbs"><strong>DESKMATE</strong><span>/</span><span>{meta.title}</span></div>
      <div className="app-header__right">
        <span className="service-status"><i />本地核心已运行</span>
        <span className="app-date">{formatDashboardDate()}</span>
        <button className="header-icon" aria-label="通知"><Bell size={19} stroke={1.7} /><i /></button>
      </div>
    </header>
  );
}

const pages = {
  dashboard: DashboardPage,
  voice: VoicePage,
  companion: CompanionPage,
  history: HistoryPage,
  vocabulary: VocabularyPage,
  keymap: KeymapPage,
  connections: ConnectionsPage,
  agents: AgentsPage,
  expressions: ExpressionsPage,
  editor: ExpressionEditorPage,
  motion: MotionPage,
  sensors: SensorsPage,
  settings: SettingsPage,
};

const companionStateCopy = {
  connecting: { label: "正在连接", message: "正在连接豆包实时对话…" },
  listening: { label: "正在倾听", message: "请开始说话" },
  thinking: { label: "正在思考", message: "DeskMate 正在组织回答" },
  speaking: { label: "正在播报", message: "DeskMate 正在回答" },
  stopping: { label: "正在结束", message: "正在释放会话与音频资源" },
  completed: { label: "本轮完成", message: "准备继续倾听" },
  error: { label: "对话异常", message: "陪伴会话已安全停止" },
};

function CompanionLiveBar({ conversation }) {
  if (!conversation || conversation.state === "idle") return null;
  const copy = companionStateCopy[conversation.state] || companionStateCopy.connecting;
  const text = conversation.state === "speaking" ? conversation.reply : conversation.transcript;
  return (
    <div className={`companion-live-bar is-${conversation.state}`} role="status" aria-live="polite">
      <span className="companion-live-bar__dot" />
      <Microphone2 size={17} stroke={1.8} />
      <strong>{copy.label}</strong>
      <span className="companion-live-bar__text">{text || conversation.error || copy.message}</span>
      {conversation.active && <button onClick={() => globalThis.desktopBridge?.stopCompanionConversation?.()}>结束</button>}
      <small>Esc 结束</small>
    </div>
  );
}

function resolveHash() {
  const value = window.location.hash.replace("#/", "").replace("#", "");
  const page = value.split("/")[0];
  return pages[page] ? page : "dashboard";
}

function resolveRouteDetail() {
  return window.location.hash.replace("#/", "").replace("#", "").split("/")[1] || "";
}

export function App() {
  return <AppStoreProvider><AppContent /></AppStoreProvider>;
}

function AppContent() {
  const [current, setCurrent] = useState(resolveHash);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const lastBoardConnected = useRef(null);
  const runtimeRef = useRef(null);
  const { event, state, patch } = useAppStore();
  runtimeRef.current = state.runtime;
  useEffect(() => mockAdapters.agentStatus.subscribe(event, { emitCurrent: false }), [event]);
  useEffect(() => {
    if (!window.desktopBridge) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      voiceAdapters.desktop.registerShortcut(state.settings.voiceShortcut).then((result) => {
        if (!active || !result.reason) return;
        setToast(`快捷键未修改：${result.reason}；当前仍为 ${result.shortcut}`);
      }).catch(() => { if (active) setToast("无法连接桌面快捷键服务"); });
    }, 450);
    return () => { active = false; window.clearTimeout(timer); };
  }, [state.settings.voiceShortcut]);
  useEffect(() => {
    voiceAdapters.desktop.setTriggerConfig({ boardF22: state.settings.boardF22Enabled, rightAlt: state.settings.globalShortcutsEnabled && state.settings.rightAltEnabled, keyboardShortcuts: state.settings.globalShortcutsEnabled }).catch(() => {});
    voiceAdapters.desktop.setGlobalShortcutsEnabled(state.settings.globalShortcutsEnabled).catch(() => {});
  }, [state.settings.boardF22Enabled, state.settings.globalShortcutsEnabled, state.settings.rightAltEnabled]);
  useEffect(() => voiceAdapters.desktop.onVoiceToggle((detail) => {
    const source = detail.source || "global-shortcut";
    deviceEventBus.publish(createDeviceEvent("voice-toggle", source, { phase: detail.phase || null, shortcut: detail.shortcut || "", workflow: detail.workflow === "edit" ? "edit" : "input", selectionCaptured: Boolean(detail.selectionCaptured) }, { at: detail.at }));
  }), []);
  useEffect(() => voiceAdapters.desktop.onVoiceEditError((detail) => {
    const message = {
      "selection-empty": "没有检测到选中文字，请先选择一段文字再按语音编辑键",
      "selection-too-long": "选中文字过长，请缩小选择范围后重试",
      "selection-copy-timeout": "未能读取选中文字，请回到原窗口重新选择后重试",
      "target-window-changed": "输入窗口已变化，本次语音编辑已安全取消",
      "no-captured-target": "未能锁定原输入窗口，本次语音编辑已安全取消",
    }[detail?.reason] || "未能读取选中文字，本次语音编辑已安全取消";
    setToast(message);
  }), []);
  useEffect(() => voiceAdapters.desktop.onVoiceCancel((detail) => {
    deviceEventBus.publish(createDeviceEvent("voice-cancel", detail.source || "keyboard", {}, { at: detail.at }));
  }), []);
  useEffect(() => voiceAdapters.desktop.onKeyDiagnostic((detail) => {
    const source = detail.source || "desktop-input";
    deviceEventBus.publish(createDeviceEvent("key-diagnostic", source, { key: detail.key || "", action: detail.action || "", sequence: Number(detail.sequence) || null }, { at: detail.time || detail.at }));
  }), []);
  useEffect(() => voiceAdapters.desktop.onHostActionResult((result) => {
    if (result?.kind === "fixed-text") setToast(result?.ok ? `已输入固定文字（${result.bytes || 0} 字节）` : `固定文字输入失败：${result?.reason || "未知错误"}`);
    else if (result?.reason === "host-action-duplicate") return;
    else setToast(result?.ok ? `已打开 ${result.label || "应用"}` : `打开应用失败：${result?.reason || "未找到映射"}`);
  }), []);
  useEffect(() => {
    const updateBridge = (inputBridge) => {
      const runtime = runtimeRef.current || {};
      patch({ runtime: { ...runtime, inputBridge: { ...(runtime.inputBridge || {}), ...inputBridge } } });
      if (lastBoardConnected.current !== inputBridge.boardConnected) {
        lastBoardConnected.current = inputBridge.boardConnected;
        deviceEventBus.publish(createDeviceEvent("connection-change", "easyinput-hid", { connected: Boolean(inputBridge.boardConnected) }));
      }
    };
    voiceAdapters.desktop.capabilities().then((value) => { if (value.inputBridge) updateBridge(value.inputBridge); }).catch(() => {});
    return voiceAdapters.desktop.onInputBridgeStatus(updateBridge);
  }, [patch]);
  useEffect(() => {
    let active = true;
    const updateAudio = (value = {}) => {
      if (!active) return;
      const runtime = runtimeRef.current || {};
      patch({ runtime: { ...runtime, easyInputAudio: { ...(runtime.easyInputAudio || {}), ...value } } });
    };
    voiceAdapters.desktop.getEasyInputAudioStatus().then(updateAudio).catch(() => updateAudio({ available: false, configured: false, state: "desktop-bridge-unavailable", reason: "desktop-bridge-unavailable" }));
    const unsubscribe = voiceAdapters.desktop.onEasyInputAudioEvent(updateAudio);
    return () => { active = false; unsubscribe?.(); };
  }, [patch]);
  useEffect(() => {
    const bridge = globalThis.desktopBridge;
    if (!bridge?.onCompanionComputerAudioCommand || !bridge?.sendCompanionComputerAudioEvent) return undefined;
    const engine = createComputerCompanionAudioEngine({ bridge });
    const unsubscribe = bridge.onCompanionComputerAudioCommand((command) => { void engine.handleCommand(command); });
    void bridge.setCompanionComputerAudioReady?.(true);
    return () => {
      unsubscribe?.();
      void bridge.setCompanionComputerAudioReady?.(false);
      void engine.close();
    };
  }, []);
  useEffect(() => {
    let active = true;
    globalThis.desktopBridge?.getMemoryStatus?.().then((memory) => {
      if (!active || !memory) return;
      const runtime = runtimeRef.current || {};
      patch({ runtime: { ...runtime, memory } });
    }).catch(() => {});
    return () => { active = false; };
  }, [patch]);
  useEffect(() => {
    if (!globalThis.desktopBridge) return undefined;
    const updateCompanion = (value = {}) => {
      const runtime = runtimeRef.current || {};
      const current = runtime.companion || {};
      const next = { ...current };
      if (value.type === "state") {
        next.state = value.state || "error";
        next.active = !["idle", "error"].includes(next.state);
        next.sessionId = value.sessionId || next.sessionId || "";
        next.generation = Number(value.generation) || next.generation || 0;
        next.error = value.error || (next.state === "error" ? next.error : "");
        if (value.audioSource) next.audioSource = value.audioSource;
        if (value.audioSink) next.audioSink = value.audioSink;
        if (value.audioSelection) next.audioSelection = value.audioSelection;
        if (value.echoGuard) next.echoGuard = value.echoGuard;
        if (value.computerAudio) next.computerAudio = value.computerAudio;
        if (next.state === "idle") { next.transcript = ""; next.reply = ""; }
      } else if (["transcript.partial", "turn.user-final"].includes(value.type)) next.transcript = String(value.text || "").slice(-500);
      else if (["reply.partial", "turn.assistant-final"].includes(value.type)) next.reply = String(value.text || "").slice(-1000);
      else if (value.type === "audio.selection") next.audioSelection = { requestedSource: value.requestedSource || "computer", activeSource: value.activeSource || "computer", output: "computer", fallback: value.fallback || null };
      else Object.assign(next, value);
      patch({ runtime: { ...runtime, companion: next } });
    };
    globalThis.desktopBridge.getCompanionConversationStatus?.().then(updateCompanion).catch(() => {});
    return globalThis.desktopBridge.onCompanionConversationEvent?.(updateCompanion);
  }, [patch]);
  useEffect(() => voiceAdapters.desktop.onNavigate(({ route }) => {
    if (!pages[route]) return;
    window.location.hash = `/${route}`;
    setCurrent(route);
  }), []);
  useEffect(() => {
    const onHash = () => setCurrent(resolveHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const navigate = (page) => {
    window.location.hash = `/${page}`;
    setCurrent(page.split("/")[0]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const CurrentPage = pages[current] || DashboardPage;
  return (
    <div className={`app-shell ${collapsed ? "has-collapsed-sidebar" : ""}`}>
      <Sidebar current={current} navigate={navigate} collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} boardConnected={Boolean(state.runtime?.inputBridge?.boardConnected)} expressionId={state.currentExpression} />
      {mobileOpen && <button className="mobile-scrim" aria-label="关闭菜单" onClick={() => setMobileOpen(false)} />}
      <main className="app-main">
        <AppHeader current={current} setMobileOpen={setMobileOpen} />
        <div className="app-content">
          <div className={current === "voice" ? "" : "voice-workflow-host--hidden"}><VoicePage navigate={navigate} notify={setToast} /></div>
          {current !== "voice" && <CurrentPage navigate={navigate} notify={setToast} initialSection={resolveRouteDetail()} />}
        </div>
      </main>
      {toast && <div className="toast"><CircleCheck size={18} />{toast}</div>}
      <CompanionLiveBar conversation={state.runtime?.companion} />
      <div className="demo-watermark"><Sparkles size={14} />{state.runtime?.inputBridge?.boardConnected ? "EasyInput 真机桥已连接" : "软件核心已就绪 · 等待板子"}</div>
    </div>
  );
}
