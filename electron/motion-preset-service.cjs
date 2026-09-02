"use strict";

const { EventEmitter } = require("events");
const { randomBytes } = require("crypto");
const {
  ENDPOINT_RESULTS,
  ENDPOINT_STATES,
  OPERATIONS,
  PRESETS,
  SOURCES,
  encodeMotionPresetFeatureReport,
} = require("./motion-presets-hid.cjs");

const SAFE_REASONS = new Set([
  "automatic-motion-disabled", "easyinput-not-connected", "input-bridge-unavailable", "input-bridge-stopped", "input-bridge-exited", "input-bridge-write-failed",
  "manual-control-active", "motion-preset-busy", "motion-preset-interface-unavailable", "motion-preset-timeout", "motion-preset-report-invalid", "motion-preset-write-failed",
  "motion-operation-cancelled", "motion-action-superseded", "peer-disconnected-or-restarted", "invalid-response", "completed", "malformed", "busy", "stale", "conflict",
  "link-not-ready", "link-queue-busy", "timeout", "link-error", "internal", "not-ready", "bad-payload", "wrong-session", "stale-action", "recenter-required",
  "emergency-stopped", "faulted", "adapter-unavailable", "adapter-failure", "sequence-conflict", "cancelled",
]);

function randomNonZero() {
  let value = 0;
  while (value === 0) value = randomBytes(4).readUInt32LE(0);
  return value;
}

function safeReason(value, fallback = "internal") {
  const reason = String(value || "");
  return SAFE_REASONS.has(reason) ? reason : fallback;
}

function sanitizeEndpoint(value) {
  if (!value || typeof value !== "object") return null;
  if (!ENDPOINT_RESULTS.includes(value.result) || !ENDPOINT_STATES.includes(value.state)) return null;
  return Object.freeze({
    actionId: Number.isSafeInteger(value.actionId) && value.actionId >= 0 && value.actionId <= 0xffffffff ? value.actionId : 0,
    completedPresetCounter: Number.isSafeInteger(value.completedPresetCounter) && value.completedPresetCounter >= 0 && value.completedPresetCounter <= 0xffffffff ? value.completedPresetCounter : 0,
    result: value.result,
    state: value.state,
    preset: Object.hasOwn(PRESETS, value.preset) ? value.preset : null,
    operation: Object.hasOwn(OPERATIONS, value.operation) ? value.operation : null,
    requestedRepeat: Number.isInteger(value.requestedRepeat) && value.requestedRepeat >= 0 && value.requestedRepeat <= 3 ? value.requestedRepeat : 0,
    completedRepeat: Number.isInteger(value.completedRepeat) && value.completedRepeat >= 0 && value.completedRepeat <= 3 ? value.completedRepeat : 0,
    source: Object.hasOwn(SOURCES, value.source) ? value.source : null,
    adapterAvailable: value.adapterAvailable === true,
    logicalCenterAccepted: value.logicalCenterAccepted === true,
    emergencyStopLatched: value.emergencyStopLatched === true,
    faulted: value.faulted === true,
    servoOutputEnabled: value.servoOutputEnabled === true,
    operationTerminal: value.operationTerminal === true,
    duplicateResponse: value.duplicateResponse === true,
  });
}

