const { randomBytes } = require("crypto");
const { STYLE_STUDIO_LEASE_TTL_MS, STYLE_STUDIO_ENCODER_ACTION_ID } = require("./style-studio-lease-hid.cjs");

const PAGE_COMMANDS = Object.freeze(["strength", "view", "save", "close", "compare", "inspiration", "reset", "mode"]);
const TRIGGER_KEYS = Object.freeze({ voice_ptt_hold: "VoiceInput", edit_ptt_hold: "VoiceEdit" });

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
    this.bindingsConfigured = false;
    this.triggerCommands = new Map();
    this.hostActionCommands = new Map();
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
  snapshot() { return { ok: true, active: this.active(), mapping: "style-studio-page-lease-v5", persistentConfigChanged: false, hardwareState: this.hardwareState, bindingsConfigured: this.bindingsConfigured }; }

  configureBindings(value) {
    const profile = Array.isArray(value?.profiles) ? value.profiles[0] : null;
    if (value?.schema !== "ai_keyboard.v1" || !profile?.keys || typeof profile.keys !== "object") {
      this.bindingsConfigured = false;
      this.triggerCommands.clear();
      this.hostActionCommands.clear();
      return { ok: false, reason: "style-studio-keymap-invalid" };
    }
    const triggerCandidates = new Map();
    const hostActionCandidates = new Map();
    for (let index = 0; index < PAGE_COMMANDS.length; index += 1) {
      const press = profile.keys[`KEY${index + 1}`]?.press;
      const command = PAGE_COMMANDS[index];
      const triggerKey = typeof press === "string" ? TRIGGER_KEYS[press] : "";
      if (triggerKey) {
        triggerCandidates.set(triggerKey, triggerCandidates.has(triggerKey) ? null : command);
      }
      if (typeof press === "string" && press.startsWith("host_action:")) {
        const hostActionId = press.slice(12);
        hostActionCandidates.set(hostActionId, hostActionCandidates.has(hostActionId) ? null : command);
      }
    }
    this.triggerCommands = new Map([...triggerCandidates].filter(([, command]) => command));
    this.hostActionCommands = new Map([...hostActionCandidates].filter(([, command]) => command));
    this.bindingsConfigured = true;
    return { ok: true, triggerCount: this.triggerCommands.size, hostActionCount: this.hostActionCommands.size };
  }

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
    const command = event.key === "F22" ? "confirm" : this.bindingsConfigured
      ? this.triggerCommands.get(event.key)
      : event.key === "VoiceInput" ? "strength" : event.key === "VoiceEdit" ? "save" : "";
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
    const command = this.hostActionCommands.get(event.hostActionId);
    if (command) {
      this.publish({ command, source: "easyinput-page-key" });
      return true;
    }
    this.publish({ command: "blocked-host-action", source: "easyinput-host-action" });
    return true;
  }
}

module.exports = { StyleStudioInputLease };
