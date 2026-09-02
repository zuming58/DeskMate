"use strict";

const { EventEmitter } = require("events");
const { ManualControlSession } = require("./manual-control-session.cjs");

const SAFETY_CONFIRMATION = Object.freeze({ userPresent: true, linkageUnloaded: true, currentLimitedSupply: true, cutoffReachable: true });
const LINK_STATES = new Set(["connected", "waiting", "faulted", "disabled", "unavailable"]);
const DIRECTION_COMMANDS = Object.freeze({
  left: Object.freeze({ axis: "yaw", direction: -1 }),
  right: Object.freeze({ axis: "yaw", direction: 1 }),
  up: Object.freeze({ axis: "pitch", direction: 1 }),
  down: Object.freeze({ axis: "pitch", direction: -1 }),
});

function endpointSucceeded(endpoint) {
  return endpoint && ["completed", "duplicate"].includes(endpoint.result);
}

function reasonFromResult(result) {
  const endpoint = result?.status?.terminal?.endpoint;
  return typeof endpoint?.result === "string" && endpoint.result !== "completed" && endpoint.result !== "duplicate"
    ? endpoint.result
    : typeof result?.reason === "string" && result.reason
      ? result.reason
      : "manual-control-command-failed";
}

class ManualControlCoordinator extends EventEmitter {
  constructor({ calibration, now, schedule, cancel, stepIntervalMs = 250, idleTimeoutMs = 60000 } = {}) {
    super();
    if (!calibration || typeof calibration.snapshot !== "function" || typeof calibration.queryStatus !== "function" || typeof calibration.command !== "function") throw new Error("manual-control-calibration-required");
    this.calibration = calibration;
    this.linkState = "unavailable";
    this.environmentConfirmed = false;
    this.session = new ManualControlSession({
      perform: (action) => this._perform(action),
      onExit: async () => { this.calibration.clearVolatileAuthorization?.(); this.environmentConfirmed = false; return { ok: true }; },
      now, schedule, cancel, stepIntervalMs, idleTimeoutMs,
    });
    this.session.on("status", () => this.publish());
    this.calibration.on?.("status", () => this.publish());
  }

  snapshot() {
    const session = this.session.snapshot();
    const evidence = this.calibration.snapshot();
    const terminal = evidence.terminal;
    const correlatedTerminal = Boolean(evidence.intent?.requestId && terminal?.requestId === evidence.intent.requestId && terminal.transport === "completed" && terminal.endpoint);
    const effectiveLinkState = this.linkState === "unavailable" && correlatedTerminal ? "connected" : this.linkState;
    let phase = "locked";
    if (!session.available) phase = "unavailable";
    else if (session.lastReason === "idle-timeout") phase = "idle-timeout";
    else if (["emergency-stop-requested", "emergency-stopped"].includes(session.lastReason)) phase = "emergency-stopped";
    else if (session.active && session.inFlight?.kind === "establish-center") phase = "establishing-center";
    else if (session.active && !session.centerReady) phase = "center-required";
    else if (session.active && session.heldDirection) phase = "moving";
    else if (session.active) phase = "ready";
    else if (["window-blur", "document-hidden", "page-leave", "device-disconnected", "link-disconnected"].includes(session.lastReason)) phase = "locked";
    return Object.freeze({
      available: session.available,
      active: session.active,
      centerReady: session.centerReady,
      heldDirection: session.heldDirection,
      inFlight: session.inFlight,
      controlsEnabled: session.controlsEnabled,
      phase,
      reason: session.lastReason,
      completedSteps: session.completedSteps,
      linkState: LINK_STATES.has(effectiveLinkState) ? effectiveLinkState : "unavailable",
      environmentConfirmed: this.environmentConfirmed,
      evidence,
    });
  }

  publish() {
    const value = this.snapshot();
    this.emit("status", value);
    return value;
  }

  handleBridgeStatus(value = {}) {
    const available = value.boardConnected === true && value.calibrationCollectionWritable !== false;
    const reportedLinkState = value.linkDiagnostics?.state;
    this.linkState = LINK_STATES.has(reportedLinkState) ? reportedLinkState : "unavailable";
    this.session.setAvailable(available);
    if (this.session.snapshot().active && ["waiting", "faulted", "disabled"].includes(this.linkState)) this.session.end("link-disconnected");
    return this.publish();
  }

