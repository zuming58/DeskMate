const { CompanionSpeechSegmenter, cleanVisibleText } = require("./companion-speech-segmenter.cjs");

const MAX_SPEECH_SEGMENTS = 12;
const TRUNCATED_RESPONSE_CLOSING = "回答有点长，我先说到这里。";
const BARGE_IN_FILLERS = new Set(["嗯", "啊", "呃", "哦", "诶", "哎", "喂", "嗯嗯", "啊啊", "哦哦"]);
const EXPLICIT_BARGE_IN = /(停下|停一下|停下来|先停|听一下|先听我说|暂停|暂停播放|等等|等一下|等一等|住嘴|闭嘴|别讲话|不要讲话|别说话|不要说话|先别说|先别讲|安静|别说了|别讲了|打住|我来说|让我说|换个问题)/;
const NON_SPEECH_LABEL = /^(?:掌声|拍手|拍手声|咳嗽|咳嗽声|噪音|杂音|音乐|背景音)$/;
const MIN_PARTIAL_SPEECH_MS = 500;
const MIN_FINAL_SPEECH_MS = 900;
const MIN_NON_EXPLICIT_BARGE_LENGTH = 5;
const MIN_SPARSE_FINAL_SPEECH_MS = 1200;
const MIN_SPARSE_FINAL_LENGTH = 8;
const DEFAULT_POST_PLAYBACK_ECHO_GRACE_MS = 6500;
const DEFAULT_BARGE_FINAL_RECOVERY_MS = 5000;

function comparisonText(value) {
  return cleanVisibleText(value, 16384).normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[^\p{L}\p{N}]+/gu, "");
}

// Keep internal punctuation: 1.5 and 15 are different instructions.
function draftTextKey(value) {
  return cleanVisibleText(value).normalize('NFKC').trim().toLowerCase().replace(/[。！？.!?]+$/u, '').replace(/\s+/g, ' ');
}

