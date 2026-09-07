const { BailianRealtimeSession } = require("./bailian-realtime.cjs");

function stableAsrError() { return new Error("three-stage-asr-unavailable"); }

class BailianStreamingAsrAdapter {
  constructor({ config, silenceDurationMs = 900, sessionFactory, onEvent = () => {} } = {}) {
    this.config = config || {};
    this.silenceDurationMs = Math.max(500, Math.min(50000, Number(silenceDurationMs) || 900));
    this.sessionFactory = sessionFactory || ((options) => new BailianRealtimeSession(options));
    this.onEvent = onEvent;
    this.session = null;
    this.closed = false;
    this.completedItems = new Set();
  }

  handle(event = {}) {
    if (this.closed) return;
    if (event.kind === "preview") {
      const text = String(event.preview || event.text || "").trim().slice(0, 16384);
      if (text) this.onEvent({ type: "partial", text });
      return;
    }
    if (event.kind === "completed") {
      const itemId = String(event.itemId || "").slice(0, 160);
      if (itemId && this.completedItems.has(itemId)) return;
      if (itemId) this.completedItems.add(itemId);
      const text = String(event.text || "").trim().slice(0, 16384);
      if (text) this.onEvent({ type: "final", text, itemId });
      return;
    }
    if (event.kind === "error") this.onEvent({ type: "error", reason: "three-stage-asr-unavailable" });
    if (event.kind === "closed") this.onEvent({ type: "closed" });
  }

  async connect() {
    if (this.closed) throw stableAsrError();
    try {
      this.session = this.sessionFactory({
        ...this.config,
        silenceDurationMs: this.silenceDurationMs,
        onEvent: (event) => this.handle(event),
      });
      const result = await this.session.start();
      if (!result?.ok) throw stableAsrError();
      return { ok: true };
    } catch {
      this.session?.cancel?.();
      this.session = null;
      throw stableAsrError();
    }
  }

  sendAudio(value) {
    if (this.closed || !this.session) return false;
    return this.session.append(value) === true;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.completedItems.clear();
    this.session?.cancel?.();
    this.session = null;
  }
}

module.exports = { BailianStreamingAsrAdapter };
