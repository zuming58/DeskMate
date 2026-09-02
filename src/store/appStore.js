import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import { expressionPresets, historyItems } from "../appData.js";
import { AI_EVENT_TYPES } from "../adapters/index.js";
import { legacyState } from "../domain/aiStatus.js";
import { DEFAULT_ENCODER, DEFAULT_KEYMAP, normalizeEncoder, normalizeKeyBinding } from "../domain/keymap.js";
import { mapAiStateToPetIntent } from "../domain/petIntent.js";
import { normalizeAgentControl } from "../domain/agentControl.js";
import { normalizeMicrophoneSource } from "../domain/microphoneSource.js";
import { COMPANION_DEFAULTS, isValidCompanionEndSmoothWindowMs, isValidCompanionIdleTimeoutMs, normalizeCompanionPreferences } from "../domain/companionPreferences.js";

export const STORAGE_KEY = "deskmate.app-state";
export const SCHEMA_VERSION = 12;

const DEFAULT_AI_EVENT = Object.freeze({ type: "idle", agent: "Codex", progress: 0, detail: "等待真实 Agent 状态" });

function isLegacyDemoAiEvent(value) {
  return value?.type === "working"
    && value?.agent === "Codex"
    && value?.progress === 68
    && value?.detail === "正在整理桌宠开发文档";
}

function normalizeHistoryEntry(item) {
  const text = String(item?.text || "");
  return {
    ...item,
    text,
    rawText: typeof item?.rawText === "string" ? item.rawText : text,
    organizer: item?.organizer && typeof item.organizer === "object" ? item.organizer : { mode: "raw", model: "legacy", durationMs: 0, status: "success", fallback: false },
  };
}

export const defaultState = {
  schemaVersion: SCHEMA_VERSION,
  history: historyItems,
  vocabulary: { hotwords: ["DeskMate", "ESP32-S3", "Codex", "Claude Code", "Hermes"], rules: [{ from: "桌面宠物", to: "桌宠" }, { from: "克劳德代码", to: "Claude Code" }] },
  keymap: structuredClone(DEFAULT_KEYMAP),
  encoder: structuredClone(DEFAULT_ENCODER),
  settings: { microphoneId: "", microphoneSource: "computer", formatting: "raw", customOrganizerRule: "", theme: "system", floating: true, backgroundOpacity: 70, operation: "toggle", startupSound: true, voiceShortcut: "Ctrl+Shift+Space", globalShortcutsEnabled: false, boardF22Enabled: true, rightAltEnabled: false, outputMode: "history", activeWindowOutputEnabled: true, keyDiagnosticsEnabled: false, simulatorEnabled: false, sttMode: "unconfigured", sttEndpoint: "", companionName: COMPANION_DEFAULTS.name, companionWakePhrase: COMPANION_DEFAULTS.wakePhrase, companionEndSmoothWindowMs: COMPANION_DEFAULTS.endSmoothWindowMs, companionIdleTimeoutMs: COMPANION_DEFAULTS.idleTimeoutMs },
  runtime: {
    inputBridge: { available: false, process: "unknown", boardConnected: false, configCollectionWritable: false, calibrationCollectionWritable: false, restarts: 0, error: "" },
    easyInputAudio: { available: false, configured: false, kind: "easyinput-lan", state: "not-configured", reason: "easyinput-audio-not-configured", networkReady: false, heartbeat: false, streaming: false, setup: { configured: false }, micTest: false, level: 0, counters: {} },
    companion: { active: false, state: "idle", provider: "doubao", sessionId: "", generation: 0, eventSequence: 0, transcript: "", reply: "", error: "", audioSource: { available: false, kind: "computer", reason: "computer-audio-renderer-unavailable" }, audioSink: { available: false, kind: "computer", reason: "computer-audio-renderer-unavailable" }, audioSelection: { requestedSource: "computer", activeSource: "", output: "computer", fallback: null }, computerAudio: { ready: false, sourceActive: false, sinkActive: false, counters: {}, sinkCancelReasons: {}, lastSinkCancelReason: "none" }, service: { configured: false, provider: "doubao" }, serviceConfigured: false, build: { id: "unknown", version: "unknown" }, mainState: { active: false, state: "idle", generation: 0 }, stopLifecycle: { pending: false, result: "never", error: "", attempts: 0 }, providerLifecycle: {}, turnLifecycle: {} },
    memory: { ready: false, storage: "unavailable" },
    lastTrigger: null,
  },
  expressionMapping: { idle: "sleep", listening: "listen", thinking: "think", working: "focus", waiting_user: "listen", completed: "happy", error: "alert" },
  agentExpressionMapping: { codex: "focus", claude: "listen", hermes: "think", workbody: "happy" },
  agentControl: { agentId: "codex", customName: "", state: "idle", automaticStatusEnabled: true },
  currentExpression: "focus",
  expressionEditor: { eyeSize: 72, eyeGap: 58, brightness: 80, blink: true, color: "cyan" },
  motion: { preset: "attentive", speed: 45, range: 55 },
  sensors: { autoBrightness: true, faceTracking: false },
  aiEvent: { ...DEFAULT_AI_EVENT },
  aiIntent: mapAiStateToPetIntent({ state: "idle" }),
};

