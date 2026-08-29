const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, dialog, session, safeStorage, shell, Tray, Menu, nativeImage, screen } = require("electron");
const path = require("path");
const { fileURLToPath } = require("url");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
const fs = require("fs");
const os = require("os");
const { summarizeNetworkInterfaces } = require("./network-summary.cjs");
const { normalizeShortcut } = require("./shortcut.cjs");
const { InputBridgeManager } = require("./input-bridge.cjs");
const { transcribe: transcribeBailian } = require("./bailian.cjs");
const { organize: organizeBailian } = require("./bailian-organizer.cjs");
const { BailianRealtimeSession } = require("./bailian-realtime.cjs");
const { createSecureBailianStore } = require("./secure-bailian.cjs");
const { AppActionStore, HostActionExecutor } = require("./app-actions.cjs");
const { configFingerprint: stableConfigFingerprint, sanitizeKeyboardConfig: stableSanitizeKeyboardConfig, mergeKeyboardPatch: strictMergeKeyboardPatch, sanitizedDiff, checkHostCapabilities } = require("./config-merge.cjs");

const DEFAULT_SHORTCUT = "Ctrl+Shift+Space";
const DEFAULT_DEV_URL = "http://localhost:5173";
const APP_ROOT = path.resolve(__dirname, "..", "dist", "client");
const APP_ID = "com.deskmate.app";
const FOREGROUND_SCRIPT = "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class DeskMateForeground { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); }'; [DeskMateForeground]::GetForegroundWindow().ToInt64()";
const PASTE_SCRIPT = "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')";
const VOICE_STATES = new Set(["idle", "recording", "transcribing", "organizing", "outputting", "completed", "error", "cancelled"]);
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

let mainWindow;
let overlayWindow;
let tray;
let inputBridge;
let shortcut = DEFAULT_SHORTCUT;
let voiceSessionRecording = false;
let voiceTargetWindow = null;
let voiceTargetCaptureToken = 0;
let voiceTargetCapturePromise = Promise.resolve(null);
let bailianStore;
let appActionStore;
let hostActionExecutor;
let isQuitting = false;
let keyboardConfigState = { raw: null, fingerprint: "", source: 2, token: null };
let shortcutCaptureActive = false;
let lastVoiceState = { state: "idle", message: "准备就绪", transcript: "", seconds: 0, level: 0, floating: true };
let lastVoiceToggleAt = 0;
const activeBailianRequests = new Map();
const activeBailianOrganizers = new Map();
const activeRealtimeSessions = new Map();

function configFingerprint(value) {
  return stableConfigFingerprint(value);
}

function sanitizeKeyboardConfig(value) {
  return stableSanitizeKeyboardConfig(value, (id) => appActionStore?.describe(id));
}

function mergeKeyboardPatch(raw, patch) {
  return strictMergeKeyboardPatch(raw, patch);
  /* if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("配置修改格式无效");
  const merged = structuredClone(raw); const profile = Array.isArray(merged.profiles) && merged.profiles[0];
  if (!profile || typeof profile !== "object") throw new Error("配置缺少默认 Profile");
  if (patch.encoder && typeof patch.encoder === "object") {
    profile.encoder = profile.encoder || {}; profile.encoder.scroll = profile.encoder.scroll || {};
    const e = patch.encoder;
    for (const [source, target] of [["mode", "mode"], ["axis", "axis"], ["speed", "speed"], ["reverseVertical", "windows_reverse_vertical"], ["reverseHorizontal", "windows_reverse_horizontal"]]) if (e[source] !== undefined) profile.encoder.scroll[target] = e[source];
    if (e.press !== undefined) profile.encoder.press = typeof e.press === "string" ? e.press : e.press?.action || "disabled";
  }
  if (Array.isArray(patch.keymap)) {
    profile.keys = profile.keys || {};
    for (let index = 0; index < Math.min(8, patch.keymap.length); index += 1) {
      const item = patch.keymap[index]; if (!item || typeof item !== "object") continue; const action = item.action;
      if (["voice-input", "voice-edit", "select-all", "copy", "paste", "undo", "disabled"].includes(action)) profile.keys[`KEY${index + 1}`] = { ...(profile.keys[`KEY${index + 1}`] || {}), press: ({ "voice-input": "voice_ptt_hold", "voice-edit": "edit_ptt_hold", "select-all": "select_all", copy: "copy", paste: "paste", undo: "undo", disabled: "disabled" })[action] };
      else if (action === "enter" || action === "backspace" || action === "hotkey") profile.keys[`KEY${index + 1}`] = { ...(profile.keys[`KEY${index + 1}`] || {}), press: { hotkey: action === "enter" ? "Return" : action === "backspace" ? "Backspace" : String(item.shortcut || "") } };
    }
  }
  return merged; */
}
const smokeMode = process.argv.includes("--deskmate-smoke-test");
const bailianTestAudio = process.argv.find((value) => value.startsWith("--bailian-test-audio="))?.slice("--bailian-test-audio=".length) || "";
const bailianTestOrganizer = process.argv.find((value) => value.startsWith("--bailian-test-organizer="))?.slice("--bailian-test-organizer=".length) || "";
let smokeStage = 0;

