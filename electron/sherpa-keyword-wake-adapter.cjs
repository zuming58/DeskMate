const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");
const { pinyin } = require("pinyin-pro");

const SHERPA_WAKE_VERSION = "sherpa-onnx-kws-v1";
const REQUIRED_MODEL_FILES = Object.freeze({
  encoder: "encoder.int8.onnx",
  decoder: "decoder.int8.onnx",
  joiner: "joiner.int8.onnx",
  tokens: "tokens.txt",
});
const PINYIN_INITIALS = Object.freeze(["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"]);

function defaultModelDirectory() {
  if (process.resourcesPath && !process.defaultApp) return path.join(process.resourcesPath, "wake-model");
  return path.resolve(__dirname, "..", "resources", "wake-model");
}

function modelPaths(directory = defaultModelDirectory()) {
  return Object.fromEntries(Object.entries(REQUIRED_MODEL_FILES).map(([key, filename]) => [key, path.join(directory, filename)]));
}

function cleanWakePhrases(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 64)).filter(Boolean))].slice(0, 8);
}

function splitPinyinSyllable(value) {
  const syllable = String(value || "").trim().toLowerCase();
  if (!syllable) return [];
  const initial = PINYIN_INITIALS.find((candidate) => syllable.startsWith(candidate)) || "";
  const final = syllable.slice(initial.length);
  return [initial, final].filter(Boolean);
}

function buildKeywordLines(phrases, { pinyinImpl = pinyin, tokenSet } = {}) {
  const lines = [];
  const seen = new Set();
  for (const phrase of cleanWakePhrases(phrases)) {
    const chinese = phrase.replace(/[^\p{Script=Han}]/gu, "");
    if (chinese.length < 2 || chinese.length > 16) continue;
    const syllables = pinyinImpl(chinese, { toneType: "symbol", type: "array" });
    if (!Array.isArray(syllables) || syllables.length !== [...chinese].length) continue;
    const tokens = syllables.flatMap(splitPinyinSyllable);
    if (!tokens.length || (tokenSet && tokens.some((token) => !tokenSet.has(token)))) continue;
    const signature = tokens.join(" ");
    if (seen.has(signature)) continue;
    seen.add(signature);
    lines.push(`${signature} @wake${lines.length + 1}`);
  }
  return lines;
}

function readTokenSet(filename, fsImpl = fs) {
  const text = fsImpl.readFileSync(filename, "utf8");
  return new Set(text.split(/\r?\n/).map((line) => line.trim().split(/\s+/)[0]).filter(Boolean));
}

function pcm16ToFloat32(value) {
  const chunk = Buffer.from(value || []);
  if (!chunk.length || chunk.length > 64 * 1024 || chunk.length % 2 !== 0) return null;
  const samples = new Float32Array(chunk.length / 2);
  for (let index = 0; index < samples.length; index += 1) samples[index] = chunk.readInt16LE(index * 2) / 32768;
  return samples;
}

function hasSignal(samples, threshold = 0.006) {
  if (!samples?.length) return false;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length) >= threshold;
}

class SherpaKeywordWakeWordAdapter {
  constructor({
    platform = process.platform,
    engineLoader = () => require("sherpa-onnx-node"),
    fsImpl = fs,
    modelDirectory = defaultModelDirectory(),
    temporaryDirectory = os.tmpdir(),
    onWake = () => {},
    onStatus = () => {},
    onInputStart = () => {},
    onInputStop = () => {},
    now = () => Date.now(),
    wakeDebounceMs = 3000,
    schedule = setTimeout,
    cancelSchedule = clearTimeout,
  } = {}) {
    this.platform = platform;
    this.engineLoader = engineLoader;
    this.fs = fsImpl;
    this.modelDirectory = modelDirectory;
    this.temporaryDirectory = temporaryDirectory;
    this.onWake = onWake;
    this.onStatus = onStatus;
    this.onInputStart = onInputStart;
    this.onInputStop = onInputStop;
    this.now = now;
    this.wakeDebounceMs = Math.max(1000, Math.min(10000, Number(wakeDebounceMs) || 3000));
    this.schedule = schedule;
    this.cancelSchedule = cancelSchedule;
    this.available = platform === "win32";
    this.probed = false;
    this.desiredEnabled = false;
    this.phrases = [];
    this.configurationDirty = false;
    this.listener = null;
    this.engineModule = null;
    this.inputReady = false;
    this.restartTimer = null;
    this.restartAttempts = 0;
    this.lastWakeAt = null;
    this.audioWindowCount = 0;
    this.signalWindowCount = 0;
    this.heardCount = 0;
    this.rejectedCount = 0;
    this.lowConfidenceCount = 0;
    this.wakeCount = 0;
    this.lastHeardAt = null;
    this.lastStatusEmitAt = 0;
    this.reason = this.available ? "wake-word-engine-not-probed" : "wake-word-windows-only";
  }

