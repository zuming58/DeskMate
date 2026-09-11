"use strict";

const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

const DEFAULT_XIAOZHI_HARDWARE_POLICY = Object.freeze({ version: 1, enabled: true });

function normalizePolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_XIAOZHI_HARDWARE_POLICY;
  if (value.version !== 1 || typeof value.enabled !== "boolean") return DEFAULT_XIAOZHI_HARDWARE_POLICY;
  return Object.freeze({ version: 1, enabled: value.enabled });
}

function validatePolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("xiaozhi-hardware-policy-invalid");
  if (Object.keys(value).sort().join(",") !== "enabled,version" || value.version !== 1 || typeof value.enabled !== "boolean") throw new Error("xiaozhi-hardware-policy-invalid");
  return Object.freeze({ version: 1, enabled: value.enabled });
}

function safeReason(value, fallback = "xiaozhi-hardware-shutdown-unconfirmed") {
  const reason = String(value || "");
  return /^[a-z0-9-]{1,80}$/.test(reason) ? reason : fallback;
}

class XiaozhiHardwarePolicyStore {
  constructor({ userDataPath } = {}) {
    if (typeof userDataPath !== "string" || !userDataPath) throw new Error("xiaozhi-hardware-policy-path-required");
    this.filePath = path.join(userDataPath, "xiaozhi-hardware-policy.json");
    this.value = this.load();
  }

  load() {
    try { return normalizePolicy(JSON.parse(fs.readFileSync(this.filePath, "utf8"))); }
    catch { return DEFAULT_XIAOZHI_HARDWARE_POLICY; }
  }

  snapshot() { return Object.freeze({ ...this.value }); }

  save(value) {
    const validated = validatePolicy(value);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    const readback = normalizePolicy(JSON.parse(fs.readFileSync(this.filePath, "utf8")));
    if (JSON.stringify(readback) !== JSON.stringify(validated)) throw new Error("xiaozhi-hardware-policy-readback-mismatch");
    this.value = readback;
    return this.snapshot();
  }
}

class XiaozhiHardwareCoordinator extends EventEmitter {
  constructor({ store, shutdown = async () => ({ attempted: false, confirmed: true, reason: "not-active" }), now = () => Date.now() } = {}) {
    super();
    if (!store || typeof store.snapshot !== "function" || typeof store.save !== "function" || typeof shutdown !== "function") throw new Error("xiaozhi-hardware-policy-dependency-invalid");
    this.store = store;
    this.shutdown = shutdown;
    this.now = now;
    this.transitioning = false;
    this.lastShutdown = Object.freeze({ state: "not-run", attempted: false, confirmed: false, reason: "", at: "" });
  }

  enabled() { return this.store.snapshot().enabled && !this.transitioning; }

  snapshot(linkState = "unavailable") {
    const policy = this.store.snapshot();
    const state = !policy.enabled ? "disabled" : linkState === "connected" ? "connected" : "enabled-disconnected";
    return Object.freeze({ policy, enabled: policy.enabled, state, transitioning: this.transitioning, lastShutdown: Object.freeze({ ...this.lastShutdown }) });
  }

  publish(linkState) {
    const value = this.snapshot(linkState);
    this.emit("status", value);
    return value;
  }

  async setEnabled(enabled, linkState = "unavailable") {
    if (typeof enabled !== "boolean") return Object.freeze({ ok: false, reason: "xiaozhi-hardware-policy-invalid", ...this.snapshot(linkState) });
    if (this.transitioning) return Object.freeze({ ok: false, reason: "xiaozhi-hardware-policy-busy", ...this.snapshot(linkState) });
    const current = this.store.snapshot();
    if (current.enabled === enabled) return Object.freeze({ ok: true, unchanged: true, ...this.snapshot(linkState) });
    if (enabled) {
      try { this.store.save({ version: 1, enabled: true }); }
      catch { return Object.freeze({ ok: false, reason: "xiaozhi-hardware-policy-save-failed", ...this.snapshot(linkState) }); }
      this.lastShutdown = Object.freeze({ state: "not-run", attempted: false, confirmed: false, reason: "", at: "" });
      return Object.freeze({ ok: true, ...this.publish(linkState) });
    }

    this.transitioning = true;
    this.publish(linkState);
    let result;
    try { result = await this.shutdown(); }
    catch (error) { result = { attempted: true, confirmed: false, reason: safeReason(error?.message) }; }
    try { this.store.save({ version: 1, enabled: false }); }
    catch {
      this.transitioning = false;
      return Object.freeze({ ok: false, reason: "xiaozhi-hardware-policy-save-failed", ...this.publish(linkState) });
    }
    this.transitioning = false;
    const attempted = result?.attempted === true;
    const confirmed = result?.confirmed === true;
    this.lastShutdown = Object.freeze({
      state: !attempted ? "not-required" : confirmed ? "confirmed" : "unconfirmed",
      attempted,
      confirmed,
      reason: confirmed ? "" : safeReason(result?.reason),
      at: new Date(this.now()).toISOString(),
    });
    return Object.freeze({ ok: true, ...this.publish(linkState) });
  }
}

module.exports = {
  DEFAULT_XIAOZHI_HARDWARE_POLICY,
  XiaozhiHardwareCoordinator,
  XiaozhiHardwarePolicyStore,
  normalizeXiaozhiHardwarePolicy: normalizePolicy,
  validateXiaozhiHardwarePolicy: validatePolicy,
};