if (smokeMode) {
  app.setPath("userData", path.join(app.getPath("temp"), `deskmate-smoke-${process.pid}`));
  app.commandLine.appendSwitch("use-fake-device-for-media-stream");
  app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
}

function getInputBridgeExecutable() {
  const name = "DeskMate.InputBridge.exe";
  return app.isPackaged
    ? path.join(process.resourcesPath, "input-bridge", name)
    : path.join(__dirname, "..", "native", "DeskMate.InputBridge", "publish", name);
}

function trayIcon() {
  return loadAppIcon("tray-icon.ico", "tray-icon.png", "deskmate-icon.png");
}

function appAssetPath(name) {
  return app.isPackaged ? path.join(process.resourcesPath, "app-assets", name) : path.join(__dirname, "assets", name);
}

function loadAppIcon(...candidates) {
  for (const name of candidates) {
    const image = nativeImage.createFromPath(appAssetPath(name));
    if (!image.isEmpty()) return image;
  }
  throw new Error(`DeskMate 图标资源不可用：${candidates.join(", ")}`);
}

function getDevUrl() {
  const candidate = process.env.DESKMATE_DEV_URL || DEFAULT_DEV_URL;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) return DEFAULT_DEV_URL;
    return url.href;
  } catch { return DEFAULT_DEV_URL; }
}

function isAllowedAppUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (process.argv.includes("--dev")) return url.origin === new URL(getDevUrl()).origin;
    if (url.protocol !== "file:") return false;
    const resolved = path.resolve(fileURLToPath(url));
    return resolved === path.join(APP_ROOT, "index.html") || resolved.startsWith(`${APP_ROOT}${path.sep}`);
  } catch { return false; }
}

function assertTrustedSender(event) {
  const senderUrl = event.senderFrame?.url || event.sender?.getURL?.() || "";
  if (!isAllowedAppUrl(senderUrl)) throw new Error("拒绝非 DeskMate 页面调用桌面能力");
}

function handleTrusted(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => { assertTrustedSender(event); return handler(...args); });
}

function runPowershell(script, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value) => { if (settled) return; settled = true; clearTimeout(timeout); resolve(value); };
    const timeout = setTimeout(() => { child.kill(); finish({ ok: false, reason: "powershell-timeout" }); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => finish({ ok: false, reason: error.message }));
    child.once("exit", (code) => finish(code === 0 ? { ok: true, value: stdout.trim() } : { ok: false, reason: stderr.trim() || `powershell-exit-${code}` }));
  });
}

async function getForegroundWindowId() {
  const result = await runPowershell(FOREGROUND_SCRIPT);
  return result.ok && /^\d+$/.test(result.value) ? result.value : null;
}

function sendToMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

