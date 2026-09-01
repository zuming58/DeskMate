const { randomUUID } = require("crypto");

const STATES = Object.freeze(["idle", "connecting", "listening", "thinking", "speaking", "stopping", "completed", "error"]);
const STATE_TO_AGENT = Object.freeze({ idle: "idle", connecting: "waiting", listening: "listening", thinking: "thinking", speaking: "working", completed: "completed", error: "error" });
const ECHO_GUARD_POLICY = "computer-speaker-echo-guard-v1";
const DEFAULT_DRAIN_TIMEOUT_MS = 4500;
const DEFAULT_TEARDOWN_STEP_TIMEOUT_MS = 750;
const MAX_POST_TTS_DIALOG_RECOVERIES_WITHOUT_USER_TURN = 2;
const PROVIDER_EVENT_NAMES = new Set([
  "none", "audio", "tts-start", "tts-end", "session-ready", "session-finished",
  "session-failed", "connection-started", "connection-failed", "connection-finished",
  "dialog-error", "error-frame", "provider-error", "transport-error", "transport-close", "other",
]);
const TERMINAL_EVENT_NAMES = new Set([
  "none", "session-finished", "session-failed", "connection-failed", "connection-finished",
  "dialog-error", "error-frame", "provider-error", "transport-error", "transport-close",
]);
const FAILURE_BUCKET_NAMES = new Set([
  "none", "request-invalid", "empty-audio", "audio-format-invalid", "server-busy",
  "server-internal", "unknown-provider-error",
]);

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

function providerEventName(event = {}) {
  const supplied = String(event?.diagnostic?.providerEvent || "");
  if (PROVIDER_EVENT_NAMES.has(supplied)) return supplied;
  const mapped = {
    audio: "audio", "tts.start": "tts-start", "tts.end": "tts-end",
    "session.ready": "session-ready", "session.finished": "session-finished",
    "connection.started": "connection-started", "connection.finished": "connection-finished",
    "connection.closed": "transport-close",
  }[event.type];
  if (mapped) return mapped;
  if (event.type === "error") {
    if (["doubao-connection-error", "doubao-connection-closed", "doubao-handshake-rejected"].includes(event.message)) return "transport-error";
    if (event.message === "doubao-handshake-service-error") return "connection-failed";
    if (event.message === "doubao-session-service-error") return "session-failed";
    return "provider-error";
  }
  return "other";
}

function terminalEventName(event = {}, providerEvent) {
  const supplied = String(event?.diagnostic?.terminalEvent || "");
  if (TERMINAL_EVENT_NAMES.has(supplied)) return supplied;
  return TERMINAL_EVENT_NAMES.has(providerEvent) ? providerEvent : "none";
}

