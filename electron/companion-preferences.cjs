const fs = require("fs");
const path = require("path");

const COMPANION_NAME_DEFAULT = "小言";
const COMPANION_WAKE_PHRASE_DEFAULT = "你好，小言";
const COMPANION_END_SMOOTH_WINDOW_MS = Object.freeze([2000, 3000, 5000]);
const COMPANION_IDLE_TIMEOUT_MS = Object.freeze([0, 30000, 60000, 120000]);
const COMPANION_PREFERENCES_DEFAULT = Object.freeze({
  name: COMPANION_NAME_DEFAULT,
  wakePhrase: COMPANION_WAKE_PHRASE_DEFAULT,
  endSmoothWindowMs: 5000,
  idleTimeoutMs: 60000,
});

function boundedDisplayText(value, fallback, maxLength) {
  const text = String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, maxLength);
  return text || fallback;
}

function normalizeCompanionPreferences(value = {}) {
  const endSmoothWindowMs = Number(value.endSmoothWindowMs);
  const idleTimeoutMs = Number(value.idleTimeoutMs);
  return Object.freeze({
    name: boundedDisplayText(value.name, COMPANION_NAME_DEFAULT, 32),
    wakePhrase: boundedDisplayText(value.wakePhrase, COMPANION_WAKE_PHRASE_DEFAULT, 64),
    endSmoothWindowMs: COMPANION_END_SMOOTH_WINDOW_MS.includes(endSmoothWindowMs) ? endSmoothWindowMs : COMPANION_PREFERENCES_DEFAULT.endSmoothWindowMs,
    idleTimeoutMs: COMPANION_IDLE_TIMEOUT_MS.includes(idleTimeoutMs) ? idleTimeoutMs : COMPANION_PREFERENCES_DEFAULT.idleTimeoutMs,
  });
}

class CompanionPreferenceStore {
  constructor({ userDataPath } = {}) {
    this.filePath = path.join(userDataPath, "companion-preferences.json");
    this.value = this.load();
  }

  load() {
    try { return normalizeCompanionPreferences(JSON.parse(fs.readFileSync(this.filePath, "utf8"))); }
    catch { return normalizeCompanionPreferences(); }
  }

  get() { return this.value; }

  save(value) {
    this.value = normalizeCompanionPreferences(value);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.value, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    return this.value;
  }
}

module.exports = {
  COMPANION_NAME_DEFAULT,
  COMPANION_WAKE_PHRASE_DEFAULT,
  COMPANION_END_SMOOTH_WINDOW_MS,
  COMPANION_IDLE_TIMEOUT_MS,
  COMPANION_PREFERENCES_DEFAULT,
  normalizeCompanionPreferences,
  CompanionPreferenceStore,
};