  async begin(value = {}) {
    if (value.environmentConfirmed !== true) return { ok: false, reason: "manual-control-environment-confirmation-required", status: this.snapshot() };
    if (this.session.snapshot().active) return { ok: false, reason: "manual-control-already-active", status: this.snapshot() };
    const current = this.calibration.snapshot();
    if (!current.available) return { ok: false, reason: "manual-control-unavailable", status: this.snapshot() };
    const query = await this.calibration.queryStatus();
    if (!query?.ok || query.status?.gate !== "ready") return { ok: false, reason: reasonFromResult(query), status: this.publish() };
    this.environmentConfirmed = true;
    this.session.setAvailable(true);
    const started = this.session.begin({ centerReady: false });
    if (!started.ok) return { ...started, status: this.publish() };
    const center = await this.session.establishCenter();
    return { ok: center.ok, reason: center.reason || "", status: this.publish() };
  }

  async establishCenter() {
    const result = await this.session.establishCenter();
    return { ...result, status: this.publish() };
  }

  press(direction) {
    const result = this.session.press(direction);
    return { ...result, status: this.publish() };
  }

  release(direction) {
    const result = this.session.release(direction);
    return { ...result, status: this.publish() };
  }

  async recenter() {
    const result = await this.session.recenter();
    return { ...result, status: this.publish() };
  }

  emergencyStop() {
    if (!this.session.snapshot().available) return { ok: false, reason: "manual-control-unavailable", status: this.snapshot() };
    const result = this.session.emergencyStop();
    return { ...result, status: this.publish() };
  }

  end(reason = "ended") {
    this.session.end(reason);
    return { ok: true, status: this.publish() };
  }

  async _perform(action) {
    if (action.kind === "emergency-stop") return this._runCommand("emergencyStop", {});
    if (action.kind === "establish-center") {
      for (const axis of ["yaw", "pitch"]) {
        const result = await this._runAxisOutput(axis, "provisionalCenter", 0, action.continueAllowed);
        if (!result.ok) return result;
      }
      return { ok: true };
    }
    if (action.kind === "recenter") {
      for (const axis of ["yaw", "pitch"]) {
        const result = await this._runAxisOutput(axis, "recenter", 0, action.continueAllowed);
        if (!result.ok) return result;
      }
      return { ok: true };
    }
    if (action.kind === "step") {
      const command = DIRECTION_COMMANDS[action.direction];
      if (!command) return { ok: false, reason: "manual-control-direction-invalid" };
      return this._runAxisOutput(command.axis, "singleStep", command.direction, action.continueAllowed);
    }
    return { ok: false, reason: "manual-control-action-invalid" };
  }

  async _runAxisOutput(axis, operation, direction, continueAllowed = () => true) {
    if (!continueAllowed()) return { ok: false, reason: "cancelled" };
    const selected = this.calibration.snapshot().context?.selectedAxis === axis ? { ok: true } : await this._runCommand("selectAxis", { axis });
    if (!selected.ok || !continueAllowed()) return selected.ok ? { ok: false, reason: "cancelled" } : selected;
    const armed = await this._runCommand("arm", { axis, leaseMs: 5000, safety: SAFETY_CONFIRMATION });
    if (!armed.ok || !continueAllowed()) return armed.ok ? { ok: false, reason: "cancelled" } : armed;
    const before = Number(this.calibration.snapshot().context?.completedOutputCount || 0);
    const output = await this._runCommand(operation, { axis, ...(operation === "singleStep" ? { direction } : {}) });
    if (!output.ok) return output;
    const after = Number(this.calibration.snapshot().context?.completedOutputCount || 0);
    return after > before ? { ok: true } : { ok: false, reason: "output-not-confirmed" };
  }

  async _runCommand(operation, extra) {
    const result = await this.calibration.command({ operation, ...extra });
    const endpoint = result?.status?.terminal?.endpoint;
    if (!result?.ok || !endpointSucceeded(endpoint)) return { ok: false, reason: reasonFromResult(result) };
    if (operation === "selectAxis" && endpoint.selectedAxis !== extra.axis) return { ok: false, reason: "axis-not-confirmed" };
    if (operation === "arm" && endpoint.armed !== true) return { ok: false, reason: "arm-not-confirmed" };
    return { ok: true };
  }
}

module.exports = { DIRECTION_COMMANDS, ManualControlCoordinator, SAFETY_CONFIRMATION };
