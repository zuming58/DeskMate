const SAMPLE_RATE = 24000;
const MAX_AMPLITUDE = 0.72;

const MOTION_CUE_DURATION_MS = Object.freeze({
  attention: 900,
  nod: 1500,
  search: 2200,
  dance: 8000,
});

const NOTE = Object.freeze({ C4: 261.63, E4: 329.63, G4: 392, A4: 440, C5: 523.25, E5: 659.25, G5: 783.99 });

function tone(startMs, durationMs, frequency, gain = 0.18, kind = "sine") {
  return { startMs, durationMs, frequency, gain, kind };
}

function cueTones(preset) {
  if (preset === "attention") return [tone(0, 180, NOTE.C5, 0.13), tone(210, 260, NOTE.G5, 0.16)];
  if (preset === "nod") return [tone(0, 150, NOTE.G4, 0.14), tone(220, 170, NOTE.C4, 0.16), tone(650, 150, NOTE.G4, 0.14), tone(870, 170, NOTE.C4, 0.16)];
  if (preset === "search") return [tone(0, 240, NOTE.C5, 0.12), tone(430, 240, NOTE.E5, 0.13), tone(860, 240, NOTE.G5, 0.14), tone(1290, 320, NOTE.E5, 0.12)];
  const notes = [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.A4, NOTE.G4, NOTE.E4, NOTE.C4, NOTE.G4];
  const tones = [];
  for (let beat = 0; beat < 16; beat += 1) {
    const start = beat * 480;
    tones.push(tone(start, 260, notes[beat % notes.length], 0.15, "triangle"));
    tones.push(tone(start, 70, beat % 4 === 0 ? 82.41 : 110, beat % 4 === 0 ? 0.24 : 0.12, "sine"));
    if (beat % 2 === 1) tones.push(tone(start + 240, 45, 1760, 0.055, "noise"));
  }
  return tones;
}

function envelope(position, length) {
  const attack = Math.max(1, Math.min(length / 3, SAMPLE_RATE * 0.012));
  const release = Math.max(1, Math.min(length / 2, SAMPLE_RATE * 0.07));
  if (position < attack) return position / attack;
  if (position > length - release) return Math.max(0, (length - position) / release);
  return 1;
}

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

export function createMotionCueWav(preset = "dance") {
  const normalized = Object.hasOwn(MOTION_CUE_DURATION_MS, preset) ? preset : "dance";
  const durationMs = MOTION_CUE_DURATION_MS[normalized];
  const sampleCount = Math.ceil(SAMPLE_RATE * durationMs / 1000);
  const samples = new Float32Array(sampleCount);
  let noiseSeed = 0x41c64e6d;
  for (const item of cueTones(normalized)) {
    const start = Math.floor(SAMPLE_RATE * item.startMs / 1000);
    const length = Math.max(1, Math.floor(SAMPLE_RATE * item.durationMs / 1000));
    for (let position = 0; position < length && start + position < sampleCount; position += 1) {
      const phase = 2 * Math.PI * item.frequency * position / SAMPLE_RATE;
      let wave;
      if (item.kind === "triangle") wave = 2 * Math.asin(Math.sin(phase)) / Math.PI;
      else if (item.kind === "noise") {
        noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
        wave = (noiseSeed / 0xffffffff) * 2 - 1;
      } else wave = Math.sin(phase);
      samples[start + position] += wave * item.gain * envelope(position, length);
    }
  }
  const dataBytes = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < sampleCount; index += 1) {
    const value = Math.max(-MAX_AMPLITUDE, Math.min(MAX_AMPLITUDE, samples[index]));
    view.setInt16(44 + index * 2, Math.round(value * 32767), true);
  }
  return new Uint8Array(buffer);
}

export { MOTION_CUE_DURATION_MS, SAMPLE_RATE };
