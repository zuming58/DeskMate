const { randomUUID } = require("crypto");
const { encodePcm16Wav } = require("./pcm-wav.cjs");
const { pcmLevel } = require("./easyinput-audio-source.cjs");

const MAX_RECORDING_BYTES = 10 * 1024 * 1024;
const MAX_RECORDING_MS = 5 * 60 * 1000;

class EasyInputVoiceRecorder {
  constructor({
    source,
    emit = () => {},
    now = () => Date.now(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    maxBytes = MAX_RECORDING_BYTES,
    maxDurationMs = MAX_RECORDING_MS,
  } = {}) {
    if (!source) throw new Error("easyinput-recording-source-required");
    this.source = source;
    this.emit = emit;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.maxBytes = maxBytes;
    this.maxDurationMs = maxDurationMs;
    this.active = null;
  }

  status() {
    return Object.freeze({ recording: Boolean(this.active), sessionId: this.active?.sessionId || "" });
  }

  async start() {
    if (this.active) return { ok: false, reason: "easyinput-recording-active" };
    const readiness = this.source.status();
    if (!readiness.available || !readiness.heartbeat) {
      return { ok: false, reason: readiness.reason || "easyinput-audio-unavailable" };
    }
    const session = { sessionId: randomUUID(), startedAt: this.now(), chunks: [], bytes: 0, lastLevelAt: 0, timer: null, failed: false };
    this.active = session;
    const result = await this.source.start({
      onAudio: (chunk) => this.acceptAudio(session, chunk),
      onError: (error) => void this.fail(error?.message || "easyinput-recording-source-error"),
    });
    if (!result.ok) {
      if (this.active === session) this.active = null;
      return result;
    }
    if (session.failed || this.active !== session) return { ok: false, reason: session.failure || "easyinput-recording-source-error" };
    session.timer = this.setTimer(() => void this.fail("easyinput-recording-time-limit"), this.maxDurationMs);
    this.emit({ type: "started", recording: true, sessionId: session.sessionId, level: 0 });
    return { ok: true, sessionId: session.sessionId };
  }

  acceptAudio(session, chunk) {
    if (this.active !== session) return;
    const value = Buffer.from(chunk || []);
    if (!value.length || value.length % 2 !== 0) return void this.fail("easyinput-recording-audio-invalid");
    if (session.bytes + value.length > this.maxBytes) return void this.fail("easyinput-recording-size-limit");
    session.chunks.push(value);
    session.bytes += value.length;
    const current = this.now();
    if (current - session.lastLevelAt >= 100) {
      session.lastLevelAt = current;
      this.emit({ type: "level", recording: true, sessionId: session.sessionId, level: pcmLevel(value), seconds: Math.floor((current - session.startedAt) / 1000) });
    }
  }

  async stop(reason = "user") {
    const session = this.active;
    if (!session) return { ok: false, reason: "easyinput-recording-not-active" };
    this.active = null;
    if (session.timer) this.clearTimer(session.timer);
    await this.source.stop(reason);
    if (session.failed) return { ok: false, reason: session.failure || "easyinput-recording-failed" };
    if (!session.bytes) return { ok: false, reason: "easyinput-recording-empty" };
    const wave = encodePcm16Wav(session.chunks);
    const audio = wave.buffer.slice(wave.byteOffset, wave.byteOffset + wave.byteLength);
    const duration = Math.max(0, Math.floor((this.now() - session.startedAt) / 1000));
    this.emit({ type: "stopped", recording: false, sessionId: session.sessionId, level: 0, reason });
    return { ok: true, sessionId: session.sessionId, audio, mimeType: "audio/wav", duration };
  }

  async cancel(reason = "cancelled") {
    const session = this.active;
    if (!session) return { ok: true, alreadyStopped: true };
    this.active = null;
    if (session.timer) this.clearTimer(session.timer);
    await this.source.stop(reason);
    this.emit({ type: "cancelled", recording: false, sessionId: session.sessionId, level: 0, reason });
    return { ok: true };
  }

  async fail(reason = "easyinput-recording-failed") {
    const session = this.active;
    if (!session || session.failed) return { ok: false, reason };
    session.failed = true;
    session.failure = String(reason || "easyinput-recording-failed");
    this.emit({ type: "error", recording: false, sessionId: session.sessionId, level: 0, reason: session.failure });
    return this.cancel(session.failure);
  }

  async close() { return this.cancel("application-quit"); }
}

module.exports = { EasyInputVoiceRecorder, MAX_RECORDING_BYTES, MAX_RECORDING_MS };
