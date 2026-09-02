"use strict";

const { EventEmitter } = require("events");
const { randomBytes } = require("crypto");
const { encodeManualCalibrationFeatureReport } = require("./manual-calibration-hid.cjs");

const COMMANDS = new Set(["selectAxis", "arm", "provisionalCenter", "singleStep", "recenter", "emergencyStop", "clearEmergencyStop"]);

function randomNonZero() {
  let value = 0;
  while (value === 0) value = randomBytes(4).readUInt32LE(0);
  return value;
}

function cleanEvidence(value) {
  if (!value || typeof value !== "object") return null;
  return JSON.parse(JSON.stringify(value));
}

class ManualCalibrationController extends EventEmitter {
  constructor({ send, randomUInt32 = randomNonZero, now = () => new Date().toISOString() } = {}) {
    super();
    if (typeof send !== "function") throw new Error("manual-calibration-send-required");
    this.send = send; this.randomUInt32 = randomUInt32; this.now = now;
    this.boardConnected = false; this.calibrationCollectionWritable = false; this.mountEpoch = 0; this.requestCounter = 0; this.confirmationCounter = randomUInt32() || 1;
    this.pending = null; this.gate = "unavailable"; this.context = null; this.armToken = 0;
    this.intent = null; this.accepted = null; this.terminal = null;
  }

  snapshot() {
    return Object.freeze({
      available: this.boardConnected && this.calibrationCollectionWritable, calibrationCollectionWritable: this.calibrationCollectionWritable,
      mountEpoch: this.mountEpoch, gate: this.gate, controlsEnabled: this.boardConnected && this.calibrationCollectionWritable && this.gate === "ready" && !this.pending,
      pending: this.pending ? { requestId: this.pending.requestId, kind: this.pending.kind, operation: this.pending.operation } : null,
      context: cleanEvidence(this.context), intent: cleanEvidence(this.intent), accepted: cleanEvidence(this.accepted), terminal: cleanEvidence(this.terminal),
    });
  }

  publish() { const value = this.snapshot(); this.emit("status", value); return value; }

  handleBridgeStatus(value = {}) {
    const connected = Boolean(value.boardConnected);
    const calibrationCollectionWritable = connected && value.calibrationCollectionWritable !== false;
    const wasAvailable = this.boardConnected && this.calibrationCollectionWritable;
    const available = connected && calibrationCollectionWritable;
    if (available && !wasAvailable) {
      this.mountEpoch += 1; this.requestCounter = 0; this.gate = "query-required"; this.context = null; this.armToken = 0; this.pending = null; this.accepted = null; this.terminal = null;
    } else if (!available && wasAvailable) {
      this.gate = "unavailable"; this.context = null; this.armToken = 0; this.pending = null; this.accepted = null; this.terminal = { stage: "terminal", transport: "peer-disconnected-or-restarted", at: this.now() };
    }
    this.boardConnected = connected;
    this.calibrationCollectionWritable = calibrationCollectionWritable;
    return this.publish();
  }

  nextRequestId() {
    this.requestCounter = (this.requestCounter + 1) >>> 0;
    if (this.requestCounter === 0) this.requestCounter = 1;
    return this.requestCounter;
  }

  nextConfirmationId() {
    this.confirmationCounter = (this.confirmationCounter + 1) >>> 0;
    if (this.confirmationCounter === 0) this.confirmationCounter = 1;
    return this.confirmationCounter;
  }

  async queryStatus() {
    if (!this.boardConnected) return { ok: false, reason: "easyinput-not-connected", status: this.snapshot() };
    if (!this.calibrationCollectionWritable) return { ok: false, reason: "manual-calibration-interface-unavailable", status: this.snapshot() };
    if (this.pending) return { ok: false, reason: "manual-calibration-busy", status: this.snapshot() };
    const requestId = this.nextRequestId();
    const report = encodeManualCalibrationFeatureReport({ kind: "status", requestId, confirmationId: 0 });
    this.gate = "querying";
    return this.issue({ requestId, confirmationId: 0, kind: "status", operation: "status", report });
  }

