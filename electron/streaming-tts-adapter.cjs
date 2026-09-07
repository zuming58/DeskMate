const { DoubaoRealtimeSession } = require("./doubao-realtime.cjs");

function stableTtsError(reason = "three-stage-tts-unavailable") {
  return new Error(/^three-stage-[a-z-]+$/.test(String(reason || "")) ? reason : "three-stage-tts-unavailable");
}

class DoubaoStreamingTtsAdapter {
  constructor({ config, sessionFactory, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.config = config || {};
    this.sessionFactory = sessionFactory || ((options) => new DoubaoRealtimeSession(options));
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.session = null;
    this.closed = false;
    this.active = null;
    this.sequence = 0;
  }

  handle(event = {}) {
    const active = this.active;
    if (event.type === "error" || event.type === "connection.closed") {
      const session = this.session;
      this.session = null;
      session?.close?.();
      if (active) this.finishActive(stableTtsError());
      return;
    }
    if (!active) return;
    if (event.type === "audio") {
      if (!active.cancelled) active.onAudio(Buffer.from(event.audio || []));
      return;
    }
    if (event.type === "tts.end") {
      this.finishActive(active.cancelled ? stableTtsError("three-stage-tts-cancelled") : null);
      return;
    }
  }

  finishActive(error = null) {
    const active = this.active;
    if (!active) return;
    this.active = null;
    this.clearTimer(active.timer);
    if (error) active.reject(error);
    else active.resolve({ ok: true });
  }

  async connect() {
    if (this.closed) throw stableTtsError();
    if (this.session) return { ok: true };
    try {
      this.session = this.sessionFactory({ config: this.config, onEvent: (event) => this.handle(event) });
      const result = await this.session.connect();
      if (!result?.ok) throw stableTtsError();
      return { ok: true };
    } catch {
      this.session?.close?.();
      this.session = null;
      throw stableTtsError();
    }
  }

  async synthesize(text, { onAudio = () => {}, signal } = {}) {
    const content = String(text || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 240);
    if (!content || this.closed || this.active) throw stableTtsError();
    if (!this.session) await this.connect();
    const sequence = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeoutMs = Math.max(8000, Math.min(30000, 5000 + [...content].length * 300));
      const active = { sequence, onAudio, resolve, reject, cancelled: false, timer: null, abort: null };
      active.abort = () => { active.cancelled = true; };
      if (signal?.aborted) active.cancelled = true;
      else signal?.addEventListener("abort", active.abort, { once: true });
      const finish = (error) => {
        signal?.removeEventListener("abort", active.abort);
        this.finishActive(error);
      };
      active.resolve = (value) => { signal?.removeEventListener("abort", active.abort); resolve(value); };
      active.reject = (error) => { signal?.removeEventListener("abort", active.abort); reject(error); };
      active.timer = this.setTimer(() => finish(stableTtsError()), timeoutMs);
      active.timer?.unref?.();
      this.active = active;
      if (active.cancelled || this.session.speakText(content) !== true) finish(stableTtsError(active.cancelled ? "three-stage-tts-cancelled" : "three-stage-tts-unavailable"));
    });
  }

  interrupt() {
    if (!this.active) return false;
    this.active.cancelled = true;
    this.session?.interrupt?.();
    this.finishActive(stableTtsError("three-stage-tts-cancelled"));
    this.session?.close?.();
    this.session = null;
    return true;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.active) this.finishActive(stableTtsError("three-stage-tts-cancelled"));
    this.session?.close?.();
    this.session = null;
  }
}

module.exports = { DoubaoStreamingTtsAdapter };
