"use strict";

const { EventEmitter } = require("events");

const DIRECTIONS = new Set(["left", "right", "up", "down"]);
const ACTIONS = new Set(["step", "establish-center", "recenter", "emergency-stop"]);

function safeResult(value) {
  if (!value || typeof value !== "object") return Object.freeze({ ok: false, reason: "invalid-result" });
  return Object.freeze({ ok: value.ok === true, reason: typeof value.reason === "string" ? value.reason : "" });
}

class ManualControlSession extends EventEmitter {
  constructor({ perform, onExit = async () => ({ ok: true }), now = () => Date.now(), schedule = (fn, delay) => setTimeout(fn, delay), cancel = (handle) => clearTimeout(handle), stepIntervalMs = 250, idleTimeoutMs = 60000 } = {}) {
    super();
    if (typeof perform !== "function") throw new Error("manual-control-perform-required");
    if (typeof onExit !== "function") throw new Error("manual-control-exit-required");
    if (!Number.isInteger(stepIntervalMs) || stepIntervalMs < 250 || stepIntervalMs > 1000) throw new Error("manual-control-step-interval-invalid");
    if (!Number.isInteger(idleTimeoutMs) || idleTimeoutMs < 10000 || idleTimeoutMs > 300000) throw new Error("manual-control-idle-timeout-invalid");
    this.perform = perform;
    this.onExit = onExit;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.stepIntervalMs = stepIntervalMs;
    this.idleTimeoutMs = idleTimeoutMs;
    this.available = false;
    this.active = false;
    this.centerReady = false;
    this.heldDirection = null;
    this.inFlight = null;
    this.timer = null;
    this.idleTimer = null;
    this.generation = 0;
    this.lastDispatchAt = 0;
    this.lastReason = "unavailable";
    this.completedSteps = 0;
    this.exitPending = null;
    this.emergencyPending = false;
  }

  snapshot() {
    return Object.freeze({
      available: this.available,
      active: this.active,
      centerReady: this.centerReady,
      heldDirection: this.heldDirection,
      inFlight: this.inFlight ? Object.freeze({ kind: this.inFlight.kind, direction: this.inFlight.direction || null }) : null,
      controlsEnabled: this.available && this.active && this.centerReady && !this.exitPending,
      lastReason: this.lastReason,
      completedSteps: this.completedSteps,
    });
  }

  publish() {
    const value = this.snapshot();
    this.emit("status", value);
    return value;
  }

  setAvailable(value) {
    const available = value === true;
    if (this.available === available) return this.snapshot();
    this.available = available;
    if (!available) return this.end("device-disconnected");
    this.lastReason = "locked";
    return this.publish();
  }

  begin({ centerReady = false } = {}) {
    if (!this.available) return { ok: false, reason: "manual-control-unavailable", status: this.snapshot() };
    if (this.active) return { ok: false, reason: "manual-control-already-active", status: this.snapshot() };
    this._clearTimer();
    this._clearIdleTimer();
    this.generation += 1;
    this.active = true;
    this.centerReady = centerReady === true;
    this.heldDirection = null;
    this.exitPending = null;
    this.emergencyPending = false;
    this.lastReason = this.centerReady ? "ready" : "center-required";
    this._touchActivity();
    return { ok: true, status: this.publish() };
  }

  press(direction) {
    if (!DIRECTIONS.has(direction)) return { ok: false, reason: "manual-control-direction-invalid", status: this.snapshot() };
    if (!this.available || !this.active) return { ok: false, reason: "manual-control-locked", status: this.snapshot() };
    if (!this.centerReady) return { ok: false, reason: "manual-control-center-required", status: this.snapshot() };
    if (this.exitPending || this.emergencyPending) return { ok: false, reason: "manual-control-stopping", status: this.snapshot() };
    if (this.heldDirection) return { ok: this.heldDirection === direction, reason: this.heldDirection === direction ? "already-held" : "manual-control-direction-busy", status: this.snapshot() };
    this.heldDirection = direction;
    this.generation += 1;
    this.lastReason = "holding";
    this._touchActivity();
    const generation = this.generation;
    this.publish();
    void this._pump(generation);
    return { ok: true, status: this.snapshot() };
  }

  release(direction = this.heldDirection, reason = "released") {
    if (direction && this.heldDirection && direction !== this.heldDirection) return { ok: false, reason: "manual-control-release-mismatch", status: this.snapshot() };
    this._clearTimer();
    this.generation += 1;
    this.heldDirection = null;
    if (this.active && !this.exitPending && !this.emergencyPending) this.lastReason = reason;
    return { ok: true, status: this.publish() };
  }

  establishCenter() {
    return this._singleAction("establish-center", { requireCenter: false });
  }

  recenter() {
    return this._singleAction("recenter", { requireCenter: true });
  }

  emergencyStop() {
    this.release(this.heldDirection, "emergency-stop-requested");
    if (this.emergencyPending || this.inFlight?.kind === "emergency-stop") return { ok: true, reason: "already-stopping", status: this.snapshot() };
    this.active = false;
    this.centerReady = false;
    this.emergencyPending = true;
    this.exitPending = "emergency-stop";
    this.lastReason = "emergency-stop-requested";
    this._clearIdleTimer();
    this.publish();
    if (!this.inFlight) void this._dispatchEmergency();
    return { ok: true, status: this.snapshot() };
  }

