const { randomUUID } = require("crypto");
const WebSocket = require("ws");
const { EVENTS, MESSAGE_TYPES, decodeFrame, encodeAudioEvent, encodeJsonEvent } = require("./doubao-realtime-codec.cjs");

const DEFAULT_ENDPOINT = "wss://openspeech.bytedance.com/api/v3/realtime/dialogue";
const DOUBAO_PROTOCOL_APP_KEY = "PlgvMymc7f3tQnJ6";
const STRICT_HALF_DUPLEX_INPUT_MODE = "keep_alive";
const { normalizeCompanionPreferences } = require("./companion-preferences.cjs");
const EVENT_NAMES = Object.freeze({
  50: "connection.started", 51: "connection.failed", 52: "connection.finished",
  150: "session.ready", 152: "session.finished", 153: "session.failed", 154: "session.usage",
  350: "tts.started", 351: "tts.sentence-ended", 352: "tts.audio", 359: "tts.ended",
  450: "asr.info", 451: "asr.result", 459: "asr.ended",
  550: "chat.delta", 553: "chat.confirmed", 559: "chat.ended", 599: "dialog.error",
});

const FAILURE_BUCKETS = Object.freeze({
  45000001: "request-invalid",
  45000002: "empty-audio",
  45000151: "audio-format-invalid",
  52000042: "audio-idle-timeout",
  55000031: "server-busy",
});

function providerFailureBucket(value) {
  const code = Number(value);
  if (Object.hasOwn(FAILURE_BUCKETS, code)) return FAILURE_BUCKETS[code];
  if (Number.isInteger(code) && String(Math.abs(code)).startsWith("550")) return "server-internal";
  return "unknown-provider-error";
}

function dialogErrorStatusClass(value) {
  if (value === undefined || value === null || value === "") return "missing";
  if ((typeof value === "number" && Number.isSafeInteger(value)) || (typeof value === "string" && /^-?\d{1,10}$/.test(value))) {
    return providerFailureBucket(value);
  }
  return "invalid";
}

function diagnostic(providerEvent, terminalEvent = "none", failureBucket = "none", detail = {}) {
  const result = { providerEvent, terminalEvent, failureBucket };
  if (["missing", "invalid", "request-invalid", "empty-audio", "audio-format-invalid", "audio-idle-timeout", "server-busy", "server-internal", "unknown-provider-error"].includes(detail.dialogErrorStatusClass)) {
    result.dialogErrorStatusClass = detail.dialogErrorStatusClass;
  }
  return Object.freeze(result);
}

function boundedText(value, max = 4096) {
  return String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);
}

function validateConfig(value = {}) {
  let endpoint;
  try { endpoint = new URL(value.endpoint || DEFAULT_ENDPOINT); } catch { throw new Error("doubao-endpoint-invalid"); }
  if (endpoint.protocol !== "wss:" || endpoint.username || endpoint.password || endpoint.hash) throw new Error("doubao-endpoint-invalid");
  const required = ["appId", "accessKey", "resourceId", "model", "voice"];
  for (const key of required) if (!String(value[key] || "").trim()) throw new Error(`doubao-${key}-missing`);
  const companion = normalizeCompanionPreferences(value);
  return {
    endpoint: endpoint.href,
    appId: boundedText(value.appId, 160), accessKey: boundedText(value.accessKey, 512), appKey: boundedText(value.appKey, 240),
    resourceId: boundedText(value.resourceId, 160), model: boundedText(value.model, 120), voice: boundedText(value.voice, 160),
    companionName: companion.name, endSmoothWindowMs: companion.endSmoothWindowMs,
  };
}