async function emitVoiceToggle(source = "global-shortcut", label = shortcut) {
  const now = Date.now();
  if (now - lastVoiceToggleAt < 350) return { ignored: true, reason: "duplicate-trigger" };
  lastVoiceToggleAt = now;
  const phase = voiceSessionRecording ? "stop" : "start";
  if (phase === "start") {
    const captureToken = ++voiceTargetCaptureToken;
    voiceTargetWindow = null;
    voiceTargetCapturePromise = getForegroundWindowId().then((windowId) => {
      if (captureToken === voiceTargetCaptureToken) voiceTargetWindow = windowId;
      return windowId;
    }).catch(() => null);
  }
  voiceSessionRecording = phase === "start";
  const at = new Date().toISOString();
  const payload = { source, shortcut: label, phase, targetCaptured: Boolean(voiceTargetWindow), at };
  sendToMain("key-diagnostic", { source, key: label, action: "release", at });
  sendToMain("voice-toggle", payload);
  return payload;
}

function emitVoiceCancel(source = "keyboard") {
  voiceSessionRecording = false;
  voiceTargetCaptureToken += 1;
  voiceTargetWindow = null;
  voiceTargetCapturePromise = Promise.resolve(null);
  sendToMain("voice-cancel", { source, at: new Date().toISOString() });
}

function registerShortcut(nextShortcut = shortcut) {
  let candidate;
  try { candidate = normalizeShortcut(nextShortcut || DEFAULT_SHORTCUT); }
  catch (error) { return { registered: globalShortcut.isRegistered(shortcut), shortcut, reason: error.message }; }
  if (candidate === shortcut && globalShortcut.isRegistered(shortcut)) return { registered: true, shortcut };
  let registered = false;
  try { registered = globalShortcut.register(candidate, () => { void emitVoiceToggle("fallback-shortcut", candidate); }); }
  catch (error) { return { registered: globalShortcut.isRegistered(shortcut), shortcut, reason: error.message }; }
  if (!registered) return { registered: globalShortcut.isRegistered(shortcut), shortcut, reason: "shortcut-unavailable" };
  const previous = shortcut;
  shortcut = candidate;
  shortcutCaptureActive = false;
  if (previous !== candidate) globalShortcut.unregister(previous);
  return { registered: true, shortcut };
}

function setShortcutCapture(active) {
  shortcutCaptureActive = Boolean(active);
  if (shortcutCaptureActive) {
    if (globalShortcut.isRegistered(shortcut)) globalShortcut.unregister(shortcut);
    return { ok: true, active: true, shortcut };
  }
  if (globalShortcut.isRegistered(shortcut)) return { ok: true, active: false, shortcut };
  const result = registerShortcut(shortcut);
  return { ok: Boolean(result.registered), active: false, shortcut: result.shortcut, reason: result.reason };
}

