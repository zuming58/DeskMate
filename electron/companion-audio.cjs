const MAX_AUDIO_CHUNK_BYTES = 64 * 1024;

class UnavailableCompanionAudioSource {
  status() { return { available: false, kind: "easyinput", reason: "easyinput-audio-source-pending" }; }
  async start() { return { ok: false, reason: "easyinput-audio-source-pending" }; }
  async stop() { return { ok: true }; }
}

class UnavailableCompanionAudioSink {
  status() { return { available: false, kind: "easyinput", reason: "easyinput-audio-sink-pending" }; }
  async start() { return { ok: false, reason: "easyinput-audio-sink-pending" }; }
  async write() { return false; }
  async interrupt() { return { ok: true }; }
  async stop() { return { ok: true }; }
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
  async interrupt() { this.interruptions += 1; this.chunks = []; return { ok: true }; }
  async stop() { this.active = false; this.chunks = []; return { ok: true }; }
}

module.exports = {
  MAX_AUDIO_CHUNK_BYTES,
  SimulatedCompanionAudioSink,
  SimulatedCompanionAudioSource,
  UnavailableCompanionAudioSink,
  UnavailableCompanionAudioSource,
};
