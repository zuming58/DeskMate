const ALLOWED_SOURCES = new Set(["easyinput-hid", "f22-fallback", "keyboard"]);
const ALLOWED_KEYS = new Set(["F22", "RightAlt", "Escape", "Device"]);
const ALLOWED_ACTIONS = new Set(["down", "up", "connected", "disconnected"]);

function parseBridgeLine(line) {
  if (typeof line !== "string" || !line.trim() || line.length > 2048) return null;
  let value;
  try { value = JSON.parse(line); } catch { return null; }
  if (!value || value.version !== 1 || !["input", "status"].includes(value.type)) return null;
  if (!ALLOWED_SOURCES.has(value.source) || !ALLOWED_KEYS.has(value.key) || !ALLOWED_ACTIONS.has(value.action)) return null;
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1 || Number.isNaN(Date.parse(value.time))) return null;
  return Object.freeze({
    version: 1,
    type: value.type,
    source: value.source,
    key: value.key,
    action: value.action,
    time: value.time,
    sequence: value.sequence,
    ...(value.type === "status" ? { boardConnected: Boolean(value.boardConnected) } : {}),
  });
}

class InputTriggerFilter {
  constructor({ now = () => Date.now(), debounceMs = 350, stuckMs = 2000, boardF22 = true, rightAlt = false } = {}) {
    this.now = now;
    this.debounceMs = debounceMs;
    this.stuckMs = stuckMs;
    this.config = { boardF22: Boolean(boardF22), rightAlt: Boolean(rightAlt) };
    this.down = new Map();
    this.lastTrigger = new Map();
  }

  configure(value = {}) {
    if (typeof value.boardF22 === "boolean") this.config.boardF22 = value.boardF22;
    if (typeof value.rightAlt === "boolean") this.config.rightAlt = value.rightAlt;
    if (!this.config.boardF22) this.down.delete("easyinput-hid:F22");
    if (!this.config.rightAlt) this.down.delete("keyboard:RightAlt");
    return { ...this.config };
  }

  reset(source, key) {
    if (source && key) this.down.delete(`${source}:${key}`);
    else this.down.clear();
  }

  accept(event) {
    if (!event) return { kind: "ignored" };
    if (event.type === "status") {
      if (!event.boardConnected) this.reset("easyinput-hid", "F22");
      return { kind: "status", event };
    }
    if (event.key === "Escape") return event.action === "down" ? { kind: "cancel", event } : { kind: "diagnostic", event };
    const enabled = ["easyinput-hid", "f22-fallback"].includes(event.source) && event.key === "F22" ? this.config.boardF22 : event.source === "keyboard" && event.key === "RightAlt" ? this.config.rightAlt : false;
    if (!enabled) return { kind: "diagnostic", event };
    const signature = `${event.source}:${event.key}`;
    if (event.action === "down") {
      const timestamp = this.now();
      const previousDown = this.down.get(signature);
      if (previousDown !== undefined && timestamp - previousDown < this.stuckMs) return { kind: "ignored", reason: "repeat-down", event };
      this.down.set(signature, timestamp);
      return { kind: "diagnostic", event };
    }
    if (!this.down.delete(signature)) return { kind: "ignored", reason: "release-without-down", event };
    const timestamp = this.now();
    if (timestamp - (this.lastTrigger.get(signature) || 0) < this.debounceMs) return { kind: "ignored", reason: "debounced", event };
    this.lastTrigger.set(signature, timestamp);
    return { kind: "trigger", event };
  }
}

module.exports = { parseBridgeLine, InputTriggerFilter };