function translateFrame(frame, state) {
  if (frame.messageType === MESSAGE_TYPES.ERROR) return {
    type: "error",
    message: "doubao-service-error",
    diagnostic: diagnostic("error-frame", "error-frame", providerFailureBucket(frame.code)),
  };
  if (frame.messageType === MESSAGE_TYPES.AUDIO_ONLY_RESPONSE || frame.event === 352) return { type: "audio", audio: frame.payload };
  const name = EVENT_NAMES[frame.event] || "diagnostic";
  const payload = frame.payloadJson || {};
  if (name === "asr.result") {
    const result = Array.isArray(payload.results) ? payload.results[0] : null;
    const text = boundedText(result?.text, 16384);
    return { type: result?.is_interim ? "asr.partial" : "asr.final", text };
  }
  if (name === "chat.delta") {
    const delta = boundedText(payload.content, 4096);
    state.replyText = boundedText(`${state.replyText}${delta}`, 16384);
    return { type: "chat.partial", text: delta, fullText: state.replyText };
  }
  if (name === "chat.ended") {
    const text = state.replyText;
    state.replyText = "";
    return { type: "chat.final", text };
  }
  if (name === "tts.started") return { type: "tts.start", text: boundedText(payload.text, 4096) };
  if (name === "tts.ended") return { type: "tts.end", diagnostic: diagnostic("tts-end") };
  if (name === "connection.failed") return { type: "error", message: "doubao-handshake-service-error", diagnostic: diagnostic("connection-failed", "connection-failed", "unknown-provider-error") };
  if (name === "connection.finished") return { type: name, diagnostic: diagnostic("connection-finished", "connection-finished") };
  if (name === "session.finished") return { type: name, diagnostic: diagnostic("session-finished", "session-finished") };
  if (name === "session.failed") return { type: "error", message: "doubao-session-service-error", diagnostic: diagnostic("session-failed", "session-failed", "unknown-provider-error") };
  if (name === "dialog.error") {
    const statusClass = dialogErrorStatusClass(payload.status_code);
    const failureBucket = ["missing", "invalid"].includes(statusClass) ? "unknown-provider-error" : statusClass;
    return {
      type: "error",
      message: "doubao-service-error",
      diagnostic: diagnostic("dialog-error", "dialog-error", failureBucket, { dialogErrorStatusClass: statusClass }),
    };
  }
  return { type: name, diagnostic: diagnostic(name) };
}

function protocolErrorReason(error) {
  const reason = String(error?.message || "");
  if (/gzip|too-large/.test(reason)) return "doubao-frame-compression-invalid";
  if (/json/.test(reason)) return "doubao-frame-json-invalid";
  if (/session-id|connect-id|identifier/.test(reason)) return "doubao-frame-identifier-invalid";
  if (/header|frame-size/.test(reason)) return "doubao-frame-header-invalid";
  return "doubao-frame-layout-invalid";
}

class DoubaoRealtimeSession {
  constructor({ config, WebSocketImpl = WebSocket, onEvent = () => {}, connectTimeoutMs = 12000 } = {}) {
    this.config = validateConfig(config);
    this.WebSocketImpl = WebSocketImpl;
    this.onEvent = onEvent;
    this.connectTimeoutMs = connectTimeoutMs;
    this.sessionId = randomUUID();
    this.socket = null;
    this.ready = false;
    this.closed = false;
    this.sessionRequestSent = false;
    this.state = { replyText: "" };
  }

  buildHeaders() {
    return Object.fromEntries(Object.entries({
      "X-Api-App-ID": this.config.appId,
      "X-Api-Access-Key": this.config.accessKey,
      "X-Api-Resource-Id": this.config.resourceId,
      "X-Api-App-Key": DOUBAO_PROTOCOL_APP_KEY,
      "X-Api-Connect-Id": randomUUID(),
    }).filter(([, value]) => value));
  }

  buildSessionPayload() {
    return {
      // The current realtime dialogue contract gates a custom stop-speaking
      // window behind enable_custom_vad (default false). Keep unrelated ASR
      // features disabled while explicitly enabling the user's bounded window.
      asr: { extra: { end_smooth_window_ms: this.config.endSmoothWindowMs, enable_custom_vad: true } },
      dialog: {
        bot_name: this.config.companionName,
        system_role: `你是 ${this.config.companionName}，DeskMate 本地桌面陪伴助手。回答自然、简短，不执行系统命令，不声称拥有未接入的硬件能力。`,
        speaking_style: "自然、友好、简洁，适合实时语音交流",
        // The official keep_alive mode permits temporary upstream silence while
        // strict half-duplex playback suppresses microphone chunks for echo safety.
        extra: { input_mod: STRICT_HALF_DUPLEX_INPUT_MODE, model: this.config.model, strict_audit: true, enable_loudness_norm: true },
      },
      tts: { speaker: this.config.voice, audio_config: { channel: 1, format: "pcm_s16le", sample_rate: 24000, speech_rate: 0, loudness_rate: 0 }, extra: {} },
    };
  }

