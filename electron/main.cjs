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
const { createSecureAiServiceStore } = require("./secure-ai-services.cjs");
const { CompanionMemoryStore } = require("./companion-memory.cjs");
const { CompanionMemoryControl } = require("./companion-memory-control.cjs");
const { createKnowledgeBaseSettings } = require("./knowledge-base-settings.cjs");
const { CompanionConversationController } = require("./companion-conversation.cjs");
const { PrestartFallbackCompanionAudioSource } = require("./companion-audio.cjs");
const { ComputerCompanionAudioSession } = require("./companion-computer-audio.cjs");
const { EasyInputLanAudioSource } = require("./easyinput-audio-source.cjs");
const { EasyInputAudioManager } = require("./easyinput-audio-manager.cjs");
const { EasyInputVoiceRecorder } = require("./easyinput-voice-recorder.cjs");
const { DoubaoRealtimeSession } = require("./doubao-realtime.cjs");
const { finishForegroundSession, initialForegroundSession, startForegroundSession } = require("./foreground-session.cjs");
const { AppActionStore, HostActionExecutor } = require("./app-actions.cjs");
const { configFingerprint: stableConfigFingerprint, sanitizeKeyboardConfig: stableSanitizeKeyboardConfig, mergeKeyboardPatch: strictMergeKeyboardPatch, sanitizedDiff, checkHostCapabilities } = require("./config-merge.cjs");
const { completeConfigWrite } = require("./config-readback.cjs");
const { PASTE_CAPTURED_WINDOW_SCRIPT, pasteIntoCapturedWindow: pasteToCapturedWindow } = require("./active-window-output.cjs");
const { COPY_SELECTION_SCRIPT, captureSelectedText } = require("./selection-capture.cjs");
const { editSelectedText: editSelectedTextWithBailian } = require("./voice-edit.cjs");
const { isVoiceActivityActive } = require("./voice-trigger-state.cjs");
const { AgentStatePublisher } = require("./agent-state-hid.cjs");
const { LinkRecoveryGate } = require("./link-recovery.cjs");
const { CodexHookStateServer } = require("./codex-hook-state.cjs");

const DEFAULT_SHORTCUT = "Ctrl+Shift+Space";
const DEFAULT_EDIT_SHORTCUT = "Ctrl+Shift+E";
const DEFAULT_DEV_URL = "http://localhost:5173";
const APP_ROOT = path.resolve(__dirname, "..", "dist", "client");
const APP_ID = "com.deskmate.app";
const FOREGROUND_SCRIPT = "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class DeskMateForeground { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); }'; [DeskMateForeground]::GetForegroundWindow().ToInt64()";
const VOICE_STATES = new Set(["idle", "recording", "transcribing", "organizing", "outputting", "completed", "error", "cancelled"]);
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

let mainWindow;
let overlayWindow;
let tray;
let inputBridge;
let shortcut = DEFAULT_SHORTCUT;
let editShortcutRegistered = false;
let globalKeyboardShortcutsEnabled = false;
let voiceSessionRecording = false;
let activeVoiceWorkflow = "input";
let voiceEditContext = null;
let voiceTargetWindow = null;
let voiceTargetCaptureToken = 0;
let voiceTargetCapturePromise = Promise.resolve(null);
let bailianStore;
let aiServiceStore;
let companionMemoryStore;
let companionMemoryControl;
let knowledgeBaseSettings;
let companionConversationController;
let computerCompanionAudio;
let easyInputAudioSource;
let easyInputAudioManager;
let easyInputVoiceRecorder;
let audioSetupWindow;
let easyInputAudioBoardConnected = false;
let foregroundSessionState = initialForegroundSession();
let activeDictationSession = null;
let appActionStore;
let hostActionExecutor;
let isQuitting = false;
let keyboardConfigState = { raw: null, fingerprint: "", source: 2, token: null };
let shortcutCaptureActive = false;
let lastVoiceState = { state: "idle", message: "准备就绪", transcript: "", seconds: 0, level: 0, floating: true };
let lastVoiceToggleAt = 0;
let pendingEditShortcutTimer = null;
let activeAgentProvider = "codex";
let codexHookServer;
let codexHookStatus = { receiver: "starting", connected: false, state: "idle", event: "", toolName: "", updatedAt: "", delivery: "not-received" };
let agentStateDelivery = { status: "never", targetState: "idle", at: "", reason: "" };
let linkStatusPollTimer = null;
let linkStatusRefreshInFlight = false;
const linkRecoveryGate = new LinkRecoveryGate();
const activeBailianRequests = new Map();
const activeBailianOrganizers = new Map();
const activeRealtimeSessions = new Map();
const AGENT_STATE_NAMES = ["idle", "listening", "thinking", "working", "waiting", "completed", "error"];
const agentStatePublisher = new AgentStatePublisher({
  send: (report) => sendAgentStateReport(report),
});

function safeAgentStateReason(value) {
  const reason = typeof value === "string" ? value : "agent-state-send-failed";
  return /^[a-z0-9-]{1,80}$/.test(reason) ? reason : "agent-state-send-failed";
}

function inputBridgeSnapshot(value = inputBridge?.snapshot()) {
  const bridge = value || { available: false, process: process.platform === "win32" ? "missing" : "unsupported", boardConnected: false, configCapabilities: null, linkDiagnostics: null };
  return { ...bridge, agentStateDelivery: { ...agentStateDelivery } };
}

function emitInputBridgeStatus(value = inputBridge?.snapshot()) {
  sendToMain("input-bridge-status", inputBridgeSnapshot(value));
}

