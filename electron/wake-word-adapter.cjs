const WAKE_WORD_ADAPTER_VERSION = "wake-word-adapter-v1";

class UnavailableWakeWordAdapter {
  status() {
    return Object.freeze({
      version: WAKE_WORD_ADAPTER_VERSION,
      available: false,
      enabled: false,
      reason: "wake-word-engine-not-integrated",
      localOnly: true,
      optInRequired: true,
      visibleMicrophoneRequired: true,
      foregroundAudioOwnerRequired: true,
    });
  }
  async start() { return { ok: false, reason: "wake-word-engine-not-integrated", status: this.status() }; }
  async stop() { return { ok: true, alreadyStopped: true, status: this.status() }; }
}

module.exports = { WAKE_WORD_ADAPTER_VERSION, UnavailableWakeWordAdapter };
