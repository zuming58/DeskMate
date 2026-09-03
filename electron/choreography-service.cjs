"use strict";

const { EventEmitter } = require("events");
const { randomBytes } = require("crypto");
const { encodeChoreographyFeatureReport } = require("./choreography-hid.cjs");
const { BUILT_IN_DEFAULT_DANCE, DEFAULT_MOTION_SETTINGS, validateChoreography } = require("./choreography-store.cjs");

const PRESETS = new Set(["attention", "nod", "search", "dance"]);
const SOURCES = new Set(["UI", "voice", "context", "idle"]);
const TERMINAL_FAILURES = new Set(["cancelled", "not-ready", "bad-payload", "wrong-session", "stale-action", "busy", "recenter-required", "emergency-stopped", "faulted", "adapter-unavailable", "adapter-failure", "sequence-conflict"]);
const SAFE_REASONS = new Set([
  "easyinput-not-connected", "input-bridge-unavailable", "input-bridge-stopped", "input-bridge-exited", "input-bridge-write-failed",
  "choreography-active", "choreography-busy", "choreography-interface-unavailable", "choreography-timeout", "choreography-report-invalid", "choreography-write-failed",
  "choreography-status-unavailable", "choreography-execute-failed", "manual-control-active", "motion-preset-active", "motion-preset-interface-unavailable",
  "motion-operation-cancelled", "peer-disconnected-or-restarted", "invalid-response", "completed", "malformed", "busy", "stale", "conflict",
  "link-not-ready", "link-queue-busy", "timeout", "link-error", "internal", ...TERMINAL_FAILURES,
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

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function builtInAction(preset, repeat = 1) {
  const actions = {
    attention: [
      { yaw: "center", pitch: "up", expression: "working" },
      { yaw: "center", pitch: "center", expression: "completed" },
    ],
    nod: [
      { yaw: "center", pitch: "down", expression: "completed" },
      { yaw: "center", pitch: "up", expression: "hold" },
      { yaw: "center", pitch: "center", expression: "hold" },
    ],
    search: [
      { yaw: "left", pitch: "center", expression: "thinking" },
      { yaw: "right", pitch: "center", expression: "thinking" },
      { yaw: "center", pitch: "center", expression: "hold" },
    ],
    dance: BUILT_IN_DEFAULT_DANCE.beats,
  };
  if (!PRESETS.has(preset) || !Number.isInteger(repeat) || repeat < 1 || repeat > 3) throw new Error("choreography-report-invalid");
  return validateChoreography({ version: 1, name: preset === "dance" ? BUILT_IN_DEFAULT_DANCE.name : `built-in-${preset}`, beatMs: preset === "dance" ? BUILT_IN_DEFAULT_DANCE.beatMs : 600, repeat, beats: actions[preset] });
}

class ChoreographyService extends EventEmitter {
  constructor({ send, requestIdSequence = null, prepareCenter, settings = () => ({ ...DEFAULT_MOTION_SETTINGS }), defaultDance = () => null, isManualControlActive = () => false, now = () => Date.now(), schedule = setTimeout, pollIntervalMs = 150, operationTimeoutMs = 180000 } = {}) {
    super();
    if (typeof send !== "function" || typeof prepareCenter !== "function") throw new Error("choreography-service-dependency-invalid");
    if (requestIdSequence !== null && typeof requestIdSequence?.next !== "function") throw new Error("choreography-request-id-sequence-invalid");
    this.send = send;
    this.requestIdSequence = requestIdSequence;
    this.prepareCenter = prepareCenter;
    this.settings = settings;
    this.defaultDance = defaultDance;
    this.isManualControlActive = isManualControlActive;
    this.now = now;
    this.schedule = schedule;
    this.pollIntervalMs = pollIntervalMs;
    this.operationTimeoutMs = operationTimeoutMs;
    this.requestCounter = randomNonZero();
    this.boardConnected = false;
    this.motionCollectionWritable = false;
    this.active = null;
    this.lastEndpoint = null;
    this.lastOutcome = null;
    this.phase = "unavailable";
  }

  snapshot() {
    const available = this.boardConnected && this.motionCollectionWritable;
    return Object.freeze({
      ready: available && !this.active && this.lastEndpoint?.adapterAvailable === true && this.lastEndpoint?.faulted !== true && this.lastEndpoint?.emergencyStopLatched !== true,
      available,
      state: this.phase,
      reason: this.lastOutcome?.ok === false ? this.lastOutcome.reason : available ? "" : this.boardConnected ? "choreography-interface-unavailable" : "easyinput-not-connected",
      busy: Boolean(this.active),
      active: this.active ? Object.freeze({ name: this.active.name, source: this.active.source }) : null,
      endpoint: this.lastEndpoint ? Object.freeze({ ...this.lastEndpoint }) : null,
      lastOutcome: this.lastOutcome ? Object.freeze({ ...this.lastOutcome }) : null,
    });
  }

  publish() { const value = this.snapshot(); this.emit("status", value); return value; }

  handleBridgeStatus(value = {}) {
    const wasAvailable = this.boardConnected && this.motionCollectionWritable;
    this.boardConnected = value.boardConnected === true;
    this.motionCollectionWritable = this.boardConnected && value.motionCollectionWritable === true;
    const available = this.boardConnected && this.motionCollectionWritable;
    if (!available) {
      this.active = null;
      this.lastEndpoint = null;
      this.phase = "unavailable";
      if (wasAvailable) this.lastOutcome = { ok: false, reason: "peer-disconnected-or-restarted" };
    } else if (!wasAvailable) {
      this.phase = "query-required";
      this.lastEndpoint = null;
      this.lastOutcome = null;
    }
    return this.publish();
  }

  async getStatus() {
    const gate = this.availabilityFailure();
    if (gate) return this.failure(gate);
    const result = await this.issue({ kind: "status" });
    if (!result.ok) return this.failure(result.reason);
    this.lastEndpoint = result.endpoint;
    this.phase = this.phaseFromEndpoint(result.endpoint);
    this.publish();
    return Object.freeze({ ok: true, ready: this.snapshot().ready, state: this.phase, endpoint: Object.freeze({ ...result.endpoint }) });
  }

  async execute(value, { source = "UI" } = {}) {
    let action;
    try { action = validateChoreography(value); } catch (error) { throw error; }
    if (!SOURCES.has(source)) return this.failure("choreography-report-invalid");
    if (this.isManualControlActive()) return this.failure("manual-control-active");
    if (this.active) return this.failure("choreography-active");
    const gate = this.availabilityFailure();
    if (gate) return this.failure(gate);
    const motionSettings = this.settings();
    const job = { name: action.name, source, cancelled: false };
    this.active = job;
    try {
      this.phase = "checking-status";
      this.publish();
      let status = await this.issue({ kind: "status" });
      if (!status.ok) return this.failure(status.reason);
      this.lastEndpoint = status.endpoint;
      if (!status.endpoint.adapterAvailable || status.endpoint.faulted || status.endpoint.emergencyStopLatched) return this.failure(this.readinessFailure(status.endpoint));
      if (status.endpoint.state !== "ready" || !status.endpoint.logicalCenterAccepted) {
        this.phase = "preparing-center";
        this.publish();
        const prepared = await this.prepareCenter(source === "voice" ? "voice" : "UI");
        if (!prepared?.ok) return this.failure(safeReason(prepared?.reason, "choreography-status-unavailable"));
        status = await this.issue({ kind: "status" });
        if (!status.ok || status.endpoint.state !== "ready" || !status.endpoint.logicalCenterAccepted) return this.failure(status.ok ? "not-ready" : status.reason);
        this.lastEndpoint = status.endpoint;
      }
      const baseline = status.endpoint.completedCounter;
      this.phase = "starting";
      this.publish();
      const command = await this.issue({ kind: "command", action, source, ...motionSettings });
      if (!command.ok) return this.failure(command.reason);
      if (!command.endpoint || command.endpoint.actionId !== command.requestId || !["accepted", "duplicate", "completed"].includes(command.endpoint.result)) return this.failure(command.endpoint?.result || "invalid-response");
      const actionId = command.requestId;
      if (command.endpoint.operationTerminal && command.endpoint.result === "completed" && command.endpoint.completedCounter > baseline && command.endpoint.completedRepeats === action.repeat && command.endpoint.logicalCenterAccepted) {
        this.phase = "ready";
        this.lastEndpoint = command.endpoint;
        this.lastOutcome = { ok: true, reason: "", name: action.name, source, endpointReportedComplete: true };
        this.publish();
        return Object.freeze({ ...this.lastOutcome, endpoint: Object.freeze({ ...command.endpoint }) });
      }
      const deadline = this.now() + this.operationTimeoutMs;
      this.phase = "running";
      this.publish();
      while (this.now() <= deadline) {
        await new Promise((resolve) => this.schedule(resolve, this.pollIntervalMs));
        if (this.active !== job) return this.failure("motion-operation-cancelled");
        const polled = await this.issue({ kind: "status" });
        if (!polled.ok) return this.failure(polled.reason);
        this.lastEndpoint = polled.endpoint;
        if (polled.endpoint.actionId !== actionId) continue;
        if (TERMINAL_FAILURES.has(polled.endpoint.result)) return this.failure(polled.endpoint.result);
        if (polled.endpoint.operationTerminal && polled.endpoint.result === "completed" && polled.endpoint.completedCounter > baseline && polled.endpoint.completedRepeats === action.repeat && polled.endpoint.logicalCenterAccepted) {
          this.phase = "ready";
          this.lastOutcome = { ok: true, reason: "", name: action.name, source, endpointReportedComplete: true };
          this.publish();
          return Object.freeze({ ...this.lastOutcome, endpoint: Object.freeze({ ...polled.endpoint }) });
        }
      }
      return this.failure("choreography-timeout");
    } finally {
      if (this.active === job) this.active = null;
      this.publish();
    }
  }

  async executePreset(preset, repeat, source = "UI") {
    if (!PRESETS.has(preset) || !SOURCES.has(source) || !Number.isInteger(repeat) || repeat < 1 || repeat > 3) return this.failure("choreography-report-invalid");
    const saved = preset === "dance" ? this.defaultDance() : null;
    const action = saved ? validateChoreography(clone(saved)) : builtInAction(preset, repeat);
    return this.execute(action, { source });
  }

  close() {
    if (this.active) this.active.cancelled = true;
    this.active = null;
    this.phase = this.boardConnected && this.motionCollectionWritable ? "query-required" : "unavailable";
    this.publish();
  }

  async issue(value) {
    let requestId;
    try { requestId = this.nextRequestId(); } catch { return { ok: false, reason: "internal" }; }
    let report;
    try { report = encodeChoreographyFeatureReport({ ...value, requestId }); }
    catch { return { ok: false, reason: "choreography-report-invalid" }; }
    const result = await this.send(report);
    if (!result?.ok) return { ok: false, reason: safeReason(result?.reason), endpoint: result?.terminal?.endpoint || null, requestId };
    const terminal = result.terminal;
    if (!terminal || terminal.stage !== "endpoint-acknowledgement" || terminal.transport !== "completed" || terminal.requestId !== requestId || terminal.kind !== value.kind || !terminal.endpoint || terminal.endpoint.sessionId !== terminal.controllerBootId) return { ok: false, reason: "invalid-response", requestId };
    if (value.kind === "command" && (terminal.sourceCode !== terminal.endpoint.sourceCode || terminal.beatCount !== value.action.beats.length || terminal.repeat !== value.action.repeat || terminal.yawAmplitudeDegrees !== value.yawAmplitudeDegrees || terminal.pitchAmplitudeDegrees !== value.pitchAmplitudeDegrees || terminal.yawSpeedDegreesPerSecond !== value.yawSpeedDegreesPerSecond || terminal.pitchSpeedDegreesPerSecond !== value.pitchSpeedDegreesPerSecond)) return { ok: false, reason: "invalid-response", requestId };
    return { ok: true, endpoint: terminal.endpoint, requestId };
  }

  availabilityFailure() {
    if (!this.boardConnected) return "easyinput-not-connected";
    if (!this.motionCollectionWritable) return "choreography-interface-unavailable";
    return "";
  }

  readinessFailure(endpoint) {
    if (!endpoint?.adapterAvailable || endpoint?.result === "adapter-unavailable") return "adapter-unavailable";
    if (endpoint.faulted || endpoint.state === "faulted") return "faulted";
    if (endpoint.emergencyStopLatched || endpoint.state === "emergency-stopped") return "emergency-stopped";
    return "not-ready";
  }

  phaseFromEndpoint(endpoint) {
    return endpoint?.state === "ready" && endpoint.logicalCenterAccepted ? "ready" : endpoint?.state || "not-ready";
  }

  nextRequestId() {
    if (this.requestIdSequence) return this.requestIdSequence.next();
    this.requestCounter = (this.requestCounter + 1) >>> 0;
    if (!this.requestCounter) this.requestCounter = 1;
    return this.requestCounter;
  }

  failure(reason) {
    const safe = safeReason(reason, "choreography-execute-failed");
    this.phase = safe === "emergency-stopped" ? "emergency-stopped" : this.availabilityFailure() ? "unavailable" : "failed";
    this.lastOutcome = { ok: false, reason: safe, endpointReportedComplete: false };
    this.publish();
    return Object.freeze({ ok: false, ready: false, state: this.phase, reason: safe, endpoint: this.lastEndpoint ? Object.freeze({ ...this.lastEndpoint }) : null });
  }
}

module.exports = { ChoreographyService, builtInAction };
