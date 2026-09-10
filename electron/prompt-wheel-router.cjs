// Windows emits Raw Input and may also deliver a legacy browser wheel event.
// Prefer source-identified board input; briefly defer unclassified DOM fallback.
class PromptWheelRouter {
  constructor(move, { now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    Object.assign(this, { move, now, setTimer, clearTimer }); this.pending = []; this.native = []; this.domApplied = [];
  }
  accept(step, source) {
    if (![-1, 1].includes(step) || !['native', 'dom'].includes(source)) return;
    const at = this.now(); this.native = this.native.filter(e => at - e.at < 250);
    this.domApplied = this.domApplied.filter(e => at - e.at < 500);
    if (source === 'native') {
      const paired = this.pending.filter(e => e.step === step && at - e.at < 150);
      for (const e of paired) { this.clearTimer(e.timer); this.pending.splice(this.pending.indexOf(e), 1); }
      this.native.push({ step, at }); this.native = this.native.slice(-64);
      const latePair = this.domApplied.findIndex(e => e.step === step);
      if (latePair >= 0) this.domApplied.splice(latePair, 1);
      else this.move(step);
      return;
    }
    // Chromium may coalesce several legacy messages into one event (or split one).
    if (this.native.some(e => e.step === step)) return;
    const e = { step, at };
    e.timer = this.setTimer(() => { this.pending = this.pending.filter(p => p !== e); this.domApplied.push(e); this.domApplied = this.domApplied.slice(-64); this.move(step); }, 150);
    this.pending.push(e);
    if (this.pending.length > 64) { const first = this.pending.shift(); this.clearTimer(first.timer); }
  }
  flush() { const pending = this.pending; this.pending = []; for (const e of pending) { this.clearTimer(e.timer); this.move(e.step); } }
  reset() { for (const e of this.pending) this.clearTimer(e.timer); this.pending = []; this.native = []; this.domApplied = []; }
}
module.exports = { PromptWheelRouter };
