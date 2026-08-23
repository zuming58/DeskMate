import { createDeviceEvent } from "../domain/deviceEvents.js";
export class DeviceSimulator {
  constructor(bus, { debounceMs = 350, now = () => Date.now() } = {}) { this.bus = bus; this.debounceMs = debounceMs; this.now = now; this.connected = true; this.lastVoiceAt = 0; this.sequence = 0; }
  toggle({ duplicate = false } = {}) { const now = this.now(); if (!this.connected || now - this.lastVoiceAt < this.debounceMs) return false; this.lastVoiceAt = now; const event = createDeviceEvent("voice-toggle", "simulator", { sequence: ++this.sequence }, { deviceId: "simulator-easyinput", at: new Date(now).toISOString() }); this.bus.publish(event); if (duplicate) this.bus.publish(event); return true; }
  disconnect() { this.connected = false; return this.bus.publish(createDeviceEvent("connection-change", "simulator", { connected: false }, { deviceId: "simulator-easyinput" })); }
  reconnect() { this.connected = true; return this.bus.publish(createDeviceEvent("connection-change", "simulator", { connected: true }, { deviceId: "simulator-easyinput" })); }
  rapidPress(count = 3) { return Array.from({ length: count }, () => this.toggle()).filter(Boolean).length; }
}
