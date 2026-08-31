const { randomUUID } = require("crypto");

const STATES = Object.freeze(["idle", "connecting", "listening", "thinking", "speaking", "stopping", "completed", "error"]);
const STATE_TO_AGENT = Object.freeze({ idle: "idle", connecting: "waiting", listening: "listening", thinking: "thinking", speaking: "working", completed: "completed", error: "error" });

function boundedText(value, max = 16384) {
  return String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);
}

function availability(adapter, fallbackReason) {
  try {
    const value = adapter?.status?.();
    return value && typeof value === "object" ? value : { available: false, reason: fallbackReason };
  } catch { return { available: false, reason: fallbackReason }; }
}

class CompanionConversationController {
  constructor({
    providerFactory,
    audioSource,
    audioSink,
    commitTurn = async () => ({ ok: true }),
    publishState = async () => ({ ok: true }),
    onEvent = () => {},
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    retryDelaysMs = [0, 250, 750],
  } = {}) {
    if (typeof providerFactory !== "function") throw new Error("companion-provider-factory-required");
    this.providerFactory = providerFactory;
    this.audioSource = audioSource;
    this.audioSink = audioSink;
    this.commitTurn = commitTurn;
    this.publishState = publishState;
    this.onEvent = onEvent;
    this.wait = wait;
    this.retryDelaysMs = retryDelaysMs.slice(0, 3);
    this.state = "idle";
    this.active = null;
    this.provider = null;
    this.turnSequence = 0;
    this.eventChain = Promise.resolve();
    this.reconnecting = null;
    this.lastError = "";
  }

  snapshot() {
    return Object.freeze({
      active: Boolean(this.active),
      state: this.state,
      sessionId: this.active?.sessionId || "",
      generation: this.active?.generation || 0,
      provider: "doubao",
      audioSource: availability(this.audioSource, "audio-source-unavailable"),
      audioSink: availability(this.audioSink, "audio-sink-unavailable"),
      error: this.lastError,
    });
  }

  async transition(state, detail = {}) {
    if (!STATES.includes(state)) throw new Error("companion-state-invalid");
    this.state = state;
    if (state !== "error") this.lastError = "";
    const payload = Object.freeze({ type: "state", state, sessionId: this.active?.sessionId || detail.sessionId || "", generation: this.active?.generation || detail.generation || 0, ...detail });
    this.onEvent(payload);
    const agentState = STATE_TO_AGENT[state];
    if (agentState) await this.publishState({ source: "companion-conversation-v1", state: agentState });
    return payload;
  }

  async start({ sessionId = randomUUID(), generation = 1 } = {}) {
    if (this.active) return { ok: false, reason: "companion-session-active", status: this.snapshot() };
    const sourceStatus = availability(this.audioSource, "audio-source-unavailable");
    const sinkStatus = availability(this.audioSink, "audio-sink-unavailable");
    if (!sourceStatus.available) return { ok: false, reason: sourceStatus.reason || "audio-source-unavailable", status: this.snapshot() };
    if (!sinkStatus.available) return { ok: false, reason: sinkStatus.reason || "audio-sink-unavailable", status: this.snapshot() };
    this.active = Object.freeze({ sessionId: boundedText(sessionId, 128), generation: Math.max(1, Number(generation) || 1), token: Symbol("companion-session") });
    this.turnSequence = 0;
    this.lastError = "";
    await this.transition("connecting");
    const token = this.active.token;
    try {
      await this.connectWithRetry(token);
      if (!this.isCurrent(token)) return { ok: false, reason: "companion-session-stale" };
      const sink = await this.audioSink.start();
      if (!sink?.ok) throw new Error(sink?.reason || "audio-sink-start-failed");
      const source = await this.audioSource.start({
        onAudio: (chunk) => { if (this.isCurrent(token)) this.provider?.sendAudio?.(chunk); },
        onError: (error) => { if (this.isCurrent(token)) void this.fail(error?.message || "audio-source-error", token); },
      });
      if (!source?.ok) throw new Error(source?.reason || "audio-source-start-failed");
      await this.transition("listening");
      return { ok: true, status: this.snapshot() };
    } catch (error) {
      await this.fail(error?.message || "companion-start-failed", token);
      return { ok: false, reason: this.lastError || "companion-start-failed", status: this.snapshot() };
    }
  }

  isCurrent(token) { return Boolean(this.active && this.active.token === token); }

  createProvider(token) {
    return this.providerFactory({ onEvent: (event) => {
      this.eventChain = this.eventChain.then(() => this.handleProviderEvent(event, token)).catch((error) => this.fail(error?.message || "companion-event-failed", token));
    } });
  }

  async connectWithRetry(token) {
    let lastError = new Error("companion-connect-failed");
    for (let attempt = 0; attempt < this.retryDelaysMs.length; attempt += 1) {
      if (!this.isCurrent(token)) throw new Error("companion-session-stale");
      if (this.retryDelaysMs[attempt] > 0) await this.wait(this.retryDelaysMs[attempt]);
      const provider = this.createProvider(token);
      this.provider = provider;
      try {
        const result = await provider.connect();
        if (!result?.ok) throw new Error(result?.reason || "companion-connect-failed");
        if (!this.isCurrent(token)) { provider.close?.(); throw new Error("companion-session-stale"); }
        if (attempt > 0) this.onEvent({ type: "reconnected", attempt, sessionId: this.active.sessionId, generation: this.active.generation });
        return result;
      } catch (error) {
        lastError = error;
        provider.close?.();
        if (this.provider === provider) this.provider = null;
      }
    }
    throw lastError;
  }