function failureBucketName(event = {}) {
  const supplied = String(event?.diagnostic?.failureBucket || "");
  if (FAILURE_BUCKET_NAMES.has(supplied)) return supplied;
  return event.type === "error" ? "unknown-provider-error" : "none";
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
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    drainTimeoutMs = DEFAULT_DRAIN_TIMEOUT_MS,
    teardownStepTimeoutMs = DEFAULT_TEARDOWN_STEP_TIMEOUT_MS,
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
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.drainTimeoutMs = drainTimeoutMs;
    this.teardownStepTimeoutMs = teardownStepTimeoutMs;
    this.retryDelaysMs = retryDelaysMs.slice(0, 3);
    this.state = "idle";
    this.active = null;
    this.provider = null;
    this.providerEpoch = 0;
    this.turnSequence = 0;
    this.eventChain = Promise.resolve();
    this.reconnecting = null;
    this.stopPromise = null;
    this.lastError = "";
    this.audioSelection = Object.freeze({ requestedSource: "", activeSource: "", output: "", fallback: null });
    this.discardResponseUntilTtsEnd = false;
    this.postInterruptState = "";
    this.playbackDraining = false;
    this.lastSuccessfulTtsDrain = null;
    this.postTtsDialogRecoveryStreak = 0;
    this.echoGuardCounters = { echoGuardDroppedChunks: 0, ignoredAsrDuringPlayback: 0, playbackDrainTimeouts: 0, teardownTimeouts: 0 };
    this.providerLifecycle = {
      connectAttempts: 0, connections: 0, closes: 0, reconnects: 0, events: 0,
      audioEvents: 0, ttsStarts: 0, ttsEnds: 0, providerErrors: 0,
      errorFrames: 0, dialogErrors: 0, sessionFinished: 0, sessionFailed: 0,
      connectionFinished: 0, transportErrors: 0, transportCloses: 0,
      lastProviderEvent: "none", lastTerminalEvent: "none", lastTerminalPhase: "none",
      providerEventSequence: 0, lastTtsEndSequence: 0, lastTerminalEventSequence: 0,
      lastFailureBucket: "none", terminalExpected: false,
      postTtsDialogRecoveryAttempts: 0, postTtsDialogRecoverySucceeded: 0,
      postTtsDialogRecoveryFailed: 0, postTtsDialogRecoveryLimited: 0,
      lastPostTtsDialogRecoveryResult: "never",
    };
    this.stopLifecycle = { requested: 0, duplicateRequests: 0, completed: 0, alreadyStopped: 0, lastResult: "never" };
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
      providerLifecycle: Object.freeze({ ...this.providerLifecycle }),
      stopLifecycle: Object.freeze({ ...this.stopLifecycle }),
      error: this.lastError,
    });
  }

  configureAudio({ audioSource, audioSink, selection = {} } = {}) {
    if (this.active || this.stopPromise) return { ok: false, reason: "companion-session-active" };
    if (!audioSource?.status || !audioSource?.start || !audioSource?.stop || !audioSink?.status || !audioSink?.start || !audioSink?.write || !audioSink?.drain || !audioSink?.interrupt || !audioSink?.stop) {
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

  boundedOperation(operation, timeoutMs, timeoutReason) {
    return new Promise((resolve) => {
      let settled = false;
      let timer;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        this.clearTimer(timer);
        resolve(result);
      };
      timer = this.setTimer(() => finish({ ok: false, reason: timeoutReason, timedOut: true }), timeoutMs);
      Promise.resolve().then(operation).then(
        (value) => finish({ ok: true, value }),
        (error) => finish({ ok: false, reason: safeErrorReason(error?.message) }),
      );
    });
  }

  async start({ sessionId = randomUUID(), generation = 1 } = {}) {
    if (this.active || this.stopPromise) return { ok: false, reason: "companion-session-active", status: this.snapshot() };
    const sourceStatus = availability(this.audioSource, "audio-source-unavailable");
    const sinkStatus = availability(this.audioSink, "audio-sink-unavailable");
    if (!sourceStatus.available) return { ok: false, reason: sourceStatus.reason || "audio-source-unavailable", status: this.snapshot() };
    if (!sinkStatus.available) return { ok: false, reason: sinkStatus.reason || "audio-sink-unavailable", status: this.snapshot() };
    this.active = Object.freeze({ sessionId: boundedText(sessionId, 128), generation: Math.max(1, Number(generation) || 1), token: Symbol("companion-session") });
    this.turnSequence = 0;
    this.lastError = "";
    this.discardResponseUntilTtsEnd = false;
    this.postInterruptState = "";
    this.playbackDraining = false;
    this.lastSuccessfulTtsDrain = null;
    this.postTtsDialogRecoveryStreak = 0;
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

  providerArrivalPhase() {
    if (this.stopPromise || this.state === "stopping") return "stopping";
    if (this.reconnecting) return "reconnecting";
    if (this.playbackDraining) return "draining";
    if (this.state === "connecting") return "starting";
    return this.active ? "active" : "idle";
  }

  recordProviderArrival(event = {}) {
    const sequence = this.providerLifecycle.providerEventSequence + 1;
    const phase = this.providerArrivalPhase();
    const providerEvent = providerEventName(event);
    const terminalEvent = terminalEventName(event, providerEvent);
    const failureBucket = failureBucketName(event);
    this.providerLifecycle.events += 1;
    this.providerLifecycle.providerEventSequence = sequence;
    this.providerLifecycle.lastProviderEvent = providerEvent;
    if (providerEvent === "audio") this.providerLifecycle.audioEvents += 1;
    else if (providerEvent === "tts-start") this.providerLifecycle.ttsStarts += 1;
    else if (providerEvent === "tts-end") {
      this.providerLifecycle.ttsEnds += 1;
      this.providerLifecycle.lastTtsEndSequence = sequence;
    }
    if (event?.type === "error") this.providerLifecycle.providerErrors += 1;
    if (providerEvent === "error-frame") this.providerLifecycle.errorFrames += 1;
    else if (providerEvent === "dialog-error") this.providerLifecycle.dialogErrors += 1;
    else if (providerEvent === "session-finished") this.providerLifecycle.sessionFinished += 1;
    else if (providerEvent === "session-failed") this.providerLifecycle.sessionFailed += 1;
    else if (providerEvent === "connection-finished") this.providerLifecycle.connectionFinished += 1;
    else if (providerEvent === "transport-error") this.providerLifecycle.transportErrors += 1;
    else if (providerEvent === "transport-close") {
      this.providerLifecycle.closes += 1;
      this.providerLifecycle.transportCloses += 1;
    }
    if (terminalEvent !== "none") {
      this.providerLifecycle.lastTerminalEvent = terminalEvent;
      this.providerLifecycle.lastTerminalPhase = phase;
      this.providerLifecycle.lastTerminalEventSequence = sequence;
      this.providerLifecycle.lastFailureBucket = failureBucket;
      this.providerLifecycle.terminalExpected = Boolean(this.stopPromise || this.state === "stopping");
    }
    return Object.freeze({ sequence, phase, providerEvent, terminalEvent });
  }

  createProvider(token) {
    const providerEpoch = ++this.providerEpoch;
    return this.providerFactory({ onEvent: (event) => {
      const providerArrival = this.recordProviderArrival(event);
      const arrival = Object.freeze({
        ...providerArrival,
        providerEpoch,
        suppressAsr: ["asr.partial", "asr.final"].includes(event?.type) && (this.echoGuardActive() || this.playbackDraining),
      });
      this.eventChain = this.eventChain.then(() => this.handleProviderEvent(event, token, arrival)).catch((error) => this.fail(error?.message || "companion-event-failed", token));
    } });
  }

  async connectWithRetry(token) {
    let lastError = new Error("companion-connect-failed");
    for (let attempt = 0; attempt < this.retryDelaysMs.length; attempt += 1) {
      if (!this.isCurrent(token)) throw new Error("companion-session-stale");
      if (this.retryDelaysMs[attempt] > 0) await this.wait(this.retryDelaysMs[attempt]);
      const provider = this.createProvider(token);
      this.provider = provider;
      this.providerLifecycle.connectAttempts += 1;
      try {
        const result = await provider.connect();
        if (!result?.ok) throw new Error(result?.reason || "companion-connect-failed");
        if (!this.isCurrent(token)) { provider.close?.(); throw new Error("companion-session-stale"); }
        const recoveredConnection = this.providerLifecycle.connections > 0 || attempt > 0;
        this.providerLifecycle.connections += 1;
        if (recoveredConnection) this.providerLifecycle.reconnects += 1;
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

  async reconnect(token, { reason = "provider-reconnect", failureReason = "companion-reconnect-failed", redactFailure = false, onConnected = null, onFailure = null, onCancelled = null } = {}) {
    const cancelled = () => { onCancelled?.(); return { ok: false, ignored: true, reason: "companion-session-stale" }; };
    if (!this.isCurrent(token)) return cancelled();
    if (this.reconnecting) return this.reconnecting;
    this.reconnecting = (async () => {
      await this.audioSource.stop();
      if (!this.isCurrent(token)) return cancelled();
      await this.audioSink.interrupt();
      if (!this.isCurrent(token)) return cancelled();
      this.provider?.close?.();
      this.provider = null;
      if (!this.isCurrent(token)) return cancelled();
      await this.transition("connecting", { reason });
      await this.connectWithRetry(token);
      if (!this.isCurrent(token)) return cancelled();
      const source = await this.audioSource.start({
        onAudio: (chunk) => { this.forwardSourceAudio(chunk, token); },
        onError: (error) => { if (this.isCurrent(token)) void this.fail(error?.message || "audio-source-error", token); },
      });
      if (!source?.ok) throw new Error(source?.reason || "audio-source-start-failed");
      if (!this.isCurrent(token)) { await this.audioSource.stop(); return cancelled(); }
      onConnected?.();
      await this.transition("listening", { reason });
      return { ok: true };
    })().catch(async (error) => {
      onFailure?.();
      const failed = await this.fail(redactFailure ? failureReason : (error?.message || failureReason), token);
      return failed?.ignored ? failed : { ok: false, reason: failed?.reason || failureReason };
    }).finally(() => { this.reconnecting = null; });
    return this.reconnecting;
  }

  isRecoverablePostTtsDialogError(event, token, arrival = {}) {
    const evidence = this.lastSuccessfulTtsDrain;
    return this.isCurrent(token)
      && event?.type === "error"
      && arrival.providerEvent === "dialog-error"
      && arrival.terminalEvent === "dialog-error"
      && arrival.phase === "active"
      && !this.stopPromise
      && this.state === "listening"
      && !this.reconnecting
      && evidence?.token === token
      && evidence.sequence > 0
      && arrival.sequence === evidence.sequence + 1;
  }

  async recoverPostTtsDialogError(token) {
    this.lastSuccessfulTtsDrain = null;
    if (this.postTtsDialogRecoveryStreak >= MAX_POST_TTS_DIALOG_RECOVERIES_WITHOUT_USER_TURN) {
      this.providerLifecycle.postTtsDialogRecoveryLimited += 1;
      this.providerLifecycle.lastPostTtsDialogRecoveryResult = "limited";
      return this.fail("doubao-service-error", token);
    }
    this.postTtsDialogRecoveryStreak += 1;
    this.providerLifecycle.postTtsDialogRecoveryAttempts += 1;
    this.providerLifecycle.lastPostTtsDialogRecoveryResult = "in-progress";
    const recovered = await this.reconnect(token, {
      reason: "post-tts-dialog-recovery",
      failureReason: "companion-post-tts-dialog-recovery-failed",
      redactFailure: true,
      onConnected: () => {
        this.providerLifecycle.postTtsDialogRecoverySucceeded += 1;
        this.providerLifecycle.lastPostTtsDialogRecoveryResult = "succeeded";
      },
      onFailure: () => {
        this.providerLifecycle.postTtsDialogRecoveryFailed += 1;
        this.providerLifecycle.lastPostTtsDialogRecoveryResult = "failed";
      },
      onCancelled: () => { this.providerLifecycle.lastPostTtsDialogRecoveryResult = "cancelled"; },
    });
    if (recovered?.ignored) {
      this.providerLifecycle.lastPostTtsDialogRecoveryResult = "cancelled";
      return recovered;
    }
    if (recovered?.ok) {
      return { ok: true, recovered: true };
    }
    return recovered;
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

  async handleProviderEvent(event = {}, token, arrival = {}) {
    if (!this.isCurrent(token) || arrival.providerEpoch !== this.providerEpoch) return { ignored: true, reason: "companion-event-stale" };
    if (event.type === "connection.closed") { void this.reconnect(token); return { ok: true }; }
    if (event.type === "error") {
      if (["doubao-connection-error", "doubao-connection-closed"].includes(event.message)) { void this.reconnect(token); return { ok: true, reconnecting: true }; }
      if (this.isRecoverablePostTtsDialogError(event, token, arrival)) return this.recoverPostTtsDialogError(token);
      this.lastSuccessfulTtsDrain = null;
      await this.fail(event.message || "companion-provider-error", token);
      return { ok: false };
    }
    if (["asr.partial", "asr.final"].includes(event.type) && (arrival.suppressAsr || this.echoGuardActive())) {
      this.echoGuardCounters.ignoredAsrDuringPlayback += 1;
      return { ignored: true, reason: "companion-playback-echo-guard" };
    }
    if (event.type === "audio") {
      if (this.discardResponseUntilTtsEnd) return { ignored: true, reason: "companion-response-interrupted" };
      if (this.state !== "speaking") await this.transition("speaking", { reason: "tts-audio" });
      let written;
      try { written = await this.audioSink.write(event.audio); }
      catch (error) {
        if (!this.isCurrent(token) || this.discardResponseUntilTtsEnd || ["computer-audio-playback-interrupted", "computer-audio-sink-stopped", "computer-audio-renderer-unavailable"].includes(error?.message)) return { ignored: true, reason: "companion-playback-cancelled" };
        throw error;
      }
      if (written !== true) throw new Error("computer-audio-playback-write-failed");
      return { ok: true };
    }
    if (event.type === "asr.partial") {
      this.onEvent({ type: "transcript.partial", text: boundedText(event.text), sessionId: this.active.sessionId, generation: this.active.generation });
      return { ok: true };
    }
    if (event.type === "asr.final") {
      this.postTtsDialogRecoveryStreak = 0;
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
      this.lastSuccessfulTtsDrain = null;
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
      this.playbackDraining = true;
      const drained = await this.boundedOperation(() => this.audioSink.drain(), this.drainTimeoutMs, "companion-audio-drain-timeout");
      if (!this.isCurrent(token)) return { ignored: true, reason: "companion-event-stale" };
      if (this.discardResponseUntilTtsEnd) {
        const nextState = this.postInterruptState || "listening";
        this.discardResponseUntilTtsEnd = false;
        this.postInterruptState = "";
        this.playbackDraining = false;
        if (this.state !== nextState) await this.transition(nextState, { reason: "response-interrupted" });
        return { ok: true, interrupted: true };
      }
      const drainResult = drained.ok ? drained.value : { ok: false, reason: drained.reason };
      if (!drainResult?.ok) {
        this.echoGuardCounters.playbackDrainTimeouts += 1;
        await this.boundedOperation(() => this.audioSink.interrupt(), this.teardownStepTimeoutMs, "companion-audio-interrupt-timeout");
      }
      this.playbackDraining = false;
      await this.transition("listening", { reason: drainResult?.ok ? "tts-playback-drained" : "tts-playback-drain-timeout" });
      this.lastSuccessfulTtsDrain = drainResult?.ok ? Object.freeze({ token, sequence: Number(arrival.sequence) || 0 }) : null;
      return { ok: true, drained: Boolean(drainResult?.ok) };
    }
    return { ignored: true, reason: "companion-event-unmapped" };
  }

  async cleanup(provider = this.provider) {
    const bounded = async (operation, reason) => {
      const result = await this.boundedOperation(operation, this.teardownStepTimeoutMs, reason);
      if (result.timedOut) this.echoGuardCounters.teardownTimeouts += 1;
      return result;
    };
    await Promise.all([
      bounded(() => this.audioSource?.stop?.(), "companion-audio-source-stop-timeout"),
      (async () => {
        await bounded(() => this.audioSink?.interrupt?.(), "companion-audio-sink-interrupt-timeout");
        await bounded(() => this.audioSink?.stop?.(), "companion-audio-sink-stop-timeout");
      })(),
      bounded(() => provider?.close?.(), "companion-provider-close-timeout"),
    ]);
    if (this.provider === provider) this.provider = null;
  }

  async publishTerminalState(state) {
    const result = await this.boundedOperation(() => this.publishState({ source: "companion-conversation-v1", state }), this.teardownStepTimeoutMs, "companion-agent-state-timeout");
    if (result.timedOut) this.echoGuardCounters.teardownTimeouts += 1;
  }

  async fail(reason, token = this.active?.token) {
    if (!this.isCurrent(token)) return { ignored: true, reason: "companion-failure-stale" };
    const session = this.active;
    const provider = this.provider;
    this.active = null;
    this.lastError = safeErrorReason(reason);
    this.discardResponseUntilTtsEnd = false;
    this.postInterruptState = "";
    this.playbackDraining = false;
    this.lastSuccessfulTtsDrain = null;
    await this.cleanup(provider);
    this.state = "error";
    this.onEvent({ type: "state", state: "error", error: this.lastError, sessionId: session.sessionId, generation: session.generation });
    await this.publishTerminalState("error");
    return { ok: false, reason: this.lastError };
  }

  stop(reason = "user") {
    this.stopLifecycle.requested += 1;
    if (this.stopPromise) { this.stopLifecycle.duplicateRequests += 1; return this.stopPromise; }
    this.stopPromise = this.performStop(reason).finally(() => { this.stopPromise = null; });
    return this.stopPromise;
  }

  async performStop(reason = "user") {
    if (!this.active) {
      if (this.state !== "idle") {
        this.state = "idle";
        this.lastError = "";
        this.onEvent({ type: "state", state: "idle", reason, sessionId: "", generation: 0 });
        await this.publishTerminalState("idle");
      }
      this.stopLifecycle.alreadyStopped += 1;
      this.stopLifecycle.lastResult = "already-stopped";
      return { ok: true, alreadyStopped: true, status: this.snapshot() };
    }
    const session = this.active;
    const provider = this.provider;
    await this.transition("stopping", { reason });
    this.active = null;
    this.discardResponseUntilTtsEnd = false;
    this.postInterruptState = "";
    this.playbackDraining = false;
    this.lastSuccessfulTtsDrain = null;
    await this.cleanup(provider);
    this.state = "idle";
    this.lastError = "";
    this.onEvent({ type: "state", state: "idle", reason, sessionId: session.sessionId, generation: session.generation });
    await this.publishTerminalState("idle");
    this.stopLifecycle.completed += 1;
    this.stopLifecycle.lastResult = "completed";
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
