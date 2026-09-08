const { CompanionSpeechSegmenter, cleanVisibleText } = require("./companion-speech-segmenter.cjs");

const MAX_SPEECH_SEGMENTS = 12;
const TRUNCATED_RESPONSE_CLOSING = "回答有点长，我先说到这里。";
const BARGE_IN_FILLERS = new Set(["嗯", "啊", "呃", "哦", "诶", "哎", "喂", "嗯嗯", "啊啊", "哦哦"]);
const EXPLICIT_BARGE_IN = /(停一下|停下来|先停|暂停|等等|等一下|别说了|别讲了|打住|我来说|让我说|换个问题)/;
const NON_SPEECH_LABEL = /^(?:掌声|拍手|拍手声|咳嗽|咳嗽声|噪音|杂音|音乐|背景音)$/;
const MIN_PARTIAL_SPEECH_MS = 500;
const MIN_FINAL_SPEECH_MS = 650;

function comparisonText(value) {
  return cleanVisibleText(value, 16384).normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[^\p{L}\p{N}]+/gu, "");
}

function classifyRecognizedBargeIn(candidate, assistantText = "") {
  const normalized = comparisonText(candidate);
  if (!normalized || BARGE_IN_FILLERS.has(normalized) || NON_SPEECH_LABEL.test(normalized)) return Object.freeze({ accepted: false, reason: "weak" });
  const meaningfulLength = [...normalized].length;
  const explicitShortInterrupt = /^(停|等等|等一下|先停|别说|不是)$/.test(normalized);
  if (meaningfulLength < 3 && !explicitShortInterrupt) return Object.freeze({ accepted: false, reason: "weak" });
  const assistant = comparisonText(assistantText);
  if (assistant && (assistant.includes(normalized) || (normalized.length >= 6 && normalized.includes(assistant)))) {
    return Object.freeze({ accepted: false, reason: "echo" });
  }
  if (assistant && normalized.length >= 4) {
    const bigrams = new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)));
    const overlap = [...bigrams].filter((gram) => assistant.includes(gram)).length / Math.max(1, bigrams.size);
    if (overlap >= 0.75) return Object.freeze({ accepted: false, reason: "echo" });
  }
  return Object.freeze({ accepted: true, reason: "recognized-speech" });
}

function isExplicitBargeIn(value) {
  return EXPLICIT_BARGE_IN.test(comparisonText(value));
}

