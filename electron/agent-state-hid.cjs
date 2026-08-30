const { randomBytes } = require("crypto");

const AGENT_STATE_REPORT_ID = 0x12;
const AGENT_STATE_PROTOCOL_VERSION = 2;
const AGENT_STATE_PAYLOAD_BYTES = 16;
const WINDOWS_FEATURE_REPORT_BYTES = 64;
const MAX_TTL_MS = 600000;
const VOICE_WORKFLOW_SOURCE_HASH = 0x7c89f35a;

const AGENT_STATES = Object.freeze({
  idle: 0,
  listening: 1,
  thinking: 2,
  working: 3,
  waiting: 4,
  completed: 5,
  error: 6,
});

const VOICE_STATE_MAP = Object.freeze({
  idle: "idle",
  cancelled: "idle",
  recording: "listening",
  transcribing: "thinking",
  organizing: "thinking",
  outputting: "working",
  completed: "completed",
  error: "error",
});

const STATE_TTL_MS = Object.freeze({
  idle: 0,
  listening: MAX_TTL_MS,
  thinking: MAX_TTL_MS,
  working: MAX_TTL_MS,
  waiting: MAX_TTL_MS,
  completed: 10000,
  error: 10000,
});

function normalizeUint32(value, label, { nonzero = false } = {}) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff || (nonzero && value === 0)) {
    throw new Error(`${label}-invalid`);
  }
  return value >>> 0;
}

function encodeAgentStateFeatureReport({ state, transitionId, ttlMs, sourceHash = VOICE_WORKFLOW_SOURCE_HASH }) {
  if (!Object.hasOwn(AGENT_STATES, state)) throw new Error("agent-state-invalid");
  const numericState = AGENT_STATES[state];
  const transition = normalizeUint32(transitionId, "agent-transition", { nonzero: true });
  const ttl = normalizeUint32(ttlMs, "agent-ttl");
  const source = normalizeUint32(sourceHash, "agent-source-hash");
  if ((state === "idle" && ttl !== 0) || (state !== "idle" && (ttl < 1 || ttl > MAX_TTL_MS))) {
    throw new Error("agent-ttl-state-mismatch");
  }

  // Windows requires HidD_SetFeature callers to use the top-level
  // collection's FeatureReportByteLength (64 here). Only bytes 1..16 after
  // the report ID are semantic; the remaining transport padding stays zero.
  const report = Buffer.alloc(WINDOWS_FEATURE_REPORT_BYTES);
  report[0] = AGENT_STATE_REPORT_ID;
  report[1] = AGENT_STATE_PROTOCOL_VERSION;
  report[2] = numericState;
  report.writeUInt32LE(transition, 5);
  report.writeUInt32LE(ttl, 9);
  report.writeUInt32LE(source, 13);
  return report;
}

function createTransitionSequence(seed = randomBytes(4).readUInt32LE(0) || 1) {
  let next = normalizeUint32(seed, "agent-transition-seed", { nonzero: true });
  return () => {
    const value = next;
    next = (next + 1) >>> 0;
    if (next === 0) next = 1;
    return value;
  };
}

class AgentStatePublisher {
  constructor({ send, nextTransitionId = createTransitionSequence(), sourceHash = VOICE_WORKFLOW_SOURCE_HASH } = {}) {
    if (typeof send !== "function") throw new Error("agent-state-send-required");
    if (typeof nextTransitionId !== "function") throw new Error("agent-transition-source-required");
    this.send = send;
    this.nextTransitionId = nextTransitionId;
    this.sourceHash = normalizeUint32(sourceHash, "agent-source-hash");
    this.lastLiveAgentState = null;
    this.liveStreamInterrupted = false;
  }

  publishVoiceState(value = {}) {
    if (value.source !== "voice-workflow") {
      this.liveStreamInterrupted = true;
      return Promise.resolve({ ok: false, ignored: true, reason: "non-live-agent-source" });
    }
    const state = VOICE_STATE_MAP[value.state];
    if (!state) return Promise.resolve({ ok: false, ignored: true, reason: "voice-state-unmapped" });
    if (!this.liveStreamInterrupted && state === this.lastLiveAgentState) {
      return Promise.resolve({ ok: true, suppressed: true });
    }

    this.liveStreamInterrupted = false;
    this.lastLiveAgentState = state;
    const report = encodeAgentStateFeatureReport({
      state,
      transitionId: this.nextTransitionId(),
      ttlMs: STATE_TTL_MS[state],
      sourceHash: this.sourceHash,
    });
    return Promise.resolve(this.send(report)).catch(() => ({ ok: false, reason: "agent-state-send-failed" }));
  }
}

module.exports = {
  AGENT_STATES,
  AGENT_STATE_PAYLOAD_BYTES,
  AGENT_STATE_PROTOCOL_VERSION,
  AGENT_STATE_REPORT_ID,
  MAX_TTL_MS,
  STATE_TTL_MS,
  VOICE_STATE_MAP,
  WINDOWS_FEATURE_REPORT_BYTES,
  AgentStatePublisher,
  createTransitionSequence,
  encodeAgentStateFeatureReport,
};
