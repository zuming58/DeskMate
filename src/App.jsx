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
  IconMessageCircle as MessageCircle,
  IconMicrophone2 as Microphone2,
  IconSparkles as Sparkles,
  IconX as X,
} from "@tabler/icons-react";
import { pageMeta } from "./appData.js";
import { AppStoreProvider, useAppStore } from "./store/appStore.js";
import { mockAdapters } from "./adapters/index.js";
import { voiceAdapters } from "./adapters/voiceAdapters.js";
import { createDeviceEvent, deviceEventBus } from "./domain/deviceEvents.js";
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

const DEVICE_FACE_URL = `${import.meta.env.BASE_URL}assets/deskmate-face-large-eyes.png`;

const navigation = [
  { id: "dashboard", label: "工作台", icon: LayoutDashboard },
  { id: "voice", label: "语音输入", icon: Microphone2 },
  { id: "companion", label: "陪伴", icon: MessageCircle },
  { id: "history", label: "历史记录", icon: BookOpen },
  { id: "vocabulary", label: "词库", icon: Brain },
  { id: "keymap", label: "按键配置", icon: Keyboard },
];

function BrandMark() {
  return <span className="brand-mark"><img src={DEVICE_FACE_URL} alt="" /></span>;
}

function Sidebar({ current, navigate, collapsed, setCollapsed, mobileOpen, setMobileOpen, boardConnected }) {
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
        <div className="device-card__screen"><img src={DEVICE_FACE_URL} alt="DeskMate 设备" /></div>
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
        <span className="app-date">8月29日 · 周六</span>
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
  return pages[value] ? value : "dashboard";
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
    voiceAdapters.desktop.setTriggerConfig({ boardF22: state.settings.boardF22Enabled, rightAlt: state.settings.rightAltEnabled }).catch(() => {});
  }, [state.settings.boardF22Enabled, state.settings.rightAltEnabled]);
  useEffect(() => voiceAdapters.desktop.onVoiceToggle((detail) => {
    const source = detail.source || "global-shortcut";
    deviceEventBus.publish(createDeviceEvent("voice-toggle", source, { phase: detail.phase || null, shortcut: detail.shortcut || "" }, { at: detail.at }));
  }), []);
  useEffect(() => voiceAdapters.desktop.onVoiceCancel((detail) => {
    deviceEventBus.publish(createDeviceEvent("voice-cancel", detail.source || "keyboard", {}, { at: detail.at }));
  }), []);
  useEffect(() => voiceAdapters.desktop.onKeyDiagnostic((detail) => {
    const source = detail.source || "desktop-input";
    deviceEventBus.publish(createDeviceEvent("key-diagnostic", source, { key: detail.key || "", action: detail.action || "", sequence: Number(detail.sequence) || null }, { at: detail.time || detail.at }));
  }), []);
  useEffect(() => voiceAdapters.desktop.onHostActionResult((result) => {
    setToast(result?.ok ? `已打开 ${result.label || "应用"}` : `打开应用失败：${result?.reason || "未找到映射"}`);
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
    setCurrent(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const CurrentPage = pages[current] || DashboardPage;
  return (
    <div className={`app-shell ${collapsed ? "has-collapsed-sidebar" : ""}`}>
      <Sidebar current={current} navigate={navigate} collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} boardConnected={Boolean(state.runtime?.inputBridge?.boardConnected)} />
      {mobileOpen && <button className="mobile-scrim" aria-label="关闭菜单" onClick={() => setMobileOpen(false)} />}
      <main className="app-main">
        <AppHeader current={current} setMobileOpen={setMobileOpen} />
        <div className="app-content">
          <div className={current === "voice" ? "" : "voice-workflow-host--hidden"}><VoicePage navigate={navigate} notify={setToast} /></div>
          {current !== "voice" && <CurrentPage navigate={navigate} notify={setToast} />}
        </div>
      </main>
      {toast && <div className="toast"><CircleCheck size={18} />{toast}</div>}
      <div className="demo-watermark"><Sparkles size={14} />{state.runtime?.inputBridge?.boardConnected ? "EasyInput 真机桥已连接" : "软件核心已就绪 · 等待板子"}</div>
    </div>
  );
}
