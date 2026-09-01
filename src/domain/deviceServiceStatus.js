import { normalizeLinkDiagnostics } from "./linkDiagnostics.js";
import { normalizeMicrophoneSource } from "./microphoneSource.js";

const LINK_PRESENTATION = Object.freeze({
  connected: Object.freeze({ label: "已连接", tone: "success" }),
  waiting: Object.freeze({ label: "等待连接", tone: "warning" }),
  faulted: Object.freeze({ label: "故障", tone: "warning" }),
  disabled: Object.freeze({ label: "未启用", tone: "neutral" }),
  unavailable: Object.freeze({ label: "不可读取", tone: "demo" }),
});

const AUDIO_UNAVAILABLE_LABELS = Object.freeze({
  "not-configured": "已接入 · 待配置",
  binding: "已接入 · 正在监听",
  "waiting-heartbeat": "不可用 · 等待心跳",
  starting: "已接入 · 正在启动",
  ambiguous: "不可用 · 多个来源",
  faulted: "不可用 · 监听失败",
  unavailable: "不可用",
  "desktop-bridge-unavailable": "不可用",
});

function microphonePresentation(audioStatus = {}, preferredMicrophoneSource = "computer") {
  const selected = normalizeMicrophoneSource(preferredMicrophoneSource);
  const state = typeof audioStatus?.state === "string" ? audioStatus.state : "desktop-bridge-unavailable";
  const streaming = state === "streaming" || audioStatus?.streaming === true;
  const available = audioStatus?.available === true || state === "ready" || streaming;
  const configured = audioStatus?.configured === true || audioStatus?.setup?.configured === true;
  if (streaming) return Object.freeze({ label: "已接入 · 当前使用中", tone: "success", state, available: true, configured, selected: true, active: true });
  if (available) {
    return selected === "easyinput"
      ? Object.freeze({ label: "已接入 · 已选择", tone: "success", state, available: true, configured, selected: true, active: false })
      : Object.freeze({ label: "已接入 · 当前未选用", tone: "neutral", state, available: true, configured, selected: false, active: false });
  }
  return Object.freeze({ label: AUDIO_UNAVAILABLE_LABELS[state] || "不可用", tone: configured ? "warning" : state === "not-configured" ? "neutral" : "demo", state, available: false, configured, selected: selected === "easyinput", active: false });
}

export function deviceServiceStatus({ inputBridge = {}, audioStatus = {}, preferredMicrophoneSource = "computer", companion = {}, memory = {} } = {}) {
  const link = normalizeLinkDiagnostics(inputBridge?.linkDiagnostics);
  const linkPresentation = LINK_PRESENTATION[link.status];
  return Object.freeze({
    easyInput: Object.freeze({ connected: inputBridge?.boardConnected === true, label: inputBridge?.boardConnected === true ? "已连接" : "等待设备", tone: inputBridge?.boardConnected === true ? "success" : "demo" }),
    xiaozhi: Object.freeze({ ...linkPresentation, state: link.status, counters: link.counters }),
    microphone: microphonePresentation(audioStatus, preferredMicrophoneSource),
    realtime: Object.freeze({ configured: companion?.service?.configured === true, label: companion?.service?.configured === true ? "凭据已配置" : "待配置", tone: companion?.service?.configured === true ? "success" : "demo" }),
    memory: Object.freeze({ ready: memory?.ready === true, label: memory?.ready === true ? "SQLite 已接入" : "不可用", tone: memory?.ready === true ? "success" : "demo" }),
  });
}

export { LINK_PRESENTATION };
