const { CompanionSpeechSegmenter, cleanVisibleText } = require("./companion-speech-segmenter.cjs");

const MAX_SPEECH_SEGMENTS = 16;
const BARGE_IN_FILLERS = new Set(["嗯", "啊", "呃", "哦", "诶", "哎", "喂", "嗯嗯", "啊啊", "哦哦"]);

function comparisonText(value) {
  return cleanVisibleText(value, 16384).normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[^\p{L}\p{N}]+/gu, "");
}

function classifyRecognizedBargeIn(candidate, assistantText = "") {
  const normalized = comparisonText(candidate);
  if (!normalized || BARGE_IN_FILLERS.has(normalized)) return Object.freeze({ accepted: false, reason: "weak" });
  const meaningfulLength = [...normalized].length;
  const explicitShortInterrupt = /^(停|等等|等一下|先停|别说|不是)$/.test(normalized);
  if (meaningfulLength < 3 && !explicitShortInterrupt) return Object.freeze({ accepted: false, reason: "weak" });
  const assistant = comparisonText(assistantText);
  if (assistant && (assistant.includes(normalized) || (normalized.length >= 6 && normalized.includes(assistant)))) {
    return Object.freeze({ accepted: false, reason: "echo" });
  }
  return Object.freeze({ accepted: true, reason: "recognized-speech" });
}

function stablePipelineReason(value) {
  const reason = String(value?.message || value || "");
  return /^three-stage-[a-z-]+$/.test(reason) ? reason : "three-stage-session-failed";
}

class ThreeStageCompanionProvider {
  constructor({ asrFactory, modelFactory, ttsFactory, shouldBypassModel = () => false, onEvent = () => {}, now = Date.now } = {}) {
    if (![asrFactory, modelFactory, ttsFactory].every((value) => typeof value === "function")) throw new Error("three-stage-provider-factory-required");
    this.asrFactory = asrFactory;
    this.modelFactory = modelFactory;
    this.ttsFactory = ttsFactory;
    this.shouldBypassModel = shouldBypassModel;
    this.onEvent = onEvent;
    this.now = now;
    this.asr = null;
    this.model = null;
    this.tts = null;
    this.closed = false;
    this.ready = false;
    this.generation = 1;
    this.turnSequence = 0;
    this.activeTurn = null;
    this.pendingBargeInFinal = false;
    this.utteranceStartedAt = null;
    this.lastFinal = { text: "", at: 0 };
    this.counters = {
      asrPartials: 0, asrFinals: 0, duplicateFinals: 0, trustedBypasses: 0,
      modelRequests: 0, assistantDeltas: 0, ttsRequests: 0, ttsAudioChunks: 0,
      turnsCompleted: 0, cancellations: 0, errors: 0,
      bargeInCandidates: 0, bargeInsAccepted: 0, bargeInsRejectedEcho: 0, bargeInsRejectedWeak: 0,
    };
    this.lastTiming = {
      speechStarted: null, firstAsrPartialMs: null, asrFinalMs: null,
      modelRequestStartedMs: null, firstAssistantDeltaMs: null, firstTtsRequestMs: null,
      firstTtsAudioMs: null, playbackStartedMs: null, turnCompletedMs: null,
    };
  }

  emit(event) { if (!this.closed) this.onEvent(event); }

  diagnostics() {
    return Object.freeze({
      version: 1,
      provider: "three-stage",
      ready: this.ready,
      active: Boolean(this.activeTurn),
      counters: Object.freeze({ ...this.counters }),
      lastTiming: Object.freeze({ ...this.lastTiming }),
    });
  }

  async connect() {
    if (this.closed) return { ok: false, reason: "three-stage-session-failed" };
    const generation = this.generation;
    try {
      this.model = this.modelFactory();
      this.tts = this.ttsFactory();
      this.asr = this.asrFactory({ onEvent: (event) => this.handleAsrEvent(event, generation) });
      await Promise.all([this.asr.connect(), this.tts.connect()]);
      if (this.closed || generation !== this.generation) throw new Error("three-stage-session-failed");
      this.ready = true;
      this.emit({ type: "session.ready", diagnostic: { providerEvent: "session-ready" } });
      return { ok: true };
    } catch (error) {
      this.asr?.close?.();
      this.tts?.close?.();
      this.model?.close?.();
      this.asr = null;
      this.tts = null;
      this.model = null;
      throw new Error(stablePipelineReason(error));
    }
  }

  sendAudio(value) {
    if (!this.ready || this.closed) return false;
    return this.asr?.sendAudio?.(value) === true;
  }

