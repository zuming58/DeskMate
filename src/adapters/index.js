export const AI_EVENT_TYPES = ["idle", "listening", "thinking", "working", "waiting_user", "completed", "error"];
export const DEVICE_TRANSPORT_TYPES = ["web-serial", "web-usb", "web-hid", "web-bluetooth", "lan"];

export class SpeechToTextAdapter { async transcribe() { return { text: "", status: "pending" }; } }
export class DeviceAdapter {
  async discoverTransports() {
    const browser = globalThis.navigator;
    return {
      webSerial: Boolean(browser?.serial),
      webUsb: Boolean(browser?.usb),
      webHid: Boolean(browser?.hid),
      webBluetooth: Boolean(browser?.bluetooth),
      lan: true,
    };
  }
  async connect() { return { connected: false, reason: "protocol-unavailable" }; }
  async disconnect() { return { connected: false }; }
  async getStatus() { return { connected: false, controlConnected: false, transport: null, source: "unconfigured" }; }
  async sendCommand() { throw new Error("尚未确认硬件控制协议，已阻止发送命令"); }
}
export class AgentStatusAdapter {
  constructor() { this.listeners = new Set(); this.event = { type: "working", agent: "Codex", progress: 68, detail: "正在整理桌宠开发文档" }; }
  subscribe(listener, { emitCurrent = true } = {}) { this.listeners.add(listener); if (emitCurrent) listener(this.event); return () => this.listeners.delete(listener); }
  setStatus(event) {
    if (!AI_EVENT_TYPES.includes(event?.type)) throw new Error("未知 AI 状态");
    const progress = Math.max(0, Math.min(100, Number(event.progress) || 0));
    this.event = { ...event, agent: event.agent || "Unknown", progress, detail: event.detail || "" };
    this.listeners.forEach((listener) => listener(this.event));
  }
}
export class DesktopBridge { async openFloatingWindow() { return { supported: false }; } async registerShortcut() { return { supported: false }; } }

export const mockAdapters = { speechToText: new SpeechToTextAdapter(), device: new DeviceAdapter(), agentStatus: new AgentStatusAdapter(), desktop: new DesktopBridge() };
