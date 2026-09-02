export const MOTION_PRESETS = Object.freeze(["attention", "search", "nod", "dance"]);
export const MOTION_REPEAT_DEFAULTS = Object.freeze({ attention: 1, search: 1, nod: 2, dance: 2 });

export function normalizeRepeatCount(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 3 ? number : fallback;
}

export function normalizeMotionState(value = {}) {
  const legacyPreset = value.preset === "attentive" ? "attention" : value.preset;
  const preset = MOTION_PRESETS.includes(legacyPreset) ? legacyPreset : "attention";
  return {
    preset,
    speed: Math.max(0, Math.min(100, Number(value.speed) || 45)),
    range: Math.max(10, Math.min(80, Number(value.range) || 55)),
    repeatCount: normalizeRepeatCount(value.repeatCount, MOTION_REPEAT_DEFAULTS[preset]),
  };
}