  handleAsrEvent(event = {}, generation = this.generation) {
    if (this.closed || generation !== this.generation) return;
    if (event.type === "partial") {
      this.counters.asrPartials += 1;
      if (this.utteranceStartedAt === null) {
        this.utteranceStartedAt = this.now();
        this.lastTiming = {
          speechStarted: 0, firstAsrPartialMs: 0, asrFinalMs: null,
          modelRequestStartedMs: null, firstAssistantDeltaMs: null, firstTtsRequestMs: null,
          firstTtsAudioMs: null, playbackStartedMs: null, turnCompletedMs: null,
        };
      }
      const text = cleanVisibleText(event.text);
      if (this.activeTurn) {
        this.counters.bargeInCandidates += 1;
        const classification = classifyRecognizedBargeIn(text, this.activeTurn.assistantText);
        if (classification.accepted) {
          this.counters.bargeInsAccepted += 1;
          const turn = this.activeTurn;
          const hadTts = Boolean(turn.ttsStarted && !turn.ttsEnded);
          this.emit({ type: "barge.start", hadTts, diagnostic: { providerEvent: "other" } });
          this.pendingBargeInFinal = true;
          this.interrupt();
        } else if (classification.reason === "echo") this.counters.bargeInsRejectedEcho += 1;
        else this.counters.bargeInsRejectedWeak += 1;
      }
      this.emit({ type: "asr.partial", text });
      return;
    }
    if (event.type === "final") {
      const text = cleanVisibleText(event.text).trim();
      if (!text) return;
      const at = this.now();
      let bargeIn = this.pendingBargeInFinal;
      this.pendingBargeInFinal = false;
      if (this.activeTurn) {
        this.counters.bargeInCandidates += 1;
        const classification = classifyRecognizedBargeIn(text, this.activeTurn.assistantText);
        if (!classification.accepted) {
          if (classification.reason === "echo") this.counters.bargeInsRejectedEcho += 1;
          else this.counters.bargeInsRejectedWeak += 1;
          return;
        }
        this.counters.bargeInsAccepted += 1;
        bargeIn = true;
        const turn = this.activeTurn;
        const hadTts = Boolean(turn.ttsStarted && !turn.ttsEnded);
        this.emit({ type: "barge.start", hadTts, diagnostic: { providerEvent: "other" } });
        this.interrupt();
      }
      if (this.lastFinal.text === text && at - this.lastFinal.at < 3000) {
        this.counters.duplicateFinals += 1;
        return;
      }
      this.lastFinal = { text, at };
      this.counters.asrFinals += 1;
      const hadPartial = this.utteranceStartedAt !== null;
      const utteranceStartedAt = this.utteranceStartedAt ?? at;
      this.utteranceStartedAt = null;
      this.lastTiming = {
        speechStarted: 0,
        firstAsrPartialMs: hadPartial ? this.lastTiming.firstAsrPartialMs : null,
        asrFinalMs: Math.max(0, at - utteranceStartedAt),
        modelRequestStartedMs: null,
        firstAssistantDeltaMs: null,
        firstTtsRequestMs: null,
        firstTtsAudioMs: null,
        playbackStartedMs: null,
        turnCompletedMs: null,
      };
      this.emit({ type: "asr.final", text, bargeIn });
      let bypass = false;
      try { bypass = this.shouldBypassModel(text) === true; } catch { bypass = false; }
      if (bypass) {
        this.counters.trustedBypasses += 1;
        return;
      }
      void this.runModelTurn(text, generation, utteranceStartedAt);
      return;
    }
    if (event.type === "error") this.fail("three-stage-asr-unavailable", generation);
    else if (event.type === "closed" && this.ready) this.emit({ type: "connection.closed", diagnostic: { providerEvent: "transport-close", terminalEvent: "transport-close" } });
  }

  newTurn(kind = "model", startedAt = this.now()) {
    const turn = {
      id: ++this.turnSequence,
      kind,
      generation: this.generation,
      abortController: new AbortController(),
      segmenter: new CompanionSpeechSegmenter(),
      speechChain: Promise.resolve(),
      segmentCount: 0,
      ttsStarted: false,
      ttsEnded: false,
      assistantText: "",
      startedAt,
    };
    this.activeTurn = turn;
    return turn;
  }

  isCurrentTurn(turn) {
    return Boolean(!this.closed && this.activeTurn === turn && turn.generation === this.generation && !turn.abortController.signal.aborted);
  }

  queueSpeech(turn, segment) {
    const text = cleanVisibleText(segment).trim();
    if (!text) return;
    turn.segmentCount += 1;
    if (turn.segmentCount > MAX_SPEECH_SEGMENTS) throw new Error("three-stage-response-too-large");
    turn.speechChain = turn.speechChain.then(async () => {
      if (!this.isCurrentTurn(turn)) return;
      if (!turn.ttsStarted) {
        turn.ttsStarted = true;
        this.lastTiming.firstTtsRequestMs = Math.max(0, this.now() - turn.startedAt);
        this.emit({ type: "tts.start", diagnostic: { providerEvent: "tts-start" } });
      }
      this.counters.ttsRequests += 1;
      let firstAudio = true;
      await this.tts.synthesize(text, {
        signal: turn.abortController.signal,
        onAudio: (audio) => {
          if (!this.isCurrentTurn(turn)) return;
          if (firstAudio) {
            firstAudio = false;
            if (this.lastTiming.firstTtsAudioMs === null) this.lastTiming.firstTtsAudioMs = Math.max(0, this.now() - turn.startedAt);
            if (this.lastTiming.playbackStartedMs === null) this.lastTiming.playbackStartedMs = this.lastTiming.firstTtsAudioMs;
          }
          this.counters.ttsAudioChunks += 1;
          this.emit({ type: "audio", audio: Buffer.from(audio || []) });
        },
      });
    });
  }

