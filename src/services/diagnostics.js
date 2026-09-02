import { normalizeAgentDelivery, normalizeLinkDiagnostics } from "../domain/linkDiagnostics.js";
import { isValidCompanionEndSmoothWindowMs, isValidCompanionIdleTimeoutMs } from "../domain/companionPreferences.js";

const SECRET_KEYS = /token|api.?key|password|wifi|path|text|transcript|recording|audio|serial|window.?title|ip|address/i;
const AUDIO_STATES = new Set(["not-configured", "binding", "waiting-heartbeat", "ready", "starting", "streaming", "ambiguous", "faulted", "unavailable", "desktop-bridge-unavailable"]);
const CONVERSATION_STATES = new Set(["idle", "connecting", "listening", "thinking", "speaking", "stopping", "completed", "error"]);
const PROVIDER_EVENTS = new Set(["none", "audio", "tts-start", "tts-end", "session-ready", "session-finished", "session-failed", "connection-started", "connection-failed", "connection-finished", "dialog-error", "error-frame", "provider-error", "transport-error", "transport-close", "other"]);
const TERMINAL_EVENTS = new Set(["none", "session-finished", "session-failed", "connection-failed", "connection-finished", "dialog-error", "error-frame", "provider-error", "transport-error", "transport-close"]);
const TERMINAL_PHASES = new Set(["none", "starting", "active", "draining", "stopping", "reconnecting", "idle"]);
const FAILURE_BUCKETS = new Set(["none", "request-invalid", "empty-audio", "audio-format-invalid", "audio-idle-timeout", "server-busy", "server-internal", "unknown-provider-error"]);
const DIALOG_ERROR_STATUS_CLASSES = new Set(["none", "missing", "invalid", "request-invalid", "empty-audio", "audio-format-invalid", "audio-idle-timeout", "server-busy", "server-internal", "unknown-provider-error"]);
const DIALOG_ERROR_ADJACENCY = new Set(["none", "adjacent-tts-end", "non-adjacent"]);
const HALF_DUPLEX_PHASES = new Set(["idle", "connecting", "listening", "thinking", "speaking", "draining", "stopping", "reconnecting", "completed", "error"]);
const TTS_TURN_OUTCOMES = new Set(["none", "completed", "manual", "stop", "provider", "drain-timeout"]);
const SINK_CANCEL_REASONS = ["none", "asr-final", "manual", "stop", "renderer", "provider", "drain-timeout", "other"];
const MANUAL_CALIBRATION_TRANSPORTS = new Set(["completed", "malformed", "busy", "stale", "conflict", "link-not-ready", "link-queue-busy", "timeout", "link-error", "peer-disconnected-or-restarted", "invalid-response", "internal", "unavailable"]);
const MANUAL_CALIBRATION_LINK_ERRORS = new Map([[0, "NONE"], [1, "UNKNOWN_TYPE"], [2, "BAD_PAYLOAD"], [3, "NOT_READY"], [4, "BUSY"], [5, "SEQUENCE_CONFLICT"], [6, "INTERNAL"]]);
const MANUAL_CALIBRATION_ENDPOINT_RESULTS = new Set(["completed", "duplicate", "not-ready", "bad-payload", "wrong-session", "stale-action", "arm-required", "arm-expired", "wrong-axis", "step-out-of-range", "center-required", "emergency-stopped", "faulted", "adapter-unavailable", "adapter-failure", "action-conflict", "safety-not-confirmed"]);
const MANUAL_CALIBRATION_OWNER_STATES = new Set(["locked", "axis-selected", "armed", "provisional-center", "emergency-stopped", "faulted"]);
const MOTION_PHASES = new Set(["unavailable", "query-required", "checking-status", "preparing-center", "starting-preset", "waiting-endpoint-completion", "stopping-and-centering", "emergency-stopping", "emergency-stopped", "clearing-emergency-stop", "ready", "recentering", "running", "not-ready", "faulted", "failed"]);
const MOTION_OPERATIONS = new Set(["run", "stopAndCenter", "emergencyStop", "clearEmergencyStopAndCenter"]);
const MOTION_PRESETS = new Set(["attention", "nod", "search", "dance"]);
const MOTION_SOURCES = new Set(["UI", "voice", "context", "idle"]);
const MOTION_RESULTS = new Set(["accepted", "duplicate", "completed", "cancelled", "not-ready", "bad-payload", "wrong-session", "stale-action", "busy", "recenter-required", "emergency-stopped", "faulted", "adapter-unavailable", "adapter-failure", "sequence-conflict"]);
const MOTION_STATES = new Set(["not-ready", "recentering", "ready", "running", "emergency-stopped", "faulted"]);