function classifyRecognizedBargeIn(candidate, assistantText = "") {
  const normalized = comparisonText(candidate);
  if (!normalized || BARGE_IN_FILLERS.has(normalized) || NON_SPEECH_LABEL.test(normalized)) return Object.freeze({ accepted: false, reason: "weak" });
  const meaningfulLength = [...normalized].length;
  const explicitInterrupt = EXPLICIT_BARGE_IN.test(normalized);
  if (meaningfulLength < MIN_NON_EXPLICIT_BARGE_LENGTH && !explicitInterrupt) return Object.freeze({ accepted: false, reason: "weak" });
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

function speechHypothesesAgree(previousValue, finalValue) {
  const previous = comparisonText(previousValue);
  const final = comparisonText(finalValue);
  if (previous.length < MIN_NON_EXPLICIT_BARGE_LENGTH || final.length < MIN_NON_EXPLICIT_BARGE_LENGTH) return false;
  if (previous.includes(final) || final.includes(previous)) return true;
  const previousBigrams = new Set(Array.from({ length: previous.length - 1 }, (_, index) => previous.slice(index, index + 2)));
  const finalBigrams = new Set(Array.from({ length: final.length - 1 }, (_, index) => final.slice(index, index + 2)));
  const overlap = [...previousBigrams].filter((gram) => finalBigrams.has(gram)).length;
  return overlap / Math.max(1, Math.min(previousBigrams.size, finalBigrams.size)) >= 0.5;
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
  constructor({ asrFactory, modelFactory, ttsFactory, announcementOnly = false, shouldBypassModel = () => false, preemptive = false, onEvent = () => {}, now = Date.now, postPlaybackEchoGraceMs = DEFAULT_POST_PLAYBACK_ECHO_GRACE_MS, bargeFinalRecoveryMs = DEFAULT_BARGE_FINAL_RECOVERY_MS, schedule = setTimeout, cancelSchedule = clearTimeout } = {}) {
    if (![asrFactory, modelFactory, ttsFactory].every((value) => typeof value === "function")) throw new Error("three-stage-provider-factory-required");
    this.asrFactory = asrFactory;
    this.announcementOnly = announcementOnly === true;
    this.asrAudioMs = 0;
    this.modelFactory = modelFactory;
    this.ttsFactory = ttsFactory;
    this.shouldBypassModel = shouldBypassModel;
    this.onEvent = onEvent;
    this.now = now;
    this.postPlaybackEchoGraceMs = Math.max(1500, Math.min(12000, Number(postPlaybackEchoGraceMs) || DEFAULT_POST_PLAYBACK_ECHO_GRACE_MS));
    this.bargeFinalRecoveryMs = Math.max(2000, Math.min(6000, Number(bargeFinalRecoveryMs) || DEFAULT_BARGE_FINAL_RECOVERY_MS));
    this.schedule = schedule;
    this.cancelSchedule = cancelSchedule;
    this.asr = null;
    this.model = null;
    this.tts = null;
    this.closed = false;
    this.ready = false;
    this.generation = 1;
    this.turnSequence = 0;
    this.activeTurn = null;
    this.playbackTail = null;
    this.postPlaybackEchoTail = null;
    this.postPlaybackEchoTimer = null;
    this.pendingBargeInFinal = null;
    this.pendingBargeInTimer = null;
    this.settledBargeInItemId = "";
    this.settledBargeInTimer = null;
    this.speechEvidence = { active: false, itemId: "", audioStartMs: null, audioEndMs: null, receivedStartAt: null, receivedStopAt: null, lastPartial: "", lastConfirmedPartial: "", stablePartials: 0, meaningfulPartials: 0 };
    this.utteranceStartedAt = null;
    this.lastFinal = { text: "", at: 0 };
    this.preemptive = preemptive === true;
    this.draft = null;
    this.draftTimer = null;
    this.draftAttempts = 0;
    this.turnHistory = [];
    this.counters = {
      asrPartials: 0, asrFinals: 0, duplicateFinals: 0, trustedBypasses: 0,
      modelRequests: 0, assistantDeltas: 0, ttsRequests: 0, ttsAudioChunks: 0,
      turnsCompleted: 0, cancellations: 0, errors: 0,
      bargeInCandidates: 0, bargeInsAccepted: 0, bargeInsRejectedEcho: 0, bargeInsRejectedWeak: 0,
      bargeSpeechStarts: 0, bargeInsRejectedUnstable: 0, postPlaybackEchoDrops: 0,
      postPlaybackFreshSpeechStarts: 0, postPlaybackEchoItemDrops: 0, postPlaybackEchoTextDrops: 0,
      bargeFinalTimeouts: 0, bargeFinalRecoveries: 0, lateBargeFinalDrops: 0,
      bargeInsAcceptedExplicit: 0, bargeInsAcceptedFinal: 0, bargePartialsDeferred: 0, bargeFinalsRejectedInconsistent: 0,
      draftsStarted: 0, draftsReused: 0, draftsCancelled: 0, modelRecoveries: 0,
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
      postPlaybackEchoTailActive: Boolean(this.postPlaybackEchoTail),
      awaitingBargeFinal: Boolean(this.pendingBargeInFinal),
      context: this.model?.diagnostics?.() || {},
      counters: Object.freeze({ ...this.counters }),
      lastTiming: Object.freeze({ ...this.lastTiming }),
      turnHistory: this.turnHistory.map(row => ({ ...row, timing: { ...row.timing }, modelTiming: { ...row.modelTiming }, failure: row.failure ? { ...row.failure } : null })),
      preemptiveEnabled: this.preemptive,
    });
  }

  async connect() {
    if (this.closed) return { ok: false, reason: "three-stage-session-failed" };
    const generation = this.generation;
    try {
      if (!this.announcementOnly) this.model = this.modelFactory();
      this.tts = this.ttsFactory();
      if (!this.announcementOnly) this.asr = this.asrFactory({ onEvent: (event) => this.handleAsrEvent(event, generation) });
      await Promise.all([this.asr?.connect(), this.tts.connect()]);
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
    const accepted = this.asr?.sendAudio?.(value) === true;
    // ASR input contract: 16 kHz mono signed 16-bit PCM. This is a media
    // boundary, not wall time; delayed VAD events can arrive after drain.
    if (accepted) this.asrAudioMs += Buffer.from(value || []).length / 32;
    return accepted;
  }

  cancelDraft() {
    if (this.draftTimer) this.cancelSchedule(this.draftTimer);
    this.draftTimer = null;
    const draft = this.draft;
    this.draft = null;
    if (draft) {
      this.counters.draftsCancelled += 1;
      draft.token.cancelled = true;
      draft.abortController.abort('superseded');
    }
  }

  considerDraft(event) {
    if (!this.preemptive || this.bargeContext() || !this.model?.prepareDraft) return;
    const text = cleanVisibleText(event.text).trim();
    if (this.draft && draftTextKey(this.draft.text) === draftTextKey(text) && this.draft.itemId === String(event.itemId || '')) return;
    this.cancelDraft();
    if (comparisonText(text).length < 5 || !classifyRecognizedBargeIn(text).accepted || this.draftAttempts >= 3) return;
    try { if (this.shouldBypassModel(text)) return; } catch { return; }
    this.draftTimer = this.schedule(() => {
      this.draftTimer = null;
      if (this.closed || this.bargeContext()) return;
      let token;
      try { token = this.model.prepareDraft(text); } catch { return; }
      if (!token) return;
      const draft = { text, itemId: String(event.itemId || ''), token, startedAt: this.now(), firstDeltaAt: null, answer: '', abortController: new AbortController(), deliver: null };
      this.draft = draft;
      this.draftAttempts += 1;
      this.counters.draftsStarted += 1;
      this.counters.modelRequests += 1;
      // The settled wrapper owns rejection even if the candidate is discarded.
      draft.promise = this.model.streamTurn({ text, draft: token, signal: draft.abortController.signal, onDelta: (delta, fullText) => {
        if (draft.abortController.signal.aborted || this.closed) return;
        draft.firstDeltaAt ??= this.now();
        draft.answer = cleanVisibleText(fullText);
        draft.deliver?.(delta, fullText);
      } }).then(result => ({ result }), error => ({ error }));
    }, 500);
    this.draftTimer?.unref?.();
  }

  takeDraft(text, itemId) {
    if (this.draftTimer) this.cancelSchedule(this.draftTimer);
    this.draftTimer = null;
    const draft = this.draft;
    this.draftAttempts = 0;
    if (draft && draftTextKey(draft.text) === draftTextKey(text) && (!draft.itemId || draft.itemId === itemId) && draft.token.commit(text)) {
      this.draft = null;
      this.counters.draftsReused += 1;
      return draft;
    }
    this.cancelDraft();
    return null;
  }

  recordTurn(turn, outcome, failure = null) {
    if (!turn || turn.recorded) return;
    turn.recorded = true;
    turn.timing.turnCompletedMs = Math.max(0, this.now() - turn.startedAt);
    this.turnHistory.push({ outcome, kind: turn.kind, timing: turn.timing, modelTiming: turn.kind === 'model' ? { ...this.model?.diagnostics?.()?.timings } : {}, failure });
    if (this.turnHistory.length > 20) this.turnHistory.shift();
  }

  bargeContext() {
    if (this.activeTurn) return Object.freeze({ assistantText: this.activeTurn.assistantText, hadTts: Boolean(this.activeTurn.ttsStarted && !this.activeTurn.ttsEnded) });
    if (this.playbackTail) return Object.freeze({ assistantText: this.playbackTail.assistantText, hadTts: true });
    return null;
  }

  resetSpeechEvidence() {
    this.speechEvidence = { active: false, itemId: "", audioStartMs: null, audioEndMs: null, receivedStartAt: null, receivedStopAt: null, lastPartial: "", lastConfirmedPartial: "", stablePartials: 0, meaningfulPartials: 0 };
  }

  clearPendingBargeInFinal() {
    if (this.pendingBargeInTimer) this.cancelSchedule(this.pendingBargeInTimer);
    this.pendingBargeInTimer = null;
    const pending = this.pendingBargeInFinal;
    this.pendingBargeInFinal = null;
    return pending;
  }

  clearSettledBargeInItem() {
    if (this.settledBargeInTimer) this.cancelSchedule(this.settledBargeInTimer);
    this.settledBargeInTimer = null;
    this.settledBargeInItemId = "";
  }

  rememberSettledBargeInItem(itemId = "") {
    this.clearSettledBargeInItem();
    const value = String(itemId || "").slice(0, 160);
    if (!value) return;
    this.settledBargeInItemId = value;
    this.settledBargeInTimer = this.schedule(() => this.clearSettledBargeInItem(), this.bargeFinalRecoveryMs);
    this.settledBargeInTimer?.unref?.();
  }

  dropSettledBargeInEvent(event = {}) {
    if (!this.settledBargeInItemId || !["partial", "final"].includes(event.type)) return false;
    const itemId = String(event.itemId || "").slice(0, 160);
    if (!itemId || itemId !== this.settledBargeInItemId) return false;
    this.counters.lateBargeFinalDrops += 1;
    if (event.type === "final") this.clearSettledBargeInItem();
    return true;
  }

  armPendingBargeInFinal({ text = "", confirmedText = "", itemId = "" } = {}, generation = this.generation) {
    this.clearPendingBargeInFinal();
    const confirmed = cleanVisibleText(confirmedText).trim();
    const current = cleanVisibleText(text).trim();
    const recoveryText = comparisonText(confirmed).length >= 5 ? confirmed : comparisonText(current).length >= 5 ? current : "";
    const pending = Object.freeze({ generation, itemId: String(itemId || "").slice(0, 160), recoveryText });
    this.pendingBargeInFinal = pending;
    this.pendingBargeInTimer = this.schedule(() => {
      if (this.pendingBargeInFinal !== pending) return;
      this.pendingBargeInFinal = null;
      this.pendingBargeInTimer = null;
      if (this.closed || generation !== this.generation) return;
      this.counters.bargeFinalTimeouts += 1;
      if (!pending.recoveryText) {
        this.emit({ type: "barge.final-missing", diagnostic: { providerEvent: "other" } });
        return;
      }
      this.counters.bargeFinalRecoveries += 1;
      this.handleAsrEvent({ type: "final", text: pending.recoveryText, itemId: pending.itemId, bargeInRecovery: true }, generation);
      this.rememberSettledBargeInItem(pending.itemId);
    }, this.bargeFinalRecoveryMs);
    this.pendingBargeInTimer?.unref?.();
  }

  clearPostPlaybackEchoTail() {
    if (this.postPlaybackEchoTimer) this.cancelSchedule(this.postPlaybackEchoTimer);
    this.postPlaybackEchoTimer = null;
    this.postPlaybackEchoTail = null;
  }

  armPostPlaybackEchoTail(assistantText = "") {
    this.clearPostPlaybackEchoTail();
    const tail = Object.freeze({
      assistantText: cleanVisibleText(assistantText),
      itemId: this.speechEvidence.active ? String(this.speechEvidence.itemId || "").slice(0, 160) : "",
      audioBoundaryMs: this.asrAudioMs,
    });
    this.postPlaybackEchoTail = tail;
    this.postPlaybackEchoTimer = this.schedule(() => {
      if (this.postPlaybackEchoTail === tail) this.postPlaybackEchoTail = null;
      this.postPlaybackEchoTimer = null;
    }, this.postPlaybackEchoGraceMs);
    this.postPlaybackEchoTimer?.unref?.();
  }

  isPostPlaybackEchoEvent(event = {}) {
    const tail = this.postPlaybackEchoTail;
    if (!tail || !["partial", "final"].includes(event.type)) return false;
    const itemId = String(event.itemId || "").slice(0, 160);
    if (tail.itemId && itemId) return itemId === tail.itemId;
    return classifyRecognizedBargeIn(event.text, tail.assistantText).reason === "echo";
  }

  dropPostPlaybackEcho(event = {}) {
    if (!this.isPostPlaybackEchoEvent(event)) return false;
    this.counters.postPlaybackEchoDrops += 1;
    const itemMatch = this.postPlaybackEchoTail.itemId && event.itemId && String(event.itemId) === this.postPlaybackEchoTail.itemId;
    this.counters[itemMatch ? "postPlaybackEchoItemDrops" : "postPlaybackEchoTextDrops"] += 1;
    if (event.type === "final") this.clearPostPlaybackEchoTail();
    return true;
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
    if (confirmed) this.speechEvidence.lastConfirmedPartial = confirmed;
    const observedMs = this.speechEvidence.receivedStartAt === null ? 0 : Math.max(0, this.now() - this.speechEvidence.receivedStartAt);
    const linguisticEvidence = confirmed.length >= 5 || (this.speechEvidence.meaningfulPartials >= 2 && normalized.length >= 5);
    return linguisticEvidence && observedMs >= MIN_PARTIAL_SPEECH_MS;
  }

  finalSpeechEvidence(text, itemId = "") {
    if (!this.matchingSpeechEvidence(itemId)) return Object.freeze({ accepted: false, reason: "item-mismatch" });
    const normalized = comparisonText(text);
    const duration = this.speechEvidence.audioStartMs !== null && this.speechEvidence.audioEndMs !== null
      ? Math.max(0, this.speechEvidence.audioEndMs - this.speechEvidence.audioStartMs)
      : 0;
    if (normalized.length < MIN_NON_EXPLICIT_BARGE_LENGTH || duration < MIN_FINAL_SPEECH_MS) return Object.freeze({ accepted: false, reason: "unstable" });
    if (this.speechEvidence.lastConfirmedPartial && speechHypothesesAgree(this.speechEvidence.lastConfirmedPartial, normalized)) return Object.freeze({ accepted: true, reason: "confirmed-partial" });
    if (this.speechEvidence.stablePartials >= 2 && speechHypothesesAgree(this.speechEvidence.lastPartial, normalized)) return Object.freeze({ accepted: true, reason: "stable-partials" });
    if (this.speechEvidence.meaningfulPartials === 0 && normalized.length >= MIN_SPARSE_FINAL_LENGTH && duration >= MIN_SPARSE_FINAL_SPEECH_MS) return Object.freeze({ accepted: true, reason: "sparse-final" });
    return Object.freeze({ accepted: false, reason: "inconsistent" });
  }

  handleAsrEvent(event = {}, generation = this.generation) {
    if (this.closed || generation !== this.generation) return;
    if (event.type === "speech.started") {
      const nextItemId = String(event.itemId || "").slice(0, 160);
      const tail = this.postPlaybackEchoTail;
      const audioStart = Number(event.audioStartMs);
      if (tail && event.audioStartMs != null && Number.isFinite(audioStart) && tail.audioBoundaryMs > 0 && audioStart >= tail.audioBoundaryMs) {
        this.clearPostPlaybackEchoTail();
        this.counters.postPlaybackFreshSpeechStarts += 1;
      }
      if (this.draftTimer) this.cancelSchedule(this.draftTimer);
      this.draftTimer = null;
      // A new ASR item cannot inherit a preceding item's private candidate.
      if (this.draft && this.draft.itemId && nextItemId !== this.draft.itemId) this.cancelDraft();
      const bargeContext = this.bargeContext();
      if (this.pendingBargeInFinal?.itemId && nextItemId && this.pendingBargeInFinal.itemId !== nextItemId) this.clearPendingBargeInFinal();
      this.resetSpeechEvidence();
      this.speechEvidence.active = true;
      this.speechEvidence.itemId = nextItemId;
      this.speechEvidence.audioStartMs = Math.max(0, Number(event.audioStartMs) || 0);
      this.speechEvidence.receivedStartAt = this.now();
      if (bargeContext) this.counters.bargeSpeechStarts += 1;
      else this.emit({ type: "asr.speech-started", diagnostic: { providerEvent: "other" } });
      return;
    }
    if (event.type === "speech.stopped") {
      if (this.matchingSpeechEvidence(event.itemId)) {
        this.speechEvidence.audioEndMs = Math.max(0, Number(event.audioEndMs) || 0);
        this.speechEvidence.receivedStopAt = this.now();
      }
      return;
    }
    if (this.dropSettledBargeInEvent(event)) return;
    if (this.dropPostPlaybackEcho(event)) return;
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
          const explicit = isExplicitBargeIn(text) && this.matchingSpeechEvidence(event.itemId);
          if (explicit) {
            this.counters.bargeInsAccepted += 1;
            this.counters.bargeInsAcceptedExplicit += 1;
            this.emit({ type: "barge.start", hadTts: bargeContext.hadTts, diagnostic: { providerEvent: "other" } });
            this.armPendingBargeInFinal({ text, confirmedText: event.confirmedText, itemId: event.itemId }, generation);
            this.interrupt({ preservePendingBargeIn: true });
          } else {
            this.recordPartialEvidence(text, event.itemId, event.confirmedText);
            this.counters.bargePartialsDeferred += 1;
          }
        } else if (classification.reason === "echo") this.counters.bargeInsRejectedEcho += 1;
        else this.counters.bargeInsRejectedWeak += 1;
      }
      this.emit({ type: "asr.partial", text });
      this.considerDraft(event);
      return;
    }
    if (event.type === "final") {
      const text = cleanVisibleText(event.text).trim();
      if (!text) return;
      const at = this.now();
      const pendingBarge = this.pendingBargeInFinal;
      const itemId = String(event.itemId || "").slice(0, 160);
      const matchesPendingBarge = Boolean(pendingBarge && (!pendingBarge.itemId || !itemId || pendingBarge.itemId === itemId));
      let bargeIn = event.bargeInRecovery === true || matchesPendingBarge;
      if (matchesPendingBarge) this.clearPendingBargeInFinal();
      const bargeContext = this.bargeContext();
      if (bargeContext) {
        this.counters.bargeInCandidates += 1;
        const classification = classifyRecognizedBargeIn(text, bargeContext.assistantText);
        if (!classification.accepted) {
          if (classification.reason === "echo") this.counters.bargeInsRejectedEcho += 1;
          else this.counters.bargeInsRejectedWeak += 1;
          this.resetSpeechEvidence();
          return;
        }
        const explicit = isExplicitBargeIn(text) && this.matchingSpeechEvidence(event.itemId);
        const evidence = explicit ? Object.freeze({ accepted: true, reason: "explicit" }) : this.finalSpeechEvidence(text, event.itemId);
        const confirmed = evidence.accepted;
        if (!confirmed) {
          this.counters.bargeInsRejectedUnstable += 1;
          if (evidence.reason === "inconsistent") this.counters.bargeFinalsRejectedInconsistent += 1;
          this.resetSpeechEvidence();
          return;
        }
        this.counters.bargeInsAccepted += 1;
        if (explicit) this.counters.bargeInsAcceptedExplicit += 1;
        else this.counters.bargeInsAcceptedFinal += 1;
        bargeIn = true;
        this.emit({ type: "barge.start", hadTts: bargeContext.hadTts, diagnostic: { providerEvent: "other" } });
        this.interrupt();
      }
      if (this.lastFinal.text === text && at - this.lastFinal.at < 3000) {
        this.counters.duplicateFinals += 1;
        return;
      }
      this.lastFinal = { text, at };
      const receivedStopAt = this.speechEvidence.receivedStopAt;
      this.resetSpeechEvidence();
      this.counters.asrFinals += 1;
      const hadPartial = this.utteranceStartedAt !== null;
      const utteranceStartedAt = this.utteranceStartedAt ?? at;
      this.utteranceStartedAt = null;
      this.lastTiming = {
        speechStarted: 0,
        firstAsrPartialMs: hadPartial ? this.lastTiming.firstAsrPartialMs : null,
        asrFinalMs: Math.max(0, at - utteranceStartedAt),
        speechStopToFinalMs: receivedStopAt == null ? null : Math.max(0, at - receivedStopAt),
        playbackQueuedMs: null,
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
        this.cancelDraft();
        this.draftAttempts = 0;
        this.counters.trustedBypasses += 1;
        return;
      }
      const draft = this.takeDraft(text, itemId);
      void this.runModelTurn(text, generation, utteranceStartedAt, draft);
      return;
    }
    if (event.type === "error") this.fail("three-stage-asr-unavailable", generation);
    else if (event.type === "closed" && this.ready) this.emit({ type: "connection.closed", diagnostic: { providerEvent: "transport-close", terminalEvent: "transport-close" } });
  }

  newTurn(kind = "model", startedAt = this.now()) {
    if (kind === 'direct') this.lastTiming = Object.fromEntries(Object.keys(this.lastTiming).map(key => [key, null]));
    this.lastTiming.playbackQueuedMs = null;
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
      timing: this.lastTiming,
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
        turn.timing.firstTtsRequestMs = Math.max(0, this.now() - turn.startedAt);
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
            if (turn.timing.firstTtsAudioMs === null) turn.timing.firstTtsAudioMs = Math.max(0, this.now() - turn.startedAt);
            // Receipt is not physical speaker playback. Keep playbackStartedMs
            // unknown; the controller separately reports renderer queue receipt.
          }
          this.counters.ttsAudioChunks += 1;
          this.emit({ type: "audio", audio: Buffer.from(audio || []), turnId: turn.id });
        },
      });
    });
    // A TTS failure may precede model completion; never leave it unobserved.
    turn.speechChain.catch(() => {});
    return true;
  }

  async runModelTurn(text, generation, startedAt = this.now(), draft = null) {
    if (this.closed || generation !== this.generation || this.activeTurn) return;
    const turn = this.newTurn("model", startedAt);
    if (!draft) this.counters.modelRequests += 1;
    turn.timing.modelRequestStartedMs = Math.max(0, (draft?.startedAt ?? this.now()) - turn.startedAt);
    if (draft?.firstDeltaAt != null) turn.timing.firstAssistantDeltaMs = Math.max(0, draft.firstDeltaAt - turn.startedAt);
    if (draft) turn.abortController.signal.addEventListener('abort', () => { draft.token.cancelled = true; draft.abortController.abort('interrupted'); }, { once: true });
    const delayedNotice = this.schedule(() => {
      if (this.isCurrentTurn(turn) && !turn.assistantText) this.emit({ type: 'model.status', status: 'waiting' });
    }, 3000);
    delayedNotice?.unref?.();
    turn.abortController.signal.addEventListener('abort', () => this.cancelSchedule(delayedNotice), { once: true });
    try {
      const onDelta = (delta, fullText) => {
          if (!this.isCurrentTurn(turn)) return;
          if (turn.timing.firstAssistantDeltaMs === null) turn.timing.firstAssistantDeltaMs = Math.max(0, this.now() - turn.startedAt);
          this.counters.assistantDeltas += 1;
          turn.assistantText = cleanVisibleText(fullText);
          this.emit({ type: "chat.partial", text: cleanVisibleText(delta), fullText: turn.assistantText });
          for (const segment of turn.segmenter.push(delta)) this.queueSpeech(turn, segment);
      };
      let result;
      if (draft) {
        draft.deliver = onDelta;
        if (draft.answer) onDelta(draft.answer, draft.answer);
        const settled = await draft.promise;
        if (settled.error) throw settled.error;
        result = settled.result;
      } else result = await this.model.streamTurn({ text, signal: turn.abortController.signal, onDelta,
        onStatus: status => { if (this.isCurrentTurn(turn)) this.emit({ type: 'model.status', status: status.type }); },
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
      this.recordTurn(turn, 'failed', error.failure || null);
      if (error.recoverable && !turn.ttsStarted) {
        this.counters.errors += 1;
        this.counters.modelRecoveries += 1;
        turn.abortController.abort('failed');
        this.activeTurn = null;
        this.emit({ type: 'turn.failed', message: stablePipelineReason(error), failureClass: error.failure?.failureClass });
        return;
      }
      this.fail(stablePipelineReason(error), generation);
    } finally {
      this.cancelSchedule(delayedNotice);
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
    this.recordTurn(turn, 'completed');
    this.counters.turnsCompleted += 1;
    this.playbackTail = turn.ttsStarted ? Object.freeze({ assistantText: turn.assistantText, kind: turn.kind, id: turn.id, startedAt: turn.startedAt, timing: turn.timing }) : null;
    this.activeTurn = null;
    this.clearPendingBargeInFinal();
    this.emit({ type: "tts.end", diagnostic: { providerEvent: "tts-end" } });
  }

  playbackDrained() {
    const tail = this.playbackTail;
    const hadTail = Boolean(tail);
    if (tail) this.armPostPlaybackEchoTail(tail.assistantText);
    this.playbackTail = null;
    this.resetSpeechEvidence();
    return hadTail;
  }

  playbackQueued(turnId) {
    const turn = this.activeTurn || this.playbackTail;
    if (this.closed || !turn || turn.id !== turnId || turn.timing.playbackQueuedMs != null) return false;
    turn.timing.playbackQueuedMs = Math.max(0, this.now() - turn.startedAt);
    return true;
  }

  speakText(value) {
    const text = cleanVisibleText(value, 240).trim();
    if (!this.ready || this.closed || !text || this.activeTurn) return false;
    this.cancelDraft();
    this.draftAttempts = 0;
    void this.runDirectSpeech(text, this.generation);
    return true;
  }

  sayHello(value) { return this.speakText(value); }

  interrupt({ preservePendingBargeIn = false } = {}) {
    this.cancelDraft();
    const turn = this.activeTurn;
    const hadPlaybackTail = Boolean(this.playbackTail);
    if (!turn && !hadPlaybackTail) {
      if (!preservePendingBargeIn) this.clearPendingBargeInFinal();
      return false;
    }
    this.counters.cancellations += 1;
    if (turn?.kind === "model" || this.playbackTail?.kind === "model") this.model?.interruptResponse?.();
    if (turn) {
      this.recordTurn(turn, 'cancelled');
      turn.abortController.abort("interrupted");
      this.tts?.interrupt?.();
    }
    this.activeTurn = null;
    this.playbackTail = null;
    this.clearPostPlaybackEchoTail();
    if (!preservePendingBargeIn) this.clearPendingBargeInFinal();
    this.resetSpeechEvidence();
    if (turn?.ttsStarted && !turn.ttsEnded) this.emit({ type: "tts.end", diagnostic: { providerEvent: "tts-end" } });
    return true;
  }

  fail(reason, generation = this.generation) {
    if (this.closed || generation !== this.generation) return;
    this.counters.errors += 1;
    const turn = this.activeTurn;
    this.recordTurn(turn, 'failed');
    this.cancelDraft();
    if (turn) turn.abortController.abort("failed");
    this.activeTurn = null;
    this.playbackTail = null;
    this.clearPostPlaybackEchoTail();
    this.clearPendingBargeInFinal();
    this.clearSettledBargeInItem();
    this.resetSpeechEvidence();
    this.emit({ type: "error", message: stablePipelineReason(reason), diagnostic: { providerEvent: "provider-error", terminalEvent: "provider-error", failureBucket: "unknown-provider-error" } });
  }

  close() {
    if (this.closed) return;
    const turn = this.activeTurn;
    this.recordTurn(turn, 'cancelled');
    this.cancelDraft();
    if (turn) turn.abortController.abort("closed");
    this.activeTurn = null;
    this.playbackTail = null;
    this.clearPostPlaybackEchoTail();
    this.clearPendingBargeInFinal();
    this.clearSettledBargeInItem();
    this.resetSpeechEvidence();
    this.pendingBargeInFinal = null;
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

module.exports = { DEFAULT_BARGE_FINAL_RECOVERY_MS, DEFAULT_POST_PLAYBACK_ECHO_GRACE_MS, MAX_SPEECH_SEGMENTS, MIN_FINAL_SPEECH_MS, MIN_NON_EXPLICIT_BARGE_LENGTH, MIN_PARTIAL_SPEECH_MS, MIN_SPARSE_FINAL_LENGTH, MIN_SPARSE_FINAL_SPEECH_MS, ThreeStageCompanionProvider, classifyRecognizedBargeIn, comparisonText, consistentPartial, isExplicitBargeIn, speechHypothesesAgree, stablePipelineReason };
