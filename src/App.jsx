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
import { createCompanionStopAction } from "./domain/companionStop.js";
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
  const { event, state, patch, mergeRuntime, updateCompanion } = useAppStore();
  const stopActionRef = useRef(null);
  if (!stopActionRef.current) stopActionRef.current = createCompanionStopAction({ getBridge: () => globalThis.desktopBridge, updateCompanion });
  const stopCompanion = stopActionRef.current.stop;
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
    else if (result?.kind === "companion-call") {
      if (result?.reason === "host-action-duplicate") return;
      const success = { "start-listening": "已开始陪伴并进入倾听", "listening-reset": "正在倾听，空闲计时已重置", "interrupt-listen": "已打断回答并继续倾听" }[result?.action];
      setToast(result?.ok ? success || "AI 陪伴呼唤已响应" : result?.reason === "companion-call-busy" ? "陪伴会话正在切换，请稍候" : `AI 陪伴呼唤失败：${result?.reason || "未知错误"}`);
    }
    else if (result?.reason === "host-action-duplicate") return;
    else setToast(result?.ok ? `已打开 ${result.label || "应用"}` : `打开应用失败：${result?.reason || "未找到映射"}`);
  }), []);
  useEffect(() => {
    const updateBridge = (inputBridge) => {
      mergeRuntime("inputBridge", inputBridge);
      if (lastBoardConnected.current !== inputBridge.boardConnected) {
        lastBoardConnected.current = inputBridge.boardConnected;
        deviceEventBus.publish(createDeviceEvent("connection-change", "easyinput-hid", { connected: Boolean(inputBridge.boardConnected) }));
      }
    };
    voiceAdapters.desktop.capabilities().then((value) => { if (value.inputBridge) updateBridge(value.inputBridge); }).catch(() => {});
    return voiceAdapters.desktop.onInputBridgeStatus(updateBridge);
  }, [mergeRuntime]);
  useEffect(() => {
    let active = true;
    const updateAudio = (value = {}) => {
      if (!active) return;
      mergeRuntime("easyInputAudio", value);
    };
    voiceAdapters.desktop.getEasyInputAudioStatus().then(updateAudio).catch(() => updateAudio({ available: false, configured: false, state: "desktop-bridge-unavailable", reason: "desktop-bridge-unavailable" }));
    const unsubscribe = voiceAdapters.desktop.onEasyInputAudioEvent(updateAudio);
    return () => { active = false; unsubscribe?.(); };
  }, [mergeRuntime]);
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
      mergeRuntime("memory", memory);
    }).catch(() => {});
    return () => { active = false; };
  }, [mergeRuntime]);
  useEffect(() => {
    if (!globalThis.desktopBridge) return undefined;
    globalThis.desktopBridge.getCompanionConversationStatus?.().then(updateCompanion).catch(() => {});
    return globalThis.desktopBridge.onCompanionConversationEvent?.(updateCompanion);
  }, [updateCompanion]);
  useEffect(() => {
    let active = true;
    voiceAdapters.desktop.getCodexTaskBriefStatus().then((value) => { if (active) mergeRuntime("codexTasks", value); }).catch(() => {});
    const unsubscribeStatus = voiceAdapters.desktop.onCodexTaskBriefStatus((value) => mergeRuntime("codexTasks", value));
    const unsubscribeAnnouncement = voiceAdapters.desktop.onCodexTaskBriefAnnouncement((value) => {
      const text = String(value?.text || "").slice(0, 240);
      if (!text) return;
      setToast(text);
      if (value?.speak === true && "speechSynthesis" in window && typeof globalThis.SpeechSynthesisUtterance === "function") {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "zh-CN";
        window.speechSynthesis.speak(utterance);
      }
    });
    return () => { active = false; unsubscribeStatus?.(); unsubscribeAnnouncement?.(); };
  }, [mergeRuntime]);
  useEffect(() => {
    let active = true;
    voiceAdapters.desktop.getCompanionPreferences().then((value) => {
      if (!active || !value?.preferences) return;
      patch({ settings: { ...state.settings, companionName: value.preferences.name, companionWakePhrase: value.preferences.wakePhrase, companionEndSmoothWindowMs: value.preferences.endSmoothWindowMs, companionIdleTimeoutMs: value.preferences.idleTimeoutMs } });
      updateCompanion({ preferences: value.preferences, savedPreferences: { revision: value.revision, endSmoothWindowMs: value.preferences.endSmoothWindowMs, idleTimeoutMs: value.preferences.idleTimeoutMs }, wakeWord: value.wakeWord });
    }).catch(() => {});
    return () => { active = false; };
  }, [patch, updateCompanion]);
  useEffect(() => {
    voiceAdapters.desktop.setCompanionStartOptions({ microphoneSource: state.settings.microphoneSource, microphoneId: state.settings.microphoneId }).catch(() => {});
  }, [state.settings.microphoneSource, state.settings.microphoneId]);
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
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || !state.runtime?.companion?.active) return;
      event.preventDefault();
      void stopCompanion("escape");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.runtime?.companion?.active, stopCompanion]);
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
          {current !== "voice" && <CurrentPage navigate={navigate} notify={setToast} initialSection={resolveRouteDetail()} stopCompanion={stopCompanion} />}
        </div>
      </main>
      {toast && <div className="toast"><CircleCheck size={18} />{toast}</div>}
      <div className="demo-watermark"><Sparkles size={14} />{state.runtime?.inputBridge?.boardConnected ? "EasyInput 真机桥已连接" : "软件核心已就绪 · 等待板子"}</div>
    </div>
  );
}