  end(reason = "ended") {
    this._clearTimer();
    this._clearIdleTimer();
    this.generation += 1;
    this.heldDirection = null;
    this.active = false;
    this.centerReady = false;
    this.lastReason = String(reason || "ended");
    if (!this.exitPending) this.exitPending = this.lastReason;
    this.publish();
    if (!this.inFlight) void this._finishExit();
    return this.snapshot();
  }

  async _singleAction(kind, { requireCenter }) {
    if (!ACTIONS.has(kind) || kind === "step" || kind === "emergency-stop") return { ok: false, reason: "manual-control-action-invalid", status: this.snapshot() };
    if (!this.available || !this.active || this.exitPending) return { ok: false, reason: "manual-control-locked", status: this.snapshot() };
    if (requireCenter && !this.centerReady) return { ok: false, reason: "manual-control-center-required", status: this.snapshot() };
    if (this.heldDirection || this.inFlight) return { ok: false, reason: "manual-control-busy", status: this.snapshot() };
    this._touchActivity();
    this.inFlight = { kind, direction: null };
    this.lastReason = kind;
    this.publish();
    const generation = this.generation;
    const result = await this._perform({ kind }, () => this.active && !this.exitPending && generation === this.generation);
    this.inFlight = null;
    if (!this.active || this.exitPending) {
      if (this.emergencyPending) void this._dispatchEmergency(); else if (this.exitPending) void this._finishExit();
      return { ...result, status: this.snapshot() };
    }
    if (result.ok && kind === "establish-center") this.centerReady = true;
    if (!result.ok && result.reason === "center-required") this.centerReady = false;
    if (!result.ok && !["cancelled", "center-required"].includes(result.reason)) {
      this.end(result.reason || "action-failed");
      return { ...result, status: this.snapshot() };
    }
    this.lastReason = result.ok ? (this.centerReady ? "ready" : "center-required") : result.reason || "action-failed";
    this._touchActivity();
    return { ...result, status: this.publish() };
  }

  async _pump(generation) {
    if (generation !== this.generation || !this.available || !this.active || !this.centerReady || !this.heldDirection || this.inFlight || this.exitPending || this.emergencyPending) return;
    const direction = this.heldDirection;
    this.inFlight = { kind: "step", direction };
    this.lastDispatchAt = this.now();
    this.publish();
    const result = await this._perform({ kind: "step", direction }, () => generation === this.generation && this.available && this.active && this.heldDirection === direction && !this.exitPending && !this.emergencyPending);
    this.inFlight = null;
    if (this.emergencyPending) { void this._dispatchEmergency(); return; }
    if (this.exitPending || !this.active || !this.available) { if (this.exitPending) void this._finishExit(); return; }
    if (!result.ok) {
      const reason = result.reason || "step-failed";
      this.release(direction, reason);
      if (reason === "center-required") {
        this.centerReady = false;
        this.lastReason = reason;
        this.publish();
      } else if (reason !== "cancelled") {
        this.end(reason);
      }
      return;
    }
    this.completedSteps += 1;
    this._touchActivity();
    this.publish();
    if (generation !== this.generation || this.heldDirection !== direction) return;
    const delay = Math.max(0, this.stepIntervalMs - Math.max(0, this.now() - this.lastDispatchAt));
    this.timer = this.schedule(() => { this.timer = null; void this._pump(generation); }, delay);
  }

  async _dispatchEmergency() {
    if (!this.emergencyPending || this.inFlight) return;
    this.inFlight = { kind: "emergency-stop", direction: null };
    this.publish();
    const result = await this._perform({ kind: "emergency-stop" });
    this.inFlight = null;
    this.emergencyPending = false;
    this.lastReason = result.ok ? "emergency-stopped" : result.reason || "emergency-stop-failed";
    await this._finishExit();
  }

  async _finishExit() {
    const reason = this.exitPending;
    if (!reason || this.inFlight) return;
    this.exitPending = null;
    try { await this.onExit(reason); } catch { /* fail closed locally even if remote cleanup cannot be confirmed */ }
    this.publish();
  }

  async _perform(action, continueAllowed = () => true) {
    const request = { ...action };
    Object.defineProperty(request, "continueAllowed", { value: continueAllowed, enumerable: false, configurable: false, writable: false });
    try { return safeResult(await this.perform(Object.freeze(request))); }
    catch { return Object.freeze({ ok: false, reason: "manual-control-transport-failed" }); }
  }

  _touchActivity() {
    this._clearIdleTimer();
    if (!this.active) return;
    const generation = this.generation;
    this.idleTimer = this.schedule(() => {
      this.idleTimer = null;
      if (this.active && generation === this.generation) this.end("idle-timeout");
    }, this.idleTimeoutMs);
  }

  _clearTimer() {
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
  }

  _clearIdleTimer() {
    if (this.idleTimer !== null) this.cancel(this.idleTimer);
    this.idleTimer = null;
  }
}

module.exports = { DIRECTIONS, ManualControlSession };