async function sendAgentStateReport(report) {
  const targetState = AGENT_STATE_NAMES[Number(report?.[2])] || "idle";
  agentStateDelivery = { status: "sending", targetState, at: new Date().toISOString(), reason: "" };
  emitInputBridgeStatus();
  const bridge = inputBridge?.snapshot();
  let result;
  if (!bridge?.boardConnected) result = { ok: false, reason: "easyinput-not-connected" };
  else if (!bridge.linkDiagnostics) result = { ok: false, reason: "deskmatelink-unavailable" };
  else if (bridge.linkDiagnostics.state !== "connected") result = { ok: false, reason: `deskmatelink-${bridge.linkDiagnostics.state}` };
  else result = await inputBridge.sendAgentState(report);
  agentStateDelivery = {
    status: result?.ok ? "acknowledged" : "failed",
    targetState,
    at: new Date().toISOString(),
    reason: result?.ok ? "" : safeAgentStateReason(result?.reason),
  };
  emitInputBridgeStatus();
  return result;
}

async function refreshLinkDiagnostics() {
  if (linkStatusRefreshInFlight || !inputBridge?.snapshot()?.boardConnected) return { ok: false, reason: "link-refresh-unavailable" };
  linkStatusRefreshInFlight = true;
  try {
    return await inputBridge.readCapabilities();
  } finally {
    linkStatusRefreshInFlight = false;
  }
}

function companionIsActive() {
  return Boolean(companionConversationController?.snapshot?.().active);
}

function releaseForegroundSession(session) {
  if (!session) return;
  foregroundSessionState = finishForegroundSession(foregroundSessionState, session).state;
}

async function beginDictationForeground() {
  if (companionIsActive()) await companionConversationController.stop("dictation-preempted");
  if (easyInputAudioManager?.status?.().micTest) await easyInputAudioManager.stopMicTest("dictation-preempted");
  if (activeDictationSession) return activeDictationSession;
  const sessionId = `dictation-${randomUUID()}`;
  const started = startForegroundSession(foregroundSessionState, { mode: "dictation", sessionId });
  foregroundSessionState = started.state;
  activeDictationSession = { sessionId, generation: foregroundSessionState.active.generation };
  return activeDictationSession;
}

function finishDictationForeground() {
  releaseForegroundSession(activeDictationSession);
  activeDictationSession = null;
}

function updateCompanionOverlay(event = {}) {
  const map = { connecting: "organizing", listening: "recording", thinking: "transcribing", speaking: "outputting", completed: "completed", error: "error", idle: "idle", stopping: "cancelled" };
  const state = event.type === "state" ? map[event.state] : null;
  const transcript = ["transcript.partial", "turn.user-final", "reply.partial", "turn.assistant-final"].includes(event.type) ? String(event.text || "").slice(-500) : "";
  const snapshot = {
    state: state || (event.type?.startsWith("reply") ? "outputting" : event.type?.startsWith("transcript") ? "recording" : "organizing"),
    message: event.error || ({ connecting: "正在连接豆包实时对话…", listening: "正在陪伴倾听…", thinking: "正在思考…", speaking: "正在播报…", completed: "本轮对话完成", stopping: "正在结束陪伴对话…" }[event.state] || "陪伴对话"),
    transcript,
    seconds: 0,
    level: event.type?.startsWith("transcript") ? 24 : 0,
    floating: true,
  };
  overlayWindow?.webContents.send("voice-state", snapshot);
  if (snapshot.state === "idle") overlayWindow?.hide();
  else {
    positionAndShowOverlay();
    if (["completed", "error", "cancelled"].includes(snapshot.state)) setTimeout(() => { if (!companionIsActive()) overlayWindow?.hide(); }, 1800);
  }
}

function handleCompanionConversationEvent(event = {}) {
  const snapshot = companionConversationController?.snapshot?.();
  const payload = event.type === "state" ? { ...event, audioSource: snapshot?.audioSource, audioSink: snapshot?.audioSink, audioSelection: snapshot?.audioSelection, computerAudio: computerCompanionAudio?.diagnostics?.() } : event;
  sendToMain("companion-conversation-event", payload);
  updateCompanionOverlay(payload);
  if (event.type === "state" && ["idle", "error"].includes(event.state) && foregroundSessionState.active?.mode === "companion") {
    releaseForegroundSession({ sessionId: event.sessionId, generation: event.generation });
  }
}

function loadTextModelSecret() {
  if (aiServiceStore?.status().text.configured) return aiServiceStore.loadTextSecret();
  return { ...bailianStore.loadSecret(), provider: "bailian" };
}

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

function onTrusted(channel, handler) {
  ipcMain.on(channel, (event, ...args) => { assertTrustedSender(event); handler(...args); });
}

function isAudioSetupSender(event) {
  const senderUrl = event.senderFrame?.url || event.sender?.getURL?.() || "";
  try { return fileURLToPath(new URL(senderUrl)) === path.join(__dirname, "audio-setup.html"); }
  catch { return false; }
}

function handleAudioSetup(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isAudioSetupSender(event) || event.sender !== audioSetupWindow?.webContents) throw new Error("拒绝非音频设置窗口调用配置能力");
    return handler(...args);
  });
}

function runPowershell(script, timeoutMs = 3000, environment = {}) {
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, env: { ...process.env, ...environment } });
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

function snapshotSystemClipboard() {
  return {
    text: clipboard.readText(),
    html: clipboard.readHTML(),
    rtf: clipboard.readRTF(),
    bookmark: clipboard.readBookmark(),
    image: clipboard.readImage(),
  };
}

function restoreSystemClipboard(snapshot = {}) {
  clipboard.write({
    text: String(snapshot.text || ""),
    html: String(snapshot.html || ""),
    rtf: String(snapshot.rtf || ""),
    bookmark: String(snapshot.bookmark || ""),
    image: snapshot.image,
  });
}

