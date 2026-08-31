export class SttAdapter {
  constructor({ maxBytes = 15 * 1024 * 1024 } = {}) { this.maxBytes = maxBytes; }
  async transcribe(blob, { signal } = {}) {
    const started = Date.now();
    if (signal?.aborted) return { status: "cancelled", text: "", provider: "unconfigured", durationMs: Date.now() - started, message: "转写已取消" };
    if (blob instanceof Blob && blob.size > this.maxBytes) return { status: "error", text: "", provider: "unconfigured", durationMs: Date.now() - started, message: `录音文件超过 ${Math.floor(this.maxBytes / 1024 / 1024)}MB 限制` };
    return { status: "pending", text: "", provider: "unconfigured", durationMs: Date.now() - started, message: "录音完成，等待转写服务" };
  }
}

export { MockSttAdapter, HttpSttAdapter, ConfigurableTextOrganizer } from "./sttAdapters.js";

export class TextOrganizerAdapter {
  async organize(text) { return String(text || ""); }
}

export class TextOutputAdapter {
  constructor(bridge = globalThis.window?.desktopBridge) { this.bridge = bridge; }
  async output(text, mode = "history") {
    if (mode === "history") return { ok: true, mode };
    if (mode === "clipboard") {
      if (this.bridge?.writeClipboard) return this.bridge.writeClipboard(text);
      if (globalThis.navigator?.clipboard?.writeText) { await navigator.clipboard.writeText(text); return { ok: true, mode }; }
      return { ok: false, reason: "clipboard-unavailable" };
    }
    if (mode === "active-window") {
      if (!this.bridge?.pasteActiveWindow) return { ok: false, reason: "desktop-bridge-unavailable" };
      return this.bridge.pasteActiveWindow(text);
    }
    return { ok: false, reason: "unknown-output-mode" };
  }
}

export { EasyInputLanAudioAdapter } from "./easyInputLanAudioAdapter.js";
import { EasyInputLanAudioAdapter } from "./easyInputLanAudioAdapter.js";

export class DesktopBridgeAdapter {
  constructor(bridge = globalThis.window?.desktopBridge) { this.bridge = bridge; }
  async capabilities() { return this.bridge?.getCapabilities ? this.bridge.getCapabilities() : { supported: false, platform: "web" }; }
  async networkSummary() { return this.bridge?.getNetworkSummary ? this.bridge.getNetworkSummary() : { available: Boolean(globalThis.navigator?.onLine), transports: [], lanAudio: "protocol-unconfirmed", sameLanPossible: Boolean(globalThis.navigator?.onLine) }; }
  async registerShortcut(shortcut) { return this.bridge?.registerShortcut ? this.bridge.registerShortcut(shortcut) : { registered: false, shortcut, reason: "desktop-bridge-unavailable" }; }
  async setShortcutCapture(active) { return this.bridge?.setShortcutCapture ? this.bridge.setShortcutCapture(active) : { ok: false, reason: "desktop-bridge-unavailable" }; }
  async listApplications() { return this.bridge?.listApplications ? this.bridge.listApplications() : []; }
  async registerApplication(token) { return this.bridge?.registerApplication ? this.bridge.registerApplication(token) : { ok: false, reason: "desktop-bridge-unavailable" }; }
  async chooseApplication() { return this.bridge?.chooseApplication ? this.bridge.chooseApplication() : { cancelled: true }; }
  async testApplication(id) { return this.bridge?.testApplication ? this.bridge.testApplication(id) : { ok: false, reason: "desktop-bridge-unavailable" }; }
  async readKeyboardConfig() { return this.bridge?.readKeyboardConfig ? this.bridge.readKeyboardConfig() : { ok: false, reason: "desktop-bridge-unavailable" }; }
  async previewKeyboardConfigPatch(patch) { return this.bridge?.previewKeyboardConfigPatch ? this.bridge.previewKeyboardConfigPatch(patch) : { ok: false, reason: "desktop-bridge-unavailable" }; }
  async commitKeyboardConfig(token) { return this.bridge?.commitKeyboardConfig ? this.bridge.commitKeyboardConfig(token) : { ok: false, reason: "desktop-bridge-unavailable" }; }
  async setVoiceRecording(recording) { return this.bridge?.setVoiceRecording ? this.bridge.setVoiceRecording(recording) : { ok: false, reason: "desktop-bridge-unavailable" }; }
  async setVoiceState(value) { return this.bridge?.setVoiceState ? this.bridge.setVoiceState(value) : { ok: false, reason: "desktop-bridge-unavailable" }; }
  async setManualAgentState(value) { return this.bridge?.setManualAgentState ? this.bridge.setManualAgentState(value) : { ok: false, reason: "desktop-bridge-unavailable" }; }
  async setTriggerConfig(value) { return this.bridge?.setTriggerConfig ? this.bridge.setTriggerConfig(value) : { ok: false, reason: "desktop-bridge-unavailable" }; }
  async editSelectedText(instruction, { signal } = {}) {
    if (!this.bridge?.editSelectedText) throw new Error("语音编辑仅在 DeskMate 桌面版可用");
    const requestId = globalThis.crypto?.randomUUID?.() || `voice-edit-${Date.now()}`;
    const cancel = () => this.bridge?.cancelBailianOrganizer?.(requestId);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      if (signal?.aborted) throw new Error("语音编辑已取消");
      return await this.bridge.editSelectedText({ requestId, instruction });
    } finally { signal?.removeEventListener("abort", cancel); }
  }
  onVoiceToggle(listener) { return this.bridge?.onVoiceToggle ? this.bridge.onVoiceToggle(listener) : () => {}; }
  onVoiceEditError(listener) { return this.bridge?.onVoiceEditError ? this.bridge.onVoiceEditError(listener) : () => {}; }
  onVoiceCancel(listener) { return this.bridge?.onVoiceCancel ? this.bridge.onVoiceCancel(listener) : () => {}; }
  onKeyDiagnostic(listener) { return this.bridge?.onKeyDiagnostic ? this.bridge.onKeyDiagnostic(listener) : () => {}; }
  onInputBridgeStatus(listener) { return this.bridge?.onInputBridgeStatus ? this.bridge.onInputBridgeStatus(listener) : () => {}; }
  onHostActionResult(listener) { return this.bridge?.onHostActionResult ? this.bridge.onHostActionResult(listener) : () => {}; }
  onNavigate(listener) { return this.bridge?.onNavigate ? this.bridge.onNavigate(listener) : () => {}; }
}

export const voiceAdapters = { stt: new SttAdapter(), organizer: new TextOrganizerAdapter(), output: new TextOutputAdapter(), lanAudio: new EasyInputLanAudioAdapter(), desktop: new DesktopBridgeAdapter() };