  async reconnect(token) {
    if (!this.isCurrent(token)) return;
    if (this.reconnecting) return this.reconnecting;
    this.reconnecting = (async () => {
      await this.audioSource.stop();
      await this.audioSink.interrupt();
      this.provider?.close?.();
      this.provider = null;
      await this.transition("connecting", { reason: "provider-reconnect" });
      await this.connectWithRetry(token);
      if (!this.isCurrent(token)) return;
      const source = await this.audioSource.start({
        onAudio: (chunk) => { if (this.isCurrent(token)) this.provider?.sendAudio?.(chunk); },
        onError: (error) => { if (this.isCurrent(token)) void this.fail(error?.message || "audio-source-error", token); },
      });
      if (!source?.ok) throw new Error(source?.reason || "audio-source-start-failed");
      await this.transition("listening");
    })().catch((error) => this.fail(error?.message || "companion-reconnect-failed", token)).finally(() => { this.reconnecting = null; });
    return this.reconnecting;
  }

  async commitFinalTurn(role, text, token) {
    if (!this.isCurrent(token)) return false;
    const content = boundedText(text);
    if (!content.trim()) return false;
    const sequence = ++this.turnSequence;
    const eventId = `${this.active.sessionId}:turn:${sequence}:${role}`;
    await this.commitTurn({ eventId, sessionId: this.active.sessionId, role, content, createdAt: new Date().toISOString() });
    return true;
  }

  async handleProviderEvent(event = {}, token) {
    if (!this.isCurrent(token)) return { ignored: true, reason: "companion-event-stale" };
    if (event.type === "connection.closed") { void this.reconnect(token); return { ok: true }; }
    if (event.type === "error") { await this.fail(event.message || "companion-provider-error", token); return { ok: false }; }
    if (event.type === "audio") { await this.audioSink.write(event.audio); return { ok: true }; }
    if (event.type === "asr.partial") {
      this.onEvent({ type: "transcript.partial", text: boundedText(event.text), sessionId: this.active.sessionId, generation: this.active.generation });
      return { ok: true };
    }
    if (event.type === "asr.final") {
      await this.audioSink.interrupt();
      this.provider?.interrupt?.();
      if (await this.commitFinalTurn("user", event.text, token)) {
        if (!this.isCurrent(token)) return { ignored: true };
        this.onEvent({ type: "turn.user-final", text: boundedText(event.text), sessionId: this.active.sessionId, generation: this.active.generation });
        await this.transition("thinking");
      }
      return { ok: true };
    }
    if (event.type === "chat.partial") {
      if (this.state !== "thinking") await this.transition("thinking");
      this.onEvent({ type: "reply.partial", text: boundedText(event.fullText || event.text), sessionId: this.active.sessionId, generation: this.active.generation });
      return { ok: true };
    }
    if (event.type === "chat.final") {
      if (await this.commitFinalTurn("assistant", event.text, token)) {
        if (!this.isCurrent(token)) return { ignored: true };
        this.onEvent({ type: "turn.assistant-final", text: boundedText(event.text), sessionId: this.active.sessionId, generation: this.active.generation });
      }
      return { ok: true };
    }
    if (event.type === "tts.start") { await this.transition("speaking"); return { ok: true }; }
    if (event.type === "tts.end") {
      await this.transition("completed");
      await this.wait(0);
      if (this.isCurrent(token)) await this.transition("listening");
      return { ok: true };
    }
    return { ignored: true, reason: "companion-event-unmapped" };
  }

  async cleanup(provider = this.provider) {
    try { await this.audioSource?.stop?.(); } catch { /* best effort */ }
    try { await this.audioSink?.interrupt?.(); await this.audioSink?.stop?.(); } catch { /* best effort */ }
    try { provider?.close?.(); } catch { /* best effort */ }
    if (this.provider === provider) this.provider = null;
  }

  async fail(reason, token = this.active?.token) {
    if (!this.isCurrent(token)) return { ignored: true, reason: "companion-failure-stale" };
    const session = this.active;
    const provider = this.provider;
    this.active = null;
    this.lastError = boundedText(reason, 240) || "companion-session-failed";
    await this.cleanup(provider);
    this.state = "error";
    this.onEvent({ type: "state", state: "error", error: this.lastError, sessionId: session.sessionId, generation: session.generation });
    await this.publishState({ source: "companion-conversation-v1", state: "error" });
    return { ok: false, reason: this.lastError };
  }

  async stop(reason = "user") {
    if (!this.active) {
      if (this.state !== "idle") await this.transition("idle", { reason });
      return { ok: true, alreadyStopped: true, status: this.snapshot() };
    }
    const session = this.active;
    const provider = this.provider;
    await this.transition("stopping", { reason });
    this.active = null;
    await this.cleanup(provider);
    this.state = "idle";
    this.lastError = "";
    this.onEvent({ type: "state", state: "idle", reason, sessionId: session.sessionId, generation: session.generation });
    await this.publishState({ source: "companion-conversation-v1", state: "idle" });
    return { ok: true, status: this.snapshot() };
  }
}

module.exports = { COMPANION_CONVERSATION_STATES: STATES, COMPANION_STATE_TO_AGENT: STATE_TO_AGENT, CompanionConversationController };