  async runModelTurn(text, generation, startedAt = this.now()) {
    if (this.closed || generation !== this.generation || this.activeTurn) return;
    const turn = this.newTurn("model", startedAt);
    this.counters.modelRequests += 1;
    this.lastTiming.modelRequestStartedMs = Math.max(0, this.now() - turn.startedAt);
    try {
      const result = await this.model.streamTurn({
        text,
        signal: turn.abortController.signal,
        onDelta: (delta, fullText) => {
          if (!this.isCurrentTurn(turn)) return;
          if (this.lastTiming.firstAssistantDeltaMs === null) this.lastTiming.firstAssistantDeltaMs = Math.max(0, this.now() - turn.startedAt);
          this.counters.assistantDeltas += 1;
          turn.assistantText = cleanVisibleText(fullText);
          this.emit({ type: "chat.partial", text: cleanVisibleText(delta), fullText: turn.assistantText });
          for (const segment of turn.segmenter.push(delta)) this.queueSpeech(turn, segment);
        },
      });
      if (!this.isCurrentTurn(turn)) return;
      for (const segment of turn.segmenter.finish(result.text)) this.queueSpeech(turn, segment);
      this.emit({ type: "chat.final", text: result.text });
      await turn.speechChain;
      if (!this.isCurrentTurn(turn)) return;
      this.completeTurn(turn);
    } catch (error) {
      if (!this.isCurrentTurn(turn)) return;
      this.fail(stablePipelineReason(error), generation);
    }
  }

  async runDirectSpeech(text, generation) {
    if (this.closed || generation !== this.generation || this.activeTurn) return;
    const content = cleanVisibleText(text, 240).trim();
    if (!content) return;
    const turn = this.newTurn("direct");
    turn.assistantText = content;
    try {
      for (const segment of turn.segmenter.push(content)) this.queueSpeech(turn, segment);
      for (const segment of turn.segmenter.finish(content)) this.queueSpeech(turn, segment);
      await turn.speechChain;
      if (!this.isCurrentTurn(turn)) return;
      this.completeTurn(turn);
    } catch (error) {
      if (!this.isCurrentTurn(turn)) return;
      this.fail(stablePipelineReason(error), generation);
    }
  }

  completeTurn(turn) {
    if (!this.isCurrentTurn(turn)) return;
    turn.ttsEnded = true;
    this.lastTiming.turnCompletedMs = Math.max(0, this.now() - turn.startedAt);
    this.counters.turnsCompleted += 1;
    this.activeTurn = null;
    this.pendingBargeInFinal = false;
    this.emit({ type: "tts.end", diagnostic: { providerEvent: "tts-end" } });
  }

  speakText(value) {
    const text = cleanVisibleText(value, 240).trim();
    if (!this.ready || this.closed || !text || this.activeTurn) return false;
    void this.runDirectSpeech(text, this.generation);
    return true;
  }

  sayHello(value) { return this.speakText(value); }

  interrupt() {
    const turn = this.activeTurn;
    if (!turn) return false;
    this.counters.cancellations += 1;
    turn.abortController.abort("interrupted");
    this.tts?.interrupt?.();
    this.activeTurn = null;
    if (turn.ttsStarted && !turn.ttsEnded) this.emit({ type: "tts.end", diagnostic: { providerEvent: "tts-end" } });
    return true;
  }

  fail(reason, generation = this.generation) {
    if (this.closed || generation !== this.generation) return;
    this.counters.errors += 1;
    const turn = this.activeTurn;
    if (turn) turn.abortController.abort("failed");
    this.activeTurn = null;
    this.emit({ type: "error", message: stablePipelineReason(reason), diagnostic: { providerEvent: "provider-error", terminalEvent: "provider-error", failureBucket: "unknown-provider-error" } });
  }

  close() {
    if (this.closed) return;
    const turn = this.activeTurn;
    if (turn) turn.abortController.abort("closed");
    this.activeTurn = null;
    this.pendingBargeInFinal = false;
    this.ready = false;
    this.closed = true;
    this.generation += 1;
    this.asr?.close?.();
    this.tts?.close?.();
    this.model?.close?.();
    this.asr = null;
    this.tts = null;
    this.model = null;
  }
}

module.exports = { MAX_SPEECH_SEGMENTS, ThreeStageCompanionProvider, classifyRecognizedBargeIn, comparisonText, stablePipelineReason };