async function pasteIntoCapturedWindow(text) {
  const value = String(text || "");
  if (!value || value.length > 100000) return { ok: false, reason: "invalid-text" };
  if (!voiceTargetWindow) await voiceTargetCapturePromise;
  if (!voiceTargetWindow) return { ok: false, reason: "no-captured-target" };
  const currentWindow = await getForegroundWindowId();
  if (!currentWindow || currentWindow !== voiceTargetWindow) return { ok: false, reason: "target-window-changed" };
  clipboard.writeText(value);
  const result = await runPowershell(PASTE_SCRIPT);
  if (result.ok) voiceTargetWindow = null;
  return result.ok ? { ok: true, mode: "active-window" } : result;
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 520,
    height: 58,
    frame: false,
    transparent: true,
    resizable: false,
    show: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: { preload: path.join(__dirname, "overlay-preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  overlayWindow.setAlwaysOnTop(true, "floating");
  overlayWindow.setIgnoreMouseEvents(true);
  const html = "<!doctype html><html><head><meta charset='utf-8'><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; style-src 'unsafe-inline'\"><style>html,body{margin:0;background:transparent;font-family:'Segoe UI','Microsoft YaHei',sans-serif;color:#f7fbff;overflow:hidden}.shell{box-sizing:border-box;height:46px;margin:6px;padding:0 10px 0 12px;border:1px solid rgba(102,205,238,.38);border-radius:14px;background:rgba(22,31,44,.84);box-shadow:0 8px 22px rgba(8,20,36,.18);backdrop-filter:blur(16px);display:flex;align-items:center;gap:10px}.state-dot{width:7px;height:7px;flex:0 0 auto;border-radius:50%;background:#44c7eb;box-shadow:0 0 0 3px rgba(68,199,235,.12)}.recording .state-dot{animation:pulse 1.2s ease-out infinite}.error .state-dot{background:#ff7b83}.completed .state-dot{background:#5bd5ae}.wave{width:62px;height:22px;display:flex;align-items:center;justify-content:center;gap:2px;flex:0 0 auto}.wave i{display:block;width:2px;height:var(--h);border-radius:2px;background:#58d4ee;opacity:.9;transition:height .12s ease}.copy{min-width:0;flex:1;color:#fff;font-size:12px;white-space:nowrap;overflow:hidden}.copy.placeholder{color:#9babbc}.copy .lead{color:#8ea1b5}.meter{width:42px;text-align:right;color:#65d7ef;font-size:11px;font-variant-numeric:tabular-nums}.escape{height:22px;padding-left:8px;border-left:1px solid rgba(255,255,255,.11);display:flex;align-items:center;color:#8fa1b3;font-size:9px;white-space:nowrap}@keyframes pulse{70%{box-shadow:0 0 0 7px rgba(68,199,235,0)}100%{box-shadow:0 0 0 0 rgba(68,199,235,0)}}</style></head><body><div id='root'></div></body></html>";
  overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function positionAndShowOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const area = screen.getPrimaryDisplay().workArea;
  const [width, height] = overlayWindow.getSize();
  overlayWindow.setPosition(Math.round(area.x + (area.width - width) / 2), area.y + area.height - height - 18, false);
  overlayWindow.showInactive();
}

function updateVoiceState(value = {}) {
  const state = VOICE_STATES.has(value.state) ? value.state : "error";
  lastVoiceState = {
    state,
    message: String(value.message || "").slice(0, 240),
    transcript: String(value.transcript || "").slice(-500),
    seconds: Math.max(0, Math.min(36000, Number(value.seconds) || 0)),
    level: Math.max(0, Math.min(100, Number(value.level) || 0)),
    floating: value.floating !== false,
  };
  voiceSessionRecording = state === "recording";
  overlayWindow?.webContents.send("voice-state", lastVoiceState);
  if (!lastVoiceState.floating || ["idle"].includes(state)) overlayWindow?.hide();
  else {
    positionAndShowOverlay();
    if (["completed", "error", "cancelled"].includes(state)) setTimeout(() => { if (lastVoiceState.state === state) overlayWindow?.hide(); }, 1800);
  }
  refreshTrayMenu();
  return { ok: true, state };
}

function showMain(route) {
  if (!mainWindow) createWindow();
  mainWindow.show();
  mainWindow.restore();
  if (route) sendToMain("desktop-navigate", { route });
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开 DeskMate", click: () => showMain() },
    { label: voiceSessionRecording ? "停止语音输入" : "开始语音输入", click: () => { void emitVoiceToggle("system-tray", "Tray"); } },
    { label: "设置与诊断", click: () => showMain("settings") },
    { type: "separator" },
    { label: "退出", click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip("DeskMate 语音输入");
  tray.on("click", () => showMain());
  tray.on("double-click", () => showMain());
  refreshTrayMenu();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 1024,
    minWidth: 960,
    minHeight: 680,
    icon: loadAppIcon("tray-icon.ico", "deskmate-icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  if (process.argv.includes("--dev")) mainWindow.loadURL(getDevUrl());
  else mainWindow.loadFile(path.join(APP_ROOT, "index.html"));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => { if (!isAllowedAppUrl(url)) event.preventDefault(); });
  mainWindow.webContents.on("did-finish-load", () => {
    sendToMain("input-bridge-status", inputBridge?.snapshot() || { available: false, process: "unsupported", boardConnected: false });
    if (smokeStage === 0) void runSmokeTest(); else if (smokeStage === 1) void finishSmokeTest();
  });
  mainWindow.on("close", (event) => {
    if (isQuitting || smokeMode) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

function startInputBridge() {
  if (process.platform !== "win32") return;
  const executable = getInputBridgeExecutable();
  if (!fs.existsSync(executable)) {
    sendToMain("input-bridge-status", { available: false, process: "missing", boardConnected: false, error: "input-bridge-not-built" });
    return;
  }
  inputBridge = new InputBridgeManager({ executable });
  inputBridge.on("status", (value) => sendToMain("input-bridge-status", value));
  inputBridge.on("diagnostic", (event) => sendToMain("key-diagnostic", event));
  inputBridge.on("trigger", (event) => { sendToMain("key-diagnostic", event); void emitVoiceToggle(event.source, event.key); });
  inputBridge.on("cancel", (event) => { sendToMain("key-diagnostic", event); emitVoiceCancel(event.source); });
  inputBridge.on("host-action", async (event) => {
    const result = await hostActionExecutor.execute(event.hostActionId);
    sendToMain("host-action-result", { kind: "open-app", ...result, at: new Date().toISOString() });
  });
  inputBridge.on("fixed-text", async (event) => {
    const blockedWindowHandles = [mainWindow, overlayWindow].filter(Boolean).map((window) => {
      const value = window.getNativeWindowHandle();
      return (value.length >= 8 ? value.readBigUInt64LE(0) : BigInt(value.readUInt32LE(0))).toString();
    });
    const result = await inputBridge.injectFixedText(event.requestId, { blockedProcessId: process.pid, blockedWindowHandles });
    sendToMain("host-action-result", { kind: "fixed-text", ...result, at: new Date().toISOString() });
  });
  inputBridge.start();
}

async function runSmokeTest() {
  if (!smokeMode || smokeStage !== 0) return;
  smokeStage = 1;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await mainWindow.webContents.executeJavaScript(`localStorage.setItem("deskmate.app-state", JSON.stringify({ schemaVersion: 6, settings: { keyDiagnosticsEnabled: true, simulatorEnabled: true, sttMode: "mock", outputMode: "clipboard", activeWindowOutputEnabled: false, formatting: "raw" } })); location.hash = "/dashboard"; location.reload();`);
}

async function finishSmokeTest() {
  if (!smokeMode || smokeStage !== 1) return;
  smokeStage = 2;
  await new Promise((resolve) => setTimeout(resolve, 800));
  await emitVoiceToggle("smoke-test", shortcut);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await emitVoiceToggle("smoke-test", shortcut);
  await new Promise((resolve) => setTimeout(resolve, 2800));
  const report = await mainWindow.webContents.executeJavaScript(`(() => { const state = JSON.parse(localStorage.getItem("deskmate.app-state") || "{}"); return { historyText: state.history?.[0]?.text || "", route: location.hash, sttMode: state.settings?.sttMode || "missing", simulatorEnabled: Boolean(state.settings?.simulatorEnabled), sttStatus: state.diagnostics?.stt?.status || "missing", sttProvider: state.diagnostics?.stt?.provider || "missing" }; })()`);
  report.clipboardText = clipboard.readText();
  report.ok = Boolean(report.historyText && report.clipboardText === report.historyText && report.route === "#/dashboard");
  const resultPath = process.env.DESKMATE_SMOKE_RESULT;
  if (resultPath && path.extname(resultPath).toLowerCase() === ".json") fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
  app.exit(report.ok ? 0 : 1);
}

async function runBailianConnectionTest(audioPath) {
  const resultPath = process.env.DESKMATE_BAILIAN_TEST_RESULT;
  const report = { ok: false };
  try {
    const resolved = path.resolve(audioPath);
    const extension = path.extname(resolved).toLowerCase();
    if (![".wav", ".webm"].includes(extension)) throw new Error("测试音频只允许 WAV 或 WebM");
    const audio = fs.readFileSync(resolved);
    const result = await transcribeBailian({ ...bailianStore.loadSecret(), audio, mimeType: extension === ".wav" ? "audio/wav" : "audio/webm" });
    Object.assign(report, { ok: true, characters: result.text.length, language: result.language, emotion: result.emotion, requestId: result.requestId });
  } catch (error) { report.error = String(error?.message || error || "unknown-error").replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]"); }
  if (resultPath && path.extname(resultPath).toLowerCase() === ".json") fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
  app.exit(report.ok ? 0 : 1);
}

async function runBailianOrganizerTest(text) {
  const resultPath = process.env.DESKMATE_BAILIAN_ORGANIZER_TEST_RESULT;
  const report = { ok: false, model: "qwen3.7-flash" };
  try {
    const source = String(text || "").trim().slice(0, 1000);
    if (!source) throw new Error("测试文字不能为空");
    const result = await organizeBailian({ ...bailianStore.loadSecret(), text: source, mode: "smart", model: "qwen3.7-flash" });
    Object.assign(report, { ok: true, charactersIn: source.length, charactersOut: result.text.length, changed: result.text !== source, durationMs: result.durationMs, status: result.status });
  } catch (error) {
    const message = String(error?.message || error || "unknown-error").replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]");
    report.errorType = /超时|timeout/i.test(message) ? "timeout" : /API Key|密钥|配置/i.test(message) ? "configuration" : "request-failed";
  }
  if (resultPath && path.extname(resultPath).toLowerCase() === ".json") fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
  app.exit(report.ok ? 0 : 1);
}

app.whenReady().then(async () => {
  app.setAppUserModelId(APP_ID);
  bailianStore = createSecureBailianStore({ safeStorage, userDataPath: app.getPath("userData") });
  appActionStore = new AppActionStore({ userDataPath: app.getPath("userData"), dialog, shell });
  hostActionExecutor = new HostActionExecutor({ store: appActionStore });
  if (bailianTestAudio) { await runBailianConnectionTest(bailianTestAudio); return; }
  if (bailianTestOrganizer) { await runBailianOrganizerTest(bailianTestOrganizer); return; }
  createWindow();
  createOverlayWindow();
  createTray();
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(permission === "media" && isAllowedAppUrl(webContents.getURL())));
  handleTrusted("desktop:get-capabilities", () => { const bridge = inputBridge?.snapshot() || { available: false, process: process.platform === "win32" ? "missing" : "unsupported", boardConnected: false, configCapabilities: null }; return { supported: true, platform: process.platform, shortcut, shortcutRegistered: globalShortcut.isRegistered(shortcut), shortcutCaptureActive, keyboardConfigSync: { available: Boolean(bridge.configCapabilities), transport: "vendor-hid-0x10", read: "vendor-hid-0x13", config_read_v1: Boolean(bridge.configCapabilities?.config_read_v1), config_write_v1: Boolean(bridge.configCapabilities?.config_write_v1), host_action_v1: Boolean(bridge.configCapabilities?.host_action_v1), fixed_text_v1: Boolean(bridge.configCapabilities?.fixed_text_v1) }, inputBridge: bridge }; });
  handleTrusted("desktop:get-network-summary", () => summarizeNetworkInterfaces(os.networkInterfaces()));
  handleTrusted("desktop:register-shortcut", (value) => registerShortcut(value));
  handleTrusted("desktop:set-shortcut-capture", (value) => setShortcutCapture(value));
  handleTrusted("desktop:list-applications", () => appActionStore.discover());
  handleTrusted("desktop:register-application", (token) => appActionStore.registerDiscovered(token));
  handleTrusted("desktop:choose-application", () => appActionStore.choose(mainWindow));
  handleTrusted("desktop:test-application", (id) => appActionStore.execute(id));
  handleTrusted("desktop:sync-keyboard-config", () => ({ ok: false, reason: "config-write-requires-preview-and-confirmation" }));
  handleTrusted("desktop:read-keyboard-config", async () => {
    const result = await inputBridge?.readConfig?.() || { ok: false, reason: "input-bridge-unavailable" };
    if (!result.ok) return result;
    let raw; try { raw = JSON.parse(result.json); } catch { return { ok: false, reason: "config-json-invalid" }; }
    if (raw.schema !== "ai_keyboard.v1") return { ok: false, reason: "config-schema-invalid" };
    keyboardConfigState = { raw, fingerprint: configFingerprint(raw), source: result.source, token: null };
    return { ok: true, config: sanitizeKeyboardConfig(raw), source: result.source, fingerprint: keyboardConfigState.fingerprint };
  });
  handleTrusted("desktop:preview-keyboard-config-patch", async (patch) => {
    const fresh = await inputBridge?.readConfig?.();
    if (!fresh?.ok) return { ok: false, reason: "config-device-disconnected" };
    let current; try { current = JSON.parse(fresh.json); } catch { return { ok: false, reason: "config-json-invalid" }; }
    if (current.schema !== "ai_keyboard.v1") return { ok: false, reason: "config-schema-invalid" };
    keyboardConfigState = { raw: current, fingerprint: configFingerprint(current), source: fresh.source, token: null };
    let merged; try { merged = mergeKeyboardPatch(current, patch); } catch (error) { return { ok: false, reason: error.message }; }
    const capabilityGate = checkHostCapabilities(merged, inputBridge?.snapshot()?.configCapabilities);
    if (!capabilityGate.ok) return capabilityGate;
    const token = randomUUID(); keyboardConfigState.token = { value: token, expires: Date.now() + 60000, fingerprint: keyboardConfigState.fingerprint, merged };
    return { ok: true, token, expiresInMs: 60000, fingerprint: keyboardConfigState.fingerprint, config: sanitizeKeyboardConfig(merged), diff: sanitizedDiff(current, merged, (id) => appActionStore?.describe(id)) };
  });
  handleTrusted("desktop:commit-keyboard-config", async (token) => {
    const pending = keyboardConfigState.token;
    if (!pending || token !== pending.value || Date.now() > pending.expires) return { ok: false, reason: "config-confirmation-expired" };
    keyboardConfigState.token = null;
    const fresh = await inputBridge?.readConfig?.(); if (!fresh?.ok) return { ok: false, reason: "config-device-disconnected" };
    let current; try { current = JSON.parse(fresh.json); } catch { return { ok: false, reason: "config-json-invalid" }; }
    if (configFingerprint(current) !== pending.fingerprint) return { ok: false, reason: "config-changed-concurrently" };
    const capabilityGate = checkHostCapabilities(pending.merged, inputBridge?.snapshot()?.configCapabilities);
    if (!capabilityGate.ok) return capabilityGate;
    const written = await inputBridge.syncConfig(pending.merged); if (!written?.ok) return written;
    const readback = await inputBridge.readConfig(); if (!readback?.ok) return { ok: false, reason: "config-readback-failed" };
    let readbackJson; try { readbackJson = JSON.parse(readback.json); } catch { return { ok: false, reason: "config-readback-invalid" }; }
    if (configFingerprint(readbackJson) !== configFingerprint(pending.merged)) return { ok: false, reason: "config-readback-mismatch" };
    keyboardConfigState = { raw: readbackJson, fingerprint: configFingerprint(readbackJson), source: readback.source, token: null };
    return { ok: true, source: readback.source, fingerprint: keyboardConfigState.fingerprint };
  });
  handleTrusted("desktop:set-trigger-config", (value) => ({ ok: true, config: inputBridge?.configure(value || {}) || { boardF22: true, rightAlt: false } }));
  handleTrusted("desktop:set-voice-recording", (recording) => { voiceSessionRecording = Boolean(recording); refreshTrayMenu(); return { ok: true, recording: voiceSessionRecording }; });
  handleTrusted("desktop:set-voice-state", (value) => updateVoiceState(value));
  handleTrusted("desktop:clipboard-write", (value) => { const text = String(value || ""); if (text.length > 100000) return { ok: false, reason: "text-too-long" }; clipboard.writeText(text); return { ok: true, mode: "clipboard" }; });
  handleTrusted("desktop:paste-active-window", (text) => pasteIntoCapturedWindow(text));
  handleTrusted("desktop:key-diagnostic", (value) => ({ ok: true, event: value }));
  handleTrusted("bailian:get-status", () => bailianStore.status());
  handleTrusted("bailian:save-credentials", (value) => bailianStore.save(value || {}));
  handleTrusted("bailian:clear-credentials", () => bailianStore.clear());
  handleTrusted("bailian:transcribe", async (value = {}) => {
    const secret = bailianStore.loadSecret();
    const audio = value.audio instanceof ArrayBuffer ? Buffer.from(value.audio) : Buffer.from(value.audio || []);
    const requestId = typeof value.requestId === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(value.requestId) ? value.requestId : `asr-${Date.now()}`;
    const controller = new AbortController();
    activeBailianRequests.set(requestId, controller);
    try { return await transcribeBailian({ ...secret, audio, mimeType: value.mimeType, signal: controller.signal }); }
    finally { activeBailianRequests.delete(requestId); }
  });
  handleTrusted("bailian:cancel", (requestId) => { const controller = activeBailianRequests.get(String(requestId || "")); if (!controller) return { ok: false, reason: "request-not-active" }; controller.abort(); return { ok: true }; });
  handleTrusted("bailian:organize", async (value = {}) => {
    const secret = bailianStore.loadSecret();
    const requestId = typeof value.requestId === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(value.requestId) ? value.requestId : `organizer-${Date.now()}`;
    const controller = new AbortController();
    activeBailianOrganizers.set(requestId, controller);
    try {
      return await organizeBailian({
        ...secret,
        model: "qwen3.7-flash",
        text: value.text,
        mode: value.mode,
        hotwords: value.hotwords,
        rules: value.rules,
        customRule: value.customRule,
        signal: controller.signal,
      });
    } finally { activeBailianOrganizers.delete(requestId); }
  });
  handleTrusted("bailian:cancel-organize", (requestId) => { const controller = activeBailianOrganizers.get(String(requestId || "")); if (!controller) return { ok: false, reason: "request-not-active" }; controller.abort(); return { ok: true }; });
  handleTrusted("bailian:realtime-start", async () => {
    const sessionId = `realtime-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const realtime = new BailianRealtimeSession({
      ...bailianStore.loadSecret(),
      onEvent: (event) => {
        sendToMain("bailian-realtime-event", { sessionId, ...event });
        if (["closed", "finished"].includes(event.kind)) activeRealtimeSessions.delete(sessionId);
      },
    });
    activeRealtimeSessions.set(sessionId, realtime);
    try { await realtime.start(); return { ok: true, sessionId }; }
    catch (error) { activeRealtimeSessions.delete(sessionId); realtime.cancel(); throw error; }
  });
  handleTrusted("bailian:realtime-append", (value = {}) => {
    const realtime = activeRealtimeSessions.get(String(value.sessionId || ""));
    if (!realtime) return { ok: false, reason: "session-not-active" };
    const audio = value.audio instanceof ArrayBuffer ? Buffer.from(value.audio) : Buffer.from(value.audio || []);
    return { ok: realtime.append(audio) };
  });
  handleTrusted("bailian:realtime-finish", (sessionId) => ({ ok: activeRealtimeSessions.get(String(sessionId || ""))?.finish() || false }));
  handleTrusted("bailian:realtime-cancel", (sessionId) => {
    const key = String(sessionId || "");
    const realtime = activeRealtimeSessions.get(key);
    if (!realtime) return { ok: false, reason: "session-not-active" };
    realtime.cancel(); activeRealtimeSessions.delete(key); return { ok: true };
  });
  registerShortcut(DEFAULT_SHORTCUT);
  startInputBridge();
  app.on("activate", () => showMain());
  app.on("second-instance", () => showMain());
});

app.on("before-quit", () => { isQuitting = true; inputBridge?.stop(); activeBailianRequests.forEach((controller) => controller.abort()); activeBailianRequests.clear(); activeBailianOrganizers.forEach((controller) => controller.abort()); activeBailianOrganizers.clear(); activeRealtimeSessions.forEach((realtime) => realtime.cancel()); activeRealtimeSessions.clear(); });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => { if (process.platform === "darwin" && !isQuitting) return; });
