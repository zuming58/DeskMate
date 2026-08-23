export const DEVICE_EVENT_VERSION = 1;
export const DEVICE_EVENT_TYPES = ["voice-toggle", "voice-cancel", "key-diagnostic", "connection-change", "audio-status"];
export const DEVICE_EVENT_SOURCES = ["simulator", "global-shortcut", "fallback-shortcut", "f22-fallback", "system-tray", "desktop-input", "easyinput", "easyinput-hid", "keyboard", "smoke-test"];
export function createDeviceEvent(type, source, payload = {}, options = {}) { return validateDeviceEvent({ version: DEVICE_EVENT_VERSION, type, source, deviceId: options.deviceId || null, at: options.at || new Date().toISOString(), payload }); }
export function validateDeviceEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("设备事件格式无效");
  if (event.version !== DEVICE_EVENT_VERSION) throw new Error("不支持的设备事件版本");
  if (!DEVICE_EVENT_TYPES.includes(event.type)) throw new Error("未知设备事件类型");
  if (!DEVICE_EVENT_SOURCES.includes(event.source)) throw new Error("未知设备事件来源");
  if (event.deviceId !== null && typeof event.deviceId !== "string") throw new Error("设备标识格式无效");
  if (Number.isNaN(Date.parse(event.at))) throw new Error("设备事件时间无效");
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) throw new Error("设备事件载荷无效");
  return Object.freeze({ ...event, payload: Object.freeze({ ...event.payload }) });
}
export class DeviceEventBus { constructor() { this.listeners = new Set(); this.lastEvent = null; this.lastSignature = ""; } subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); } publish(candidate) { let event; try { event = validateDeviceEvent(candidate); } catch { return false; } const signature = JSON.stringify(event); if (signature === this.lastSignature) return false; this.lastSignature = signature; this.lastEvent = event; this.listeners.forEach((listener) => listener(event)); return true; } }
export const deviceEventBus = new DeviceEventBus();
