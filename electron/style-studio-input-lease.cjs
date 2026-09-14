class StyleStudioInputLease {
  constructor({ isForeground, publish }) {
    this.isForeground = isForeground;
    this.publish = publish;
    this.token = "";
  }

  acquire(token) {
    const value = String(token || "");
    if (!/^[A-Za-z0-9-]{8,80}$/.test(value)) throw new Error("style-studio-lease-token-invalid");
    this.token = value;
    return this.snapshot();
  }

  release(token) {
    if (token && String(token) !== this.token) return { ok: false, reason: "lease-token-mismatch" };
    this.token = "";
    return this.snapshot();
  }

  active() { return Boolean(this.token && this.isForeground()); }
  snapshot() { return { ok: true, active: this.active(), mapping: "style-studio-page-lease-v2", firmwareChanged: false }; }

  routeWheel(event = {}) {
    if (!this.active()) return false;
    this.publish({ command: event.action === "positive" ? "next" : "previous", source: "easyinput-wheel" });
    return true;
  }

  routeTrigger(event = {}) {
    if (!this.active()) return false;
    if (event.source !== "easyinput-hid") return false;
    const command = ["F22", "VoiceInput"].includes(event.key) ? "confirm" : event.key === "VoiceEdit" ? "save" : "";
    if (!command) return false;
    this.publish({ command, source: "easyinput-trigger" });
    return true;
  }
}

module.exports = { StyleStudioInputLease };
