import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { cleanupLegacyRetention, copyLegacyAudio, hasManagedHistory, historyCommand, loadManagedHistory, migrateLegacyHistory } from "./historyPersistence.js";
import { expressionPresets } from "../appData.js";
import { AI_EVENT_TYPES } from "../adapters/index.js";
import { legacyState } from "../domain/aiStatus.js";
import { DEFAULT_ENCODER, DEFAULT_KEYMAP, normalizeEncoder, normalizeKeyBinding } from "../domain/keymap.js";
import { mapAiStateToPetIntent } from "../domain/petIntent.js";
import { normalizeAgentControl } from "../domain/agentControl.js";
import { normalizeMicrophoneSource } from "../domain/microphoneSource.js";
import { COMPANION_DEFAULTS, isValidCompanionEndSmoothWindowMs, isValidCompanionIdleTimeoutMs, isValidCompanionVolume, normalizeCompanionPreferences } from "../domain/companionPreferences.js";
import { normalizeMotionState } from "../domain/motionPresets.js";
import { normalizeKeyboardPending, SHARED_KEY_INDEXES } from "../domain/keymapWorkspace.js";
import { stableVocabulary } from "../domain/vocabulary.js";

export const STORAGE_KEY = "deskmate.app-state";
export const SCHEMA_VERSION = 15;
export const PREVIOUS_STATE_KEY = `${STORAGE_KEY}.previous-valid`;
const PENDING_HISTORY_KEY = "deskmate.history-pending.v1";

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
  history: [],
  vocabulary: { hotwords: ["DeskMate", "ESP32-S3", "Codex", "Claude Code", "Hermes"], rules: [{ id: "default-rule-1", from: "桌面宠物", to: "桌宠" }, { id: "default-rule-2", from: "克劳德代码", to: "Claude Code" }] },
  keymap: structuredClone(DEFAULT_KEYMAP),
  encoder: structuredClone(DEFAULT_ENCODER),
  keyboardPending: { keymap: {}, encoder: {} },
  keyboardLayoutVersion: 0,
  settings: { microphoneId: "", microphoneSource: "computer", formatting: "raw", customOrganizerRule: "", theme: "system", floating: true, backgroundOpacity: 70, operation: "toggle", startupSound: true, voiceShortcut: "Ctrl+Shift+Space", globalShortcutsEnabled: false, boardF22Enabled: true, rightAltEnabled: false, outputMode: "history", activeWindowOutputEnabled: true, keyDiagnosticsEnabled: false, simulatorEnabled: false, sttMode: "unconfigured", sttEndpoint: "", companionName: COMPANION_DEFAULTS.name, companionWakePhrase: COMPANION_DEFAULTS.wakePhrase, companionEndSmoothWindowMs: COMPANION_DEFAULTS.endSmoothWindowMs, companionIdleTimeoutMs: COMPANION_DEFAULTS.idleTimeoutMs, companionConversationVolume: COMPANION_DEFAULTS.conversationVolume, companionCodexBriefVolume: COMPANION_DEFAULTS.codexBriefVolume, companionWakeEnabled: false },
  runtime: {
    companionPlayback: { playing: false },
    inputBridge: { available: false, process: "unknown", boardConnected: false, configCollectionWritable: false, calibrationCollectionWritable: false, restarts: 0, error: "" },
    easyInputAudio: { available: false, configured: false, kind: "easyinput-lan", state: "not-configured", reason: "easyinput-audio-not-configured", networkReady: false, heartbeat: false, streaming: false, setup: { configured: false }, micTest: false, level: 0, counters: {} },
    companion: { active: false, state: "idle", provider: "three-stage", sessionId: "", generation: 0, eventSequence: 0, transcript: "", reply: "", error: "", audioSource: { available: false, kind: "computer", reason: "computer-audio-renderer-unavailable" }, audioSink: { available: false, kind: "computer", reason: "computer-audio-renderer-unavailable" }, audioSelection: { requestedSource: "computer", activeSource: "", output: "computer", fallback: null }, computerAudio: { ready: false, sourceActive: false, sinkActive: false, counters: {}, sinkCancelReasons: {}, lastSinkCancelReason: "none" }, service: { configured: false, provider: "three-stage", stages: {} }, serviceConfigured: false, intentBridge: { status: "unavailable", taskCount: 0 }, build: { id: "unknown", version: "unknown" }, mainState: { active: false, state: "idle", generation: 0 }, stopLifecycle: { pending: false, result: "never", error: "", attempts: 0 }, providerLifecycle: {}, turnLifecycle: {} },
    memory: { ready: false, storage: "unavailable" },
    codexTasks: { receiver: "unavailable", protocol: "codex-task-brief-v1", announcementsEnabled: true, tasks: [] },
    lastTrigger: null,
  },
  expressionMapping: { idle: "sleep", listening: "listen", thinking: "think", working: "focus", waiting_user: "listen", completed: "happy", error: "alert" },
  agentExpressionMapping: { codex: "focus", claude: "listen", hermes: "think", workbody: "happy" },
  agentControl: { agentId: "codex", customName: "", state: "idle", automaticStatusEnabled: true },
  currentExpression: "focus",
  expressionEditor: { eyeSize: 72, eyeGap: 58, brightness: 80, blink: true, color: "cyan" },
  motion: { preset: "attention", speed: 45, range: 55, repeatCount: 1 },
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
    keyboardPending: normalizeKeyboardPending(value.keyboardPending),
    keyboardLayoutVersion: value.keyboardLayoutVersion >= 1 ? 1 : 0,
    vocabulary: stableVocabulary({ ...defaultState.vocabulary, ...(value.vocabulary || {}) }),
    settings: (() => { const companion = normalizeCompanionPreferences({ name: value.settings?.companionName, wakePhrase: value.settings?.companionWakePhrase, endSmoothWindowMs: value.settings?.companionEndSmoothWindowMs, idleTimeoutMs: value.settings?.companionIdleTimeoutMs, conversationVolume: value.settings?.companionConversationVolume, codexBriefVolume: value.settings?.companionCodexBriefVolume, wakeEnabled: value.settings?.companionWakeEnabled }); return { ...defaultState.settings, ...(value.settings || {}), microphoneSource: normalizeMicrophoneSource(value.settings?.microphoneSource), operation: "toggle", companionName: companion.name, companionWakePhrase: companion.wakePhrase, companionEndSmoothWindowMs: companion.endSmoothWindowMs, companionIdleTimeoutMs: companion.idleTimeoutMs, companionConversationVolume: companion.conversationVolume, companionCodexBriefVolume: companion.codexBriefVolume, companionWakeEnabled: companion.wakeEnabled }; })(),
    expressionMapping: { ...defaultState.expressionMapping, ...(value.expressionMapping || {}) },
    agentExpressionMapping: { ...defaultState.agentExpressionMapping, ...(value.agentExpressionMapping || {}) },
    agentControl: normalizeAgentControl(value.agentControl),
    expressionEditor: { ...defaultState.expressionEditor, ...(value.expressionEditor || {}) },
    motion: normalizeMotionState(value.motion),
    sensors: { ...defaultState.sensors, ...(value.sensors || {}) },
    runtime: { ...defaultState.runtime, ...(value.runtime || {}), inputBridge: { ...defaultState.runtime.inputBridge, ...(value.runtime?.inputBridge || {}) }, easyInputAudio: { ...defaultState.runtime.easyInputAudio, ...(value.runtime?.easyInputAudio || {}) }, companion: { ...defaultState.runtime.companion, ...(value.runtime?.companion || {}) }, memory: { ...defaultState.runtime.memory, ...(value.runtime?.memory || {}) }, codexTasks: { ...defaultState.runtime.codexTasks, ...(value.runtime?.codexTasks || {}) } },
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
  if ((raw.schemaVersion ?? 0) < 13) raw = { ...raw, motion: normalizeMotionState(raw.motion) };
  if ((raw.schemaVersion ?? 0) < 14) raw = { ...raw, settings: { ...(raw.settings || {}), companionWakeEnabled: false } };
  if ((raw.schemaVersion ?? 0) < 15) raw = { ...raw, settings: { ...(raw.settings || {}), companionConversationVolume: COMPANION_DEFAULTS.conversationVolume, companionCodexBriefVolume: COMPANION_DEFAULTS.codexBriefVolume } };
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

