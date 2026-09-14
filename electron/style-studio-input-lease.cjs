const { randomBytes } = require("crypto");
const { STYLE_STUDIO_LEASE_TTL_MS, STYLE_STUDIO_ENCODER_ACTION_ID } = require("./style-studio-lease-hid.cjs");

class StyleStudioInputLease {
  constructor({ isForeground, publish, sendHardwareLease = async () => ({ ok: false, reason: "input-bridge-unavailable" }), setIntervalImpl = setInterval, clearIntervalImpl = clearInterval, makeHardwareToken } = {}) {
    this.isForeground = isForeground;
    this.publish = publish;
    this.sendHardwareLease = sendHardwareLease;
    this.setIntervalImpl = setIntervalImpl;
    this.clearIntervalImpl = clearIntervalImpl;
    this.makeHardwareToken = makeHardwareToken || (() => randomBytes(4).readUInt32LE(0) || 1);
    this.token = "";
    this.hardwareToken = 0;
    this.heartbeat = null;
    this.sending = null;
    this.hardwareState = "idle";
  }

  acquire(token) {
    const value = String(token || "");
    if (!/^[A-Za-z0-9-]{8,80}$/.test(value)) throw new Error("style-studio-lease-token-invalid");
    if (this.token === value && this.heartbeat) return this.snapshot();
    this.stopHeartbeat();
    this.token = value;
    this.hardwareToken = this.makeHardwareToken() >>> 0 || 1;
    this.hardwareState = "checking";
    this.publishHardwareState();
    void this.send("acquire");
    this.heartbeat = this.setIntervalImpl(() => { if (this.token) void this.send("renew"); }, 1000);
    return this.snapshot();
  }

  release(token) {
    if (token && String(token) !== this.token) return { ok: false, reason: "lease-token-mismatch" };
    const hardwareToken = this.hardwareToken;
    this.stopHeartbeat();
    this.token = "";
    this.hardwareToken = 0;
    this.hardwareState = "idle";
    if (hardwareToken) {
      const pending = this.sending;
      void Promise.resolve(pending).catch(() => {}).then(() => this.sendHardwareLease({ operation: "release", token: hardwareToken, ttlMs: 0 })).catch(() => {});
    }
    return this.snapshot();
  }

  active() { return Boolean(this.token && this.isForeground()); }
  snapshot() { return { ok: true, active: this.active(), mapping: "style-studio-page-lease-v4", persistentConfigChanged: false, hardwareState: this.hardwareState }; }

  stopHeartbeat() {
    if (this.heartbeat) this.clearIntervalImpl(this.heartbeat);
    this.heartbeat = null;
  }

  async send(operation) {
    if (!this.token || !this.hardwareToken) return;
    if (this.sending) return;
    const request = this.sendHardwareLease({ operation, token: this.hardwareToken, ttlMs: STYLE_STUDIO_LEASE_TTL_MS }).catch(() => ({ ok: false, reason: "style-studio-lease-write-failed" }));
    this.sending = request;
    const result = await request;
    if (this.sending === request) this.sending = null;
    if (!this.token) return;
    const next = result?.ok ? "active" : result?.reason === "style-studio-input-lease-v1-unsupported" ? "unsupported" : "checking";
    if (next !== this.hardwareState) { this.hardwareState = next; this.publishHardwareState(); }
  }

  publishHardwareState() {
    this.publish?.({ command: "hardware-lease-status", state: this.hardwareState, source: "easyinput-style-studio-lease" });
  }

  routeWheel(event = {}) {
    if (!this.active()) return false;
    this.publish({ command: event.action === "positive" ? "next" : "previous", source: "easyinput-wheel" });
    return true;
  }

  routeTrigger(event = {}) {
    if (!this.active()) return false;
    if (event.source !== "easyinput-hid") return false;
    const command = event.key === "F22" ? "confirm" : event.key === "VoiceInput" ? "strength" : event.key === "VoiceEdit" ? "save" : "";
    if (!command) return false;
    this.publish({ command, source: "easyinput-trigger" });
    return true;
  }

  routeHostAction(event = {}) {
    if (event.hostActionId === STYLE_STUDIO_ENCODER_ACTION_ID) {
      if (this.active() && this.hardwareState === "active") this.publish({ command: "confirm", source: "easyinput-encoder-press" });
      return true;
    }
    if (!this.active()) return false;
    this.publish({ command: "blocked-host-action", source: "easyinput-host-action" });
    return true;
  }
}

module.exports = { StyleStudioInputLease };
