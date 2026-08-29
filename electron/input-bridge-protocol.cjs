const ALLOWED_SOURCES = new Set(["easyinput-hid", "f22-fallback", "keyboard"]);
const ALLOWED_KEYS = new Set(["F22", "RightAlt", "Escape", "Device"]);
const ALLOWED_ACTIONS = new Set(["down", "up", "connected", "disconnected"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REQUEST_PATTERN = /^[a-zA-Z0-9-]{8,80}$/;

function parseBridgeLine(line) {
  if (typeof line !== "string" || !line.trim() || line.length > 4096) return null;
  let value;
  try { value = JSON.parse(line); } catch { return null; }
  if (!value || value.version !== 1) return null;
  if (value.type === "host-action") {
    if (value.source !== "easyinput-hid" || !UUID_PATTERN.test(value.hostActionId) || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || Number.isNaN(Date.parse(value.time))) return null;
    return Object.freeze({ version: 1, type: "host-action", source: "easyinput-hid", hostActionId: value.hostActionId, time: value.time, sequence: value.sequence });
  }
  if (value.type === "fixed-text") {
    if (value.source !== "easyinput-hid" || !REQUEST_PATTERN.test(value.requestId) || !Number.isInteger(value.bytes) || value.bytes < 1 || value.bytes > 960 || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || Number.isNaN(Date.parse(value.time))) return null;
    return Object.freeze({ version: 1, type: "fixed-text", source: "easyinput-hid", requestId: value.requestId, bytes: value.bytes, time: value.time, sequence: value.sequence });
  }
  if (value.type === "fixed-text-result") {
    if (value.source !== "easyinput-hid" || !REQUEST_PATTERN.test(value.requestId) || typeof value.ok !== "boolean" || !Number.isInteger(value.bytes) || value.bytes < 0 || value.bytes > 960 || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || Number.isNaN(Date.parse(value.time))) return null;
    return Object.freeze({ version: 1, type: "fixed-text-result", source: "easyinput-hid", requestId: value.requestId, ok: value.ok, reason: typeof value.reason === "string" ? value.reason.slice(0, 80) : "", bytes: value.bytes, time: value.time, sequence: value.sequence });
  }
  if (value.type === "desktop-output-result") {
    if (value.source !== "desktop-output" || !REQUEST_PATTERN.test(value.requestId) || typeof value.ok !== "boolean" || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || Number.isNaN(Date.parse(value.time))) return null;
    return Object.freeze({ version: 1, type: "desktop-output-result", source: "desktop-output", requestId: value.requestId, ok: value.ok, reason: typeof value.reason === "string" ? value.reason.slice(0, 80) : "", time: value.time, sequence: value.sequence });
  }
  if (value.type === "config-write") {
    if (!REQUEST_PATTERN.test(value.requestId) || typeof value.ok !== "boolean" || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || Number.isNaN(Date.parse(value.time))) return null;
    return Object.freeze({ version: 1, type: "config-write", source: "easyinput-hid", requestId: value.requestId, ok: value.ok, reason: typeof value.reason === "string" ? value.reason.slice(0, 80) : "", time: value.time, sequence: value.sequence });
  }
  if (value.type === "config-ack") {
    if (value.source !== "easyinput-hid" || typeof value.ok !== "boolean" || typeof value.saved !== "boolean" || !Number.isInteger(value.bytes) || value.bytes < 0 || value.bytes > 2048 || !Number.isInteger(value.crc16) || value.crc16 < 0 || value.crc16 > 0xffff || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || Number.isNaN(Date.parse(value.time))) return null;
    return Object.freeze({ version: 1, type: "config-ack", source: "easyinput-hid", ok: value.ok, saved: value.saved, bytes: value.bytes, crc16: value.crc16, phase: Number(value.phase) || 0, time: value.time, sequence: value.sequence });
  }
  if (value.type === "config-snapshot") {
    if (value.source !== "easyinput-hid" || !REQUEST_PATTERN.test(value.requestId) || typeof value.jsonBase64 !== "string" || value.jsonBase64.length > 4096 || !Number.isInteger(value.bytes) || value.bytes < 1 || value.bytes > 2048 || !Number.isInteger(value.crc16) || value.crc16 < 0 || value.crc16 > 0xffff || !Number.isInteger(value.sourceId) || value.sourceId < 0 || value.sourceId > 3 || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || Number.isNaN(Date.parse(value.time))) return null;
    return Object.freeze({ version: 1, type: "config-snapshot", source: "easyinput-hid", requestId: value.requestId, bytes: value.bytes, crc16: value.crc16, sourceId: value.sourceId, jsonBase64: value.jsonBase64, time: value.time, sequence: value.sequence });
  }
  if (value.type === "config-progress") {
    if (value.source !== "easyinput-hid" || !REQUEST_PATTERN.test(value.requestId) || !Number.isInteger(value.chunk) || value.chunk < 1 || !Number.isInteger(value.total) || value.total < value.chunk || value.total > 42 || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || Number.isNaN(Date.parse(value.time))) return null;
    return Object.freeze({ version: 1, type: "config-progress", source: "easyinput-hid", requestId: value.requestId, chunk: value.chunk, total: value.total, time: value.time, sequence: value.sequence });
  }
  if (value.type === "config-capabilities") {
    if (value.source !== "easyinput-hid" || !REQUEST_PATTERN.test(value.requestId) || typeof value.configReadV1 !== "boolean" || typeof value.configWriteV1 !== "boolean" || (value.hostActionV1 !== undefined && typeof value.hostActionV1 !== "boolean") || (value.fixedTextV1 !== undefined && typeof value.fixedTextV1 !== "boolean") || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || Number.isNaN(Date.parse(value.time))) return null;
    return Object.freeze({ version: 1, type: "config-capabilities", source: "easyinput-hid", requestId: value.requestId, configReadV1: value.configReadV1, configWriteV1: value.configWriteV1, hostActionV1: value.hostActionV1 === true, fixedTextV1: value.fixedTextV1 === true, time: value.time, sequence: value.sequence });
  }
  if (!["input", "status"].includes(value.type)) return null;
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
    if (["host-action", "fixed-text", "fixed-text-result", "desktop-output-result", "config-write", "config-ack", "config-snapshot", "config-progress", "config-capabilities"].includes(event.type)) return { kind: event.type, event };
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
