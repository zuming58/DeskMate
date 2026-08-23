const WebSocket = require("ws");
const { validateApiKey, validateWorkspaceId } = require("./bailian.cjs");

const DEFAULT_REALTIME_MODEL = "qwen3-asr-flash-realtime";
const MAX_CHUNK_BYTES = 1024 * 1024;

function realtimeEndpoint(workspaceId = "", model = DEFAULT_REALTIME_MODEL) {
  const workspace = validateWorkspaceId(workspaceId);
  const host = workspace ? `${workspace}.cn-beijing.maas.aliyuncs.com` : "dashscope.aliyuncs.com";
  return `wss://${host}/api-ws/v1/realtime?model=${encodeURIComponent(model)}`;
}

function eventId(prefix = "event") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseRealtimeMessage(value) {
  let message;
  try { message = JSON.parse(String(value)); } catch { return null; }
  if (!message || typeof message.type !== "string") return null;
  if (message.type === "conversation.item.input_audio_transcription.text") {
    return { kind: "preview", text: String(message.text || ""), stash: String(message.stash || ""), itemId: String(message.item_id || "") };
  }
  if (message.type === "conversation.item.input_audio_transcription.completed") {
    return { kind: "completed", text: String(message.transcript || ""), itemId: String(message.item_id || ""), language: String(message.language || ""), emotion: String(message.emotion || "") };
  }
  if (message.type === "conversation.item.input_audio_transcription.failed" || message.type === "error") {
    return { kind: "error", message: String(message.error?.message || "实时语音识别失败").slice(0, 240) };
  }
  if (message.type === "session.finished") return { kind: "finished" };
  if (message.type === "session.created") return { kind: "created" };
  if (message.type === "session.updated") return { kind: "ready" };
  return { kind: "diagnostic", type: message.type };
}

class BailianRealtimeSession {
  constructor({ apiKey, workspaceId = "", WebSocketImpl = WebSocket, onEvent = () => {}, timeoutMs = 10000 } = {}) {
    this.apiKey = validateApiKey(apiKey);
    this.workspaceId = validateWorkspaceId(workspaceId);
    this.WebSocketImpl = WebSocketImpl;
    this.onEvent = onEvent;
    this.timeoutMs = timeoutMs;
    this.socket = null;
    this.ready = false;
    this.closed = false;
    this.pendingAudio = [];
    this.completedItems = new Map();
    this.liveItems = new Map();
  }

  combinedPreview(itemId = "") {
    const completed = [...this.completedItems.values()].filter(Boolean).join("，");
    const live = itemId ? this.liveItems.get(itemId) || "" : [...this.liveItems.values()].at(-1) || "";
    return [completed, live].filter(Boolean).join(completed && live ? "，" : "");
  }

  emit(event) { this.onEvent(event); }

  async start() {
    if (this.socket) return { ok: true };
    const headers = { Authorization: `Bearer ${this.apiKey}`, "User-Agent": "DeskMate/0.0.0" };
    if (this.workspaceId) headers["X-DashScope-WorkSpace"] = this.workspaceId;
    const socket = new this.WebSocketImpl(realtimeEndpoint(this.workspaceId), { headers });
    this.socket = socket;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("连接千问实时识别超时")), this.timeoutMs);
      const cleanup = () => clearTimeout(timeout);
      socket.once("open", () => {
        socket.send(JSON.stringify({
          event_id: eventId("session"),
          type: "session.update",
          session: {
            input_audio_format: "pcm",
            sample_rate: 16000,
            input_audio_transcription: { language: "zh" },
            turn_detection: { type: "server_vad", threshold: 0.0, silence_duration_ms: 500 },
          },
        }));
      });
      socket.on("message", (data) => {
        const event = parseRealtimeMessage(data);
        if (!event) return;
        if (event.kind === "ready" && !this.ready) {
          this.ready = true;
          cleanup();
          this.pendingAudio.splice(0).forEach((audio) => this.append(audio));
          this.emit({ kind: "ready" });
          resolve({ ok: true });
          return;
        }
        if (event.kind === "preview") {
          const current = `${event.text}${event.stash}`.trim();
          this.liveItems.set(event.itemId, current);
          this.emit({ ...event, preview: this.combinedPreview(event.itemId) });
        } else if (event.kind === "completed") {
          this.liveItems.delete(event.itemId);
          if (event.text.trim()) this.completedItems.set(event.itemId, event.text.trim());
          this.emit({ ...event, preview: this.combinedPreview() });
        } else {
          this.emit(event);
          if (event.kind === "finished") this.cancel();
        }
      });
      socket.once("error", (error) => {
        cleanup();
        if (!this.ready) reject(new Error(error?.message || "无法连接千问实时识别"));
        this.emit({ kind: "error", message: String(error?.message || "实时识别连接异常").slice(0, 240) });
      });
      socket.once("close", () => {
        cleanup();
        this.closed = true;
        this.emit({ kind: "closed" });
        if (!this.ready) reject(new Error("千问实时识别连接已关闭"));
      });
    });
    return { ok: true };
  }

  append(value) {
    const audio = Buffer.isBuffer(value) ? value : Buffer.from(value || []);
    if (!audio.length || audio.length > MAX_CHUNK_BYTES || this.closed) return false;
    if (!this.ready || this.socket?.readyState !== this.WebSocketImpl.OPEN) {
      if (this.pendingAudio.length < 20) this.pendingAudio.push(audio);
      return true;
    }
    this.socket.send(JSON.stringify({ event_id: eventId("audio"), type: "input_audio_buffer.append", audio: audio.toString("base64") }));
    return true;
  }

  finish() {
    if (this.closed || !this.socket) return false;
    if (this.socket.readyState === this.WebSocketImpl.OPEN) this.socket.send(JSON.stringify({ event_id: eventId("finish"), type: "session.finish" }));
    setTimeout(() => this.cancel(), 5000).unref?.();
    return true;
  }

  cancel() {
    if (this.closed) return;
    this.closed = true;
    this.pendingAudio = [];
    try { this.socket?.close(); } catch { /* already closed */ }
  }
}

module.exports = { BailianRealtimeSession, DEFAULT_REALTIME_MODEL, MAX_CHUNK_BYTES, parseRealtimeMessage, realtimeEndpoint };