function normalizeManualCalibrationDiagnostics(value) {
  const source = value && typeof value === "object" ? value : {};
  const request = source.request && ["status", "command"].includes(source.request.kind) && Number.isInteger(source.request.id) && source.request.id >= 1 && source.request.id <= 0xffffffff
    ? { kind: source.request.kind, id: source.request.id }
    : null;
  if (!request) return { status: "unavailable", request: null, accepted: false, transport: "unavailable", linkError: { enum: "NONE", code: 0 }, endpoint: null, at: null };
  const requestedTransport = MANUAL_CALIBRATION_TRANSPORTS.has(source.transport) ? source.transport : "unavailable";
  const candidateLinkErrorCode = Number.isInteger(source.linkError?.code) && MANUAL_CALIBRATION_LINK_ERRORS.has(source.linkError.code) && MANUAL_CALIBRATION_LINK_ERRORS.get(source.linkError.code) === source.linkError.enum ? source.linkError.code : 0;
  const linkErrorCode = requestedTransport === "link-error" && candidateLinkErrorCode > 0 ? candidateLinkErrorCode : 0;
  const endpoint = source.endpoint && typeof source.endpoint === "object" ? {
    ...(MANUAL_CALIBRATION_ENDPOINT_RESULTS.has(source.endpoint.result) ? { result: source.endpoint.result } : {}),
    ...(MANUAL_CALIBRATION_OWNER_STATES.has(source.endpoint.state) ? { state: source.endpoint.state } : {}),
  } : null;
  const at = typeof source.at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(source.at) ? source.at : null;
  return {
    status: "available",
    request,
    accepted: source.accepted === true,
    transport: requestedTransport === "link-error" && linkErrorCode === 0 ? "unavailable" : requestedTransport,
    linkError: { enum: MANUAL_CALIBRATION_LINK_ERRORS.get(linkErrorCode), code: linkErrorCode },
    endpoint: endpoint && Object.keys(endpoint).length > 0 ? endpoint : null,
    at,
  };
}

