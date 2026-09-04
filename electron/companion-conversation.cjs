const { randomUUID } = require("crypto");
const { COMPANION_PREFERENCES_DEFAULT, isValidEndSmoothWindowMs, isValidIdleTimeoutMs } = require("./companion-preferences.cjs");
const { normalizePersona } = require("./companion-persona.cjs");

const STATES = Object.freeze(["idle", "connecting", "listening", "thinking", "speaking", "stopping", "completed", "error"]);
const STATE_TO_AGENT = Object.freeze({ idle: "idle", connecting: "waiting", listening: "listening", thinking: "thinking", speaking: "working", completed: "completed", error: "error" });
const ECHO_GUARD_POLICY = "computer-speaker-echo-guard-v1";
const DEFAULT_DRAIN_TIMEOUT_MS = 4500;
const DEFAULT_TEARDOWN_STEP_TIMEOUT_MS = 750;
const DEFAULT_TRUSTED_SPEECH_TIMEOUT_MS = 12000;
const DEFAULT_IDLE_TIMEOUT_MS = COMPANION_PREFERENCES_DEFAULT.idleTimeoutMs;
const HALF_DUPLEX_PHASES = new Set(["idle", "connecting", "listening", "thinking", "speaking", "draining", "stopping", "reconnecting", "completed", "error"]);
const TTS_TURN_OUTCOMES = new Set(["none", "completed", "manual", "stop", "provider", "drain-timeout", "trusted-timeout"]);
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
  "none", "request-invalid", "empty-audio", "audio-format-invalid", "audio-idle-timeout", "server-busy",
  "server-internal", "unknown-provider-error",
]);
const DIALOG_ERROR_STATUS_CLASS_NAMES = new Set([
  "missing", "invalid", "request-invalid", "empty-audio", "audio-format-invalid", "audio-idle-timeout",
  "server-busy", "server-internal", "unknown-provider-error",
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

function dialogErrorStatusClassName(event = {}) {
  const supplied = String(event?.diagnostic?.dialogErrorStatusClass || "");
  return DIALOG_ERROR_STATUS_CLASS_NAMES.has(supplied) ? supplied : "missing";
}

class CompanionConversationController {
  constructor({
    providerFactory,
    audioSource,
    audioSink,
    commitTurn = async () => ({ ok: true }),
    resolveTrustedTurn = () => null,
    claimsTrustedTurn = () => false,
    publishState = async () => ({ ok: true }),
    onEvent = () => {},
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    now = Date.now,
    drainTimeoutMs = DEFAULT_DRAIN_TIMEOUT_MS,
    teardownStepTimeoutMs = DEFAULT_TEARDOWN_STEP_TIMEOUT_MS,
    trustedSpeechTimeoutMs,
    retryDelaysMs = [0, 250, 750],
  } = {}) {
    if (typeof providerFactory !== "function") throw new Error("companion-provider-factory-required");
    this.providerFactory = providerFactory;
    this.audioSource = audioSource;
    this.audioSink = audioSink;
    this.commitTurn = commitTurn;
    this.resolveTrustedTurn = resolveTrustedTurn;
    this.claimsTrustedTurn = claimsTrustedTurn;
    this.publishState = publishState;
    this.onEvent = onEvent;
    this.wait = wait;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.now = now;
    this.drainTimeoutMs = drainTimeoutMs;
    this.teardownStepTimeoutMs = teardownStepTimeoutMs;
    this.trustedSpeechTimeoutOverride = Number.isFinite(Number(trustedSpeechTimeoutMs)) && Number(trustedSpeechTimeoutMs) > 0;
    this.trustedSpeechTimeoutMs = this.trustedSpeechTimeoutOverride ? Math.max(10, Number(trustedSpeechTimeoutMs)) : DEFAULT_TRUSTED_SPEECH_TIMEOUT_MS;
    this.retryDelaysMs = retryDelaysMs.slice(0, 3);
    this.state = "idle";
    this.active = null;
    this.provider = null;
    this.providerEpoch = 0;
    this.turnSequence = 0;
    this.eventChain = Promise.resolve();
    this.reconnecting = null;
    this.stopPromise = null;
    this.idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS;
    this.idleTimer = null;
    this.lastStopReason = "never";
    this.sessionProviderPreferences = Object.freeze({ revision: 0, ...COMPANION_PREFERENCES_DEFAULT });
    this.sessionPersona = normalizePersona();
    this.sessionMemoryContext = Object.freeze([]);
    this.sessionApplied = null;
    this.lastPartialAt = null;
    this.asrTiming = { metric: "provider-partial-to-final-v1", status: "unavailable", lastMs: 0, samples: 0 };
    this.lastError = "";
    this.audioSelection = Object.freeze({ requestedSource: "", activeSource: "", output: "", fallback: null });
    this.discardResponseUntilTtsEnd = false;
    this.postInterruptState = "";
    this.playbackDraining = false;
    this.halfDuplexPhase = "idle";
    this.activeTtsTurn = null;
    this.pendingChatFinals = 0;
    this.pendingTrustedResponse = null;
    this.trustedResponseActive = false;
    this.trustedSpeechTimer = null;
    this.trustedSpeechTimerGeneration = 0;
    this.echoGuardCounters = { echoGuardDroppedChunks: 0, ignoredAsrDuringPlayback: 0, playbackDrainTimeouts: 0, teardownTimeouts: 0 };
    this.turnLifecycle = {
      ttsTurnStarted: 0, ttsTurnCompleted: 0, ttsTurnAbandoned: 0,
      ttsImplicitStarts: 0, ttsStartsWhileOpen: 0, ttsEndsWithoutStart: 0,
      chatFinals: 0, chatFinalsSuppressed: 0, chatFinalTtsEndPairs: 0, chatFinalsWithoutTtsEnd: 0,
      asrFinalsAccepted: 0, asrFinalsSuppressed: 0,
      bridgeChecks: 0, bridgeOwnedTurns: 0, bridgePassThroughTurns: 0, bridgeFailures: 0, trustedSpeechTimeouts: 0,
      lastAsrFinalArrivalPhase: "idle", lastTtsTurnOutcome: "none",
      asrFinalArrivalPhases: Object.fromEntries([...HALF_DUPLEX_PHASES].map((phase) => [phase, 0])),
    };
    this.providerLifecycle = {
      connectAttempts: 0, connections: 0, closes: 0, reconnects: 0, events: 0,
      audioEvents: 0, ttsStarts: 0, ttsEnds: 0, providerErrors: 0,
      errorFrames: 0, dialogErrors: 0, sessionFinished: 0, sessionFailed: 0,
      connectionFinished: 0, transportErrors: 0, transportCloses: 0,
      lastProviderEvent: "none", lastTerminalEvent: "none", lastTerminalPhase: "none",
      providerEventSequence: 0, lastTtsEndSequence: 0, lastTerminalEventSequence: 0,
      lastFailureBucket: "none", terminalExpected: false,
      dialogErrorsAdjacentTtsEnd: 0,
      lastDialogErrorStatusClass: "none",
      lastDialogErrorAdjacency: "none",
    };
    this.stopLifecycle = { requested: 0, duplicateRequests: 0, completed: 0, alreadyStopped: 0, lastResult: "never" };
  }

  echoGuardActive() {
    return this.audioSelection.output === "computer" && Boolean(this.active) && !this.microphoneUplinkAllowed();
  }

  microphoneUplinkAllowed() {
    return Boolean(this.active) && this.halfDuplexPhase === "listening" && !this.playbackDraining && !this.stopPromise;
  }

  setHalfDuplexPhase(phase) {
    this.halfDuplexPhase = HALF_DUPLEX_PHASES.has(phase) ? phase : "idle";
    return this.halfDuplexPhase;
  }

  syncHalfDuplexPhaseFromState(state) {
    const mapped = state === "connecting" && this.reconnecting ? "reconnecting" : state;
    if (HALF_DUPLEX_PHASES.has(mapped) && mapped !== "draining") this.setHalfDuplexPhase(mapped);
  }

  beginTtsTurn({ implicit = false } = {}) {
    if (this.activeTtsTurn) {
      if (!implicit) this.turnLifecycle.ttsStartsWhileOpen += 1;
      return this.activeTtsTurn;
    }
    this.activeTtsTurn = { interruption: "none" };
    this.turnLifecycle.ttsTurnStarted += 1;
    if (implicit) this.turnLifecycle.ttsImplicitStarts += 1;
    return this.activeTtsTurn;
  }

  markTtsTurnInterrupted(reason) {
    if (!this.activeTtsTurn) return false;
    const outcome = TTS_TURN_OUTCOMES.has(reason) && reason !== "completed" && reason !== "none" ? reason : "provider";
    if (this.activeTtsTurn.interruption === "none") this.activeTtsTurn.interruption = outcome;
    return true;
  }

  finishTtsTurn() {
    if (!this.activeTtsTurn) {
      this.turnLifecycle.ttsEndsWithoutStart += 1;
    } else if (this.activeTtsTurn.interruption !== "none") {
      this.turnLifecycle.ttsTurnAbandoned += 1;
      this.turnLifecycle.lastTtsTurnOutcome = this.activeTtsTurn.interruption;
    } else {
      this.turnLifecycle.ttsTurnCompleted += 1;
      this.turnLifecycle.lastTtsTurnOutcome = "completed";
    }
    this.activeTtsTurn = null;
  }

  abandonOpenTurn(reason = "provider") {
    if (this.activeTtsTurn) {
      this.markTtsTurnInterrupted(reason);
      this.turnLifecycle.ttsTurnAbandoned += 1;
      this.turnLifecycle.lastTtsTurnOutcome = this.activeTtsTurn.interruption;
      this.activeTtsTurn = null;
    }
    if (this.pendingChatFinals > 0) {
      this.turnLifecycle.chatFinalsWithoutTtsEnd += this.pendingChatFinals;
      this.pendingChatFinals = 0;
    }
  }

  turnLifecycleSnapshot() {
    return Object.freeze({
      ...this.turnLifecycle,
      asrFinalArrivalPhases: Object.freeze({ ...this.turnLifecycle.asrFinalArrivalPhases }),
    });
  }

  echoGuardSnapshot() {
    return Object.freeze({
      policy: ECHO_GUARD_POLICY,
      active: this.echoGuardActive(),
      phase: this.halfDuplexPhase,
      uplinkAllowed: this.microphoneUplinkAllowed(),
      counters: Object.freeze({ ...this.echoGuardCounters }),
    });
  }

  forwardSourceAudio(chunk, token) {
    if (!this.isCurrent(token)) return false;
    if (!this.microphoneUplinkAllowed()) {
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
      turnLifecycle: this.turnLifecycleSnapshot(),
      providerLifecycle: Object.freeze({ ...this.providerLifecycle }),
      stopLifecycle: Object.freeze({ ...this.stopLifecycle }),
      sessionPolicy: Object.freeze({ idleTimeoutMs: this.idleTimeoutMs, idleTimerArmed: Boolean(this.idleTimer), lastStopReason: this.lastStopReason, sessionApplied: this.sessionApplied }),
      asrTiming: Object.freeze({ ...this.asrTiming }),
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

  configureSession({ preferences, idleTimeoutMs: legacyIdleTimeoutMs } = {}) {
    if (this.active || this.stopPromise) return { ok: false, reason: "companion-session-active" };
    const candidate = preferences && typeof preferences === "object" ? preferences : { ...this.sessionProviderPreferences, idleTimeoutMs: legacyIdleTimeoutMs };
    const endSmoothWindowMs = Number(candidate.endSmoothWindowMs);
    const idleTimeoutMs = Number(candidate.idleTimeoutMs);
    if (!isValidEndSmoothWindowMs(endSmoothWindowMs) || !isValidIdleTimeoutMs(idleTimeoutMs)) return { ok: false, reason: "companion-session-preferences-invalid" };
    this.idleTimeoutMs = idleTimeoutMs;
    this.sessionProviderPreferences = Object.freeze({
      revision: Math.max(0, Number(candidate.revision) || 0),
      name: boundedText(candidate.name || COMPANION_PREFERENCES_DEFAULT.name, 32),
      wakePhrase: boundedText(candidate.wakePhrase || COMPANION_PREFERENCES_DEFAULT.wakePhrase, 64),
      endSmoothWindowMs,
      idleTimeoutMs,
    });
    this.sessionPersona = normalizePersona(candidate.persona);
    this.sessionMemoryContext = Object.freeze(Array.isArray(candidate.memoryContext) ? candidate.memoryContext.slice(0, 20).map((item) => Object.freeze({ day: boundedText(item?.day, 10), kind: boundedText(item?.kind, 60), summary: boundedText(item?.summary, 500) })).filter((item) => item.summary.trim()) : []);
    this.sessionApplied = Object.freeze({ ...this.sessionProviderPreferences });
    return { ok: true, status: this.snapshot() };
  }

  clearIdleTimer() {
    if (this.idleTimer) this.clearTimer(this.idleTimer);
    this.idleTimer = null;
  }

  clearTrustedSpeechTimer() {
    if (this.trustedSpeechTimer) this.clearTimer(this.trustedSpeechTimer);
    this.trustedSpeechTimer = null;
    this.trustedSpeechTimerGeneration += 1;
  }

  trustedSpeechTimeoutFor(text) {
    if (this.trustedSpeechTimeoutOverride) return this.trustedSpeechTimeoutMs;
    const estimated = 8000 + [...boundedText(text, 500)].length * 300;
    return Math.max(this.trustedSpeechTimeoutMs, Math.min(60000, estimated));
  }

  armTrustedSpeechTimer(text, token) {
    this.clearTrustedSpeechTimer();
    if (!this.isCurrent(token)) return false;
    const generation = this.trustedSpeechTimerGeneration;
    this.trustedSpeechTimer = this.setTimer(() => {
      this.trustedSpeechTimer = null;
      this.eventChain = this.eventChain
        .then(() => this.handleTrustedSpeechTimeout(token, generation))
        .catch((error) => this.fail(error?.message || "companion-trusted-speech-timeout-failed", token));
    }, this.trustedSpeechTimeoutFor(text));
    return true;
  }

  async handleTrustedSpeechTimeout(token, generation) {
    if (!this.isCurrent(token) || generation !== this.trustedSpeechTimerGeneration) return { ignored: true, reason: "companion-trusted-speech-timeout-stale" };
    this.trustedSpeechTimerGeneration += 1;
    this.turnLifecycle.trustedSpeechTimeouts += 1;
    this.markTtsTurnInterrupted("trusted-timeout");
    this.abandonOpenTurn("trusted-timeout");
    this.pendingTrustedResponse = null;
    this.trustedResponseActive = false;
    this.discardResponseUntilTtsEnd = false;
    this.postInterruptState = "";
    this.playbackDraining = false;
    this.onEvent({ type: "trusted-speech.timeout", reason: "trusted-speech-timeout", sessionId: this.active.sessionId, generation: this.active.generation });
    return this.reconnect(token, { reason: "trusted-speech-timeout" });
  }

  armIdleTimer(reason = "listening") {
    this.clearIdleTimer();
    if (!this.active || this.state !== "listening" || this.idleTimeoutMs === 0) return false;
    const token = this.active.token;
    this.idleTimer = this.setTimer(() => {
      this.idleTimer = null;
      if (!this.isCurrent(token) || this.state !== "listening") return;
      this.onEvent({ type: "idle.timeout", reason: "listening-idle-timeout", sessionId: this.active.sessionId, generation: this.active.generation });
      void this.stop("listening-idle-timeout");
    }, this.idleTimeoutMs);
    this.onEvent({ type: "idle.timer", reason: safeErrorReason(reason), armed: true, timeoutMs: this.idleTimeoutMs, sessionId: this.active.sessionId, generation: this.active.generation });
    return true;
  }

  resetListeningIdleTimer(reason = "companion-call") {
    if (!this.active || this.state !== "listening") return false;
    return this.armIdleTimer(reason);
  }

  async transition(state, detail = {}) {
    if (!STATES.includes(state)) throw new Error("companion-state-invalid");
    this.state = state;
    this.syncHalfDuplexPhaseFromState(state);
    if (state === "listening") this.armIdleTimer(detail.reason || "listening");
    else this.clearIdleTimer();
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

  async start({ sessionId = randomUUID(), generation = 1, initialAnnouncement = "" } = {}) {
    if (this.active || this.stopPromise) return { ok: false, reason: "companion-session-active", status: this.snapshot() };
    const sourceStatus = availability(this.audioSource, "audio-source-unavailable");
    const sinkStatus = availability(this.audioSink, "audio-sink-unavailable");
    if (!sourceStatus.available) return { ok: false, reason: sourceStatus.reason || "audio-source-unavailable", status: this.snapshot() };
    if (!sinkStatus.available) return { ok: false, reason: sinkStatus.reason || "audio-sink-unavailable", status: this.snapshot() };
    this.active = Object.freeze({ sessionId: boundedText(sessionId, 128), generation: Math.max(1, Number(generation) || 1), token: Symbol("companion-session") });
    this.turnSequence = 0;
    this.lastError = "";
    this.lastStopReason = "never";
    this.discardResponseUntilTtsEnd = false;
    this.postInterruptState = "";
    this.playbackDraining = false;
    this.activeTtsTurn = null;
    this.pendingChatFinals = 0;
    this.pendingTrustedResponse = null;
    this.trustedResponseActive = false;
    this.clearTrustedSpeechTimer();
    this.lastPartialAt = null;
    this.asrTiming = { metric: "provider-partial-to-final-v1", status: "unavailable", lastMs: 0, samples: 0 };
    this.setHalfDuplexPhase("connecting");
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
      const announcement = boundedText(initialAnnouncement, 240).trim();
      if (announcement) {
        await this.transition("thinking", { reason: "trusted-proactive-announcement" });
        if (!this.provider?.sayHello?.(announcement)) throw new Error("companion-announcement-unavailable");
        this.trustedResponseActive = true;
        this.armTrustedSpeechTimer(announcement, token);
      } else await this.transition("listening");
      return { ok: true, status: this.snapshot() };
    } catch (error) {
      await this.fail(error?.message || "companion-start-failed", token);
      return { ok: false, reason: this.lastError || "companion-start-failed", status: this.snapshot() };
    }
  }

  async announce(value) {
    const content = boundedText(value, 240).trim();
    if (!content) return { ok: false, reason: "companion-announcement-empty", status: this.snapshot() };
    if (!this.active || this.stopPromise || this.state !== "listening") return { ok: false, reason: "companion-announcement-busy", status: this.snapshot() };
    const token = this.active.token;
    await this.transition("thinking", { reason: "trusted-proactive-announcement" });
    if (!this.isCurrent(token)) return { ok: false, reason: "companion-session-stale", status: this.snapshot() };
    if (!this.provider?.speakText?.(content)) {
      this.clearTrustedSpeechTimer();
      this.trustedResponseActive = false;
      await this.transition("listening", { reason: "announcement-send-failed" });
      return { ok: false, reason: "companion-announcement-unavailable", status: this.snapshot() };
    }
    this.trustedResponseActive = true;
    this.armTrustedSpeechTimer(content, token);
    return { ok: true, status: this.snapshot() };
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
    const asrArrivalPhase = this.halfDuplexPhase;
    const previousProviderEvent = this.providerLifecycle.lastProviderEvent;
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
    else if (providerEvent === "dialog-error") {
      this.providerLifecycle.dialogErrors += 1;
      const adjacentTtsEnd = previousProviderEvent === "tts-end" && sequence === this.providerLifecycle.lastTtsEndSequence + 1;
      if (adjacentTtsEnd) this.providerLifecycle.dialogErrorsAdjacentTtsEnd += 1;
      this.providerLifecycle.lastDialogErrorStatusClass = dialogErrorStatusClassName(event);
      this.providerLifecycle.lastDialogErrorAdjacency = adjacentTtsEnd ? "adjacent-tts-end" : "non-adjacent";
    }
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
    if (event?.type === "chat.final") {
      this.turnLifecycle.chatFinals += 1;
      this.pendingChatFinals += 1;
      if (this.discardResponseUntilTtsEnd) this.turnLifecycle.chatFinalsSuppressed += 1;
    } else if (event?.type === "tts.end" && this.pendingChatFinals > 0) {
      this.pendingChatFinals -= 1;
      this.turnLifecycle.chatFinalTtsEndPairs += 1;
    }
    const isAsr = ["asr.partial", "asr.final"].includes(event?.type);
    const suppressAsr = isAsr && asrArrivalPhase !== "listening";
    if (["transport-error", "transport-close"].includes(providerEvent)) this.setHalfDuplexPhase(this.stopPromise ? "stopping" : "reconnecting");
    else if (event?.type === "error") this.setHalfDuplexPhase(this.stopPromise ? "stopping" : "error");
    else if (event?.type === "asr.final" && !suppressAsr) this.setHalfDuplexPhase("thinking");
    else if (["chat.partial", "chat.final"].includes(event?.type) && !this.discardResponseUntilTtsEnd) this.setHalfDuplexPhase("thinking");
    else if (["tts.start", "audio"].includes(event?.type) && !this.discardResponseUntilTtsEnd) this.setHalfDuplexPhase("speaking");
    else if (event?.type === "tts.end" && !this.discardResponseUntilTtsEnd) this.setHalfDuplexPhase("draining");
    if (event?.type === "asr.final" && !suppressAsr && boundedText(event.text).trim()) this.clearIdleTimer();
    return Object.freeze({ sequence, phase, providerEvent, terminalEvent, asrArrivalPhase, suppressAsr });
  }

  createProvider(token) {
    const providerEpoch = ++this.providerEpoch;
    return this.providerFactory({ sessionPreferences: this.sessionProviderPreferences, sessionPersona: this.sessionPersona, sessionMemoryContext: this.sessionMemoryContext, onEvent: (event) => {
      const providerArrival = this.recordProviderArrival(event);
      const arrival = Object.freeze({
        ...providerArrival,
        providerEpoch,
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

  async reconnect(token, { reason = "provider-reconnect" } = {}) {
    const cancelled = () => ({ ok: false, ignored: true, reason: "companion-session-stale" });
    if (!this.isCurrent(token)) return cancelled();
    if (this.reconnecting) return this.reconnecting;
    this.reconnecting = (async () => {
      this.clearTrustedSpeechTimer();
      this.lastPartialAt = null;
      this.pendingTrustedResponse = null;
      this.trustedResponseActive = false;
      await this.audioSource.stop();
      if (!this.isCurrent(token)) return cancelled();
      this.abandonOpenTurn("provider");
      this.setHalfDuplexPhase("reconnecting");
      await this.audioSink.interrupt("provider");
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
      await this.transition("listening", { reason });
      return { ok: true };
    })().catch(async (error) => {
      const failed = await this.fail(error?.message || "companion-reconnect-failed", token);
      return failed?.ignored ? failed : { ok: false, reason: failed?.reason || "companion-reconnect-failed" };
    }).finally(() => { this.reconnecting = null; });
    return this.reconnecting;
  }

  async speakTrustedOnFreshProvider(response, token) {
    if (!this.isCurrent(token) || !response?.text) return { ok: false, reason: "companion-trusted-response-stale" };
    const previousProvider = this.provider;
    this.provider = null;
    this.abandonOpenTurn("provider");
    this.setHalfDuplexPhase("reconnecting");
    await this.audioSink.interrupt("trusted-response");
    previousProvider?.close?.();
    if (!this.isCurrent(token)) return { ok: false, reason: "companion-session-stale" };
    await this.transition("connecting", { reason: "trusted-response-provider-replace" });
    await this.connectWithRetry(token);
    if (!this.isCurrent(token)) return { ok: false, reason: "companion-session-stale" };
    this.discardResponseUntilTtsEnd = false;
    this.postInterruptState = "";
    this.pendingTrustedResponse = null;
    this.trustedResponseActive = true;
    await this.transition("thinking", { reason: "trusted-response-owned" });
    if (!this.provider?.speakText?.(response.text)) {
      this.clearTrustedSpeechTimer();
      this.trustedResponseActive = false;
      await this.transition("listening", { reason: "trusted-response-send-failed" });
      return { ok: false, reason: "companion-trusted-response-unavailable" };
    }
    this.armTrustedSpeechTimer(response.text, token);
    if (await this.commitFinalTurn("assistant", response.text, token)) {
      if (!this.isCurrent(token)) return { ignored: true };
      this.onEvent({ type: "turn.assistant-final", text: response.text, trusted: true, sessionId: this.active.sessionId, generation: this.active.generation });
    }
    return { ok: true, trusted: true };
  }

  async commitFinalTurn(role, text, token, metadata = {}) {
    if (!this.isCurrent(token)) return false;
    const content = boundedText(text);
    if (!content.trim()) return false;
    const sequence = ++this.turnSequence;
    const eventId = `${this.active.sessionId}:turn:${sequence}:${role}`;
    await this.commitTurn({ eventId, sessionId: this.active.sessionId, role, content, createdAt: new Date().toISOString(), ...metadata });
    return true;
  }

  async handleProviderEvent(event = {}, token, arrival = {}) {
    if (!this.isCurrent(token) || arrival.providerEpoch !== this.providerEpoch) return { ignored: true, reason: "companion-event-stale" };
    if (event.type === "connection.closed") { void this.reconnect(token); return { ok: true }; }
    if (event.type === "error") {
      if (["doubao-connection-error", "doubao-connection-closed"].includes(event.message)) { void this.reconnect(token); return { ok: true, reconnecting: true }; }
      await this.fail(event.message || "companion-provider-error", token);
      return { ok: false };
    }
    if (event.type === "asr.final") {
      const phase = HALF_DUPLEX_PHASES.has(arrival.asrArrivalPhase) ? arrival.asrArrivalPhase : "idle";
      this.turnLifecycle.lastAsrFinalArrivalPhase = phase;
      this.turnLifecycle.asrFinalArrivalPhases[phase] += 1;
      if (arrival.suppressAsr) this.turnLifecycle.asrFinalsSuppressed += 1;
      else this.turnLifecycle.asrFinalsAccepted += 1;
    }
    if (["asr.partial", "asr.final"].includes(event.type) && arrival.suppressAsr) {
      this.echoGuardCounters.ignoredAsrDuringPlayback += 1;
      return { ignored: true, reason: "companion-playback-echo-guard" };
    }
    if (event.type === "audio") {
      if (this.discardResponseUntilTtsEnd) return { ignored: true, reason: "companion-response-interrupted" };
      this.beginTtsTurn({ implicit: true });
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
      this.lastPartialAt = this.now();
      this.onEvent({ type: "transcript.partial", text: boundedText(event.text), sessionId: this.active.sessionId, generation: this.active.generation });
      return { ok: true };
    }
    if (event.type === "asr.final") {
      if (this.lastPartialAt !== null) {
        const elapsed = Math.max(0, Math.min(60000, Math.round(this.now() - this.lastPartialAt)));
        this.asrTiming = { metric: "provider-partial-to-final-v1", status: "available", lastMs: elapsed, samples: this.asrTiming.samples + 1 };
      }
      this.lastPartialAt = null;
      let trustedClaimed = false;
      try { trustedClaimed = this.claimsTrustedTurn(event.text) === true; } catch { trustedClaimed = false; }
      if (trustedClaimed) {
        this.discardResponseUntilTtsEnd = true;
        this.postInterruptState = "thinking";
        this.setHalfDuplexPhase("thinking");
      }
      let trusted = null;
      try { trusted = await this.resolveTrustedTurn(event.text); } catch { trusted = null; this.turnLifecycle.bridgeFailures += 1; }
      const trustedText = boundedText(trusted?.text || trusted?.answer, 240).trim();
      if (trusted?.checked === true) {
        this.turnLifecycle.bridgeChecks += 1;
        if (trusted.failed === true) this.turnLifecycle.bridgeFailures += 1;
        if (trustedText) this.turnLifecycle.bridgeOwnedTurns += 1;
        else this.turnLifecycle.bridgePassThroughTurns += 1;
      }
      if (trustedText) {
        this.pendingTrustedResponse = Object.freeze({ text: trustedText, result: trusted?.result || null });
        this.discardResponseUntilTtsEnd = true;
        this.postInterruptState = "thinking";
        this.setHalfDuplexPhase("thinking");
      }
      else if (trustedClaimed) {
        this.discardResponseUntilTtsEnd = false;
        this.postInterruptState = "";
      }
      if (await this.commitFinalTurn("user", event.text, token, { intentChecked: trusted?.checked === true, intentHandled: Boolean(trustedText) })) {
        if (!this.isCurrent(token)) return { ignored: true };
        this.onEvent({ type: "turn.user-final", text: boundedText(event.text), sessionId: this.active.sessionId, generation: this.active.generation });
        if (trustedText && trusted?.result) this.onEvent({ type: "intent.result", result: trusted.result, sessionId: this.active.sessionId, generation: this.active.generation });
        await this.transition("thinking");
      }
      if (trustedText && this.isCurrent(token)) return this.speakTrustedOnFreshProvider(this.pendingTrustedResponse, token);
      if (trustedClaimed && this.isCurrent(token)) await this.transition("listening", { reason: "trusted-response-unavailable" });
      return { ok: true };
    }
    if (event.type === "asr.ended" && this.pendingTrustedResponse) return { ignored: true, reason: "companion-trusted-response-owned" };
    if (event.type === "chat.partial") {
      if (this.pendingTrustedResponse || this.trustedResponseActive) return { ignored: true, reason: "companion-trusted-response-owned" };
      if (this.discardResponseUntilTtsEnd) return { ignored: true, reason: "companion-response-interrupted" };
      if (this.state !== "thinking") await this.transition("thinking");
      this.onEvent({ type: "reply.partial", text: boundedText(event.fullText || event.text), sessionId: this.active.sessionId, generation: this.active.generation });
      return { ok: true };
    }
    if (event.type === "chat.final") {
      if (this.pendingTrustedResponse || this.trustedResponseActive) return { ignored: true, reason: "companion-trusted-response-owned" };
      if (this.discardResponseUntilTtsEnd) return { ignored: true, reason: "companion-response-interrupted" };
      if (await this.commitFinalTurn("assistant", event.text, token)) {
        if (!this.isCurrent(token)) return { ignored: true };
        this.onEvent({ type: "turn.assistant-final", text: boundedText(event.text), sessionId: this.active.sessionId, generation: this.active.generation });
      }
      return { ok: true };
    }
    if (event.type === "tts.start") {
      if (this.discardResponseUntilTtsEnd) return { ignored: true, reason: "companion-response-interrupted" };
      this.beginTtsTurn();
      await this.transition("speaking");
      return { ok: true };
    }
    if (event.type === "tts.end") {
      this.clearTrustedSpeechTimer();
      if (this.discardResponseUntilTtsEnd) {
        this.finishTtsTurn();
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
        this.finishTtsTurn();
        const nextState = this.postInterruptState || "listening";
        this.discardResponseUntilTtsEnd = false;
        this.postInterruptState = "";
        this.playbackDraining = false;
        this.trustedResponseActive = false;
        if (this.state !== nextState) await this.transition(nextState, { reason: "response-interrupted" });
        return { ok: true, interrupted: true };
      }
      const drainResult = drained.ok ? drained.value : { ok: false, reason: drained.reason };
      if (!drainResult?.ok) {
        this.echoGuardCounters.playbackDrainTimeouts += 1;
        this.markTtsTurnInterrupted("drain-timeout");
        await this.boundedOperation(() => this.audioSink.interrupt("drain-timeout"), this.teardownStepTimeoutMs, "companion-audio-interrupt-timeout");
      }
      this.finishTtsTurn();
      this.playbackDraining = false;
      this.trustedResponseActive = false;
      await this.transition("listening", { reason: drainResult?.ok ? "tts-playback-drained" : "tts-playback-drain-timeout" });
      return { ok: true, drained: Boolean(drainResult?.ok) };
    }
    return { ignored: true, reason: "companion-event-unmapped" };
  }

  async cleanup(provider = this.provider, cancellationReason = "stop") {
    const bounded = async (operation, reason) => {
      const result = await this.boundedOperation(operation, this.teardownStepTimeoutMs, reason);
      if (result.timedOut) this.echoGuardCounters.teardownTimeouts += 1;
      return result;
    };
    await Promise.all([
      bounded(() => this.audioSource?.stop?.(), "companion-audio-source-stop-timeout"),
      (async () => {
        await bounded(() => this.audioSink?.interrupt?.(cancellationReason), "companion-audio-sink-interrupt-timeout");
        await bounded(() => this.audioSink?.stop?.(cancellationReason), "companion-audio-sink-stop-timeout");
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
    this.clearIdleTimer();
    this.clearTrustedSpeechTimer();
    this.lastError = safeErrorReason(reason);
    this.abandonOpenTurn("provider");
    this.setHalfDuplexPhase("error");
    this.discardResponseUntilTtsEnd = false;
    this.postInterruptState = "";
    this.playbackDraining = false;
    this.pendingTrustedResponse = null;
    this.trustedResponseActive = false;
    await this.cleanup(provider, "provider");
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
    this.clearIdleTimer();
    this.clearTrustedSpeechTimer();
    this.lastStopReason = safeErrorReason(reason);
    if (!this.active) {
      if (this.state !== "idle") {
        this.state = "idle";
        this.lastError = "";
        this.onEvent({ type: "state", state: "idle", reason, sessionId: "", generation: 0 });
        await this.publishTerminalState("idle");
      }
      this.stopLifecycle.alreadyStopped += 1;
      this.stopLifecycle.lastResult = "already-stopped";
      this.onEvent({ type: "stop.lifecycle", reason: this.lastStopReason, stopLifecycle: { ...this.stopLifecycle } });
      return { ok: true, alreadyStopped: true, status: this.snapshot() };
    }
    const session = this.active;
    const provider = this.provider;
    await this.transition("stopping", { reason });
    this.active = null;
    this.abandonOpenTurn("stop");
    this.discardResponseUntilTtsEnd = false;
    this.postInterruptState = "";
    this.playbackDraining = false;
    this.pendingTrustedResponse = null;
    this.trustedResponseActive = false;
    this.clearTrustedSpeechTimer();
    await this.cleanup(provider, "stop");
    this.state = "idle";
    this.setHalfDuplexPhase("idle");
    this.lastError = "";
    this.onEvent({ type: "state", state: "idle", reason, sessionId: session.sessionId, generation: session.generation });
    await this.publishTerminalState("idle");
    this.stopLifecycle.completed += 1;
    this.stopLifecycle.lastResult = "completed";
    this.onEvent({ type: "stop.lifecycle", reason: this.lastStopReason, sessionId: session.sessionId, generation: session.generation, stopLifecycle: { ...this.stopLifecycle } });
    return { ok: true, status: this.snapshot() };
  }

  async interrupt(reason = "user") {
    if (!this.active) return { ok: false, reason: "companion-session-inactive", status: this.snapshot() };
    if (!['thinking', 'speaking', 'completed'].includes(this.state)) return { ok: false, reason: "companion-response-not-active", status: this.snapshot() };
    this.discardResponseUntilTtsEnd = true;
    this.postInterruptState = "listening";
    this.pendingTrustedResponse = null;
    this.trustedResponseActive = false;
    this.clearTrustedSpeechTimer();
    this.markTtsTurnInterrupted("manual");
    await this.audioSink.interrupt("manual");
    this.provider?.interrupt?.();
    await this.transition("listening", { reason: safeErrorReason(reason) });
    this.onEvent({ type: "response.interrupted", sessionId: this.active.sessionId, generation: this.active.generation });
    return { ok: true, status: this.snapshot() };
  }

  async call(reason = "companion-call") {
    if (!this.active) return { ok: false, reason: "companion-session-inactive", action: "start", status: this.snapshot() };
    if (this.stopPromise || ["connecting", "stopping"].includes(this.state) || this.reconnecting) {
      return { ok: false, reason: "companion-call-busy", action: "busy", status: this.snapshot() };
    }
    if (this.state === "listening") {
      this.resetListeningIdleTimer(reason);
      this.onEvent({ type: "call.acknowledged", action: "listening-reset", sessionId: this.active.sessionId, generation: this.active.generation });
      return { ok: true, action: "listening-reset", status: this.snapshot() };
    }
    if (["thinking", "speaking", "completed"].includes(this.state) || this.playbackDraining || this.halfDuplexPhase === "draining") {
      const result = await this.interrupt(reason);
      return { ...result, action: result.ok ? "interrupt-listen" : "busy" };
    }
    return { ok: false, reason: "companion-call-busy", action: "busy", status: this.snapshot() };
  }
}

module.exports = { COMPANION_CONVERSATION_STATES: STATES, COMPANION_STATE_TO_AGENT: STATE_TO_AGENT, COMPANION_ECHO_GUARD_POLICY: ECHO_GUARD_POLICY, CompanionConversationController };