export function persistState(state, storage = globalThis.localStorage) {
  try {
    const current = storage.getItem(STORAGE_KEY);
    if (current) {
      try { validateConfig(JSON.parse(current)); } catch { return "corrupt"; }
    }
    const persisted = structuredClone(state);
    delete persisted.runtime;
    validateConfig(persisted);
    if (current) storage.setItem(PREVIOUS_STATE_KEY, current);
    storage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    return "saved";
  } catch { return "error"; }
}

export function recoverPreviousState(storage = globalThis.localStorage) {
  const previous = storage.getItem(PREVIOUS_STATE_KEY);
  if (!previous) throw new Error("没有已验证的上一份配置，请使用手动导出的备份恢复");
  const validated = validateConfig(JSON.parse(previous));
  const damaged = storage.getItem(STORAGE_KEY);
  if (damaged) storage.setItem(`${STORAGE_KEY}.damaged.${Date.now()}`, damaged);
  storage.setItem(STORAGE_KEY, previous);
  return validated;
}

export function validateConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("配置必须是 JSON 对象");
  if (value.schemaVersion !== undefined && (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 0)) throw new Error("schemaVersion 必须是非负整数数字");
  if ((value.schemaVersion ?? 0) > SCHEMA_VERSION) throw new Error("配置来自更高版本，请先升级 DeskMate");
  if (value.history !== undefined && (!Array.isArray(value.history) || value.history.some((item) => !item || typeof item !== "object" || typeof item.text !== "string" || typeof item.time !== "string" || (item.rawText !== undefined && typeof item.rawText !== "string") || (item.organizer !== undefined && (!item.organizer || typeof item.organizer !== "object" || Array.isArray(item.organizer)))))) throw new Error("历史记录格式无效");
  if (value.keymap !== undefined && (!Array.isArray(value.keymap) || value.keymap.length !== 8 || value.keymap.some((item) => typeof item !== "string" && (!item || typeof item !== "object" || Array.isArray(item) || typeof item.action !== "string")))) throw new Error("按键映射必须包含 8 项有效动作");
  if (value.encoder !== undefined && (!value.encoder || typeof value.encoder !== "object" || Array.isArray(value.encoder))) throw new Error("旋钮配置格式无效");
  if (value.vocabulary !== undefined && (!value.vocabulary || typeof value.vocabulary !== "object" || Array.isArray(value.vocabulary))) throw new Error("词库格式无效");
  if (value.vocabulary?.hotwords !== undefined && (!Array.isArray(value.vocabulary.hotwords) || value.vocabulary.hotwords.some((item) => typeof item !== "string"))) throw new Error("热词格式无效");
  if (value.vocabulary?.rules !== undefined && (!Array.isArray(value.vocabulary.rules) || value.vocabulary.rules.some((item) => !item || typeof item.from !== "string" || typeof item.to !== "string"))) throw new Error("替换规则格式无效");
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
  if (value.settings?.companionConversationVolume !== undefined && !isValidCompanionVolume(value.settings.companionConversationVolume)) throw new Error("陪伴音量无效");
  if (value.settings?.companionCodexBriefVolume !== undefined && !isValidCompanionVolume(value.settings.companionCodexBriefVolume)) throw new Error("工作提醒音量无效");
  if (value.settings?.companionWakeEnabled !== undefined && typeof value.settings.companionWakeEnabled !== "boolean") throw new Error("语音唤醒开关无效");
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
  if (action.type === "history-append") return { ...state, history: [action.value, ...state.history.filter((item) => String(item.id) !== String(action.value.id))] };
  if (action.type === "history-hydrate") {
    const persisted = new Set(action.rows.map((row) => String(row.id)));
    return { ...state, history: [...state.history.filter((row) => !persisted.has(String(row.id))), ...action.rows] };
  }
  if (action.type === "reset") return { ...state, settings: structuredClone(defaultState.settings) };
  if (action.type === "replace") {
    const next = { ...state };
    const fields = action.fields || Object.keys(action.value);
    const allowed = ["settings", "vocabulary", "expressionMapping", "agentExpressionMapping", "agentControl", "expressionEditor", "motion", "sensors", "currentExpression"];
    for (const field of allowed) if (fields.includes(field)) next[field] = action.value[field];
    const pending = normalizeKeyboardPending(state.keyboardPending);
    if (fields.includes("keymap")) {
      next.keymap = state.keymap.map((item, index) => SHARED_KEY_INDEXES.includes(index) ? action.value.keymap[index] : item);
      for (const index of SHARED_KEY_INDEXES) pending.keymap[`KEY${index + 1}`] = next.keymap[index];
    }
    if (fields.includes("encoder")) { next.encoder = action.value.encoder; pending.encoder = { ...next.encoder }; }
    next.keyboardPending = pending;
    return next;
  }
  if (action.type === "history-remove") {
    const ids = new Set(action.ids);
    return { ...state, history: state.history.filter((item) => !ids.has(item.id)) };
  }
  if (action.type === "history-retention-cleanup") {
    const historyIds = new Set((action.historyIds || []).map(String));
    const audioIds = new Set((action.audioIds || []).map(String));
    return { ...state, history: state.history.filter((item) => !historyIds.has(String(item.id))).map((item) => {
      if (!audioIds.has(String(item.audioId || ""))) return item;
      const next = { ...item, recordingUnavailable: true }; delete next.audioId; return next;
    }) };
  }
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
      for (const key of ["audioSource", "audioSink", "audioSelection", "echoGuard", "computerAudio", "service", "intentBridge", "build", "mainState", "stopLifecycle", "providerLifecycle", "turnLifecycle", "sessionPolicy", "preferences", "wakeWord"]) if (value[key] !== undefined) next[key] = value[key];
      if (next.state === "idle") { next.transcript = ""; next.reply = ""; }
    } else if (["transcript.partial", "turn.user-final"].includes(value.type)) next.transcript = String(value.text || "").slice(-500);
    else if (["reply.partial", "turn.assistant-final"].includes(value.type)) next.reply = "";
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
    for (const key of ["providerLifecycle", "turnLifecycle", "sessionPolicy", "asrTiming", "intentBridge", "preferences", "savedPreferences", "wakeWord", "mainState", "build"]) {
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
  const [storageStatus, setStorageStatus] = useState("pending");
  const [historyStatus, setHistoryStatus] = useState({ phase: hasManagedHistory() ? "migrating" : "browser", error: "" });
  const historyBusy = useRef(false);
  const pendingHistory = useRef(new Map());
  const migrationSource = useRef(state.history);
  const mounted = useRef(false);
  const persistPending = () => {
    // A corrupt retry queue is evidence, not an empty default to overwrite.
    const prior = localStorage.getItem(PENDING_HISTORY_KEY);
    if (prior && !Array.isArray(JSON.parse(prior))) throw new Error("待保存队列损坏，请先导出本次文字");
    localStorage.setItem(PENDING_HISTORY_KEY, JSON.stringify([...pendingHistory.current.values()]));
  };
  const saveManagedEntry = async (entry) => {
    if (entry.audioId) {
      const audio = await historyCommand("audio-get", entry.audioId);
      if (!audio) await copyLegacyAudio(entry.audioId);
    }
    await historyCommand("append", entry);
    pendingHistory.current.delete(String(entry.id));
    persistPending();
  };
  const retryHistory = useCallback(async () => {
    if (!hasManagedHistory() || historyBusy.current) return;
    historyBusy.current = true;
    setHistoryStatus({ phase: "migrating", error: "" });
    try {
      // Do not switch to an empty store when the legacy source cannot be decoded.
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) validateConfig(JSON.parse(raw));
      const savedPending = JSON.parse(localStorage.getItem(PENDING_HISTORY_KEY) || "[]");
      if (!Array.isArray(savedPending)) throw new Error("待保存队列损坏");
      for (const entry of savedPending) {
        if (!entry || entry.id == null || typeof entry.text !== "string") throw new Error("待保存队列损坏");
        pendingHistory.current.set(String(entry.id), entry);
        dispatch({ type: "history-append", value: entry });
      }
      await migrateLegacyHistory(migrationSource.current);
      for (const entry of [...pendingHistory.current.values()]) await saveManagedEntry(entry);
      const rows = await loadManagedHistory();
      dispatch({ type: "history-hydrate", rows, pendingIds: [...pendingHistory.current.keys()] });
      setHistoryStatus({ phase: "ready", error: "" });
    } catch (error) { setHistoryStatus({ phase: "error", error: error.message || "本机历史保存不可用" }); }
    finally { historyBusy.current = false; }
  }, []);
  useEffect(() => { if (!mounted.current) { mounted.current = true; void retryHistory(); } }, [retryHistory]);
  useEffect(() => {
    let disposed = false;
    const applyCleanup = async (value) => {
      if (disposed || !value?.jobId || historyBusy.current || pendingHistory.current.size) return;
      try {
        await cleanupLegacyRetention(value);
        const removed = new Set((value.historyIds || []).map(String));
        const removedAudio = new Set((value.audioIds || []).map(String));
        migrationSource.current = migrationSource.current.filter((item) => !removed.has(String(item.id))).map((item) => {
          if (!removedAudio.has(String(item.audioId || ""))) return item;
          const next = { ...item, recordingUnavailable: true }; delete next.audioId; return next;
        });
        dispatch({ type: "history-retention-cleanup", historyIds: value.historyIds, audioIds: value.audioIds });
        await globalThis.desktopBridge?.acknowledgeLocalRetention?.({ jobId: value.jobId });
      } catch { /* Primary data is already quarantined; main keeps this exact browser cleanup retryable. */ }
    };
    const unsubscribe = globalThis.desktopBridge?.onLocalRetentionCleanup?.(applyCleanup);
    void globalThis.desktopBridge?.getLocalRetentionStatus?.().then((status) => Promise.all((status?.pendingBrowserCleanup || []).map(applyCleanup))).catch(() => {});
    return () => { disposed = true; unsubscribe?.(); };
  }, []);
  useEffect(() => {
    setStorageStatus(persistState(historyStatus.phase === "ready" ? { ...state, history: [] } : state));
  }, [state, historyStatus.phase]);
  const appendHistory = useCallback(async (entry) => {
    dispatch({ type: "history-append", value: entry });
    if (!hasManagedHistory()) return;
    pendingHistory.current.set(String(entry.id), entry);
    // Best-effort crash retry source; primary SQLite success remains authoritative.
    try { persistPending(); } catch { /* Primary write below may still succeed. */ }
    try { await saveManagedEntry(entry); }
    catch (error) {
      setHistoryStatus({ phase: "error", error: error.message || "记录未保存，请重试或导出" });
      throw new Error("历史未能可靠保存；本次文字仍在页面，请前往历史记录重试或导出");
    }
  }, []);
  const removeHistory = useCallback(async (ids) => {
    if (hasManagedHistory()) {
      if (historyBusy.current || pendingHistory.current.size) throw new Error("请先完成迁移或重试未保存记录");
      const status = await historyCommand("status");
      if (!status.migrated) throw new Error("迁移未完成，原数据仍保留");
      await historyCommand("remove", { ids });
    }
    dispatch({ type: "history-remove", ids });
  }, []);
  const patch = useCallback((value) => dispatch({ type: "patch", value }), []);
  const mergeRuntime = useCallback((slice, value) => dispatch({ type: "runtime-slice", slice, value }), []);
  const updateCompanion = useCallback((value) => dispatch({ type: "companion-runtime", value }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const replace = useCallback((value) => {
    const validated = validateConfig(value);
    dispatch({ type: "replace", value: validated, fields: Object.keys(value) });
    return validated;
  }, []);
  const event = useCallback((value) => dispatch({ type: "event", value }), []);
  const exportConfig = useCallback(() => serializeConfig(state), [state]);
  const hasPendingHistory = useCallback(() => historyBusy.current || pendingHistory.current.size > 0, []);
  const api = useMemo(() => ({ state, storageStatus, historyStatus, hasPendingHistory, retryHistory, appendHistory, removeHistory, patch, mergeRuntime, updateCompanion, reset, replace, event, exportConfig }), [state, storageStatus, historyStatus, hasPendingHistory, retryHistory, appendHistory, removeHistory, patch, mergeRuntime, updateCompanion, reset, replace, event, exportConfig]);
  return createElement(AppStoreContext.Provider, { value: api }, children);
}
export function useAppStore() { const value = useContext(AppStoreContext); if (!value) throw new Error("useAppStore must be used inside AppStoreProvider"); return value; }
