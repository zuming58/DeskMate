export const COMPANION_CALL_ACTION_ID = "f11135b4-7471-47f1-808a-629ae99eb63b";
export const COMPANION_DEFAULTS = Object.freeze({ name: "小言", wakePhrase: "你好，小言", endSmoothWindowMs: 5000, idleTimeoutMs: 60000, wakeEnabled: false });
export const COMPANION_END_SMOOTH_RANGE = Object.freeze({ min: 500, max: 50000, step: 500 });
export const COMPANION_IDLE_TIMEOUT_RANGE = Object.freeze({ min: 10000, max: 3600000, step: 1000 });

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
    endSmoothWindowMs: isValidCompanionEndSmoothWindowMs(endSmoothWindowMs) ? endSmoothWindowMs : COMPANION_DEFAULTS.endSmoothWindowMs,
    idleTimeoutMs: isValidCompanionIdleTimeoutMs(idleTimeoutMs) ? idleTimeoutMs : COMPANION_DEFAULTS.idleTimeoutMs,
    wakeEnabled: value.wakeEnabled === true,
  };
}

export function isValidCompanionEndSmoothWindowMs(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= COMPANION_END_SMOOTH_RANGE.min && numeric <= COMPANION_END_SMOOTH_RANGE.max && numeric % COMPANION_END_SMOOTH_RANGE.step === 0;
}

export function isValidCompanionIdleTimeoutMs(value) {
  const numeric = Number(value);
  return numeric === 0 || (Number.isInteger(numeric) && numeric >= COMPANION_IDLE_TIMEOUT_RANGE.min && numeric <= COMPANION_IDLE_TIMEOUT_RANGE.max && numeric % COMPANION_IDLE_TIMEOUT_RANGE.step === 0);
}

export function companionPreferencesToDraft(value = {}) {
  const normalized = normalizeCompanionPreferences(value);
  return {
    name: normalized.name,
    wakePhrase: normalized.wakePhrase,
    endSmoothSeconds: String(normalized.endSmoothWindowMs / 1000),
    idleTimeoutSeconds: String(normalized.idleTimeoutMs / 1000),
    wakeEnabled: normalized.wakeEnabled,
  };
}

export function parseCompanionPreferenceDraft(value = {}) {
  const name = String(value.name || "").replace(/[\u0000-\u001f]/g, "").trim();
  const wakePhrase = String(value.wakePhrase || "").replace(/[\u0000-\u001f]/g, "").trim();
  const endSmoothSeconds = Number(value.endSmoothSeconds);
  const idleTimeoutSeconds = Number(value.idleTimeoutSeconds);
  if (!name || name.length > 32) return { ok: false, field: "name", reason: "陪伴名称应为 1–32 个字符" };
  if (!wakePhrase || wakePhrase.length > 64) return { ok: false, field: "wakePhrase", reason: "唤醒短语应为 1–64 个字符" };
  if (!Number.isFinite(endSmoothSeconds) || !isValidCompanionEndSmoothWindowMs(endSmoothSeconds * 1000)) return { ok: false, field: "endSmoothSeconds", reason: "停顿需为 0.5–50 秒，并以 0.5 秒递增" };
  if (!Number.isFinite(idleTimeoutSeconds) || !isValidCompanionIdleTimeoutMs(idleTimeoutSeconds * 1000)) return { ok: false, field: "idleTimeoutSeconds", reason: "空闲结束需为 0（关闭）或 10–3600 的整数秒" };
  return { ok: true, value: { name, wakePhrase, endSmoothWindowMs: Math.round(endSmoothSeconds * 1000), idleTimeoutMs: Math.round(idleTimeoutSeconds * 1000), wakeEnabled: value.wakeEnabled === true } };
}