  status() {
    const enabled = Boolean(this.listener) && this.inputReady;
    return Object.freeze({
      version: SHERPA_WAKE_VERSION,
      available: this.available && this.probed,
      enabled,
      desiredEnabled: this.desiredEnabled,
      reason: this.listener ? this.inputReady ? "listening" : this.reason : this.reason,
      mode: "background-local-keyword",
      inputMode: "deskmate-selected-microphone",
      capsuleVisible: false,
      localOnly: true,
      optInRequired: true,
      visibleMicrophoneRequired: true,
      foregroundAudioOwnerRequired: true,
      audioWindowCount: this.audioWindowCount,
      signalWindowCount: this.signalWindowCount,
      heardCount: this.heardCount,
      rejectedCount: this.rejectedCount,
      lowConfidenceCount: this.lowConfidenceCount,
      wakeCount: this.wakeCount,
      lastHeardAt: this.lastHeardAt,
    });
  }

  emitStatus() { this.onStatus(this.status()); }

  // The dedicated KWS engine always consumes the exact WebRTC microphone chosen
  // by DeskMate. This compatibility method lets the shared main lifecycle keep
  // treating the adapter as an external-audio owner.
  setExternalAudio() { return false; }

  async probe() {
    if (!this.available) return this.status();
    try {
      const files = modelPaths(this.modelDirectory);
      if (Object.values(files).some((filename) => !this.fs.existsSync(filename))) throw new Error("wake-word-model-missing");
      const engine = this.engineLoader();
      if (typeof engine?.KeywordSpotter !== "function") throw new Error("wake-word-engine-unavailable");
      this.engineModule = engine;
      this.probed = true;
      this.reason = "wake-word-disabled";
    } catch (error) {
      this.probed = false;
      this.available = false;
      this.reason = error?.message === "wake-word-model-missing" ? "wake-word-model-missing" : "wake-word-engine-unavailable";
    }
    this.emitStatus();
    return this.status();
  }

  configure({ enabled, phrases } = {}) {
    const nextPhrases = cleanWakePhrases(phrases);
    const phrasesChanged = nextPhrases.length !== this.phrases.length || nextPhrases.some((phrase, index) => phrase !== this.phrases[index]);
    this.desiredEnabled = enabled === true;
    this.phrases = nextPhrases;
    if (phrasesChanged) {
      this.restartAttempts = 0;
      if (this.listener) this.configurationDirty = true;
    }
    if (!this.desiredEnabled) this.reason = "wake-word-disabled";
    this.emitStatus();
    return this.status();
  }

