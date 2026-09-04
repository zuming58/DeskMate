const fs = require("fs");
const path = require("path");

const COMPANION_NAME_DEFAULT = "小言";
const COMPANION_WAKE_PHRASE_DEFAULT = "你好，小言";
const COMPANION_END_SMOOTH_MIN_MS = 500;
const COMPANION_END_SMOOTH_MAX_MS = 50000;
const COMPANION_END_SMOOTH_STEP_MS = 500;
const COMPANION_IDLE_TIMEOUT_MIN_MS = 10000;
const COMPANION_IDLE_TIMEOUT_MAX_MS = 3600000;
const COMPANION_IDLE_TIMEOUT_STEP_MS = 1000;
const COMPANION_PREFERENCES_DEFAULT = Object.freeze({
  name: COMPANION_NAME_DEFAULT,
  wakePhrase: COMPANION_WAKE_PHRASE_DEFAULT,
  endSmoothWindowMs: 4000,
  idleTimeoutMs: 10000,
  codexBriefAnnouncementsEnabled: true,
  wakeEnabled: false,
});

function boundedDisplayText(value, fallback, maxLength) {
  const text = String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, maxLength);
  return text || fallback;
}

function isValidEndSmoothWindowMs(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= COMPANION_END_SMOOTH_MIN_MS && numeric <= COMPANION_END_SMOOTH_MAX_MS && numeric % COMPANION_END_SMOOTH_STEP_MS === 0;
}

function isValidIdleTimeoutMs(value) {
  const numeric = Number(value);
  return numeric === 0 || (Number.isInteger(numeric) && numeric >= COMPANION_IDLE_TIMEOUT_MIN_MS && numeric <= COMPANION_IDLE_TIMEOUT_MAX_MS && numeric % COMPANION_IDLE_TIMEOUT_STEP_MS === 0);
}

function validateCompanionPreferences(value = {}) {
  const name = String(value.name || "").replace(/[\u0000-\u001f]/g, "").trim();
  const wakePhrase = String(value.wakePhrase || "").replace(/[\u0000-\u001f]/g, "").trim();
  if (!name || name.length > 32) throw new Error("companion-name-invalid");
  if (!wakePhrase || wakePhrase.length > 64) throw new Error("companion-wake-phrase-invalid");
  if (!isValidEndSmoothWindowMs(value.endSmoothWindowMs)) throw new Error("companion-end-smooth-window-invalid");
  if (!isValidIdleTimeoutMs(value.idleTimeoutMs)) throw new Error("companion-idle-timeout-invalid");
  if (value.codexBriefAnnouncementsEnabled !== undefined && typeof value.codexBriefAnnouncementsEnabled !== "boolean") throw new Error("companion-codex-brief-announcements-invalid");
  if (value.wakeEnabled !== undefined && typeof value.wakeEnabled !== "boolean") throw new Error("companion-wake-enabled-invalid");
  return Object.freeze({ name, wakePhrase, endSmoothWindowMs: Number(value.endSmoothWindowMs), idleTimeoutMs: Number(value.idleTimeoutMs), codexBriefAnnouncementsEnabled: value.codexBriefAnnouncementsEnabled !== false, wakeEnabled: value.wakeEnabled === true });
}

function normalizeCompanionPreferences(value = {}) {
  const endSmoothWindowMs = Number(value.endSmoothWindowMs);
  const idleTimeoutMs = Number(value.idleTimeoutMs);
  return Object.freeze({
    name: boundedDisplayText(value.name, COMPANION_NAME_DEFAULT, 32),
    wakePhrase: boundedDisplayText(value.wakePhrase, COMPANION_WAKE_PHRASE_DEFAULT, 64),
    endSmoothWindowMs: isValidEndSmoothWindowMs(endSmoothWindowMs) ? endSmoothWindowMs : COMPANION_PREFERENCES_DEFAULT.endSmoothWindowMs,
    idleTimeoutMs: isValidIdleTimeoutMs(idleTimeoutMs) ? idleTimeoutMs : COMPANION_PREFERENCES_DEFAULT.idleTimeoutMs,
    codexBriefAnnouncementsEnabled: value.codexBriefAnnouncementsEnabled !== false,
    wakeEnabled: value.wakeEnabled === true,
  });
}

class CompanionPreferenceStore {
  constructor({ userDataPath } = {}) {
    this.filePath = path.join(userDataPath, "companion-preferences.json");
    this.value = this.load();
    this.revision = 1;
  }

  load() {
    try { return normalizeCompanionPreferences(JSON.parse(fs.readFileSync(this.filePath, "utf8"))); }
    catch { return normalizeCompanionPreferences(); }
  }

  get() { return this.value; }

  snapshot() { return Object.freeze({ revision: this.revision, preferences: this.value }); }

  writeAndReadback(value) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    return validateCompanionPreferences(JSON.parse(fs.readFileSync(this.filePath, "utf8")));
  }

  save(value) {
    const validated = validateCompanionPreferences({ ...this.value, ...value });
    const readback = this.writeAndReadback(validated);
    if (JSON.stringify(readback) !== JSON.stringify(validated)) throw new Error("companion-preferences-readback-mismatch");
    this.value = readback;
    this.revision += 1;
    return this.value;
  }

  setCodexBriefAnnouncementsEnabled(enabled) {
    if (typeof enabled !== "boolean") throw new Error("companion-codex-brief-announcements-invalid");
    return this.save({ codexBriefAnnouncementsEnabled: enabled });
  }
}

module.exports = {
  COMPANION_NAME_DEFAULT,
  COMPANION_WAKE_PHRASE_DEFAULT,
  COMPANION_END_SMOOTH_MIN_MS,
  COMPANION_END_SMOOTH_MAX_MS,
  COMPANION_END_SMOOTH_STEP_MS,
  COMPANION_IDLE_TIMEOUT_MIN_MS,
  COMPANION_IDLE_TIMEOUT_MAX_MS,
  COMPANION_IDLE_TIMEOUT_STEP_MS,
  COMPANION_PREFERENCES_DEFAULT,
  isValidEndSmoothWindowMs,
  isValidIdleTimeoutMs,
  validateCompanionPreferences,
  normalizeCompanionPreferences,
  CompanionPreferenceStore,
};
