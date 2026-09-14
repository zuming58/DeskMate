export const STYLE_STUDIO_DETENT_SOUND = Object.freeze({
  durationSeconds: 0.058,
  maxGain: 0.034,
  forwardHz: 760,
  backwardHz: 680,
});

export function createStyleStudioDetentSound({
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

  function schedule(current, direction) {
    const now = current.currentTime;
    const base = direction < 0 ? STYLE_STUDIO_DETENT_SOUND.backwardHz : STYLE_STUDIO_DETENT_SOUND.forwardHz;
    const end = now + STYLE_STUDIO_DETENT_SOUND.durationSeconds;
    const master = current.createGain();
    const body = current.createOscillator();
    const glint = current.createOscillator();

    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(STYLE_STUDIO_DETENT_SOUND.maxGain, now + 0.004);
    master.gain.exponentialRampToValueAtTime(0.0001, end);
    body.type = 'triangle';
    body.frequency.setValueAtTime(base, now);
    body.frequency.exponentialRampToValueAtTime(base * 0.78, end);
    glint.type = 'sine';
    glint.frequency.setValueAtTime(base * 1.82, now);
    glint.frequency.exponentialRampToValueAtTime(base * 1.24, now + 0.032);
    body.connect(master);
    glint.connect(master);
    master.connect(current.destination);
    body.start(now);
    glint.start(now);
    body.stop(end);
    glint.stop(now + 0.034);
  }

  async function play(direction = 1) {
    const current = ensureContext();
    if (!current || !(await prime()) || current.state === 'suspended') return false;
    try { schedule(current, direction); return true; }
    catch { return false; }
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
