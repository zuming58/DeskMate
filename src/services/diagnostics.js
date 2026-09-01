import { normalizeAgentDelivery, normalizeLinkDiagnostics } from "../domain/linkDiagnostics.js";

const SECRET_KEYS = /token|api.?key|password|wifi|path|text|transcript|recording|audio|serial|window.?title|ip|address/i;
const AUDIO_STATES = new Set(["not-configured", "binding", "waiting-heartbeat", "ready", "starting", "streaming", "ambiguous", "faulted", "unavailable", "desktop-bridge-unavailable"]);
const CONVERSATION_STATES = new Set(["idle", "connecting", "listening", "thinking", "speaking", "stopping", "completed", "error"]);
export function createDiagnosticReport(input = {}) {
  const sanitize = (value) => { if (Array.isArray(value)) return value.map(sanitize); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEYS.test(key)).map(([key, item]) => [key, sanitize(item)])); };
  const source = input.lanAudio || {};
  const counters = source.counters || {};
  const lanAudio = {
    status: AUDIO_STATES.has(source.status) ? source.status : "not-configured",
    configured: Boolean(source.configured),
    networkReady: Boolean(source.networkReady),
    heartbeat: Boolean(source.heartbeat),
    micTest: Boolean(source.micTest),
    counters: Object.fromEntries(["heartbeats", "audioFrames", "droppedFrames", "sequenceGaps", "malformedPackets", "sourceRejects", "controlRetries", "controlTimeouts"].map((key) => [key, Number.isInteger(counters[key]) ? counters[key] : 0])),
  };
  const bridge = input.inputBridge || {};
  const link = normalizeLinkDiagnostics(bridge.linkDiagnostics);
  const agentStateDelivery = normalizeAgentDelivery(bridge.agentStateDelivery);
  const conversationSource = input.conversation || {};
  const conversationCounters = conversationSource.counters || {};
  const conversation = {
    state: CONVERSATION_STATES.has(conversationSource.state) ? conversationSource.state : "idle",
    serviceConfigured: Boolean(conversationSource.serviceConfigured),
    connected: Boolean(conversationSource.connected),
    input: ["computer", "easyinput"].includes(conversationSource.input) ? conversationSource.input : "computer",
    output: "computer",
    fallback: Boolean(conversationSource.fallback),
    error: /^[a-z0-9-]{0,120}$/.test(String(conversationSource.error || "")) ? String(conversationSource.error || "") : "companion-session-failed",
    counters: Object.fromEntries(["sourceChunks", "sinkChunks", "rejectedEvents", "interruptions", "queueDrops"].map((key) => [key, Number.isInteger(conversationCounters[key]) ? conversationCounters[key] : 0])),
  };
  const safeInput = sanitize(input);
  delete safeInput.inputBridge;
  delete safeInput.conversation;
  return { ...safeInput, schemaVersion: 1, generatedAt: new Date().toISOString(), lanAudio, conversation, deskMateLink: link, agentStateDelivery };
}
