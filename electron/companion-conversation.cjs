const { randomUUID } = require("crypto");

const STATES = Object.freeze(["idle", "connecting", "listening", "thinking", "speaking", "stopping", "completed", "error"]);
const STATE_TO_AGENT = Object.freeze({ idle: "idle", connecting: "waiting", listening: "listening", thinking: "thinking", speaking: "working", completed: "completed", error: "error" });
const ECHO_GUARD_POLICY = "computer-speaker-echo-guard-v1";

function boundedText(value, max = 16384) {
  return String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);
}

function availability(adapter, fallbackReason) {
  try {
    const value = adapter?.status?.();
    return value && typeof value === "object" ? value : { available: false, reason: fallbackReason };
  } catch { return { available: false, reason: fallbackReason }; }
}

function safeErrorReason(value) {
  const reason = boundedText(value, 240);
  if (/^[a-z0-9-]{1,120}$/.test(reason)) return reason;
  return "companion-session-failed";
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
    this.audioSelection = Object.freeze({ requestedSource: "", activeSource: "", output: "", fallback: null });
    this.discardResponseUntilTtsEnd = false;
    this.postInterruptState = "";
    this.echoGuardCounters = { echoGuardDroppedChunks: 0, ignoredAsrDuringPlayback: 0 };
  }

  echoGuardActive() {
    return this.audioSelection.output === "computer" && this.state === "speaking";
  }

  echoGuardSnapshot() {
    return Object.freeze({
      policy: ECHO_GUARD_POLICY,
      active: this.echoGuardActive(),
      counters: Object.freeze({ ...this.echoGuardCounters }),
    });
  }

  forwardSourceAudio(chunk, token) {
    if (!this.isCurrent(token)) return false;
    if (this.echoGuardActive()) {
      this.echoGuardCounters.echoGuardDroppedChunks += 1;
      return false;
    }
    this.provider?.sendAudio?.(chunk);
    return true;
  }

  snapshot() {
    const sourceStatus = availability(this.audioSource, "audio-source-unavailable");
    return Object.freeze({
      active: Boolean(this.active),
      state: this.state,
      sessionId: this.active?.sessionId || "",
      generation: this.active?.generation || 0,
      provider: "doubao",
      audioSource: sourceStatus,
      audioSink: availability(this.audioSink, "audio-sink-unavailable"),
      audioSelection: Object.freeze({
        ...this.audioSelection,
        activeSource: sourceStatus.activeSource || this.audioSelection.activeSource,
        fallback: sourceStatus.fallback || this.audioSelection.fallback,
      }),
      echoGuard: this.echoGuardSnapshot(),
      error: this.lastError,
    });
  }

  configureAudio({ audioSource, audioSink, selection = {} } = {}) {
    if (this.active) return { ok: false, reason: "companion-session-active" };
    if (!audioSource?.status || !audioSource?.start || !audioSource?.stop || !audioSink?.status || !audioSink?.start || !audioSink?.write || !audioSink?.interrupt || !audioSink?.stop) {
      return { ok: false, reason: "companion-audio-adapter-invalid" };
    }
    this.audioSource = audioSource;
    this.audioSink = audioSink;
    this.audioSelection = Object.freeze({
      requestedSource: ["computer", "easyinput"].includes(selection.requestedSource) ? selection.requestedSource : "computer",
      activeSource: ["computer", "easyinput"].includes(selection.activeSource) ? selection.activeSource : "",
      output: "computer",
      fallback: selection.fallback && typeof selection.fallback === "object" ? Object.freeze({ from: "easyinput", to: "computer", reason: safeErrorReason(selection.fallback.reason) }) : null,
    });
    return { ok: true, status: this.snapshot() };
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
    this.discardResponseUntilTtsEnd = false;
    this.postInterruptState = "";
    await this.transition("connecting");
    const token = this.active.token;
    try {
      await this.connectWithRetry(token);
      if (!this.isCurrent(token)) return { ok: false, reason: "companion-session-stale" };
      const sink = await this.audioSink.start();
      if (!sink?.ok) throw new Error(sink?.reason || "audio-sink-start-failed");
      const source = await this.audioSource.start({
        onAudio: (chunk) => { this.forwardSourceAudio(chunk, token); },
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
        onAudio: (chunk) => { this.forwardSourceAudio(chunk, token); },
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
    if (event.type === "error") {
      if (["doubao-connection-error", "doubao-connection-closed"].includes(event.message)) { void this.reconnect(token); return { ok: true, reconnecting: true }; }
      await this.fail(event.message || "companion-provider-error", token);
      return { ok: false };
    }
    if (["asr.partial", "asr.final"].includes(event.type) && this.echoGuardActive()) {
      this.echoGuardCounters.ignoredAsrDuringPlayback += 1;
      return { ignored: true, reason: "companion-playback-echo-guard" };
    }
    if (event.type === "audio") {
      if (this.discardResponseUntilTtsEnd) return { ignored: true, reason: "companion-response-interrupted" };
      if (this.state !== "speaking") await this.transition("speaking", { reason: "tts-audio" });
      await this.audioSink.write(event.audio);
      return { ok: true };
    }
    if (event.type === "asr.partial") {
      this.onEvent({ type: "transcript.partial", text: boundedText(event.text), sessionId: this.active.sessionId, generation: this.active.generation });
      return { ok: true };
    }
    if (event.type === "asr.final") {
      if (this.state === "speaking" || this.discardResponseUntilTtsEnd) {
        this.discardResponseUntilTtsEnd = true;
        this.postInterruptState = "thinking";
      }
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
      if (this.discardResponseUntilTtsEnd) return { ignored: true, reason: "companion-response-interrupted" };
      if (this.state !== "thinking") await this.transition("thinking");
      this.onEvent({ type: "reply.partial", text: boundedText(event.fullText || event.text), sessionId: this.active.sessionId, generation: this.active.generation });
      return { ok: true };
    }
    if (event.type === "chat.final") {
      if (this.discardResponseUntilTtsEnd) return { ignored: true, reason: "companion-response-interrupted" };
      if (await this.commitFinalTurn("assistant", event.text, token)) {
        if (!this.isCurrent(token)) return { ignored: true };
        this.onEvent({ type: "turn.assistant-final", text: boundedText(event.text), sessionId: this.active.sessionId, generation: this.active.generation });
      }
      return { ok: true };
    }
    if (event.type === "tts.start") {
      if (this.discardResponseUntilTtsEnd) return { ignored: true, reason: "companion-response-interrupted" };
      await this.transition("speaking");
      return { ok: true };
    }
    if (event.type === "tts.end") {
      if (this.discardResponseUntilTtsEnd) {
        const nextState = this.postInterruptState || "listening";
        this.discardResponseUntilTtsEnd = false;
        this.postInterruptState = "";
        if (this.isCurrent(token) && this.state !== nextState) await this.transition(nextState, { reason: "response-interrupted" });
        return { ok: true, interrupted: true };
      }
      if (this.isCurrent(token)) await this.transition("listening", { reason: "tts-ended" });
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
    this.lastError = safeErrorReason(reason);
    this.discardResponseUntilTtsEnd = false;
    this.postInterruptState = "";
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
    this.discardResponseUntilTtsEnd = false;
    this.postInterruptState = "";
    await this.cleanup(provider);
    this.state = "idle";
    this.lastError = "";
    this.onEvent({ type: "state", state: "idle", reason, sessionId: session.sessionId, generation: session.generation });
    await this.publishState({ source: "companion-conversation-v1", state: "idle" });
    return { ok: true, status: this.snapshot() };
  }

  async interrupt(reason = "user") {
    if (!this.active) return { ok: false, reason: "companion-session-inactive", status: this.snapshot() };
    if (!['thinking', 'speaking', 'completed'].includes(this.state)) return { ok: false, reason: "companion-response-not-active", status: this.snapshot() };
    this.discardResponseUntilTtsEnd = true;
    this.postInterruptState = "listening";
    await this.audioSink.interrupt();
    this.provider?.interrupt?.();
    await this.transition("listening", { reason: safeErrorReason(reason) });
    this.onEvent({ type: "response.interrupted", sessionId: this.active.sessionId, generation: this.active.generation });
    return { ok: true, status: this.snapshot() };
  }
}

module.exports = { COMPANION_CONVERSATION_STATES: STATES, COMPANION_STATE_TO_AGENT: STATE_TO_AGENT, COMPANION_ECHO_GUARD_POLICY: ECHO_GUARD_POLICY, CompanionConversationController };
