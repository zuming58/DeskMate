const MAX_AUDIO_CHUNK_BYTES = 64 * 1024;

class UnavailableCompanionAudioSource {
  status() { return { available: false, kind: "easyinput", reason: "easyinput-audio-source-pending" }; }
  async start() { return { ok: false, reason: "easyinput-audio-source-pending" }; }
  async stop() { return { ok: true }; }
}

class UnavailableCompanionAudioSink {
  status() { return { available: false, kind: "easyinput", reason: "easyinput-speaker-contract-not-frozen" }; }
  async start() { return { ok: false, reason: "easyinput-speaker-contract-not-frozen" }; }
  async write() { return false; }
  async drain() { return { ok: false, reason: "easyinput-speaker-contract-not-frozen" }; }
  async interrupt() { return { ok: true }; }
  async stop() { return { ok: true }; }
}

function safeAudioReason(value, fallback = "audio-source-unavailable") {
  const reason = String(value || "");
  return /^[a-z0-9-]{1,120}$/.test(reason) ? reason : fallback;
}

class PrestartFallbackCompanionAudioSource {
  constructor({ primary, fallback, requestedSource = "easyinput", onSelection = () => {} } = {}) {
    this.primary = primary;
    this.fallback = fallback;
    this.requestedSource = requestedSource;
    this.onSelection = onSelection;
    this.active = null;
    this.fallbackReason = "";
  }

  status() {
    const primaryStatus = this.primary?.status?.() || { available: false, reason: "audio-source-unavailable" };
    const fallbackStatus = this.fallback?.status?.() || { available: false, reason: "audio-source-unavailable" };
    const adapter = this.active || this.primary;
    const value = adapter?.status?.() || primaryStatus;
    const canStart = this.active ? Boolean(value.available) : Boolean(primaryStatus.available || fallbackStatus.available);
    const reason = canStart ? "" : safeAudioReason(fallbackStatus.reason || primaryStatus.reason);
    return {
      ...value,
      available: canStart,
      reason,
      requestedSource: this.requestedSource,
      activeSource: this.active === this.fallback ? "computer" : this.active ? this.requestedSource : "",
      fallback: this.fallbackReason ? { from: this.requestedSource, to: "computer", reason: this.fallbackReason } : null,
    };
  }

  async start(handlers = {}) {
    if (this.active) return { ok: false, reason: "audio-source-session-active" };
    const primaryStatus = this.primary?.status?.() || { available: false, reason: "audio-source-unavailable" };
    let result;
    try { result = primaryStatus.available ? await this.primary.start(handlers) : { ok: false, reason: primaryStatus.reason || "audio-source-unavailable" }; }
    catch (error) { result = { ok: false, reason: safeAudioReason(error?.message) }; }
    if (result?.ok) {
      this.active = this.primary;
      this.fallbackReason = "";
      this.onSelection(this.status());
      return result;
    }
    this.fallbackReason = safeAudioReason(result?.reason || primaryStatus.reason);
    result = await this.fallback.start(handlers);
    if (!result?.ok) return result;
    this.active = this.fallback;
    this.onSelection(this.status());
    return { ...result, fallback: { from: this.requestedSource, to: "computer", reason: this.fallbackReason } };
  }

  async stop() {
    const adapter = this.active;
    this.active = null;
    if (adapter?.stop) await adapter.stop();
    return { ok: true };
  }
}

class SimulatedCompanionAudioSource {
  constructor() { this.active = false; this.handlers = null; }
  status() { return { available: true, kind: "simulated" }; }
  async start(handlers = {}) { this.active = true; this.handlers = handlers; return { ok: true }; }
  push(value) {
    const chunk = Buffer.from(value || []);
    if (!this.active || !chunk.length || chunk.length > MAX_AUDIO_CHUNK_BYTES) return false;
    this.handlers?.onAudio?.(chunk);
    return true;
  }
  fail(reason = "simulated-audio-source-error") { if (this.active) this.handlers?.onError?.(new Error(reason)); }
  async stop() { this.active = false; this.handlers = null; return { ok: true }; }
}

class SimulatedCompanionAudioSink {
  constructor() { this.active = false; this.chunks = []; this.interruptions = 0; }
  status() { return { available: true, kind: "simulated" }; }
  async start() { this.active = true; return { ok: true }; }
  async write(value) { const chunk = Buffer.from(value || []); if (!this.active || !chunk.length || chunk.length > MAX_AUDIO_CHUNK_BYTES) return false; this.chunks.push(chunk); return true; }
  async drain() { return { ok: true }; }
  async interrupt() { this.interruptions += 1; this.chunks = []; return { ok: true }; }
  async stop() { this.active = false; this.chunks = []; return { ok: true }; }
}

module.exports = {
  MAX_AUDIO_CHUNK_BYTES,
  SimulatedCompanionAudioSink,
  SimulatedCompanionAudioSource,
  PrestartFallbackCompanionAudioSource,
  UnavailableCompanionAudioSink,
  UnavailableCompanionAudioSource,
};