class MotionPresetService extends EventEmitter {
  constructor({
    send,
    requestIdSequence = null,
    randomUInt32 = randomNonZero,
    now = () => Date.now(),
    schedule = setTimeout,
    cancel = clearTimeout,
    pollIntervalMs = 120,
    operationTimeoutMs = 15000,
    isAutomaticMotionEnabled = () => false,
    isManualControlActive = () => false,
  } = {}) {
    super();
    if (typeof send !== "function") throw new Error("motion-presets-send-required");
    if (requestIdSequence !== null && typeof requestIdSequence?.next !== "function") throw new Error("motion-presets-request-id-sequence-invalid");
    if (typeof isAutomaticMotionEnabled !== "function" || typeof isManualControlActive !== "function") throw new Error("motion-presets-gate-invalid");
    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 10 || pollIntervalMs > 2000 || !Number.isInteger(operationTimeoutMs) || operationTimeoutMs < 250 || operationTimeoutMs > 60000) throw new Error("motion-presets-timing-invalid");
    this.send = send;
    this.requestIdSequence = requestIdSequence;
    this.randomUInt32 = randomUInt32;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.pollIntervalMs = pollIntervalMs;
    this.operationTimeoutMs = operationTimeoutMs;
    this.isAutomaticMotionEnabled = isAutomaticMotionEnabled;
    this.isManualControlActive = isManualControlActive;
    this.requestCounter = randomUInt32() || 1;
    this.boardConnected = false;
    this.motionCollectionWritable = false;
    this.mountEpoch = 0;
    this.phase = "unavailable";
    this.activeJob = null;
    this.lastEndpoint = null;
    this.lastOutcome = null;
    this.intent = null;
    this.accepted = null;
    this.terminal = null;
    this.controllerBootId = 0;
    this.peerBootId = 0;
    this.recenterRequiredForEpoch = false;
    this.transportTail = Promise.resolve();
  }

  snapshot() {
    return Object.freeze({
      available: this.boardConnected && this.motionCollectionWritable,
      motionCollectionWritable: this.motionCollectionWritable,
      mountEpoch: this.mountEpoch,
      phase: this.phase,
      busy: Boolean(this.activeJob),
      active: this.activeJob ? Object.freeze({ operation: this.activeJob.operation, preset: this.activeJob.preset, repeat: this.activeJob.repeat, source: this.activeJob.source }) : null,
      endpoint: sanitizeEndpoint(this.lastEndpoint),
      endpointReportedComplete: this.lastOutcome?.endpointReportedComplete === true,
      lastOutcome: this.lastOutcome ? Object.freeze({ ...this.lastOutcome }) : null,
    });
  }

  diagnostics() {
    const snapshot = this.snapshot();
    return Object.freeze({
      status: snapshot.available ? "available" : "unavailable",
      phase: snapshot.phase,
      busy: snapshot.busy,
      operation: snapshot.active?.operation || snapshot.lastOutcome?.operation || null,
      preset: snapshot.active?.preset || snapshot.lastOutcome?.preset || null,
      repeat: snapshot.active?.repeat || snapshot.lastOutcome?.repeat || 0,
      source: snapshot.active?.source || snapshot.lastOutcome?.source || null,
      endpointReportedComplete: snapshot.endpointReportedComplete,
      endpoint: snapshot.endpoint,
      reason: snapshot.lastOutcome?.reason || "",
    });
  }

  publish() {
    const value = this.snapshot();
    this.emit("status", value);
    return value;
  }

  handleBridgeStatus(value = {}) {
    const connected = value.boardConnected === true;
    const writable = connected && value.motionCollectionWritable === true;
    const wasAvailable = this.boardConnected && this.motionCollectionWritable;
    const available = connected && writable;
    if (available && !wasAvailable) {
      this.mountEpoch += 1;
      this.phase = "query-required";
      this.lastEndpoint = null;
      this.lastOutcome = null;
      this.intent = null;
      this.accepted = null;
      this.terminal = null;
      this.controllerBootId = 0;
      this.peerBootId = 0;
      this.recenterRequiredForEpoch = false;
    } else if (!available && wasAvailable) {
      this._preempt("peer-disconnected-or-restarted");
      this.phase = "unavailable";
      this.lastEndpoint = null;
      this.controllerBootId = 0;
      this.peerBootId = 0;
      this.recenterRequiredForEpoch = true;
      this._recordOutcome({ ok: false, reason: "peer-disconnected-or-restarted", operation: this.intent?.operation || "status" });
    }
    this.boardConnected = connected;
    this.motionCollectionWritable = writable;
    return this.publish();
  }

  async getStatus() {
    const gate = this._availabilityFailure();
    if (gate) return this._publicFailure(gate, "status");
    const result = await this._queryStatus(null, { recoverStale: true });
    if (!result.ok) return this._publicFailure(result.reason, "status", result.endpoint);
    if (!this.activeJob) this.phase = this._phaseFromEndpoint(result.endpoint);
    this.publish();
    return Object.freeze({ ok: true, endpoint: sanitizeEndpoint(result.endpoint), endpointReportedComplete: false });
  }

  async runPreset(preset, repeat, source) {
    if (!Object.hasOwn(PRESETS, preset) || !Number.isInteger(repeat) || repeat < 1 || repeat > 3 || !Object.hasOwn(SOURCES, source)) return this._publicFailure("motion-preset-report-invalid", "run");
    if ((source === "context" || source === "idle") && !this.isAutomaticMotionEnabled()) return this._publicFailure("automatic-motion-disabled", "run", null, { preset, repeat, source });
    if (this.isManualControlActive()) return this._publicFailure("manual-control-active", "run", null, { preset, repeat, source });
    if (this.activeJob) return this._publicFailure("motion-preset-busy", "run", null, { preset, repeat, source });
    const gate = this._availabilityFailure();
    if (gate) return this._publicFailure(gate, "run", null, { preset, repeat, source });

    const job = this._beginJob({ operation: "run", preset, repeat, source });
    try {
      this.phase = "checking-status";
      this.publish();
      let status = await this._queryStatus(job, { recoverStale: true });
      if (!status.ok) return this._jobFailure(job, status.reason, status.endpoint);
      const readiness = this._readinessFailure(status.endpoint);
      if (readiness && !["recenter-required", "busy"].includes(readiness)) return this._jobFailure(job, readiness, status.endpoint);
      if (this.recenterRequiredForEpoch || status.endpoint.state !== "ready" || !status.endpoint.logicalCenterAccepted) {
        this.phase = "preparing-center";
        this.publish();
        const prepared = await this._commandAndWaitReady(job, "stopAndCenter", source);
        if (!prepared.ok) return this._jobFailure(job, prepared.reason, prepared.endpoint);
        status = prepared;
        this.recenterRequiredForEpoch = false;
      }
      const baselineCounter = status.endpoint.completedPresetCounter;
      this.phase = "starting-preset";
      this.publish();
      const command = await this._issueCommand(job, "run", { preset, repeat, source });
      if (!command.ok) return this._jobFailure(job, command.reason, command.endpoint);
      this.phase = "waiting-endpoint-completion";
      this.publish();
      const completed = await this._waitForAction(job, {
        actionId: command.actionId,
        sessionId: command.endpoint.sessionId,
        controllerBootId: command.controllerBootId,
        peerBootId: command.peerBootId,
        mode: "complete",
        baselineCounter,
        preset,
        repeat,
        source,
      });
      if (!completed.ok) return this._jobFailure(job, completed.reason, completed.endpoint);
      this.phase = "ready";
      const outcome = { ok: true, reason: "", operation: "run", preset, repeat, source, endpointReportedComplete: true };
      this._recordOutcome(outcome);
      this.publish();
      return Object.freeze({ ...outcome, endpoint: sanitizeEndpoint(completed.endpoint) });
    } finally {
      this._finishJob(job);
    }
  }

  async stopAndCenter(source = "UI") {
    return this._runRecoveryOperation("stopAndCenter", source, "ready");
  }

  async emergencyStop(source = "UI") {
    if (!["UI", "voice"].includes(source)) return this._publicFailure("motion-preset-report-invalid", "emergencyStop");
    this._preempt("motion-operation-cancelled");
    const gate = this._availabilityFailure();
    if (gate) return this._publicFailure(gate, "emergencyStop", null, { source });
    const job = this._beginJob({ operation: "emergencyStop", preset: null, repeat: 0, source });
    try {
      this.phase = "emergency-stopping";
      this.publish();
      const command = await this._issueCommand(job, "emergencyStop", { source });
      if (!command.ok) return this._jobFailure(job, command.reason, command.endpoint);
      const stopped = command.endpoint.state === "emergency-stopped" && command.endpoint.emergencyStopLatched && command.endpoint.operationTerminal
        ? { ok: true, endpoint: command.endpoint }
        : { ok: false, reason: "invalid-response", endpoint: command.endpoint };
      if (!stopped.ok) return this._jobFailure(job, stopped.reason, stopped.endpoint);
      this.phase = "emergency-stopped";
      const outcome = { ok: true, reason: "", operation: "emergencyStop", preset: null, repeat: 0, source, endpointReportedComplete: false, endpointReportedEmergencyStopped: true };
      this._recordOutcome(outcome);
      this.publish();
      return Object.freeze({ ...outcome, endpoint: sanitizeEndpoint(stopped.endpoint) });
    } finally {
      this._finishJob(job);
    }
  }

  async clearEmergencyStopAndCenter(source = "UI") {
    return this._runRecoveryOperation("clearEmergencyStopAndCenter", source, "ready");
  }

  close(reason = "motion-operation-cancelled") {
    const job = this._preempt(reason);
    if (!job) return;
    this.phase = this.boardConnected && this.motionCollectionWritable ? "query-required" : "unavailable";
    this._recordOutcome({ ok: false, reason, operation: job.operation, preset: job.preset, repeat: job.repeat, source: job.source });
    this.publish();
  }

  async _runRecoveryOperation(operation, source, target) {
    const sourceAllowed = operation === "clearEmergencyStopAndCenter" ? source === "UI" : ["UI", "voice"].includes(source);
    if (!sourceAllowed) return this._publicFailure("motion-preset-report-invalid", operation);
    if (this.isManualControlActive()) return this._publicFailure("manual-control-active", operation, null, { source });
    this._preempt("motion-operation-cancelled");
    const gate = this._availabilityFailure();
    if (gate) return this._publicFailure(gate, operation, null, { source });
    const job = this._beginJob({ operation, preset: null, repeat: 0, source });
    try {
      this.phase = operation === "stopAndCenter" ? "stopping-and-centering" : "clearing-emergency-stop";
      this.publish();
      const completed = target === "ready" ? await this._commandAndWaitReady(job, operation, source) : null;
      if (!completed?.ok) return this._jobFailure(job, completed?.reason || "internal", completed?.endpoint);
      this.recenterRequiredForEpoch = false;
      this.phase = "ready";
      const outcome = { ok: true, reason: "", operation, preset: null, repeat: 0, source, endpointReportedComplete: true };
      this._recordOutcome(outcome);
      this.publish();
      return Object.freeze({ ...outcome, endpoint: sanitizeEndpoint(completed.endpoint) });
    } finally {
      this._finishJob(job);
    }
  }

  async _commandAndWaitReady(job, operation, source) {
    const command = await this._issueCommand(job, operation, { source });
    if (!command.ok) return command;
    return this._waitForAction(job, { actionId: command.actionId, sessionId: command.endpoint.sessionId, controllerBootId: command.controllerBootId, peerBootId: command.peerBootId, mode: "ready" });
  }

  async _issueCommand(job, operation, { preset, repeat, source }) {
    const issued = await this._issue(job, { kind: "command", operation, preset, repeat, source });
    if (!issued.ok) return issued;
    const endpoint = issued.terminal.endpoint;
    if (!endpoint || endpoint.actionId !== issued.requestId) return { ok: false, reason: "invalid-response", endpoint };
    if (endpoint.operation !== operation || endpoint.source !== source || (operation === "run" ? (endpoint.preset !== preset || endpoint.requestedRepeat !== repeat) : (endpoint.preset !== null || endpoint.requestedRepeat !== 0))) return { ok: false, reason: "invalid-response", endpoint };
    const allowed = operation === "emergencyStop"
      ? new Set(["accepted", "duplicate", "completed", "emergency-stopped"])
      : new Set(["accepted", "duplicate", "completed"]);
    if (!allowed.has(endpoint.result)) return { ok: false, reason: safeReason(endpoint.result), endpoint };
    return { ok: true, actionId: issued.requestId, endpoint, controllerBootId: issued.terminal.controllerBootId, peerBootId: issued.terminal.peerBootId };
  }

  async _queryStatus(job, { recoverStale = false } = {}) {
    let recovered = false;
    while (true) {
      const issued = await this._issue(job, { kind: "status" });
      if (!issued.ok) {
        if (!recovered && recoverStale && issued.reason === "stale" && typeof this.requestIdSequence?.recoverAfterStale === "function") {
          try { this.requestIdSequence.recoverAfterStale(issued.requestId); } catch (error) { return { ok: false, reason: safeReason(error?.code || error?.message), endpoint: null }; }
          recovered = true;
          continue;
        }
        return issued;
      }
      const endpoint = issued.terminal.endpoint;
      if (!endpoint) return { ok: false, reason: "invalid-response", endpoint: null };
      this.lastEndpoint = endpoint;
      return { ok: true, endpoint, requestId: issued.requestId, controllerBootId: issued.terminal.controllerBootId, peerBootId: issued.terminal.peerBootId };
    }
  }

  async _issue(job, request) {
    if (job?.cancelled) return { ok: false, reason: job.cancelledReason || "motion-operation-cancelled", endpoint: this.lastEndpoint };
    let requestId;
    try { requestId = this._nextRequestId(); } catch (error) { return { ok: false, reason: safeReason(error?.code || error?.message), endpoint: null, requestId: 0 }; }
    let report;
    try { report = encodeMotionPresetFeatureReport({ ...request, requestId }); } catch { return { ok: false, reason: "motion-preset-report-invalid", endpoint: null, requestId }; }
    const intent = Object.freeze({
      kind: request.kind,
      operation: request.operation || "status",
      preset: request.preset || null,
      repeat: request.repeat || 0,
      source: request.source || null,
      requestId,
    });
    this.intent = intent;
    this.accepted = null;
    this.terminal = null;
    const result = await this._withTransport(async () => {
      if (job?.cancelled) return { ok: false, reason: job.cancelledReason || "motion-operation-cancelled" };
      return this.send(report, { onAccepted: (value) => { this.accepted = Object.freeze({ requestId, acceptedCount: value.acceptedCount, at: this._isoNow() }); this.publish(); } });
    });
    if (job?.cancelled) return { ok: false, reason: job.cancelledReason || "motion-operation-cancelled", endpoint: this.lastEndpoint, requestId };
    if (!result?.ok) {
      this.terminal = Object.freeze({ requestId, transport: safeReason(result?.terminal?.transport || result?.reason), at: this._isoNow() });
      return { ok: false, reason: safeReason(result?.reason), endpoint: result?.terminal?.endpoint || null, requestId };
    }
    const terminal = result.terminal;
    const identity = this._acceptTerminalIdentity(terminal, intent);
    if (!identity.ok) return { ok: false, reason: identity.reason, endpoint: terminal?.endpoint || null, requestId };
    this.terminal = Object.freeze({ requestId, transport: terminal.transport, at: this._isoNow() });
    return { ok: true, terminal, requestId };
  }

  _acceptTerminalIdentity(terminal, intent) {
    if (!terminal || terminal.stage !== "endpoint-acknowledgement" || terminal.transport !== "completed" || terminal.requestId !== intent.requestId || terminal.kind !== intent.kind) return { ok: false, reason: "invalid-response" };
    if (terminal.controllerBootId === 0 || !terminal.endpoint || terminal.endpoint.sessionId !== terminal.controllerBootId) return { ok: false, reason: "invalid-response" };
    if (intent.kind === "command" && (terminal.operation !== intent.operation || terminal.preset !== intent.preset || terminal.repeat !== intent.repeat || terminal.source !== intent.source || terminal.endpoint.actionId !== intent.requestId)) return { ok: false, reason: "invalid-response" };
    if (intent.kind === "status" && (terminal.operation !== null || terminal.preset !== null || terminal.repeat !== 0 || terminal.source !== null)) return { ok: false, reason: "invalid-response" };
    if ((this.controllerBootId && terminal.controllerBootId !== this.controllerBootId) || (this.peerBootId && terminal.peerBootId && terminal.peerBootId !== this.peerBootId)) {
      this.controllerBootId = 0;
      this.peerBootId = 0;
      this.recenterRequiredForEpoch = true;
      return { ok: false, reason: "peer-disconnected-or-restarted" };
    }
    this.controllerBootId = terminal.controllerBootId;
    if (terminal.peerBootId) this.peerBootId = terminal.peerBootId;
    return { ok: true };
  }

  async _waitForAction(job, { actionId, sessionId, controllerBootId, peerBootId, mode, baselineCounter = 0, preset = null, repeat = 0, source = null }) {
    const deadline = this.now() + this.operationTimeoutMs;
    while (this.now() <= deadline) {
      if (job.cancelled) return { ok: false, reason: job.cancelledReason || "motion-operation-cancelled", endpoint: this.lastEndpoint };
      const status = await this._queryStatus(job);
      if (!status.ok) return status;
      const endpoint = status.endpoint;
      if (status.controllerBootId !== controllerBootId || status.peerBootId !== peerBootId || endpoint.sessionId !== sessionId) {
        this.recenterRequiredForEpoch = true;
        return { ok: false, reason: "peer-disconnected-or-restarted", endpoint };
      }
      if (endpoint.actionId === actionId) {
        if (mode === "ready" && endpoint.result === "completed" && endpoint.state === "ready" && endpoint.logicalCenterAccepted && endpoint.operationTerminal) return { ok: true, endpoint };
        if (mode === "complete" && endpoint.result === "completed" && endpoint.state === "ready" && endpoint.logicalCenterAccepted && endpoint.operationTerminal && baselineCounter < 0xffffffff && endpoint.completedPresetCounter === baselineCounter + 1 && endpoint.operation === "run" && endpoint.preset === preset && endpoint.requestedRepeat === repeat && endpoint.completedRepeat === repeat && endpoint.source === source) return { ok: true, endpoint };
        if (["cancelled", "not-ready", "bad-payload", "wrong-session", "stale-action", "busy", "recenter-required", "emergency-stopped", "faulted", "adapter-unavailable", "adapter-failure", "sequence-conflict"].includes(endpoint.result)) return { ok: false, reason: safeReason(endpoint.result), endpoint };
      } else if (endpoint.actionId > actionId) {
        return { ok: false, reason: "motion-action-superseded", endpoint };
      }
      const waited = await this._wait(job, this.pollIntervalMs);
      if (!waited) return { ok: false, reason: job.cancelledReason || "motion-operation-cancelled", endpoint: this.lastEndpoint };
    }
    return { ok: false, reason: "motion-preset-timeout", endpoint: this.lastEndpoint };
  }

  _readinessFailure(endpoint) {
    if (!endpoint?.adapterAvailable || endpoint?.result === "adapter-unavailable") return "adapter-unavailable";
    if (endpoint.faulted || endpoint.state === "faulted" || endpoint.result === "faulted") return "faulted";
    if (endpoint.emergencyStopLatched || endpoint.state === "emergency-stopped" || endpoint.result === "emergency-stopped") return "emergency-stopped";
    if (endpoint.state === "not-ready" || endpoint.result === "not-ready") return "not-ready";
    if (endpoint.result === "recenter-required") return "recenter-required";
    if (endpoint.state === "running" || endpoint.state === "recentering" || endpoint.result === "busy") return "busy";
    return null;
  }

  _phaseFromEndpoint(endpoint) {
    if (!endpoint) return "query-required";
    if (endpoint.state === "ready" && endpoint.logicalCenterAccepted) return "ready";
    return endpoint.state;
  }

  _availabilityFailure() {
    if (!this.boardConnected) return "easyinput-not-connected";
    if (!this.motionCollectionWritable) return "motion-preset-interface-unavailable";
    return null;
  }

  _nextRequestId() {
    if (this.requestIdSequence) return this.requestIdSequence.next();
    this.requestCounter = (this.requestCounter + 1) >>> 0;
    if (this.requestCounter === 0) this.requestCounter = 1;
    return this.requestCounter;
  }

  _beginJob(value) {
    const job = { ...value, cancelled: false, cancelledReason: "", waitHandle: null, wake: null };
    this.activeJob = job;
    return job;
  }

  _finishJob(job) {
    if (this.activeJob === job) this.activeJob = null;
    if (this.phase !== "unavailable") this.publish();
  }

  _preempt(reason) {
    const job = this.activeJob;
    if (!job) return null;
    job.cancelled = true;
    job.cancelledReason = safeReason(reason, "motion-operation-cancelled");
    if (job.waitHandle !== null) this.cancel(job.waitHandle);
    job.waitHandle = null;
    job.wake?.(false);
    job.wake = null;
    this.activeJob = null;
    return job;
  }

  _wait(job, milliseconds) {
    if (job.cancelled) return Promise.resolve(false);
    return new Promise((resolve) => {
      job.wake = resolve;
      job.waitHandle = this.schedule(() => {
        job.waitHandle = null;
        job.wake = null;
        resolve(!job.cancelled);
      }, milliseconds);
    });
  }

  async _withTransport(task) {
    const previous = this.transportTail;
    let release;
    this.transportTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await task(); } finally { release(); }
  }

  _jobFailure(job, reason, endpoint = null) {
    const result = this._publicFailure(reason, job.operation, endpoint, job);
    if (this.phase !== "unavailable") this.phase = reason === "emergency-stopped" ? "emergency-stopped" : "failed";
    this.publish();
    return result;
  }

  _publicFailure(reason, operation, endpoint = null, details = {}) {
    const outcome = {
      ok: false,
      reason: safeReason(reason),
      operation,
      preset: Object.hasOwn(PRESETS, details.preset) ? details.preset : null,
      repeat: Number.isInteger(details.repeat) && details.repeat >= 1 && details.repeat <= 3 ? details.repeat : 0,
      source: Object.hasOwn(SOURCES, details.source) ? details.source : null,
      endpointReportedComplete: false,
    };
    this._recordOutcome(outcome);
    return Object.freeze({ ...outcome, endpoint: sanitizeEndpoint(endpoint) });
  }

  _recordOutcome(value) {
    this.lastOutcome = Object.freeze({
      ok: value.ok === true,
      reason: value.ok ? "" : safeReason(value.reason),
      operation: Object.hasOwn(OPERATIONS, value.operation) ? value.operation : "status",
      preset: Object.hasOwn(PRESETS, value.preset) ? value.preset : null,
      repeat: Number.isInteger(value.repeat) && value.repeat >= 1 && value.repeat <= 3 ? value.repeat : 0,
      source: Object.hasOwn(SOURCES, value.source) ? value.source : null,
      endpointReportedComplete: value.endpointReportedComplete === true,
      ...(value.endpointReportedEmergencyStopped === true ? { endpointReportedEmergencyStopped: true } : {}),
      at: this._isoNow(),
    });
  }

  _isoNow() {
    return new Date(this.now()).toISOString();
  }
}

module.exports = { MotionPresetService, sanitizeEndpoint };