function normalizeMotionPresetDiagnostics(value) {
  const source = value && typeof value === "object" ? value : {};
  const endpointSource = source.endpoint && typeof source.endpoint === "object" ? source.endpoint : null;
  const endpoint = endpointSource && MOTION_RESULTS.has(endpointSource.result) && MOTION_STATES.has(endpointSource.state) ? {
    actionId: Number.isInteger(endpointSource.actionId) && endpointSource.actionId >= 0 && endpointSource.actionId <= 0xffffffff ? endpointSource.actionId : 0,
    completedPresetCounter: Number.isInteger(endpointSource.completedPresetCounter) && endpointSource.completedPresetCounter >= 0 && endpointSource.completedPresetCounter <= 0xffffffff ? endpointSource.completedPresetCounter : 0,
    result: endpointSource.result,
    state: endpointSource.state,
    operation: MOTION_OPERATIONS.has(endpointSource.operation) ? endpointSource.operation : null,
    preset: MOTION_PRESETS.has(endpointSource.preset) ? endpointSource.preset : null,
    requestedRepeat: Number.isInteger(endpointSource.requestedRepeat) && endpointSource.requestedRepeat >= 0 && endpointSource.requestedRepeat <= 3 ? endpointSource.requestedRepeat : 0,
    completedRepeat: Number.isInteger(endpointSource.completedRepeat) && endpointSource.completedRepeat >= 0 && endpointSource.completedRepeat <= 3 ? endpointSource.completedRepeat : 0,
    source: MOTION_SOURCES.has(endpointSource.source) ? endpointSource.source : null,
    adapterAvailable: endpointSource.adapterAvailable === true,
    logicalCenterAccepted: endpointSource.logicalCenterAccepted === true,
    emergencyStopLatched: endpointSource.emergencyStopLatched === true,
    faulted: endpointSource.faulted === true,
    servoOutputEnabled: endpointSource.servoOutputEnabled === true,
    operationTerminal: endpointSource.operationTerminal === true,
    duplicateResponse: endpointSource.duplicateResponse === true,
  } : null;
  return {
    status: source.status === "available" ? "available" : "unavailable",
    phase: MOTION_PHASES.has(source.phase) ? source.phase : "unavailable",
    busy: source.busy === true,
    operation: MOTION_OPERATIONS.has(source.operation) ? source.operation : null,
    preset: MOTION_PRESETS.has(source.preset) ? source.preset : null,
    repeat: Number.isInteger(source.repeat) && source.repeat >= 1 && source.repeat <= 3 ? source.repeat : 0,
    source: MOTION_SOURCES.has(source.source) ? source.source : null,
    endpointReportedComplete: source.endpointReportedComplete === true,
    endpoint,
    reason: /^[a-z0-9-]{0,80}$/.test(String(source.reason || "")) ? String(source.reason || "") : "internal",
  };
}
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
  const enumerated = bridge.boardConnected === true;
  const collectionState = (value) => !enumerated ? "not-enumerated" : typeof value === "boolean" ? (value ? "writable" : "unavailable") : "unknown";
  const easyInputHid = {
    enumerated,
    configCollection: collectionState(bridge.configCollectionWritable),
    calibrationCollection: collectionState(bridge.calibrationCollectionWritable),
    motionCollection: collectionState(bridge.motionCollectionWritable),
  };
  const link = normalizeLinkDiagnostics(bridge.linkDiagnostics);
  const agentStateDelivery = normalizeAgentDelivery(bridge.agentStateDelivery);
  const manualCalibration = normalizeManualCalibrationDiagnostics(bridge.manualCalibration);
  const motionPresets = normalizeMotionPresetDiagnostics(bridge.motionPresets);
  const conversationSource = input.conversation || {};
  const conversationCounters = conversationSource.counters || {};
  const echoGuardSource = conversationSource.echoGuard || {};
  const echoGuardCounters = echoGuardSource.counters || {};
  const buildSource = conversationSource.build || {};
  const stopSource = conversationSource.stopLifecycle || {};
  const providerSource = conversationSource.providerLifecycle || {};
  const turnSource = conversationSource.turnLifecycle || {};
  const asrPhaseSource = turnSource.asrFinalArrivalPhases || {};
  const sinkCancelSource = conversationSource.sinkCancelReasons || {};
  const mainStateSource = conversationSource.mainState || {};
  const savedPreferencesSource = conversationSource.savedPreferences || {};
  const sessionPolicySource = conversationSource.sessionPolicy || {};
  const sessionAppliedSource = sessionPolicySource.sessionApplied || {};
  const asrTimingSource = conversationSource.asrTiming || {};
  const savedEndpointing = {
    revision: Math.max(0, Number(savedPreferencesSource.revision) || 0),
    endSmoothWindowMs: isValidCompanionEndSmoothWindowMs(savedPreferencesSource.endSmoothWindowMs) ? Number(savedPreferencesSource.endSmoothWindowMs) : 5000,
    idleTimeoutMs: isValidCompanionIdleTimeoutMs(savedPreferencesSource.idleTimeoutMs) ? Number(savedPreferencesSource.idleTimeoutMs) : 60000,
  };
  const sessionApplied = isValidCompanionEndSmoothWindowMs(sessionAppliedSource.endSmoothWindowMs) && isValidCompanionIdleTimeoutMs(sessionAppliedSource.idleTimeoutMs)
    ? { revision: Math.max(0, Number(sessionAppliedSource.revision) || 0), endSmoothWindowMs: Number(sessionAppliedSource.endSmoothWindowMs), idleTimeoutMs: Number(sessionAppliedSource.idleTimeoutMs) }
    : { status: "unavailable" };
  const asrTiming = asrTimingSource.metric === "provider-partial-to-final-v1" && asrTimingSource.status === "available"
    ? { metric: "provider-partial-to-final-v1", status: "available", lastMs: Math.max(0, Math.min(60000, Number(asrTimingSource.lastMs) || 0)), samples: Math.max(0, Number(asrTimingSource.samples) || 0) }
    : { metric: "provider-partial-to-final-v1", status: "unavailable", lastMs: null, samples: Math.max(0, Number(asrTimingSource.samples) || 0) };
  const conversation = {
    state: CONVERSATION_STATES.has(conversationSource.state) ? conversationSource.state : "idle",
    serviceConfigured: Boolean(conversationSource.serviceConfigured),
    connected: Boolean(conversationSource.connected),
    input: ["computer", "easyinput"].includes(conversationSource.input) ? conversationSource.input : "computer",
    output: "computer",
    fallback: Boolean(conversationSource.fallback),
    error: /^[a-z0-9-]{0,120}$/.test(String(conversationSource.error || "")) ? String(conversationSource.error || "") : "companion-session-failed",
    build: {
      id: /^[a-z0-9.-]{1,80}$/.test(String(buildSource.id || "")) ? String(buildSource.id) : "unknown",
      version: /^[0-9.]{1,24}$/.test(String(buildSource.version || "")) ? String(buildSource.version) : "unknown",
    },
    mainState: { active: Boolean(mainStateSource.active), state: CONVERSATION_STATES.has(mainStateSource.state) ? mainStateSource.state : "idle", generation: Math.max(0, Number(mainStateSource.generation) || 0) },
    eventSequence: Math.max(0, Number(conversationSource.eventSequence) || 0),
    endpointing: { saved: savedEndpointing, sessionApplied },
    asrTiming,
    stopLifecycle: {
      pending: Boolean(stopSource.pending),
      result: /^[a-z0-9-]{1,80}$/.test(String(stopSource.result || stopSource.lastResult || "")) ? String(stopSource.result || stopSource.lastResult) : "unknown",
      error: /^[a-z0-9-]{0,120}$/.test(String(stopSource.error || "")) ? String(stopSource.error || "") : "companion-stop-failed",
      requested: Math.max(0, Number(stopSource.requested) || 0),
      duplicateRequests: Math.max(0, Number(stopSource.duplicateRequests) || 0),
      completed: Math.max(0, Number(stopSource.completed) || 0),
      reason: /^[a-z0-9-]{1,120}$/.test(String(sessionPolicySource.lastStopReason || "")) ? String(sessionPolicySource.lastStopReason) : "never",
    },
    providerLifecycle: {
      ...Object.fromEntries(["connectAttempts", "connections", "closes", "reconnects", "events", "audioEvents", "ttsStarts", "ttsEnds", "providerErrors", "errorFrames", "dialogErrors", "dialogErrorsAdjacentTtsEnd", "sessionFinished", "sessionFailed", "connectionFinished", "transportErrors", "transportCloses", "providerEventSequence", "lastTtsEndSequence", "lastTerminalEventSequence"].map((key) => [key, Math.max(0, Number(providerSource[key]) || 0)])),
      lastProviderEvent: PROVIDER_EVENTS.has(providerSource.lastProviderEvent) ? providerSource.lastProviderEvent : "none",
      lastTerminalEvent: TERMINAL_EVENTS.has(providerSource.lastTerminalEvent) ? providerSource.lastTerminalEvent : "none",
      lastTerminalPhase: TERMINAL_PHASES.has(providerSource.lastTerminalPhase) ? providerSource.lastTerminalPhase : "none",
      lastFailureBucket: FAILURE_BUCKETS.has(providerSource.lastFailureBucket) ? providerSource.lastFailureBucket : "none",
      terminalExpected: Boolean(providerSource.terminalExpected),
      lastDialogErrorStatusClass: DIALOG_ERROR_STATUS_CLASSES.has(providerSource.lastDialogErrorStatusClass) ? providerSource.lastDialogErrorStatusClass : "none",
      lastDialogErrorAdjacency: DIALOG_ERROR_ADJACENCY.has(providerSource.lastDialogErrorAdjacency) ? providerSource.lastDialogErrorAdjacency : "none",
    },
    turnLifecycle: {
      ...Object.fromEntries(["ttsTurnStarted", "ttsTurnCompleted", "ttsTurnAbandoned", "ttsImplicitStarts", "ttsStartsWhileOpen", "ttsEndsWithoutStart", "chatFinals", "chatFinalsSuppressed", "chatFinalTtsEndPairs", "chatFinalsWithoutTtsEnd", "asrFinalsAccepted", "asrFinalsSuppressed"].map((key) => [key, Math.max(0, Number(turnSource[key]) || 0)])),
      lastAsrFinalArrivalPhase: HALF_DUPLEX_PHASES.has(turnSource.lastAsrFinalArrivalPhase) ? turnSource.lastAsrFinalArrivalPhase : "idle",
      lastTtsTurnOutcome: TTS_TURN_OUTCOMES.has(turnSource.lastTtsTurnOutcome) ? turnSource.lastTtsTurnOutcome : "none",
      asrFinalArrivalPhases: Object.fromEntries([...HALF_DUPLEX_PHASES].map((phase) => [phase, Math.max(0, Number(asrPhaseSource[phase]) || 0)])),
    },
    sinkCancellation: {
      reasons: Object.fromEntries(SINK_CANCEL_REASONS.map((reason) => [reason, Math.max(0, Number(sinkCancelSource[reason]) || 0)])),
      lastReason: SINK_CANCEL_REASONS.includes(conversationSource.lastSinkCancelReason) ? conversationSource.lastSinkCancelReason : "none",
    },
    counters: Object.fromEntries(["sourceChunks", "sinkChunks", "rejectedEvents", "interruptions", "queueDrops", "drainRequests", "drains", "drainTimeouts", "sinkAccepted", "sinkPlayed", "sinkCancelled", "backpressureWaits", "backpressureTimeouts", "bufferedAudioHighWaterMs"].map((key) => [key, Number.isInteger(conversationCounters[key]) ? conversationCounters[key] : 0])),
    echoGuard: {
      policy: echoGuardSource.policy === "computer-speaker-echo-guard-v1" ? echoGuardSource.policy : "unavailable",
      active: Boolean(echoGuardSource.active),
      phase: HALF_DUPLEX_PHASES.has(echoGuardSource.phase) ? echoGuardSource.phase : "idle",
      uplinkAllowed: Boolean(echoGuardSource.uplinkAllowed),
      counters: Object.fromEntries(["echoGuardDroppedChunks", "ignoredAsrDuringPlayback", "playbackDrainTimeouts", "teardownTimeouts"].map((key) => [key, Number.isInteger(echoGuardCounters[key]) ? echoGuardCounters[key] : 0])),
    },
  };
  const safeInput = sanitize(input);
  delete safeInput.inputBridge;
  delete safeInput.conversation;
  return { ...safeInput, schemaVersion: 1, generatedAt: new Date().toISOString(), lanAudio, conversation, easyInputHid, deskMateLink: link, agentStateDelivery, manualCalibration, motionPresets };
}