  createListener() {
    const files = modelPaths(this.modelDirectory);
    const tokenSet = readTokenSet(files.tokens, this.fs);
    const keywordLines = buildKeywordLines(this.phrases, { tokenSet });
    if (!keywordLines.length) throw new Error("wake-word-phrase-unsupported");
    const keywordsFile = path.join(this.temporaryDirectory, `.deskmate-wake-${process.pid}-${randomUUID()}.txt`);
    this.fs.writeFileSync(keywordsFile, `${keywordLines.join("\n")}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    try {
      const spotter = new this.engineModule.KeywordSpotter({
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          transducer: { encoder: files.encoder, decoder: files.decoder, joiner: files.joiner },
          tokens: files.tokens,
          numThreads: 1,
          provider: "cpu",
          debug: 0,
        },
        maxActivePaths: 4,
        numTrailingBlanks: 1,
        keywordsScore: 1,
        keywordsThreshold: 0.25,
        keywordsFile,
      });
      return { spotter, stream: spotter.createStream() };
    } finally {
      try { this.fs.unlinkSync(keywordsFile); } catch { /* best-effort ephemeral cleanup */ }
    }
  }

  async start({ phrases, retry = false } = {}) {
    if (!retry) this.restartAttempts = 0;
    if (phrases) this.phrases = cleanWakePhrases(phrases);
    if (!this.probed) await this.probe();
    if (!this.available) return { ok: false, reason: this.reason, status: this.status() };
    if (!this.desiredEnabled) return { ok: false, reason: "wake-word-disabled", status: this.status() };
    if (!this.phrases.length) return { ok: false, reason: "wake-word-phrase-empty", status: this.status() };
    if (this.listener && !this.configurationDirty) return { ok: true, alreadyStarted: true, status: this.status() };
    if (this.listener) await this.pause("wake-word-configuration-changed");
    this.configurationDirty = false;
    this.lastWakeAt = null;
    this.inputReady = false;
    try {
      this.listener = this.createListener();
      this.reason = "wake-word-microphone-starting";
      this.onInputStart();
      this.emitStatus();
      return { ok: true, status: this.status() };
    } catch (error) {
      this.listener = null;
      this.reason = ["wake-word-phrase-unsupported", "wake-word-model-missing"].includes(error?.message) ? error.message : "wake-word-engine-unavailable";
      this.emitStatus();
      return { ok: false, reason: this.reason, status: this.status() };
    }
  }

  markInputReady() {
    if (!this.listener) return false;
    this.inputReady = true;
    this.reason = "listening";
    this.emitStatus();
    return true;
  }

  writeAudio(value) {
    if (!this.listener || !this.inputReady) return false;
    const samples = pcm16ToFloat32(value);
    if (!samples) return false;
    this.audioWindowCount += 1;
    if (hasSignal(samples)) {
      this.signalWindowCount += 1;
      this.lastHeardAt = new Date(this.now()).toISOString();
    }
    try {
      const { spotter, stream } = this.listener;
      stream.acceptWaveform({ sampleRate: 16000, samples });
      let cycles = 0;
      while (spotter.isReady(stream) && cycles < 64) { spotter.decode(stream); cycles += 1; }
      const keyword = String(spotter.getResult(stream)?.keyword || "");
      if (keyword) {
        this.heardCount += 1;
        const at = this.now();
        if (this.lastWakeAt === null || at - this.lastWakeAt >= this.wakeDebounceMs) {
          this.lastWakeAt = at;
          this.wakeCount += 1;
          spotter.reset(stream);
          this.emitStatus();
          this.onWake();
          return true;
        }
        spotter.reset(stream);
      }
      if (this.audioWindowCount % 20 === 0 || (this.signalWindowCount > 0 && this.now() - this.lastStatusEmitAt >= 1000)) {
        this.lastStatusEmitAt = this.now();
        this.emitStatus();
      }
      return true;
    } catch {
      this.reason = "wake-word-engine-failed";
      this.listener = null;
      this.inputReady = false;
      this.onInputStop();
      this.emitStatus();
      this.scheduleRestart();
      return false;
    }
  }

  inputError(reason = "wake-word-microphone-unavailable") {
    if (!this.listener) return false;
    this.inputReady = false;
    this.reason = String(reason || "wake-word-microphone-unavailable").slice(0, 80);
    this.emitStatus();
    return true;
  }

  scheduleRestart() {
    if (!this.desiredEnabled || !this.available || !this.phrases.length || this.restartTimer || this.restartAttempts >= 3) return false;
    this.restartAttempts += 1;
    const delay = 500 * (2 ** (this.restartAttempts - 1));
    this.reason = "wake-word-restarting";
    this.emitStatus();
    this.restartTimer = this.schedule(async () => {
      this.restartTimer = null;
      const result = await this.start({ retry: true });
      if (!result.ok) this.scheduleRestart();
    }, delay);
    return true;
  }

  async pause(reason = "foreground-audio-active") {
    if (this.restartTimer) this.cancelSchedule(this.restartTimer);
    this.restartTimer = null;
    const wasActive = Boolean(this.listener);
    this.listener = null;
    this.inputReady = false;
    this.configurationDirty = false;
    this.reason = String(reason || "foreground-audio-active").slice(0, 80);
    if (wasActive) this.onInputStop();
    this.emitStatus();
    return { ok: true, paused: wasActive, status: this.status() };
  }

  async stop() {
    this.desiredEnabled = false;
    const result = await this.pause("wake-word-disabled");
    return { ...result, alreadyStopped: !result.paused, status: this.status() };
  }
}

module.exports = {
  REQUIRED_MODEL_FILES,
  SHERPA_WAKE_VERSION,
  SherpaKeywordWakeWordAdapter,
  buildKeywordLines,
  cleanWakePhrases,
  defaultModelDirectory,
  hasSignal,
  modelPaths,
  pcm16ToFloat32,
  splitPinyinSyllable,
};
