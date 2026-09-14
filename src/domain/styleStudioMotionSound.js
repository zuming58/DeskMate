export const STYLE_STUDIO_MOTION_SOUND = Object.freeze({
  insertDurationSeconds: 0.12,
  pullDurationSeconds: 0.085,
  maxGain: 0.036,
});

export function createStyleStudioMotionSound({
  AudioContextClass = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext,
} = {}) {
  let context = null;
  let disposed = false;

  function ensureContext() {
    if (disposed || !AudioContextClass) return null;
    try { context ||= new AudioContextClass(); }
    catch { return null; }
    return context;
  }

  async function prime() {
    const current = ensureContext();
    if (!current) return false;
    if (current.state === 'suspended' && typeof current.resume === 'function') {
      try { await current.resume(); } catch { return false; }
    }
    return !disposed && current.state !== 'closed';
  }

  function envelope(current, peak, duration) {
    const now = current.currentTime;
    const gain = current.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.min(peak, STYLE_STUDIO_MOTION_SOUND.maxGain), now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    gain.connect(current.destination);
    return { gain, now };
  }

  function scheduleInsert(current) {
    const { gain, now } = envelope(current, 0.026, STYLE_STUDIO_MOTION_SOUND.insertDurationSeconds);
    const slide = current.createOscillator();
    const seat = current.createOscillator();
    slide.type = 'triangle';
    slide.frequency.setValueAtTime(330, now);
    slide.frequency.exponentialRampToValueAtTime(145, now + 0.105);
    seat.type = 'sine';
    seat.frequency.setValueAtTime(112, now + 0.07);
    seat.frequency.exponentialRampToValueAtTime(76, now + 0.12);
    slide.connect(gain); seat.connect(gain);
    slide.start(now); seat.start(now + 0.07);
    slide.stop(now + 0.11); seat.stop(now + 0.12);
  }

  function schedulePull(current) {
    const { gain, now } = envelope(current, STYLE_STUDIO_MOTION_SOUND.maxGain, STYLE_STUDIO_MOTION_SOUND.pullDurationSeconds);
    const pop = current.createOscillator();
    const click = current.createOscillator();
    pop.type = 'sine';
    pop.frequency.setValueAtTime(185, now);
    pop.frequency.exponentialRampToValueAtTime(82, now + 0.08);
    click.type = 'triangle';
    click.frequency.setValueAtTime(720, now);
    click.frequency.exponentialRampToValueAtTime(360, now + 0.032);
    pop.connect(gain); click.connect(gain);
    pop.start(now); click.start(now);
    pop.stop(now + 0.085); click.stop(now + 0.035);
  }

  async function play(kind) {
    const current = ensureContext();
    if (!current || !(await prime()) || current.state === 'suspended') return false;
    try {
      if (kind === 'insert') scheduleInsert(current);
      else if (kind === 'pull') schedulePull(current);
      else return false;
      return true;
    } catch { return false; }
  }

  async function close() {
    disposed = true;
    const current = context;
    context = null;
    if (current && current.state !== 'closed' && typeof current.close === 'function') {
      try { await current.close(); } catch { /* renderer teardown */ }
    }
  }

  return { prime, play, close };
}
