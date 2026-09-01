const MAX_AUDIO_CHUNK_BYTES = 64 * 1024;
const COMMAND_VERSION = 1;
const DEFAULT_START_TIMEOUT_MS = 5000;
const DEFAULT_DRAIN_TIMEOUT_MS = 4000;

function safeContext(value = {}) {
  const sessionId = String(value.sessionId || "").slice(0, 128);
  const generation = Math.max(1, Number(value.generation) || 1);
  const deviceId = String(value.deviceId || "").slice(0, 512);
  if (!sessionId) throw new Error("computer-audio-session-invalid");
  return Object.freeze({ sessionId, generation, deviceId });
}

function matchesContext(event, context) {
  return Boolean(context && String(event?.sessionId || "") === context.sessionId && Number(event?.generation) === context.generation);
}

class ComputerCompanionAudioSession {
  constructor({ sendCommand = () => {}, onError = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, startTimeoutMs = DEFAULT_START_TIMEOUT_MS, drainTimeoutMs = DEFAULT_DRAIN_TIMEOUT_MS } = {}) {
    this.sendCommand = sendCommand;
    this.onError = onError;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.startTimeoutMs = startTimeoutMs;
    this.drainTimeoutMs = drainTimeoutMs;
    this.rendererReady = false;
    this.context = null;
    this.sourceActive = false;
    this.sinkActive = false;
    this.sourceHandlers = null;
    this.pending = new Map();
    this.sequence = 0;
    this.counters = { sourceChunks: 0, sinkChunks: 0, rejectedEvents: 0, interruptions: 0, queueDrops: 0, drainRequests: 0, drains: 0, drainTimeouts: 0 };
    this.source = Object.freeze({
      status: () => this.sourceStatus(),
      start: (handlers) => this.startSource(handlers),
      stop: () => this.stopSource(),
    });
    this.sink = Object.freeze({
      status: () => this.sinkStatus(),
      start: () => this.startSink(),
      write: (value) => this.writeSink(value),
      drain: () => this.drainSink(),
      interrupt: () => this.interruptSink(),
      stop: () => this.stopSink(),
    });
  }

  setRendererReady(ready) {
    this.rendererReady = Boolean(ready);
    if (!this.rendererReady) {
      this.settle("source.started", { ok: false, reason: "computer-audio-renderer-unavailable" });
      this.settle("sink.started", { ok: false, reason: "computer-audio-renderer-unavailable" });
      this.settleWhere((key) => key.startsWith("sink.drained:"), { ok: false, reason: "computer-audio-renderer-unavailable" });
      if (this.sourceActive) this.sourceHandlers?.onError?.(new Error("computer-audio-renderer-unavailable"));
      else if (this.sinkActive) this.onError("computer-audio-renderer-unavailable");
    }
    return { ok: true, ready: this.rendererReady };
  }

  prepare(value) {
    if (this.sourceActive || this.sinkActive) return { ok: false, reason: "computer-audio-session-active" };
    this.context = safeContext(value);
    return { ok: true };
  }

  sourceStatus() {
    return Object.freeze({ available: this.rendererReady, kind: "computer", reason: this.rendererReady ? "" : "computer-audio-renderer-unavailable", sampleRate: 16000, active: this.sourceActive });
  }

  sinkStatus() {
    return Object.freeze({ available: this.rendererReady, kind: "computer", reason: this.rendererReady ? "" : "computer-audio-renderer-unavailable", sampleRate: 24000, active: this.sinkActive });
  }

  diagnostics() {
    return Object.freeze({ ready: this.rendererReady, sourceActive: this.sourceActive, sinkActive: this.sinkActive, counters: Object.freeze({ ...this.counters }) });
  }

  command(type, extra = {}) {
    if (!this.context) return false;
    this.sendCommand(Object.freeze({ version: COMMAND_VERSION, type, sessionId: this.context.sessionId, generation: this.context.generation, sequence: ++this.sequence, ...extra }));
    return true;
  }

  request(type, successType, extra = {}) {
    if (!this.rendererReady || !this.context) return Promise.resolve({ ok: false, reason: "computer-audio-renderer-unavailable" });
    if (this.pending.has(successType)) return Promise.resolve({ ok: false, reason: "computer-audio-request-active" });
    return new Promise((resolve) => {
      const timer = this.setTimer(() => {
        this.pending.delete(successType);
        resolve({ ok: false, reason: "computer-audio-start-timeout" });
      }, this.startTimeoutMs);
      this.pending.set(successType, { resolve, timer });
      this.command(type, extra);
    });
  }

  settle(type, result) {
    const pending = this.pending.get(type);
    if (!pending) return false;
    this.pending.delete(type);
    this.clearTimer(pending.timer);
    pending.resolve(result);
    return true;
  }

  settleWhere(predicate, result) {
    let count = 0;
    for (const key of [...this.pending.keys()]) {
      if (predicate(key) && this.settle(key, result)) count += 1;
    }
    return count;
  }