function consistentPartial(previous, current) {
  if (!previous || !current || previous === current) return false;
  if (current.includes(previous) || previous.includes(current)) return true;
  let prefix = 0;
  while (prefix < Math.min(previous.length, current.length) && previous[prefix] === current[prefix]) prefix += 1;
  return prefix >= Math.min(3, Math.min(previous.length, current.length));
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
    this.playbackTail = null;
    this.pendingBargeInFinal = false;
    this.speechEvidence = { active: false, itemId: "", audioStartMs: null, audioEndMs: null, receivedStartAt: null, lastPartial: "", stablePartials: 0, meaningfulPartials: 0 };
    this.utteranceStartedAt = null;
    this.lastFinal = { text: "", at: 0 };
    this.counters = {
      asrPartials: 0, asrFinals: 0, duplicateFinals: 0, trustedBypasses: 0,
      modelRequests: 0, assistantDeltas: 0, ttsRequests: 0, ttsAudioChunks: 0,
      turnsCompleted: 0, cancellations: 0, errors: 0,
      bargeInCandidates: 0, bargeInsAccepted: 0, bargeInsRejectedEcho: 0, bargeInsRejectedWeak: 0,
      bargeSpeechStarts: 0, bargeInsRejectedUnstable: 0,
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
      playbackTailActive: Boolean(this.playbackTail),
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

  bargeContext() {
    if (this.activeTurn) return Object.freeze({ assistantText: this.activeTurn.assistantText, hadTts: Boolean(this.activeTurn.ttsStarted && !this.activeTurn.ttsEnded) });
    if (this.playbackTail) return Object.freeze({ assistantText: this.playbackTail.assistantText, hadTts: true });
    return null;
  }

  resetSpeechEvidence() {
    this.speechEvidence = { active: false, itemId: "", audioStartMs: null, audioEndMs: null, receivedStartAt: null, lastPartial: "", stablePartials: 0, meaningfulPartials: 0 };
  }

  matchingSpeechEvidence(itemId = "") {
    const value = String(itemId || "");
    return Boolean(this.speechEvidence.active && (!value || !this.speechEvidence.itemId || value === this.speechEvidence.itemId));
  }

  recordPartialEvidence(text, itemId = "", confirmedText = "") {
    if (!this.matchingSpeechEvidence(itemId)) return false;
    const normalized = comparisonText(text);
    const confirmed = comparisonText(confirmedText);
    const previous = this.speechEvidence.lastPartial;
    if (normalized && normalized !== previous) this.speechEvidence.meaningfulPartials += 1;
    this.speechEvidence.stablePartials = consistentPartial(previous, normalized) ? this.speechEvidence.stablePartials + 1 : normalized ? 1 : 0;
    this.speechEvidence.lastPartial = normalized;
    const observedMs = this.speechEvidence.receivedStartAt === null ? 0 : Math.max(0, this.now() - this.speechEvidence.receivedStartAt);
    const linguisticEvidence = confirmed.length >= 5 || (this.speechEvidence.meaningfulPartials >= 2 && normalized.length >= 5);
    return linguisticEvidence && observedMs >= MIN_PARTIAL_SPEECH_MS;
  }

  finalSpeechConfirmed(text, itemId = "") {
    if (!this.matchingSpeechEvidence(itemId)) return false;
    const duration = this.speechEvidence.audioStartMs !== null && this.speechEvidence.audioEndMs !== null
      ? Math.max(0, this.speechEvidence.audioEndMs - this.speechEvidence.audioStartMs)
      : 0;
    return comparisonText(text).length >= 5 && duration >= MIN_FINAL_SPEECH_MS;
  }

  handleAsrEvent(event = {}, generation = this.generation) {
    if (this.closed || generation !== this.generation) return;
    if (event.type === "speech.started") {
      this.resetSpeechEvidence();
      this.speechEvidence.active = true;
      this.speechEvidence.itemId = String(event.itemId || "").slice(0, 160);
      this.speechEvidence.audioStartMs = Math.max(0, Number(event.audioStartMs) || 0);
      this.speechEvidence.receivedStartAt = this.now();
      if (this.bargeContext()) this.counters.bargeSpeechStarts += 1;
      return;
    }
    if (event.type === "speech.stopped") {
      if (this.matchingSpeechEvidence(event.itemId)) this.speechEvidence.audioEndMs = Math.max(0, Number(event.audioEndMs) || 0);
      return;
    }
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
      const bargeContext = this.bargeContext();
      if (bargeContext) {
        this.counters.bargeInCandidates += 1;
        const classification = classifyRecognizedBargeIn(text, bargeContext.assistantText);
        if (classification.accepted) {
          const confirmed = isExplicitBargeIn(text) && this.matchingSpeechEvidence(event.itemId)
            ? true
            : this.recordPartialEvidence(text, event.itemId, event.confirmedText);
          if (confirmed) {
            this.counters.bargeInsAccepted += 1;
            this.emit({ type: "barge.start", hadTts: bargeContext.hadTts, diagnostic: { providerEvent: "other" } });
            this.pendingBargeInFinal = true;
            this.interrupt();
          } else this.counters.bargeInsRejectedUnstable += 1;
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
      const bargeContext = this.bargeContext();
      if (bargeContext) {
        this.counters.bargeInCandidates += 1;
        const classification = classifyRecognizedBargeIn(text, bargeContext.assistantText);
        if (!classification.accepted) {
          if (classification.reason === "echo") this.counters.bargeInsRejectedEcho += 1;
          else this.counters.bargeInsRejectedWeak += 1;
          return;
        }
        const confirmed = (isExplicitBargeIn(text) && this.matchingSpeechEvidence(event.itemId)) || this.finalSpeechConfirmed(text, event.itemId);
        if (!confirmed) {
          this.counters.bargeInsRejectedUnstable += 1;
          this.resetSpeechEvidence();
          return;
        }
        this.counters.bargeInsAccepted += 1;
        bargeIn = true;
        this.emit({ type: "barge.start", hadTts: bargeContext.hadTts, diagnostic: { providerEvent: "other" } });
        this.interrupt();
      }
      if (this.lastFinal.text === text && at - this.lastFinal.at < 3000) {
        this.counters.duplicateFinals += 1;
        return;
      }
      this.lastFinal = { text, at };
      this.resetSpeechEvidence();
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
      spokenText: "",
      responseTruncated: false,
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

  queueSpeech(turn, segment, { force = false } = {}) {
    const text = cleanVisibleText(segment).trim();
    if (!text) return false;
    if ((!force && turn.segmentCount >= MAX_SPEECH_SEGMENTS - 1) || turn.segmentCount >= MAX_SPEECH_SEGMENTS) {
      turn.responseTruncated = true;
      return false;
    }
    turn.segmentCount += 1;
    turn.spokenText = `${turn.spokenText}${text}`;
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
    return true;
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
      if (turn.responseTruncated) this.queueSpeech(turn, TRUNCATED_RESPONSE_CLOSING, { force: true });
      this.emit({ type: "chat.final", text: turn.responseTruncated ? turn.spokenText : result.text });
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
    this.playbackTail = turn.ttsStarted ? Object.freeze({ assistantText: turn.assistantText }) : null;
    this.activeTurn = null;
    this.pendingBargeInFinal = false;
    this.emit({ type: "tts.end", diagnostic: { providerEvent: "tts-end" } });
  }

  playbackDrained() {
    const hadTail = Boolean(this.playbackTail);
    this.playbackTail = null;
    this.resetSpeechEvidence();
    return hadTail;
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
    const hadPlaybackTail = Boolean(this.playbackTail);
    if (!turn && !hadPlaybackTail) return false;
    this.counters.cancellations += 1;
    if (turn) {
      turn.abortController.abort("interrupted");
      this.tts?.interrupt?.();
    }
    this.activeTurn = null;
    this.playbackTail = null;
    this.resetSpeechEvidence();
    if (turn?.ttsStarted && !turn.ttsEnded) this.emit({ type: "tts.end", diagnostic: { providerEvent: "tts-end" } });
    return true;
  }

  fail(reason, generation = this.generation) {
    if (this.closed || generation !== this.generation) return;
    this.counters.errors += 1;
    const turn = this.activeTurn;
    if (turn) turn.abortController.abort("failed");
    this.activeTurn = null;
    this.playbackTail = null;
    this.resetSpeechEvidence();
    this.emit({ type: "error", message: stablePipelineReason(reason), diagnostic: { providerEvent: "provider-error", terminalEvent: "provider-error", failureBucket: "unknown-provider-error" } });
  }

  close() {
    if (this.closed) return;
    const turn = this.activeTurn;
    if (turn) turn.abortController.abort("closed");
    this.activeTurn = null;
    this.playbackTail = null;
    this.resetSpeechEvidence();
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

module.exports = { MAX_SPEECH_SEGMENTS, MIN_FINAL_SPEECH_MS, MIN_PARTIAL_SPEECH_MS, ThreeStageCompanionProvider, classifyRecognizedBargeIn, comparisonText, consistentPartial, isExplicitBargeIn, stablePipelineReason };