function mergeDefaults(value) {
  if (!value || typeof value !== "object") return structuredClone(defaultState);
  return {
    ...structuredClone(defaultState), ...value, schemaVersion: SCHEMA_VERSION,
    history: Array.isArray(value.history) ? value.history.map(normalizeHistoryEntry) : structuredClone(defaultState.history),
    keymap: Array.isArray(value.keymap) && value.keymap.length === 8 ? value.keymap.map((item, index) => normalizeKeyBinding(item, defaultState.keymap[index])) : structuredClone(defaultState.keymap),
    encoder: normalizeEncoder(value.encoder),
    vocabulary: { ...defaultState.vocabulary, ...(value.vocabulary || {}) },
    settings: (() => { const companion = normalizeCompanionPreferences({ name: value.settings?.companionName, wakePhrase: value.settings?.companionWakePhrase, endSmoothWindowMs: value.settings?.companionEndSmoothWindowMs, idleTimeoutMs: value.settings?.companionIdleTimeoutMs }); return { ...defaultState.settings, ...(value.settings || {}), microphoneSource: normalizeMicrophoneSource(value.settings?.microphoneSource), operation: "toggle", companionName: companion.name, companionWakePhrase: companion.wakePhrase, companionEndSmoothWindowMs: companion.endSmoothWindowMs, companionIdleTimeoutMs: companion.idleTimeoutMs }; })(),
    expressionMapping: { ...defaultState.expressionMapping, ...(value.expressionMapping || {}) },
    agentExpressionMapping: { ...defaultState.agentExpressionMapping, ...(value.agentExpressionMapping || {}) },
    agentControl: normalizeAgentControl(value.agentControl),
    expressionEditor: { ...defaultState.expressionEditor, ...(value.expressionEditor || {}) },
    motion: { ...defaultState.motion, ...(value.motion || {}) },
    sensors: { ...defaultState.sensors, ...(value.sensors || {}) },
    runtime: { ...defaultState.runtime, ...(value.runtime || {}), inputBridge: { ...defaultState.runtime.inputBridge, ...(value.runtime?.inputBridge || {}) }, easyInputAudio: { ...defaultState.runtime.easyInputAudio, ...(value.runtime?.easyInputAudio || {}) }, companion: { ...defaultState.runtime.companion, ...(value.runtime?.companion || {}) }, memory: { ...defaultState.runtime.memory, ...(value.runtime?.memory || {}) } },
    aiEvent: { ...defaultState.aiEvent, ...(value.aiEvent || {}) },
    aiIntent: value.aiIntent || defaultState.aiIntent,
  };
}