  async startSource(handlers = {}) {
    if (this.sourceActive) return { ok: false, reason: "computer-audio-source-active" };
    this.sourceHandlers = handlers;
    const result = await this.request("source.start", "source.started", { deviceId: this.context?.deviceId || "" });
    if (!result.ok) this.sourceHandlers = null;
    else this.sourceActive = true;
    return result;
  }

  async stopSource() {
    if (this.context) this.command("source.stop");
    this.settle("source.started", { ok: false, reason: "computer-audio-source-stopped" });
    this.sourceActive = false;
    this.sourceHandlers = null;
    return { ok: true };
  }

  async startSink() {
    if (this.sinkActive) return { ok: true, alreadyStarted: true };
    const result = await this.request("sink.start", "sink.started");
    if (result.ok) this.sinkActive = true;
    return result;
  }

  async writeSink(value) {
    const chunk = Buffer.from(value || []);
    if (!this.sinkActive || !chunk.length || chunk.length > MAX_AUDIO_CHUNK_BYTES) return false;
    this.counters.sinkChunks += 1;
    return this.command("sink.audio", { audio: chunk });
  }

  async drainSink() {
    if (!this.sinkActive || !this.rendererReady || !this.context) return { ok: false, reason: "computer-audio-sink-unavailable" };
    const requestSequence = ++this.sequence;
    const key = `sink.drained:${requestSequence}`;
    this.counters.drainRequests += 1;
    return new Promise((resolve) => {
      const timer = this.setTimer(() => {
        if (!this.pending.delete(key)) return;
        this.counters.drainTimeouts += 1;
        this.command("sink.interrupt");
        resolve({ ok: false, reason: "computer-audio-drain-timeout" });
      }, this.drainTimeoutMs);
      this.pending.set(key, { resolve, timer });
      this.sendCommand(Object.freeze({ version: COMMAND_VERSION, type: "sink.drain", sessionId: this.context.sessionId, generation: this.context.generation, sequence: requestSequence }));
    });
  }

  async interruptSink() {
    this.counters.interruptions += 1;
    if (this.context) this.command("sink.interrupt");
    return { ok: true };
  }

  async stopSink() {
    if (this.context) this.command("sink.stop");
    this.settle("sink.started", { ok: false, reason: "computer-audio-sink-stopped" });
    this.settleWhere((key) => key.startsWith("sink.drained:"), { ok: false, reason: "computer-audio-sink-stopped" });
    this.sinkActive = false;
    return { ok: true };
  }

  handleRendererEvent(event = {}) {
    if (!event || typeof event !== "object" || event.version !== COMMAND_VERSION) {
      this.counters.rejectedEvents += 1;
      return { ok: false, reason: "computer-audio-event-invalid" };
    }
    if (event.type === "renderer.ready") return this.setRendererReady(event.ready);
    if (!matchesContext(event, this.context)) {
      this.counters.rejectedEvents += 1;
      return { ok: false, reason: "computer-audio-event-stale" };
    }
    if (event.type === "source.started") return { ok: this.settle("source.started", { ok: true }) };
    if (event.type === "sink.started") return { ok: this.settle("sink.started", { ok: true }) };
    if (event.type === "sink.drained") {
      const requestSequence = Number(event.requestSequence);
      if (!Number.isSafeInteger(requestSequence) || requestSequence < 1) {
        this.counters.rejectedEvents += 1;
        return { ok: false, reason: "computer-audio-drain-event-invalid" };
      }
      const settled = this.settle(`sink.drained:${requestSequence}`, { ok: true });
      if (!settled) {
        this.counters.rejectedEvents += 1;
        return { ok: false, reason: "computer-audio-drain-event-stale" };
      }
      this.counters.drains += 1;
      return { ok: true };
    }
    if (event.type === "source.audio") {
      const chunk = Buffer.from(event.audio || []);
      if (!this.sourceActive || !chunk.length || chunk.length > MAX_AUDIO_CHUNK_BYTES) {
        this.counters.rejectedEvents += 1;
        return { ok: false, reason: "computer-audio-chunk-invalid" };
      }
      this.counters.sourceChunks += 1;
      this.sourceHandlers?.onAudio?.(chunk);
      return { ok: true };
    }
    if (event.type === "source.error") {
      const reason = /^[a-z0-9-]{1,80}$/.test(String(event.reason || "")) ? event.reason : "computer-microphone-error";
      if (!this.settle("source.started", { ok: false, reason })) this.sourceHandlers?.onError?.(new Error(reason));
      return { ok: true };
    }
    if (event.type === "sink.error") {
      const reason = /^[a-z0-9-]{1,80}$/.test(String(event.reason || "")) ? event.reason : "computer-speaker-error";
      if (!this.settle("sink.started", { ok: false, reason })) this.onError(reason);
      return { ok: true };
    }
    if (event.type === "sink.queue-drop") {
      this.counters.queueDrops += 1;
      return { ok: true };
    }
    this.counters.rejectedEvents += 1;
    return { ok: false, reason: "computer-audio-event-unmapped" };
  }
}

module.exports = { COMMAND_VERSION, ComputerCompanionAudioSession, MAX_AUDIO_CHUNK_BYTES, safeContext };
