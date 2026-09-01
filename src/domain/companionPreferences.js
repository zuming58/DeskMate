export const COMPANION_CALL_ACTION_ID = "f11135b4-7471-47f1-808a-629ae99eb63b";
export const COMPANION_DEFAULTS = Object.freeze({ name: "小言", wakePhrase: "你好，小言", endSmoothWindowMs: 5000, idleTimeoutMs: 60000 });
export const COMPANION_END_SMOOTH_OPTIONS = Object.freeze([2000, 3000, 5000]);
export const COMPANION_IDLE_TIMEOUT_OPTIONS = Object.freeze([0, 30000, 60000, 120000]);

function bounded(value, fallback, maxLength) {
  const text = String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, maxLength);
  return text || fallback;
}

export function normalizeCompanionPreferences(value = {}) {
  const endSmoothWindowMs = Number(value.endSmoothWindowMs);
  const idleTimeoutMs = Number(value.idleTimeoutMs);
  return {
    name: bounded(value.name, COMPANION_DEFAULTS.name, 32),
    wakePhrase: bounded(value.wakePhrase, COMPANION_DEFAULTS.wakePhrase, 64),
    endSmoothWindowMs: COMPANION_END_SMOOTH_OPTIONS.includes(endSmoothWindowMs) ? endSmoothWindowMs : COMPANION_DEFAULTS.endSmoothWindowMs,
    idleTimeoutMs: COMPANION_IDLE_TIMEOUT_OPTIONS.includes(idleTimeoutMs) ? idleTimeoutMs : COMPANION_DEFAULTS.idleTimeoutMs,
  };
}