  async command(value = {}) {
    const operation = String(value.operation || "");
    if (!COMMANDS.has(operation)) return { ok: false, reason: "manual-calibration-command-invalid", status: this.snapshot() };
    if (!this.boardConnected) return { ok: false, reason: "easyinput-not-connected", status: this.snapshot() };
    if (!this.calibrationCollectionWritable) return { ok: false, reason: "manual-calibration-interface-unavailable", status: this.snapshot() };
    if (this.gate !== "ready" || !this.context) return { ok: false, reason: "manual-calibration-status-required", status: this.snapshot() };
    if (this.pending) return { ok: false, reason: "manual-calibration-busy", status: this.snapshot() };
    const axis = operation === "emergencyStop" || operation === "clearEmergencyStop" ? "none" : String(value.axis || this.context.selectedAxis || "");
    if (!["yaw", "pitch", "none"].includes(axis)) return { ok: false, reason: "manual-calibration-axis-invalid", status: this.snapshot() };
    const requestId = this.nextRequestId(); const confirmationId = this.nextConfirmationId();
    const actionId = ((this.context.lastActionId || 0) + 1) >>> 0 || 1;
    let armToken = 0; let safetyFlags = 0; let leaseMs = 0; let direction = 0;
    if (operation === "arm") {
      const safety = value.safety || {};
      if (![safety.userPresent, safety.linkageUnloaded, safety.currentLimitedSupply, safety.cutoffReachable].every((item) => item === true)) return { ok: false, reason: "manual-calibration-safety-incomplete", status: this.snapshot() };
      armToken = this.randomUInt32() || 1; safetyFlags = 0x0f; leaseMs = Number(value.leaseMs);
    } else if (["provisionalCenter", "singleStep", "recenter"].includes(operation)) {
      if (!this.armToken) return { ok: false, reason: "manual-calibration-arm-required", status: this.snapshot() };
      armToken = this.armToken; direction = operation === "singleStep" ? Number(value.direction) : 0; this.armToken = 0;
    }
    const command = { sessionId: this.context.sessionId, actionId, armToken, operation, axis, direction, leaseMs, safetyFlags };
    let report;
    try { report = encodeManualCalibrationFeatureReport({ kind: "command", requestId, confirmationId, command }); }
    catch (error) { return { ok: false, reason: error.message, status: this.snapshot() }; }
    if (["selectAxis", "emergencyStop", "clearEmergencyStop"].includes(operation)) this.armToken = 0;
    const result = await this.issue({ requestId, confirmationId, kind: "command", operation, report, pendingArmToken: operation === "arm" ? armToken : 0 });
    return result;
  }

  async issue(entry) {
    this.pending = { requestId: entry.requestId, confirmationId: entry.confirmationId, kind: entry.kind, operation: entry.operation };
    this.intent = { requestId: entry.requestId, confirmationId: entry.confirmationId, kind: entry.kind, operation: entry.operation, at: this.now() };
    this.accepted = null; this.terminal = null; this.publish();
    const onAccepted = (value) => {
      if (this.pending?.requestId !== entry.requestId) return;
      this.accepted = { requestId: value.requestId, confirmationId: value.confirmationId, acceptedCount: value.acceptedCount, linkSequence: value.linkSequence, at: this.now() };
      this.publish();
    };
    let result;
    try { result = await this.send(entry.report, { onAccepted }); }
    catch { result = { ok: false, reason: "manual-calibration-transport-failed" }; }
    if (this.pending?.requestId !== entry.requestId) return { ok: false, reason: "manual-calibration-lifecycle-reset", status: this.snapshot() };
    this.pending = null;
    const terminal = result?.terminal || null;
    this.terminal = terminal ? { ...terminal, at: this.now() } : { stage: "terminal", transport: result?.reason || "transport-failed", at: this.now() };
    if (entry.kind === "status") {
      if (result?.ok && terminal?.transportCode === 0 && terminal.endpoint?.type === "status") { this.context = terminal.endpoint; this.gate = "ready"; }
      else { this.context = null; this.gate = terminal?.transport === "link-not-ready" ? "not-ready" : "faulted"; }
    } else if (result?.ok && terminal?.endpoint?.type === "command") {
      const endpoint = terminal.endpoint;
      this.context = { ...this.context, sessionId: endpoint.sessionId, lastActionId: endpoint.actionId, completedOutputCount: endpoint.completedOutputCount, state: endpoint.state, selectedAxis: endpoint.selectedAxis, flags: endpoint.flags, armed: endpoint.armed, provisionalCenter: endpoint.provisionalCenter, recenterRequired: endpoint.recenterRequired, emergencyStopped: endpoint.emergencyStopped, faulted: endpoint.faulted, adapterAvailable: endpoint.adapterAvailable, lastError: endpoint.lastError, fixedStepDegrees: endpoint.fixedStepDegrees };
      if (entry.operation === "arm" && endpoint.resultCode === 0 && endpoint.armed) this.armToken = entry.pendingArmToken;
    }
    this.publish();
    return { ok: Boolean(result?.ok), reason: result?.reason || "", status: this.snapshot() };
  }
}

module.exports = { ManualCalibrationController };