export function migrateState(raw) {
  if (!raw || typeof raw !== "object") return structuredClone(defaultState);
  if (raw.schemaVersion === 0) raw = { ...raw, vocabulary: { hotwords: raw.hotwords || [], rules: raw.rules || [] } };
  if ((raw.schemaVersion ?? 0) < 4) raw = { ...raw, settings: { ...(raw.settings || {}), formatting: "raw" } };
  if ((raw.schemaVersion ?? 0) < 5) raw = { ...raw, history: Array.isArray(raw.history) ? raw.history.map(normalizeHistoryEntry) : raw.history };
  if ((raw.schemaVersion ?? 0) < 6) raw = { ...raw, keymap: Array.isArray(raw.keymap) ? raw.keymap.map((item, index) => normalizeKeyBinding(item, DEFAULT_KEYMAP[index])) : raw.keymap, encoder: normalizeEncoder(raw.encoder), settings: { ...(raw.settings || {}), activeWindowOutputEnabled: true } };
  if ((raw.schemaVersion ?? 0) < 7) raw = { ...raw, agentControl: normalizeAgentControl(raw.agentControl) };
  if ((raw.schemaVersion ?? 0) < 8) raw = { ...raw, settings: { ...(raw.settings || {}), microphoneSource: normalizeMicrophoneSource(raw.settings?.microphoneSource), globalShortcutsEnabled: false } };
  if ((raw.schemaVersion ?? 0) < 9 && isLegacyDemoAiEvent(raw.aiEvent)) raw = { ...raw, aiEvent: { ...DEFAULT_AI_EVENT }, aiIntent: mapAiStateToPetIntent({ state: "idle" }) };
  if ((raw.schemaVersion ?? 0) < 10) raw = { ...raw, agentControl: normalizeAgentControl({ ...(raw.agentControl || {}), automaticStatusEnabled: raw.agentControl?.automaticStatusEnabled !== false }) };
  if ((raw.schemaVersion ?? 0) < 11) raw = { ...raw, runtime: { ...(raw.runtime || {}), companion: { ...(raw.runtime?.companion || {}), audioSelection: { requestedSource: "computer", activeSource: "", output: "computer", fallback: null } } } };
  if ((raw.schemaVersion ?? 0) < 12) raw = { ...raw, settings: { ...(raw.settings || {}), companionName: COMPANION_DEFAULTS.name, companionWakePhrase: COMPANION_DEFAULTS.wakePhrase, companionEndSmoothWindowMs: COMPANION_DEFAULTS.endSmoothWindowMs, companionIdleTimeoutMs: COMPANION_DEFAULTS.idleTimeoutMs } };
  return mergeDefaults(raw);
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
    return raw ? validateConfig(raw) : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

export function serializeConfig(state) {
  const safe = structuredClone(state);
  if (safe.settings) safe.settings.sttEndpoint = "";
  safe.history = [];
  delete safe.diagnostics;
  delete safe.runtime;
  return JSON.stringify(safe, null, 2);
}

export function validateConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("配置必须是 JSON 对象");
  if (value.schemaVersion !== undefined && (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 0)) throw new Error("schemaVersion 必须是非负整数数字");
  if ((value.schemaVersion ?? 0) > SCHEMA_VERSION) throw new Error("配置来自更高版本，请先升级 DeskMate");
  if (value.history !== undefined && (!Array.isArray(value.history) || value.history.some((item) => !item || typeof item !== "object" || typeof item.text !== "string" || typeof item.time !== "string" || (item.rawText !== undefined && typeof item.rawText !== "string") || (item.organizer !== undefined && (!item.organizer || typeof item.organizer !== "object" || Array.isArray(item.organizer)))))) throw new Error("历史记录格式无效");
  if (value.keymap !== undefined && (!Array.isArray(value.keymap) || value.keymap.length !== 8 || value.keymap.some((item) => typeof item !== "string" && (!item || typeof item !== "object" || Array.isArray(item) || typeof item.action !== "string")))) throw new Error("按键映射必须包含 8 项有效动作");
  if (value.encoder !== undefined && (!value.encoder || typeof value.encoder !== "object" || Array.isArray(value.encoder))) throw new Error("旋钮配置格式无效");
  if (value.vocabulary !== undefined && (!value.vocabulary || typeof value.vocabulary !== "object" || Array.isArray(value.vocabulary))) throw new Error("词库格式无效");
  if (value.vocabulary?.hotwords && (!Array.isArray(value.vocabulary.hotwords) || value.vocabulary.hotwords.some((item) => typeof item !== "string"))) throw new Error("热词格式无效");
  if (value.vocabulary?.rules && (!Array.isArray(value.vocabulary.rules) || value.vocabulary.rules.some((item) => !item || typeof item.from !== "string" || typeof item.to !== "string"))) throw new Error("替换规则格式无效");
  if (value.settings !== undefined && (!value.settings || typeof value.settings !== "object" || Array.isArray(value.settings))) throw new Error("设置格式无效");
  if (value.settings?.voiceShortcut !== undefined && (typeof value.settings.voiceShortcut !== "string" || value.settings.voiceShortcut.length > 64)) throw new Error("语音快捷键格式无效");
  if (value.settings?.microphoneSource !== undefined && !["computer", "easyinput"].includes(value.settings.microphoneSource)) throw new Error("麦克风来源无效");
  if (value.settings?.globalShortcutsEnabled !== undefined && typeof value.settings.globalShortcutsEnabled !== "boolean") throw new Error("普通键盘全局快捷键设置无效");
  if (value.settings?.boardF22Enabled !== undefined && typeof value.settings.boardF22Enabled !== "boolean") throw new Error("板子 F22 设置无效");
  if (value.settings?.rightAltEnabled !== undefined && typeof value.settings.rightAltEnabled !== "boolean") throw new Error("右 Alt 设置无效");
  if (value.settings?.outputMode !== undefined && !["history", "clipboard"].includes(value.settings.outputMode)) throw new Error("文字输出方式无效");
  if (value.settings?.activeWindowOutputEnabled !== undefined && typeof value.settings.activeWindowOutputEnabled !== "boolean") throw new Error("当前窗口输出设置无效");
  if (value.settings?.keyDiagnosticsEnabled !== undefined && typeof value.settings.keyDiagnosticsEnabled !== "boolean") throw new Error("按键诊断设置无效");
  if (value.settings?.simulatorEnabled !== undefined && typeof value.settings.simulatorEnabled !== "boolean") throw new Error("模拟器设置无效");
  if (value.settings?.sttMode !== undefined && !["unconfigured", "mock", "http", "bailian"].includes(value.settings.sttMode)) throw new Error("STT 模式无效");
  if (value.settings?.companionName !== undefined && (typeof value.settings.companionName !== "string" || !value.settings.companionName.trim() || value.settings.companionName.length > 32)) throw new Error("陪伴名称无效");
  if (value.settings?.companionWakePhrase !== undefined && (typeof value.settings.companionWakePhrase !== "string" || !value.settings.companionWakePhrase.trim() || value.settings.companionWakePhrase.length > 64)) throw new Error("唤醒短语无效");
  if (value.settings?.companionEndSmoothWindowMs !== undefined && !isValidCompanionEndSmoothWindowMs(value.settings.companionEndSmoothWindowMs)) throw new Error("停顿阈值无效");
  if (value.settings?.companionIdleTimeoutMs !== undefined && !isValidCompanionIdleTimeoutMs(value.settings.companionIdleTimeoutMs)) throw new Error("会话空闲时长无效");
  if (value.settings?.sttEndpoint !== undefined && (typeof value.settings.sttEndpoint !== "string" || value.settings.sttEndpoint.length > 2048)) throw new Error("STT 端点格式无效");
  if (value.settings?.customOrganizerRule !== undefined && (typeof value.settings.customOrganizerRule !== "string" || value.settings.customOrganizerRule.length > 4000)) throw new Error("自定义整理规则格式无效");
  const expressionIds = new Set(expressionPresets.map((item) => item.id));
  const checkExpressionMap = (mapping, label) => {
    if (mapping === undefined) return;
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping) || Object.values(mapping).some((item) => !expressionIds.has(item))) throw new Error(`${label}格式无效`);
  };
  checkExpressionMap(value.expressionMapping, "状态表情映射");
  checkExpressionMap(value.agentExpressionMapping, "AI 工具表情映射");
  if (value.agentControl !== undefined) {
    if (!value.agentControl || typeof value.agentControl !== "object" || Array.isArray(value.agentControl)) throw new Error("AI 手动控制配置无效");
    if (value.agentControl.automaticStatusEnabled !== undefined && typeof value.agentControl.automaticStatusEnabled !== "boolean") throw new Error("AI 自动状态设置无效");
    const normalizedAgentControl = normalizeAgentControl(value.agentControl);
    if (normalizedAgentControl.agentId !== value.agentControl.agentId || normalizedAgentControl.state !== value.agentControl.state || normalizedAgentControl.customName !== String(value.agentControl.customName || "")) throw new Error("AI 手动控制配置无效");
  }
  if (value.currentExpression !== undefined && !expressionIds.has(value.currentExpression)) throw new Error("当前表情不存在");
  if (value.aiEvent !== undefined && (!value.aiEvent || typeof value.aiEvent !== "object" || !AI_EVENT_TYPES.includes(value.aiEvent.type))) throw new Error("AI 状态事件格式无效");
  if (value.expressionEditor !== undefined && (!value.expressionEditor || typeof value.expressionEditor !== "object")) throw new Error("表情编辑参数格式无效");
  if (value.motion !== undefined && (!value.motion || typeof value.motion !== "object")) throw new Error("动作参数格式无效");
  if (value.sensors !== undefined && (!value.sensors || typeof value.sensors !== "object")) throw new Error("传感器设置格式无效");
  return migrateState(value);
}

