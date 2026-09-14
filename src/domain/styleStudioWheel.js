export function styleStudioWheelStep(event = {}) {
  const x = Number(event.deltaX) || 0;
  const y = Number(event.deltaY) || 0;
  const delta = Math.abs(y) >= Math.abs(x) ? y : x;
  const threshold = Number(event.deltaMode) === 0 ? 40 : 1;
  return Math.abs(delta) >= threshold ? (delta > 0 ? 1 : -1) : 0;
}

// EasyInput Raw Input and Chromium's legacy wheel event can describe the same
// encoder detent. Prefer source-identified native input and emit one step only.
export class StyleStudioWheelRouter {
  constructor(move, { now = Date.now, setTimer = (fn, delay) => setTimeout(fn, delay), clearTimer = id => clearTimeout(id) } = {}) {
    Object.assign(this, { move, now, setTimer, clearTimer });
    this.pending = [];
    this.native = [];
    this.domApplied = [];
  }

  accept(step, source) {
    if (![-1, 1].includes(step) || !['native', 'dom'].includes(source)) return;
    const at = this.now();
    this.native = this.native.filter(item => at - item.at < 250);
    this.domApplied = this.domApplied.filter(item => at - item.at < 500);
    if (source === 'native') {
      const paired = this.pending.filter(item => item.step === step && at - item.at < 150);
      for (const item of paired) {
        this.clearTimer(item.timer);
        this.pending.splice(this.pending.indexOf(item), 1);
      }
      this.native.push({ step, at });
      this.native = this.native.slice(-64);
      const latePair = this.domApplied.findIndex(item => item.step === step);
      if (latePair >= 0) this.domApplied.splice(latePair, 1);
      else this.move(step);
      return;
    }
    if (this.native.some(item => item.step === step)) return;
    const item = { step, at };
    item.timer = this.setTimer(() => {
      this.pending = this.pending.filter(value => value !== item);
      this.domApplied.push(item);
      this.domApplied = this.domApplied.slice(-64);
      this.move(step);
    }, 150);
    this.pending.push(item);
    if (this.pending.length > 64) {
      const first = this.pending.shift();
      this.clearTimer(first.timer);
    }
  }

  reset() {
    for (const item of this.pending) this.clearTimer(item.timer);
    this.pending = [];
    this.native = [];
    this.domApplied = [];
  }
}