async function captureVoiceEditSelection(targetWindow) {
  return captureSelectedText({
    targetWindow,
    readClipboardText: () => clipboard.readText(),
    writeClipboardText: (value) => clipboard.writeText(value),
    snapshotClipboard: snapshotSystemClipboard,
    restoreClipboard: restoreSystemClipboard,
    runCopy: (expectedWindow) => runPowershell(COPY_SELECTION_SCRIPT, 3000, { DESKMATE_TARGET_WINDOW: expectedWindow }),
    marker: `deskmate-selection-${randomUUID()}`,
  });
}

function sendToMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function createAudioSetupWindow() {
  if (audioSetupWindow && !audioSetupWindow.isDestroyed()) { audioSetupWindow.focus(); return audioSetupWindow; }
  audioSetupWindow = new BrowserWindow({
    width: 560,
    height: 720,
    minWidth: 520,
    minHeight: 640,
    parent: mainWindow,
    modal: true,
    show: false,
    title: "EasyInput 音频设置",
    webPreferences: { preload: path.join(__dirname, "audio-setup-preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  audioSetupWindow.loadFile(path.join(__dirname, "audio-setup.html"));
  audioSetupWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  audioSetupWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  audioSetupWindow.once("ready-to-show", () => audioSetupWindow?.show());
  audioSetupWindow.on("closed", () => { audioSetupWindow = null; });
  return audioSetupWindow;
}

async function openEasyInputAudioSetup() {
  const refreshed = await easyInputAudioManager.refreshConfiguration();
  if (!refreshed.ok && !["easyinput-audio-not-configured"].includes(refreshed.reason)) return refreshed;
  createAudioSetupWindow();
  return { ok: true };
}

function sanitizedCodexHookStatus() {
  return { provider: "codex", sourceVersion: "codex-hook-v1", selected: activeAgentProvider === "codex", ...codexHookStatus };
}

async function handleCodexHookState(value) {
  const updatedAt = new Date().toISOString();
  let delivery = activeAgentProvider === "codex" ? "pending" : "not-selected";
  if (activeAgentProvider === "codex") {
    if (companionIsActive()) delivery = "companion-conversation-active";
    else if (isVoiceActivityActive({ recording: voiceSessionRecording, state: lastVoiceState.state })) delivery = "voice-workflow-active";
    else {
      const result = await agentStatePublisher.publishProviderState({ source: "codex-hook-v1", state: value.state });
      delivery = result?.ok ? (result.suppressed ? "suppressed" : "sent") : result?.reason || "send-failed";
    }
  }
  codexHookStatus = { receiver: "listening", connected: true, state: value.state, event: value.event, toolName: value.toolName, updatedAt, delivery };
  sendToMain("codex-agent-state", sanitizedCodexHookStatus());
}

async function emitVoiceToggle(source = "global-shortcut", label = shortcut, requestedWorkflow = "input") {
  const now = Date.now();
  if (now - lastVoiceToggleAt < 350) return { ignored: true, reason: "duplicate-trigger" };
  lastVoiceToggleAt = now;
  const phase = voiceSessionRecording ? "stop" : "start";
  const workflow = phase === "stop" ? activeVoiceWorkflow : requestedWorkflow === "edit" ? "edit" : "input";
  if (phase === "start") {
    await beginDictationForeground();
    const captureToken = ++voiceTargetCaptureToken;
    voiceTargetWindow = null;
    voiceEditContext = null;
    if (workflow === "edit") {
      updateVoiceState({ state: "organizing", message: "正在读取选中文字…", floating: lastVoiceState.floating, source: "voice-workflow" });
      const windowId = await getForegroundWindowId().catch(() => null);
      if (!windowId || captureToken !== voiceTargetCaptureToken) {
        sendToMain("voice-edit-error", { source, reason: "no-captured-target", at: new Date().toISOString() });
        updateVoiceState({ state: "error", message: "未能锁定原输入窗口", floating: lastVoiceState.floating, source: "voice-workflow" });
        finishDictationForeground();
        return { ignored: true, reason: "no-captured-target" };
      }
      const selection = await captureVoiceEditSelection(windowId);
      if (!selection.ok || captureToken !== voiceTargetCaptureToken) {
        sendToMain("voice-edit-error", { source, reason: selection.reason || "selection-capture-failed", at: new Date().toISOString() });
        const message = selection.reason === "selection-empty" ? "没有检测到选中文字" : selection.reason === "selection-too-long" ? "选中文字过长" : selection.reason === "target-window-changed" ? "原输入窗口已经变化" : "未能读取选中文字";
        updateVoiceState({ state: "error", message, floating: lastVoiceState.floating, source: "voice-workflow" });
        finishDictationForeground();
        return { ignored: true, reason: selection.reason || "selection-capture-failed" };
      }
      voiceTargetWindow = windowId;
      voiceTargetCapturePromise = Promise.resolve(windowId);
      voiceEditContext = { selectedText: selection.text, capturedAt: Date.now() };
    } else {
      voiceTargetCapturePromise = getForegroundWindowId().then((windowId) => {
        if (captureToken === voiceTargetCaptureToken) voiceTargetWindow = windowId;
        return windowId;
      }).catch(() => null);
    }
    activeVoiceWorkflow = workflow;
  }
  voiceSessionRecording = phase === "start";
  const at = new Date().toISOString();
  const payload = { source, shortcut: label, phase, workflow, targetCaptured: Boolean(voiceTargetWindow), selectionCaptured: workflow === "edit" ? Boolean(voiceEditContext?.selectedText) : undefined, at };
  sendToMain("key-diagnostic", { source, key: label, action: "release", at });
  sendToMain("voice-toggle", payload);
  return payload;
}

async function emitVoiceCancel(source = "keyboard") {
  if (!isVoiceActivityActive({ recording: voiceSessionRecording, state: lastVoiceState.state })) {
    if (companionIsActive()) return companionConversationController.stop(source === "keyboard" ? "escape" : source);
    if (easyInputAudioManager?.status?.().micTest) return easyInputAudioManager.stopMicTest(source === "keyboard" ? "escape" : source);
    return { ignored: true, reason: "voice-idle" };
  }
  voiceSessionRecording = false;
  voiceTargetCaptureToken += 1;
  voiceTargetWindow = null;
  voiceEditContext = null;
  activeVoiceWorkflow = "input";
  voiceTargetCapturePromise = Promise.resolve(null);
  finishDictationForeground();
  sendToMain("voice-cancel", { source, at: new Date().toISOString() });
  return { cancelled: true };
}

function cancelPendingEditShortcut() {
  if (!pendingEditShortcutTimer) return;
  clearTimeout(pendingEditShortcutTimer);
  pendingEditShortcutTimer = null;
}

function scheduleEditShortcutFallback() {
  cancelPendingEditShortcut();
  const bridgeAvailable = Boolean(inputBridge?.snapshot?.().available);
  pendingEditShortcutTimer = setTimeout(() => {
    pendingEditShortcutTimer = null;
    void emitVoiceToggle("voice-edit-shortcut", DEFAULT_EDIT_SHORTCUT, "edit");
  }, bridgeAvailable ? 1200 : 180);
}

function registerEditShortcut() {
  if (globalShortcut.isRegistered(DEFAULT_EDIT_SHORTCUT)) { editShortcutRegistered = true; return { registered: true, shortcut: DEFAULT_EDIT_SHORTCUT }; }
  try { editShortcutRegistered = globalShortcut.register(DEFAULT_EDIT_SHORTCUT, scheduleEditShortcutFallback); }
  catch (error) { editShortcutRegistered = false; return { registered: false, shortcut: DEFAULT_EDIT_SHORTCUT, reason: error.message }; }
  return { registered: editShortcutRegistered, shortcut: DEFAULT_EDIT_SHORTCUT, reason: editShortcutRegistered ? undefined : "shortcut-unavailable" };
}

function registerShortcut(nextShortcut = shortcut) {
  let candidate;
  try { candidate = normalizeShortcut(nextShortcut || DEFAULT_SHORTCUT); }
  catch (error) { return { registered: globalShortcut.isRegistered(shortcut), shortcut, reason: error.message }; }
  if (candidate === DEFAULT_EDIT_SHORTCUT) return { registered: globalShortcut.isRegistered(shortcut), shortcut, reason: `${DEFAULT_EDIT_SHORTCUT} 已保留给语音编辑` };
  const previous = shortcut;
  if (!globalKeyboardShortcutsEnabled) { shortcut = candidate; return { registered: false, shortcut, disabled: true, reason: "global-keyboard-shortcuts-disabled" }; }
  if (candidate === shortcut && globalShortcut.isRegistered(shortcut)) return { registered: true, shortcut };
  let registered = false;
  try { registered = globalShortcut.register(candidate, () => { void emitVoiceToggle("fallback-shortcut", candidate); }); }
  catch (error) { return { registered: globalShortcut.isRegistered(shortcut), shortcut, reason: error.message }; }
  if (!registered) return { registered: globalShortcut.isRegistered(shortcut), shortcut, reason: "shortcut-unavailable" };
  shortcut = candidate;
  shortcutCaptureActive = false;
  if (previous !== candidate) globalShortcut.unregister(previous);
  return { registered: true, shortcut };
}

function setGlobalShortcutsEnabled(enabled) {
  globalKeyboardShortcutsEnabled = Boolean(enabled);
  if (!globalKeyboardShortcutsEnabled) {
    if (globalShortcut.isRegistered(shortcut)) globalShortcut.unregister(shortcut);
    if (globalShortcut.isRegistered(DEFAULT_EDIT_SHORTCUT)) globalShortcut.unregister(DEFAULT_EDIT_SHORTCUT);
    editShortcutRegistered = false;
    return { ok: true, enabled: false, shortcut, registered: false, editShortcutRegistered: false };
  }
  const voice = registerShortcut(shortcut);
  const edit = registerEditShortcut();
  return { ok: Boolean(voice.registered), enabled: true, shortcut: voice.shortcut, registered: Boolean(voice.registered), editShortcutRegistered: Boolean(edit.registered), reason: voice.reason || edit.reason };
}

function setShortcutCapture(active) {
  shortcutCaptureActive = Boolean(active);
  if (shortcutCaptureActive) {
    if (globalShortcut.isRegistered(shortcut)) globalShortcut.unregister(shortcut);
    if (globalShortcut.isRegistered(DEFAULT_EDIT_SHORTCUT)) globalShortcut.unregister(DEFAULT_EDIT_SHORTCUT);
    editShortcutRegistered = false;
    return { ok: true, active: true, shortcut };
  }
  if (!globalKeyboardShortcutsEnabled) return { ok: true, active: false, shortcut, registered: false, editShortcutRegistered: false };
  const result = globalShortcut.isRegistered(shortcut) ? { registered: true, shortcut } : registerShortcut(shortcut);
  const editResult = registerEditShortcut();
  return { ok: Boolean(result.registered), active: false, shortcut: result.shortcut, editShortcutRegistered: Boolean(editResult.registered), reason: result.reason };
}

async function pasteIntoCapturedWindow(text) {
  if (!voiceTargetWindow) await voiceTargetCapturePromise;
  const targetWindow = voiceTargetWindow;
  const result = await pasteToCapturedWindow({
    text,
    targetWindow,
    writeClipboard: (value) => clipboard.writeText(value),
    runPaste: (expectedWindow) => runPowershell(PASTE_CAPTURED_WINDOW_SCRIPT, 3000, { DESKMATE_TARGET_WINDOW: expectedWindow }),
  });
  if (result.ok) voiceTargetWindow = null;
  return result;
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 320,
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
  const html = "<!doctype html><html><head><meta charset='utf-8'><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; style-src 'unsafe-inline'\"><style>html,body{margin:0;background:transparent;font-family:'Segoe UI','Microsoft YaHei',sans-serif;color:#f7fbff;overflow:hidden}.shell{box-sizing:border-box;height:46px;margin:6px;padding:0 9px 0 11px;border:1px solid rgba(102,205,238,.38);border-radius:14px;background:rgba(22,31,44,.84);box-shadow:0 8px 22px rgba(8,20,36,.18);backdrop-filter:blur(16px);display:flex;align-items:center;gap:7px}.state-dot{width:7px;height:7px;flex:0 0 auto;border-radius:50%;background:#44c7eb;box-shadow:0 0 0 3px rgba(68,199,235,.12)}.recording .state-dot{animation:pulse 1.2s ease-out infinite}.error .state-dot{background:#ff7b83}.completed .state-dot{background:#5bd5ae}.wave{width:48px;height:22px;display:flex;align-items:center;justify-content:center;gap:1px;flex:0 0 auto}.wave i{display:block;width:2px;height:var(--h);border-radius:2px;background:#58d4ee;opacity:.9;transition:height .12s ease}.copy{min-width:0;flex:1;color:#fff;font-size:11px;white-space:nowrap;overflow:hidden}.copy.placeholder{color:#9babbc}.copy .lead{color:#8ea1b5}.meter{width:34px;text-align:right;color:#65d7ef;font-size:10px;font-variant-numeric:tabular-nums}.escape{height:22px;padding-left:7px;border-left:1px solid rgba(255,255,255,.11);display:flex;align-items:center;color:#8fa1b3;font-size:8px;white-space:nowrap}@keyframes pulse{70%{box-shadow:0 0 0 7px rgba(68,199,235,0)}100%{box-shadow:0 0 0 0 rgba(68,199,235,0)}}</style></head><body><div id='root'></div></body></html>";
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
  if (state !== "idle" && value.source === "voice-workflow" && !activeDictationSession) void beginDictationForeground();
  void agentStatePublisher.publishVoiceState({ state, source: value.source });
  lastVoiceState = {
    state,
    message: String(value.message || "").slice(0, 240),
    transcript: String(value.transcript || "").slice(-500),
    seconds: Math.max(0, Math.min(36000, Number(value.seconds) || 0)),
    level: Math.max(0, Math.min(100, Number(value.level) || 0)),
    floating: value.floating !== false,
  };
  voiceSessionRecording = state === "recording";
  if (["idle", "completed", "error", "cancelled"].includes(state)) finishDictationForeground();
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
    emitInputBridgeStatus();
    sendToMain("codex-agent-state", sanitizedCodexHookStatus());
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
  inputBridge.on("status", (value) => {
    emitInputBridgeStatus(value);
    const linkAction = linkRecoveryGate.observe(value);
    if (linkAction.recover) void agentStatePublisher.recoverCurrentState();
    const boardConnected = value?.boardConnected === true;
    const newlyConnected = boardConnected && !easyInputAudioBoardConnected;
    easyInputAudioBoardConnected = boardConnected;
    if (newlyConnected) {
      void (async () => {
        // Both operations use the one native Feature Report read slot. Keep
        // reconnect recovery serialized so Link diagnostics cannot make the
        // existing audio configuration refresh fail with a synthetic busy.
        if (linkAction.refresh) await refreshLinkDiagnostics();
        await easyInputAudioManager?.refreshConfiguration();
      })();
    } else if (linkAction.refresh) {
      void refreshLinkDiagnostics();
    }
    if (value?.boardConnected === false) {
      const companionSource = companionConversationController?.snapshot?.().audioSelection?.activeSource;
      if (companionIsActive() && companionSource === "easyinput") void companionConversationController.stop("easyinput-device-disconnected");
      if (easyInputVoiceRecorder?.status?.().recording) void easyInputVoiceRecorder.fail("easyinput-device-disconnected");
      void easyInputAudioManager?.suspend("easyinput-device-disconnected");
    }
  });
  inputBridge.on("diagnostic", (event) => sendToMain("key-diagnostic", event));
  inputBridge.on("trigger", (event) => {
    sendToMain("key-diagnostic", event);
    if (event.key === "VoiceEdit") cancelPendingEditShortcut();
    void emitVoiceToggle(event.source, event.key, event.key === "VoiceEdit" ? "edit" : "input");
  });
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
  linkStatusPollTimer = setInterval(() => { void refreshLinkDiagnostics(); }, 5000);
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

function companionConversationStatus() {
  const snapshot = companionConversationController?.snapshot?.() || { active: false, state: "idle", provider: "doubao", audioSource: { available: false, reason: "computer-audio-renderer-unavailable" }, audioSink: { available: false, reason: "computer-audio-renderer-unavailable" }, audioSelection: { requestedSource: "computer", activeSource: "", output: "computer", fallback: null }, error: "" };
  const service = aiServiceStore?.status?.().realtime || { configured: false, provider: "doubao" };
  return { ...snapshot, service, foregroundMode: foregroundSessionState.active?.mode || null, computerAudio: computerCompanionAudio?.diagnostics?.() || { ready: false, sourceActive: false, sinkActive: false, counters: {} }, easyInputSpeaker: { available: false, reason: "easyinput-speaker-contract-not-frozen" } };
}

function normalizeCompanionStartOptions(value = {}) {
  return {
    microphoneSource: value?.microphoneSource === "easyinput" ? "easyinput" : "computer",
    microphoneId: typeof value?.microphoneId === "string" ? value.microphoneId.slice(0, 512) : "",
  };
}

async function startCompanionConversation(value = {}) {
  if (isVoiceActivityActive({ recording: voiceSessionRecording, state: lastVoiceState.state }) || foregroundSessionState.active?.mode === "dictation") {
    return { ok: false, reason: "voice-workflow-active", status: companionConversationStatus() };
  }
  if (easyInputAudioManager?.status?.().micTest) return { ok: false, reason: "easyinput-mic-test-active", status: companionConversationStatus() };
  if (!aiServiceStore?.status?.().realtime?.configured) return { ok: false, reason: "realtime-service-not-configured", status: companionConversationStatus() };
  if (companionIsActive()) return { ok: false, reason: "companion-session-active", status: companionConversationStatus() };
  const sessionId = `companion-${randomUUID()}`;
  const started = startForegroundSession(foregroundSessionState, { mode: "companion", sessionId });
  foregroundSessionState = started.state;
  const lease = { sessionId, generation: foregroundSessionState.active.generation };
  const options = normalizeCompanionStartOptions(value);
  const prepared = computerCompanionAudio.prepare({ ...lease, deviceId: options.microphoneId });
  if (!prepared.ok) { releaseForegroundSession(lease); return { ok: false, reason: prepared.reason, status: companionConversationStatus() }; }
  let audioSource = computerCompanionAudio.source;
  if (options.microphoneSource === "easyinput") {
    audioSource = new PrestartFallbackCompanionAudioSource({
      primary: easyInputAudioSource,
      fallback: computerCompanionAudio.source,
      requestedSource: "easyinput",
      onSelection: (status) => handleCompanionConversationEvent({ type: "audio.selection", requestedSource: "easyinput", activeSource: status.activeSource, fallback: status.fallback }),
    });
  }
  const configured = companionConversationController.configureAudio({
    audioSource,
    audioSink: computerCompanionAudio.sink,
    selection: { requestedSource: options.microphoneSource, activeSource: options.microphoneSource === "computer" ? "computer" : "", output: "computer" },
  });
  if (!configured.ok) { releaseForegroundSession(lease); return { ok: false, reason: configured.reason, status: companionConversationStatus() }; }
  const result = await companionConversationController.start(lease);
  if (!result.ok) releaseForegroundSession(lease);
  return { ...result, status: companionConversationStatus() };
}

async function stopCompanionConversation(reason = "user") {
  const result = await companionConversationController.stop(reason);
  return { ...result, status: companionConversationStatus() };
}

async function interruptCompanionConversation(reason = "user") {
  const result = await companionConversationController.interrupt(reason);
  return { ...result, status: companionConversationStatus() };
}

app.whenReady().then(async () => {
  app.setAppUserModelId(APP_ID);
  bailianStore = createSecureBailianStore({ safeStorage, userDataPath: app.getPath("userData") });
  aiServiceStore = createSecureAiServiceStore({ safeStorage, userDataPath: app.getPath("userData") });
  companionMemoryStore = new CompanionMemoryStore({ userDataPath: app.getPath("userData") });
  companionMemoryControl = new CompanionMemoryControl({ store: companionMemoryStore });
  knowledgeBaseSettings = createKnowledgeBaseSettings({ safeStorage, userDataPath: app.getPath("userData") });
  easyInputAudioSource = new EasyInputLanAudioSource();
  easyInputAudioManager = new EasyInputAudioManager({
    source: easyInputAudioSource,
    readConfig: () => inputBridge?.readConfig?.() || Promise.resolve({ ok: false, reason: "input-bridge-unavailable" }),
    syncConfig: (value) => inputBridge?.syncConfig?.(value) || Promise.resolve({ ok: false, reason: "input-bridge-unavailable" }),
    fingerprint: configFingerprint,
    networkInterfaces: () => os.networkInterfaces(),
    emit: (event) => sendToMain("easyinput-audio-event", event),
  });
  easyInputVoiceRecorder = new EasyInputVoiceRecorder({
    source: easyInputAudioSource,
    emit: (event) => sendToMain("easyinput-voice-recording-event", event),
  });
  computerCompanionAudio = new ComputerCompanionAudioSession({
    sendCommand: (event) => sendToMain("companion-computer-audio-command", event),
    onError: (reason) => { if (companionIsActive()) void companionConversationController.fail(reason); },
  });
  companionConversationController = new CompanionConversationController({
    providerFactory: ({ onEvent }) => new DoubaoRealtimeSession({ config: aiServiceStore.loadRealtimeSecret(), onEvent }),
    audioSource: computerCompanionAudio.source,
    audioSink: computerCompanionAudio.sink,
    commitTurn: (turn) => companionMemoryStore.commitConversationTurn(turn),
    publishState: (value) => agentStatePublisher.publishCompanionState(value),
    onEvent: handleCompanionConversationEvent,
  });
  appActionStore = new AppActionStore({ userDataPath: app.getPath("userData"), dialog, shell });
  hostActionExecutor = new HostActionExecutor({ store: appActionStore });
  codexHookServer = new CodexHookStateServer({ onState: (value) => { void handleCodexHookState(value); } });
  const codexReceiver = await codexHookServer.start();
  codexHookStatus = { ...codexHookStatus, receiver: codexReceiver.ok ? "listening" : "unavailable" };
  if (bailianTestAudio) { await runBailianConnectionTest(bailianTestAudio); return; }
  if (bailianTestOrganizer) { await runBailianOrganizerTest(bailianTestOrganizer); return; }
  createWindow();
  createOverlayWindow();
  createTray();
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(permission === "media" && isAllowedAppUrl(webContents.getURL())));
  handleTrusted("desktop:get-capabilities", () => { const bridge = inputBridgeSnapshot(); return { supported: true, platform: process.platform, shortcut, globalShortcutsEnabled: globalKeyboardShortcutsEnabled, shortcutRegistered: globalShortcut.isRegistered(shortcut), editShortcut: DEFAULT_EDIT_SHORTCUT, editShortcutRegistered: globalShortcut.isRegistered(DEFAULT_EDIT_SHORTCUT), shortcutCaptureActive, keyboardConfigSync: { available: Boolean(bridge.configCapabilities), transport: "vendor-hid-0x10", read: "vendor-hid-0x13", config_read_v1: Boolean(bridge.configCapabilities?.config_read_v1), config_write_v1: Boolean(bridge.configCapabilities?.config_write_v1), host_action_v1: Boolean(bridge.configCapabilities?.host_action_v1), fixed_text_v1: Boolean(bridge.configCapabilities?.fixed_text_v1) }, inputBridge: bridge }; });
  handleTrusted("desktop:refresh-link-diagnostics", () => refreshLinkDiagnostics());
  handleTrusted("desktop:get-network-summary", () => summarizeNetworkInterfaces(os.networkInterfaces()));
  handleTrusted("desktop:get-easyinput-audio-status", () => easyInputAudioManager.status());
  handleTrusted("desktop:open-easyinput-audio-setup", () => openEasyInputAudioSetup());
  handleTrusted("desktop:start-easyinput-mic-test", () => easyInputAudioManager.startMicTest({ canStart: () => {
    if (companionIsActive()) return { ok: false, reason: "companion-conversation-active" };
    if (isVoiceActivityActive({ recording: voiceSessionRecording, state: lastVoiceState.state })) return { ok: false, reason: "voice-workflow-active" };
    return { ok: true };
  } }));
  handleTrusted("desktop:stop-easyinput-mic-test", () => easyInputAudioManager.stopMicTest("user"));
  handleTrusted("desktop:start-easyinput-voice-recording", async () => {
    if (easyInputVoiceRecorder.status().recording) return { ok: false, reason: "easyinput-recording-active" };
    await beginDictationForeground();
    const result = await easyInputVoiceRecorder.start();
    if (!result.ok) finishDictationForeground();
    return result;
  });
  handleTrusted("desktop:stop-easyinput-voice-recording", () => easyInputVoiceRecorder.stop("user"));
  handleTrusted("desktop:cancel-easyinput-voice-recording", () => easyInputVoiceRecorder.cancel("user-cancelled"));
  handleAudioSetup("audio-setup:load", () => easyInputAudioManager.setupSnapshot());
  handleAudioSetup("audio-setup:preview", (value) => easyInputAudioManager.previewSetup(value || {}));
  handleAudioSetup("audio-setup:commit", (token) => easyInputAudioManager.commitSetup(String(token || "")));
  handleAudioSetup("audio-setup:close", () => { audioSetupWindow?.close(); return { ok: true }; });
  handleTrusted("desktop:register-shortcut", (value) => registerShortcut(value));
  handleTrusted("desktop:set-global-shortcuts-enabled", (value) => setGlobalShortcutsEnabled(value));
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
    const verified = await completeConfigWrite({ syncConfig: (value) => inputBridge.syncConfig(value), readConfig: () => inputBridge.readConfig(), expectedConfig: pending.merged, fingerprint: configFingerprint });
    if (!verified.ok) return verified;
    keyboardConfigState = { raw: verified.config, fingerprint: verified.fingerprint, source: verified.source, token: null };
    return { ok: true, saved: true, source: verified.source, fingerprint: verified.fingerprint, verificationAttempts: verified.attempts };
  });
  handleTrusted("desktop:set-trigger-config", (value) => ({ ok: true, config: inputBridge?.configure(value || {}) || { boardF22: true, rightAlt: false, keyboardShortcuts: false } }));
  handleTrusted("desktop:set-voice-recording", async (recording) => { if (recording) await beginDictationForeground(); voiceSessionRecording = Boolean(recording); refreshTrayMenu(); return { ok: true, recording: voiceSessionRecording }; });
  handleTrusted("desktop:set-voice-state", (value) => updateVoiceState(value));
  handleTrusted("desktop:set-manual-agent-state", async (value = {}) => {
    const agentId = typeof value.agentId === "string" && /^[a-z0-9-]{1,32}$/.test(value.agentId) ? value.agentId : "";
    const state = typeof value.state === "string" ? value.state : "";
    if (!agentId || !["idle", "listening", "thinking", "working", "waiting", "completed", "error"].includes(state)) return { ok: false, reason: "manual-agent-request-invalid" };
    if (companionIsActive()) return { ok: false, reason: "companion-conversation-active" };
    if (isVoiceActivityActive({ recording: voiceSessionRecording, state: lastVoiceState.state })) return { ok: false, reason: "voice-workflow-active" };
    const result = await agentStatePublisher.publishManualState({ source: "manual-agent-control", state });
    return result?.ok ? { ok: true, agentId, state, delivery: { ...agentStateDelivery } } : { ok: false, reason: result?.reason || "agent-state-send-failed", delivery: { ...agentStateDelivery } };
  });
  handleTrusted("desktop:set-active-agent-provider", (value) => {
    const provider = typeof value === "string" ? value : "";
    if (!["disabled", "codex", "workbody", "hermes", "claude", "custom"].includes(provider)) return { ok: false, reason: "agent-provider-invalid" };
    activeAgentProvider = provider;
    const status = sanitizedCodexHookStatus();
    sendToMain("codex-agent-state", status);
    return { ok: true, provider, status };
  });
  handleTrusted("desktop:get-codex-agent-status", () => sanitizedCodexHookStatus());
  handleTrusted("desktop:clipboard-write", (value) => { const text = String(value || ""); if (text.length > 100000) return { ok: false, reason: "text-too-long" }; clipboard.writeText(text); return { ok: true, mode: "clipboard" }; });
  handleTrusted("desktop:paste-active-window", (text) => pasteIntoCapturedWindow(text));
  handleTrusted("desktop:key-diagnostic", (value) => ({ ok: true, event: value }));
  handleTrusted("bailian:get-status", () => bailianStore.status());
  handleTrusted("bailian:save-credentials", (value) => bailianStore.save(value || {}));
  handleTrusted("bailian:clear-credentials", () => bailianStore.clear());
  handleTrusted("ai-services:get-status", () => aiServiceStore.status());
  handleTrusted("ai-services:save-text", (value) => aiServiceStore.saveText(value || {}));
  handleTrusted("ai-services:clear-text", () => aiServiceStore.clearText());
  handleTrusted("ai-services:save-realtime", (value) => aiServiceStore.saveRealtime(value || {}));
  handleTrusted("ai-services:clear-realtime", () => aiServiceStore.clearRealtime());
  handleTrusted("companion:get-status", () => companionConversationStatus());
  handleTrusted("companion:start", (value) => startCompanionConversation(value));
  handleTrusted("companion:stop", () => stopCompanionConversation("user"));
  handleTrusted("companion:interrupt", () => interruptCompanionConversation("user"));
  handleTrusted("companion:set-computer-audio-ready", (ready) => computerCompanionAudio.setRendererReady(Boolean(ready)));
  onTrusted("companion:computer-audio-event", (value) => { computerCompanionAudio.handleRendererEvent(value); });
  handleTrusted("memory:get-status", () => companionMemoryStore.status());
  handleTrusted("memory:list", (value) => companionMemoryStore.list(value || {}));
  handleTrusted("memory:set-candidate-state", (value = {}) => companionMemoryStore.setCandidateState(value.id, value.state));
  handleTrusted("memory:update-candidate", (value = {}) => companionMemoryStore.updateCandidate(value));
  handleTrusted("memory:prepare-forget", (value = {}) => companionMemoryControl.prepareForget(value));
  handleTrusted("memory:confirm-forget", (value = {}) => companionMemoryControl.confirmForget(value));
  handleTrusted("memory:export-reviewed", async () => {
    const payload = companionMemoryStore.exportReviewed();
    const selection = await dialog.showSaveDialog(mainWindow, { title: "导出 DeskMate 已审核记忆", defaultPath: "deskmate-reviewed-memory.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    if (selection.canceled || !selection.filePath) return { ok: false, cancelled: true };
    const target = path.extname(selection.filePath).toLowerCase() === ".json" ? selection.filePath : `${selection.filePath}.json`;
    try { fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8"); }
    catch { return { ok: false, reason: "memory-export-write-failed" }; }
    return { ok: true, dailySummaries: payload.dailySummaries.length, longTermMemories: payload.longTermMemories.length };
  });
  handleTrusted("memory:get-knowledge-base-status", () => knowledgeBaseSettings.status());
  handleTrusted("memory:choose-knowledge-base", async () => {
    const selection = await dialog.showOpenDialog(mainWindow, { title: "选择 DeskMate 知识库目录", properties: ["openDirectory", "createDirectory"] });
    if (selection.canceled || selection.filePaths.length !== 1) return { ok: false, cancelled: true, status: knowledgeBaseSettings.status() };
    try { return { ok: true, status: knowledgeBaseSettings.saveRoot(selection.filePaths[0]) }; }
    catch (error) { const reason = ["knowledge-base-secure-storage-unavailable", "knowledge-base-location-invalid", "knowledge-base-location-unavailable"].includes(error?.message) ? error.message : "knowledge-base-location-unavailable"; return { ok: false, reason, status: knowledgeBaseSettings.status() }; }
  });
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
    const secret = loadTextModelSecret();
    const requestId = typeof value.requestId === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(value.requestId) ? value.requestId : `organizer-${Date.now()}`;
    const controller = new AbortController();
    activeBailianOrganizers.set(requestId, controller);
    try {
      return await organizeBailian({
        ...secret,
        text: value.text,
        mode: value.mode,
        hotwords: value.hotwords,
        rules: value.rules,
        customRule: value.customRule,
        signal: controller.signal,
      });
    } finally { activeBailianOrganizers.delete(requestId); }
  });
  handleTrusted("bailian:edit-selected-text", async (value = {}) => {
    const context = voiceEditContext;
    voiceEditContext = null;
    if (!context?.selectedText) throw new Error("没有可用的选中文字，请重新选择后按语音编辑键");
    if (Date.now() - context.capturedAt > 10 * 60 * 1000) throw new Error("选中文字已过期，请重新选择后再试");
    const secret = loadTextModelSecret();
    const requestId = typeof value.requestId === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(value.requestId) ? value.requestId : `voice-edit-${Date.now()}`;
    const controller = new AbortController();
    activeBailianOrganizers.set(requestId, controller);
    try { return await editSelectedTextWithBailian({ ...secret, selectedText: context.selectedText, instruction: value.instruction, signal: controller.signal }); }
    finally { activeBailianOrganizers.delete(requestId); }
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
  setGlobalShortcutsEnabled(false);
  startInputBridge();
  app.on("activate", () => showMain());
  app.on("second-instance", () => showMain());
});

app.on("before-quit", () => { isQuitting = true; cancelPendingEditShortcut(); if (linkStatusPollTimer) clearInterval(linkStatusPollTimer); linkStatusPollTimer = null; inputBridge?.stop(); void codexHookServer?.stop(); void companionConversationController?.stop("application-quit"); void easyInputVoiceRecorder?.close(); void easyInputAudioManager?.close(); audioSetupWindow?.destroy(); activeBailianRequests.forEach((controller) => controller.abort()); activeBailianRequests.clear(); activeBailianOrganizers.forEach((controller) => controller.abort()); activeBailianOrganizers.clear(); activeRealtimeSessions.forEach((realtime) => realtime.cancel()); activeRealtimeSessions.clear(); companionMemoryControl?.clear(); companionMemoryControl = null; companionMemoryStore?.close(); companionMemoryStore = null; });
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => { if (process.platform === "darwin" && !isQuitting) return; });