  async connect() {
    if (this.socket) return { ok: this.ready };
    const socket = new this.WebSocketImpl(this.config.endpoint, { headers: this.buildHeaders() });
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => { if (settled) return; settled = true; clearTimeout(timer); callback(value); };
      const timer = setTimeout(() => { try { socket.terminate?.(); } catch { /* best effort */ } finish(reject, new Error("doubao-connect-timeout")); }, this.connectTimeoutMs);
      socket.once("open", () => {
        if (this.closed) return;
        socket.send(encodeJsonEvent(EVENTS.START_CONNECTION, {}));
      });
      socket.once("unexpected-response", (_request, response) => {
        response?.resume?.();
        try { socket.terminate?.(); } catch { /* best effort */ }
        const error = new Error("doubao-handshake-rejected");
        finish(reject, error);
        this.onEvent({ type: "error", message: error.message, diagnostic: diagnostic("transport-error", "transport-error", "unknown-provider-error") });
      });
      socket.on("message", (data) => {
        if (this.closed) return;
        let event;
        try {
          event = translateFrame(decodeFrame(data), this.state);
          if (event.type === "connection.started" && !this.sessionRequestSent) {
            this.sessionRequestSent = true;
            socket.send(encodeJsonEvent(EVENTS.START_SESSION, this.buildSessionPayload(), this.sessionId));
          }
        } catch (error) { event = { type: "error", message: protocolErrorReason(error) }; }
        if (event.type === "session.ready") { this.ready = true; finish(resolve, { ok: true, sessionId: this.sessionId }); }
        if (event.type === "error" && !this.ready) finish(reject, new Error(event.message));
        this.onEvent(event);
      });
      socket.once("error", () => {
        const error = new Error("doubao-connection-error");
        if (!this.ready) finish(reject, error);
        this.onEvent({ type: "error", message: error.message, diagnostic: diagnostic("transport-error", "transport-error", "unknown-provider-error") });
      });
      socket.once("close", () => {
        const wasReady = this.ready;
        this.ready = false;
        if (!wasReady) finish(reject, new Error("doubao-connection-closed"));
        if (!this.closed) this.onEvent({ type: "connection.closed", diagnostic: diagnostic("transport-close", "transport-close") });
      });
    });
  }

  sendAudio(value) {
    const chunk = Buffer.from(value || []);
    if (!this.ready || this.closed || !chunk.length || chunk.length > 64 * 1024) return false;
    this.socket.send(encodeAudioEvent(EVENTS.AUDIO_TASK_REQUEST, chunk, this.sessionId));
    return true;
  }

  endAudio() {
    if (!this.ready || this.closed) return false;
    this.socket.send(encodeJsonEvent(EVENTS.END_AUDIO, {}, this.sessionId));
    return true;
  }

  interrupt() { this.state.replyText = ""; }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.state.replyText = "";
    try {
      if (this.socket?.readyState === this.WebSocketImpl.OPEN) {
        this.socket.send(encodeJsonEvent(EVENTS.FINISH_SESSION, {}, this.sessionId));
        this.socket.send(encodeJsonEvent(EVENTS.FINISH_CONNECTION, {}));
      }
      this.socket?.close();
    } catch { /* best effort */ }
  }
}

module.exports = { DEFAULT_ENDPOINT, DOUBAO_PROTOCOL_APP_KEY, STRICT_HALF_DUPLEX_INPUT_MODE, DoubaoRealtimeSession, dialogErrorStatusClass, protocolErrorReason, providerFailureBucket, translateFrame, validateConfig };
