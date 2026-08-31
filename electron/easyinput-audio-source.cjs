const dgram = require("dgram");
const { randomBytes } = require("crypto");
const net = require("net");
const { ACK_STATUS, CONTROL_ACTIONS, decodeDatagram, encodeControl } = require("./easyinput-audio-codec.cjs");

const HEARTBEAT_FRESH_MS = 3500;
const HEARTBEAT_WAIT_MS = 5000;
const CONTROL_ACK_MS = 600;
const CONTROL_ATTEMPTS = 3;
const KEEPALIVE_MS = 5000;
const MAX_AUDIO_QUEUE_FRAMES = 50;

function endpointKey(value) { return value ? `${value.address}:${value.port}` : ""; }
function sameEndpoint(left, right) { return endpointKey(left) === endpointKey(right); }
function safeIncrement(value, amount = 1) { return Math.min(0xffffffff, value + amount); }

function pcmLevel(value) {
  const buffer = Buffer.from(value || []);
  if (!buffer.length || buffer.length % 2 !== 0) return 0;
  let sum = 0;
  for (let offset = 0; offset < buffer.length; offset += 2) {
    const sample = buffer.readInt16LE(offset) / 32768;
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / (buffer.length / 2));
  return Math.max(0, Math.min(100, Math.round(rms * 220)));
}

class EasyInputLanAudioSource {
  constructor({
    socketFactory = () => dgram.createSocket("udp4"),
    randomToken = () => randomBytes(16),
    randomSession = () => randomBytes(8).readBigUInt64LE(0) || 1n,
    now = () => Date.now(),
    onEvent = () => {},
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    setRepeating = setInterval,
    clearRepeating = clearInterval,
  } = {}) {
    this.socketFactory = socketFactory;
    this.randomToken = randomToken;
    this.randomSession = randomSession;
    this.now = now;
    this.onEvent = onEvent;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.setRepeating = setRepeating;
    this.clearRepeating = clearRepeating;
    this.config = null;
    this.socket = null;
    this.bound = false;
    this.state = "not-configured";
    this.reason = "easyinput-audio-not-configured";
    this.candidate = null;
    this.candidateAmbiguous = false;
    this.candidateWaiters = new Set();
    this.lockedEndpoint = null;
    this.sessionId = 0n;
    this.controlSequence = 0;
    this.lastAudioSequence = null;
    this.handlers = null;
    this.keepaliveTimer = null;
    this.pendingAck = null;
    this.audioQueue = [];
    this.audioDrainScheduled = false;
    this.closed = false;
    this.diagnostics = { heartbeats: 0, audioFrames: 0, droppedFrames: 0, sequenceGaps: 0, malformedPackets: 0, sourceRejects: 0, controlRetries: 0, controlTimeouts: 0 };
  }

  status() {
    const heartbeatFresh = Boolean(this.candidate && this.now() - this.candidate.seenAt <= HEARTBEAT_FRESH_MS && !this.candidateAmbiguous);
    return Object.freeze({
      available: Boolean(this.config && this.bound && (this.sessionId || heartbeatFresh)),
      kind: "easyinput-lan",
      configured: Boolean(this.config),
      state: this.state,
      reason: this.reason,
      networkReady: this.bound,
      heartbeat: heartbeatFresh,
      streaming: Boolean(this.sessionId),
      counters: Object.freeze({ ...this.diagnostics }),
    });
  }

  emitStatus(extra = {}) { this.onEvent(Object.freeze({ type: "status", ...this.status(), ...extra })); }

  async configure(value = {}) {
    const bindAddress = String(value.bindAddress || "");
    const port = Number(value.port);
    if (net.isIPv4(bindAddress) === 0 || !Number.isInteger(port) || port < 1024 || port > 65535) return { ok: false, reason: "easyinput-audio-config-invalid" };
    const unchanged = this.config?.bindAddress === bindAddress && this.config?.port === port;
    if (unchanged && this.bound) return { ok: true, status: this.status() };
    await this.stop("configuration-changed");
    await this.closeSocket();
    this.closed = false;
    this.config = Object.freeze({ bindAddress, port });
    this.state = "binding";
    this.reason = "";
    const result = await this.ensureListening();
    this.emitStatus();
    return result;
  }

  async clearConfiguration(reason = "easyinput-audio-not-configured") {
    await this.stop("configuration-cleared");
    await this.closeSocket();
    this.config = null;
    this.state = "not-configured";
    this.reason = reason;
    this.emitStatus();
    return { ok: true };
  }