function agentKey(value = "") {
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  if (normalized.includes("claude")) return "claude";
  if (normalized.includes("hermes")) return "hermes";
  if (normalized.includes("workbody")) return "workbody";
  return "codex";
}

export function reduceAppState(state, action) {
  if (action.type === "reset") return structuredClone(defaultState);
  if (action.type === "replace") return action.value;
  if (action.type === "patch") return { ...state, ...action.value };
  if (action.type === "runtime-slice") {
    const slice = String(action.slice || "");
    if (!Object.hasOwn(state.runtime || {}, slice)) return state;
    return { ...state, runtime: { ...state.runtime, [slice]: { ...(state.runtime?.[slice] || {}), ...(action.value || {}) } } };
  }
  if (action.type === "companion-runtime") {
    const current = state.runtime?.companion || {};
    const value = action.value || {};
    const currentSequence = Math.max(0, Number(current.eventSequence) || 0);
    const incomingSequence = Math.max(0, Number(value.eventSequence) || 0);
    if (incomingSequence && currentSequence && incomingSequence < currentSequence) return state;
    const currentGeneration = Math.max(0, Number(current.generation) || 0);
    const incomingGeneration = Math.max(0, Number(value.generation) || 0);
    const isStatus = value.type === "status" || !value.type;
    if (!isStatus && currentGeneration && incomingGeneration && incomingGeneration < currentGeneration) return state;
    if (!isStatus && currentGeneration && incomingGeneration === currentGeneration && current.sessionId && value.sessionId && current.sessionId !== value.sessionId) return state;
    if (!isStatus && ["idle", "error"].includes(current.state) && currentGeneration && incomingGeneration && incomingGeneration <= currentGeneration && value.type !== "stop.lifecycle") return state;
    const next = { ...current };
    if (value.type === "state") {
      next.state = value.state || "error";
      next.active = !["idle", "error"].includes(next.state);
      next.sessionId = value.sessionId || (next.state === "idle" ? "" : next.sessionId || "");
      next.generation = incomingGeneration || (next.state === "idle" ? 0 : currentGeneration);
      next.error = value.error || (next.state === "error" ? next.error : "");
      for (const key of ["audioSource", "audioSink", "audioSelection", "echoGuard", "computerAudio", "service", "build", "mainState", "stopLifecycle", "providerLifecycle", "turnLifecycle", "sessionPolicy", "preferences", "wakeWord"]) if (value[key] !== undefined) next[key] = value[key];
      if (next.state === "idle") { next.transcript = ""; next.reply = ""; }
    } else if (["transcript.partial", "turn.user-final"].includes(value.type)) next.transcript = String(value.text || "").slice(-500);
    else if (["reply.partial", "turn.assistant-final"].includes(value.type)) next.reply = String(value.text || "").slice(-1000);
    else if (value.type === "audio.selection") next.audioSelection = { requestedSource: value.requestedSource || "computer", activeSource: value.activeSource || "computer", output: "computer", fallback: value.fallback || null };
    else if (value.type === "stop.lifecycle") {
      next.stopLifecycle = { ...(next.stopLifecycle || {}), ...(value.stopLifecycle || {}) };
      if (value.stopLifecycle?.pending) { next.state = "stopping"; next.active = true; }
    }
    else {
      const preserveTerminalGeneration = isStatus && !value.active && currentGeneration > incomingGeneration;
      Object.assign(next, value);
      if (preserveTerminalGeneration) { next.generation = currentGeneration; next.sessionId = current.sessionId || ""; }
    }
    for (const key of ["providerLifecycle", "turnLifecycle", "sessionPolicy", "asrTiming", "preferences", "savedPreferences", "wakeWord", "mainState", "build"]) {
      if (value[key] !== undefined) next[key] = value[key];
    }
    if (incomingSequence) next.eventSequence = incomingSequence;
    return { ...state, runtime: { ...state.runtime, companion: next } };
  }
  if (action.type === "event") {
    const event = action.value;
    const agentExpression = event.type === "working" ? state.agentExpressionMapping[agentKey(event.agent)] : null;
    const expression = agentExpression || state.expressionMapping[event.type] || state.currentExpression;
    return { ...state, aiEvent: event, aiIntent: mapAiStateToPetIntent({ state: legacyState(event.type) }), currentExpression: expression };
  }
  return state;
}

const AppStoreContext = createContext(null);
export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(reduceAppState, undefined, loadState);
  useEffect(() => { try { const persisted = structuredClone(state); delete persisted.runtime; localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)); } catch { /* storage can be unavailable */ } }, [state]);
  const patch = useCallback((value) => dispatch({ type: "patch", value }), []);
  const mergeRuntime = useCallback((slice, value) => dispatch({ type: "runtime-slice", slice, value }), []);
  const updateCompanion = useCallback((value) => dispatch({ type: "companion-runtime", value }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const replace = useCallback((value) => {
    const validated = validateConfig(value);
    dispatch({ type: "replace", value: validated });
    return validated;
  }, []);
  const event = useCallback((value) => dispatch({ type: "event", value }), []);
  const exportConfig = useCallback(() => serializeConfig(state), [state]);
  const api = useMemo(() => ({ state, patch, mergeRuntime, updateCompanion, reset, replace, event, exportConfig }), [state, patch, mergeRuntime, updateCompanion, reset, replace, event, exportConfig]);
  return createElement(AppStoreContext.Provider, { value: api }, children);
}
export function useAppStore() { const value = useContext(AppStoreContext); if (!value) throw new Error("useAppStore must be used inside AppStoreProvider"); return value; }