  async ensureListening() {
    if (this.bound && this.socket) return { ok: true, status: this.status() };
    if (!this.config) return { ok: false, reason: "easyinput-audio-not-configured" };
    const socket = this.socketFactory();
    this.socket = socket;
    socket.on("message", (message, remote) => this.handleDatagram(message, remote));
    socket.on("error", () => this.handleSocketError());
    socket.on("close", () => { if (this.socket === socket) { this.bound = false; this.socket = null; } });
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => { if (settled) return; settled = true; resolve(result); };
      socket.once("error", () => finish({ ok: false, reason: "easyinput-audio-port-unavailable" }));
      try {
        socket.bind(this.config.port, this.config.bindAddress, () => {
          if (this.socket !== socket) return finish({ ok: false, reason: "easyinput-audio-listener-stale" });
          this.bound = true;
          this.state = "waiting-heartbeat";
          this.reason = "";
          finish({ ok: true, status: this.status() });
        });
      } catch {
        this.state = "faulted";
        this.reason = "easyinput-audio-port-unavailable";
        finish({ ok: false, reason: this.reason });
      }
    });
  }

  handleSocketError() {
    this.state = "faulted";
    this.reason = "easyinput-audio-socket-error";
    this.emitStatus();
    if (this.sessionId) this.handlers?.onError?.(new Error(this.reason));
  }

  handleDatagram(value, remote = {}) {
    if (net.isIPv4(remote.address) === 0 || !Number.isInteger(remote.port) || remote.port < 1 || remote.port > 65535) {
      this.diagnostics.sourceRejects = safeIncrement(this.diagnostics.sourceRejects);
      return;
    }
    const decoded = decodeDatagram(value);
    if (!decoded) {
      this.diagnostics.malformedPackets = safeIncrement(this.diagnostics.malformedPackets);
      return;
    }
    const endpoint = Object.freeze({ address: remote.address, port: remote.port, seenAt: this.now() });
    if (decoded.kind === "heartbeat") return this.handleHeartbeat(decoded, endpoint);
    if (this.pendingAck && decoded.kind === "ack" && sameEndpoint(endpoint, this.pendingAck.endpoint)) return this.handleAck(decoded);
    if (!this.lockedEndpoint || !sameEndpoint(endpoint, this.lockedEndpoint)) {
      this.diagnostics.sourceRejects = safeIncrement(this.diagnostics.sourceRejects);
      return;
    }
    if (decoded.kind === "audio") this.handleAudio(decoded);
  }

  handleHeartbeat(value, endpoint) {
    this.diagnostics.heartbeats = safeIncrement(this.diagnostics.heartbeats);
    const currentFresh = this.candidate && this.now() - this.candidate.seenAt <= HEARTBEAT_FRESH_MS;
    if (this.lockedEndpoint && !sameEndpoint(endpoint, this.lockedEndpoint)) {
      this.diagnostics.sourceRejects = safeIncrement(this.diagnostics.sourceRejects);
      return;
    }
    if (!this.lockedEndpoint && currentFresh && !sameEndpoint(endpoint, this.candidate)) {
      this.candidateAmbiguous = true;
      this.state = "ambiguous";
      this.reason = "multiple-easyinput-audio-sources";
      this.emitStatus();
      this.flushCandidateWaiters(new Error(this.reason));
      return;
    }
    this.candidate = endpoint;
    this.candidateAmbiguous = false;
    if (!this.sessionId) {
      this.state = value.audioReady ? "ready" : "unavailable";
      this.reason = value.audioReady ? "" : "easyinput-audio-device-unavailable";
    }
    this.emitStatus();
    if (value.audioReady) this.flushCandidateWaiters(null, endpoint);
  }

  flushCandidateWaiters(error, endpoint) {
    for (const waiter of this.candidateWaiters) {
      this.clearTimer(waiter.timer);
      error ? waiter.reject(error) : waiter.resolve(endpoint);
    }
    this.candidateWaiters.clear();
  }

  waitForCandidate() {
    if (this.candidateAmbiguous) return Promise.reject(new Error("multiple-easyinput-audio-sources"));
    if (this.candidate && this.now() - this.candidate.seenAt <= HEARTBEAT_FRESH_MS) return Promise.resolve(this.candidate);
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = this.setTimer(() => { this.candidateWaiters.delete(waiter); reject(new Error("easyinput-audio-heartbeat-timeout")); }, HEARTBEAT_WAIT_MS);
      this.candidateWaiters.add(waiter);
    });
  }

  handleAck(value) {
    const pending = this.pendingAck;
    if (!pending || value.action !== pending.action || value.sessionId !== pending.sessionId || value.sequence !== pending.sequence) return;
    this.pendingAck = null;
    this.clearTimer(pending.timer);
    pending.resolve(value);
  }

  waitForAck(expected) {
    return new Promise((resolve) => {
      const pending = { ...expected, resolve, timer: null };
      pending.timer = this.setTimer(() => { if (this.pendingAck === pending) this.pendingAck = null; resolve(null); }, CONTROL_ACK_MS);
      this.pendingAck = pending;
    });
  }

  async sendControl(actionName, endpoint, { bestEffort = false } = {}) {
    const action = CONTROL_ACTIONS[actionName];
    const sequence = ++this.controlSequence >>> 0;
    const token = this.randomToken();
    const packet = encodeControl({ action, sessionId: this.sessionId, sequence, token });
    if (bestEffort) {
      try { this.socket.send(packet, endpoint.port, endpoint.address); return { ok: true, unconfirmed: true }; }
      catch { return { ok: false, reason: "easyinput-audio-control-send-failed" }; }
    }
    for (let attempt = 0; attempt < CONTROL_ATTEMPTS; attempt += 1) {
      if (attempt > 0) this.diagnostics.controlRetries = safeIncrement(this.diagnostics.controlRetries);
      const ackPromise = this.waitForAck({ action, sessionId: this.sessionId, sequence, endpoint });
      try { this.socket.send(packet, endpoint.port, endpoint.address); }
      catch {
        const pending = this.pendingAck;
        if (pending) { this.clearTimer(pending.timer); this.pendingAck = null; pending.resolve(null); }
        throw new Error("easyinput-audio-control-send-failed");
      }
      const ack = await ackPromise;
      if (!ack) continue;
      if (ack.status !== ACK_STATUS.ok) throw new Error(`easyinput-audio-control-rejected-${ack.status}`);
      return { ok: true, ack };
    }
    this.diagnostics.controlTimeouts = safeIncrement(this.diagnostics.controlTimeouts);
    throw new Error("easyinput-audio-control-timeout");
  }

  handleAudio(value) {
    if (!this.sessionId || value.sessionId !== this.sessionId) {
      this.diagnostics.sourceRejects = safeIncrement(this.diagnostics.sourceRejects);
      return;
    }
    if (this.lastAudioSequence !== null) {
      if (value.sequence <= this.lastAudioSequence) {
        this.diagnostics.droppedFrames = safeIncrement(this.diagnostics.droppedFrames);
        return;
      }
      if (value.sequence > this.lastAudioSequence + 1) {
        const gap = value.sequence - this.lastAudioSequence - 1;
        this.diagnostics.sequenceGaps = safeIncrement(this.diagnostics.sequenceGaps, gap);
      }
    }
    this.lastAudioSequence = value.sequence;
    this.diagnostics.audioFrames = safeIncrement(this.diagnostics.audioFrames);
    if (this.audioQueue.length >= MAX_AUDIO_QUEUE_FRAMES) {
      this.diagnostics.droppedFrames = safeIncrement(this.diagnostics.droppedFrames);
      return;
    }
    this.audioQueue.push(Buffer.from(value.audio));
    if (!this.audioDrainScheduled) {
      this.audioDrainScheduled = true;
      queueMicrotask(() => this.drainAudioQueue());
    }
  }

  drainAudioQueue() {
    this.audioDrainScheduled = false;
    const handlers = this.handlers;
    if (!handlers) { this.audioQueue = []; return; }
    const queue = this.audioQueue;
    this.audioQueue = [];
    for (const chunk of queue) handlers.onAudio?.(chunk);
  }

  async start(handlers = {}) {
    if (this.sessionId) return { ok: false, reason: "easyinput-audio-session-active" };
    const listener = await this.ensureListening();
    if (!listener.ok) return listener;
    this.handlers = handlers;
    try {
      const endpoint = await this.waitForCandidate();
      this.sessionId = BigInt(this.randomSession()) || 1n;
      this.controlSequence = 0;
      this.lastAudioSequence = null;
      this.state = "starting";
      this.reason = "";
      this.emitStatus();
      await this.sendControl("start", endpoint);
      this.lockedEndpoint = endpoint;
      this.state = "streaming";
      this.emitStatus();
      this.keepaliveTimer = this.setRepeating(() => {
        void this.sendControl("keepalive", this.lockedEndpoint).catch((error) => {
          this.handlers?.onError?.(error);
          void this.stop("keepalive-failed");
        });
      }, KEEPALIVE_MS);
      return { ok: true };
    } catch (error) {
      this.sessionId = 0n;
      this.lockedEndpoint = null;
      this.handlers = null;
      this.state = "ready";
      this.reason = error?.message || "easyinput-audio-start-failed";
      this.emitStatus();
      return { ok: false, reason: this.reason };
    }
  }

  async stop(reason = "user") {
    if (this.keepaliveTimer) this.clearRepeating(this.keepaliveTimer);
    this.keepaliveTimer = null;
    const endpoint = this.lockedEndpoint;
    const active = Boolean(this.sessionId && endpoint && this.socket);
    if (active) {
      try { await this.sendControl("stop", endpoint, { bestEffort: true }); } catch { /* best effort */ }
    }
    if (this.pendingAck) { this.clearTimer(this.pendingAck.timer); this.pendingAck.resolve(null); this.pendingAck = null; }
    this.sessionId = 0n;
    this.lockedEndpoint = null;
    this.lastAudioSequence = null;
    this.audioQueue = [];
    this.handlers = null;
    if (this.config && this.bound) { this.state = "waiting-heartbeat"; this.reason = reason === "user" ? "" : reason; }
    this.emitStatus();
    return { ok: true, alreadyStopped: !active };
  }

  async closeSocket() {
    this.flushCandidateWaiters(new Error("easyinput-audio-listener-closed"));
    this.candidate = null;
    this.candidateAmbiguous = false;
    const socket = this.socket;
    this.socket = null;
    this.bound = false;
    if (socket) {
      try { socket.removeAllListeners("message"); socket.close(); } catch { /* best effort */ }
    }
  }

  async close() {
    this.closed = true;
    await this.stop("application-quit");
    await this.closeSocket();
  }
}

module.exports = { EasyInputLanAudioSource, pcmLevel };
