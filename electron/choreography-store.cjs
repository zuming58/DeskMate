const fs = require("fs");
const path = require("path");

const CHOREOGRAPHY_VERSION = 1;
const STORE_VERSION = 4;
const MAX_CHOREOGRAPHIES = 8;
const MIN_BEATS = 2;
const MAX_BEATS = 8;
const BEAT_MS = new Set([400, 600, 800, 1000]);
const YAW_VALUES = new Set(["hold", "left", "center", "right"]);
const PITCH_VALUES = new Set(["hold", "up", "center", "down"]);
const EXPRESSION_VALUES = new Set(["hold", "completed", "thinking", "working"]);
const DEFAULT_MOTION_SETTINGS = Object.freeze({
  yawAmplitudeDegrees: 20,
  pitchAmplitudeDegrees: 15,
  yawSpeedDegreesPerSecond: 80,
  pitchSpeedDegreesPerSecond: 80,
});
const MOTION_SETTING_LIMITS = Object.freeze({
  yawAmplitudeDegrees: Object.freeze({ min: 4, max: 40, step: 1 }),
  pitchAmplitudeDegrees: Object.freeze({ min: 4, max: 20, step: 1 }),
  yawSpeedDegreesPerSecond: Object.freeze({ min: 20, max: 100, step: 10 }),
  pitchSpeedDegreesPerSecond: Object.freeze({ min: 20, max: 100, step: 10 }),
});
const ACTION_KEYS = ["beatMs", "beats", "name", "repeat", "version"];
const BEAT_KEYS = ["expression", "pitch", "yaw"];
const BUILT_IN_DEFAULT_DANCE = Object.freeze({
  version: CHOREOGRAPHY_VERSION,
  name: "内置默认舞蹈",
  beatMs: 400,
  repeat: 2,
  beats: Object.freeze([
    Object.freeze({ yaw: "left", pitch: "up", expression: "completed" }),
    Object.freeze({ yaw: "center", pitch: "center", expression: "hold" }),
    Object.freeze({ yaw: "right", pitch: "down", expression: "working" }),
    Object.freeze({ yaw: "center", pitch: "center", expression: "hold" }),
    Object.freeze({ yaw: "left", pitch: "down", expression: "completed" }),
    Object.freeze({ yaw: "right", pitch: "up", expression: "completed" }),
    Object.freeze({ yaw: "center", pitch: "center", expression: "hold" }),
  ]),
});

function hasExactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === expected.join(",");
}

function normalizeName(value) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("choreography-name-invalid");
  const name = value.trim();
  if (!name || [...name].length > 20) throw new Error("choreography-name-invalid");
  return name;
}

function validateChoreography(value) {
  if (!hasExactKeys(value, ACTION_KEYS)) throw new Error("choreography-contract-invalid");
  if (value.version !== CHOREOGRAPHY_VERSION) throw new Error("choreography-version-invalid");
  const name = normalizeName(value.name);
  if (!BEAT_MS.has(value.beatMs)) throw new Error("choreography-beat-ms-invalid");
  if (!Number.isInteger(value.repeat) || value.repeat < 1 || value.repeat > 3) throw new Error("choreography-repeat-invalid");
  if (!Array.isArray(value.beats) || value.beats.length < MIN_BEATS || value.beats.length > MAX_BEATS) throw new Error("choreography-beats-invalid");
  const beats = value.beats.map((beat) => {
    if (!hasExactKeys(beat, BEAT_KEYS) || !YAW_VALUES.has(beat.yaw) || !PITCH_VALUES.has(beat.pitch) || !EXPRESSION_VALUES.has(beat.expression)) throw new Error("choreography-beat-invalid");
    return Object.freeze({ yaw: beat.yaw, pitch: beat.pitch, expression: beat.expression });
  });
  if (!beats.some((beat) => beat.yaw !== "hold" || beat.pitch !== "hold" || beat.expression !== "hold")) throw new Error("choreography-empty");
  return Object.freeze({ version: CHOREOGRAPHY_VERSION, name, beatMs: value.beatMs, repeat: value.repeat, beats: Object.freeze(beats) });
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function duplicateName(source, existing) {
  const sourcePoints = [...source];
  for (let index = 1; index <= MAX_CHOREOGRAPHIES + 1; index += 1) {
    const suffix = index === 1 ? " 副本" : ` 副本${index}`;
    const candidate = `${sourcePoints.slice(0, Math.max(1, 20 - [...suffix].length)).join("")}${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("choreography-copy-name-unavailable");
}

class ChoreographyStore {
  constructor({ userDataPath } = {}) {
    this.filePath = path.join(userDataPath, "choreographies.json");
    const loaded = this.load();
    this.actions = loaded.actions;
    this.defaultDanceName = loaded.defaultDanceName;
    this.motionSettings = loaded.motionSettings;
  }

  load() {
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      const keys = Object.keys(value || {}).sort().join(",");
      const legacy = keys === "actions,version" && value.version === 1;
      const prior = keys === "actions,defaultDanceName,motionSettings,version" && value.version === 2;
      const interim = keys === "actions,defaultDanceName,motionSettings,version" && value.version === 3;
      const current = keys === "actions,defaultDanceName,motionSettings,version" && value.version === STORE_VERSION;
      if ((!legacy && !prior && !interim && !current) || !Array.isArray(value.actions) || value.actions.length > MAX_CHOREOGRAPHIES) throw new Error("choreography-store-invalid");
      const actions = value.actions.map(validateChoreography);
      if (new Set(actions.map((action) => action.name)).size !== actions.length) throw new Error("choreography-store-invalid");
      if (legacy) return { actions, defaultDanceName: "", motionSettings: { ...DEFAULT_MOTION_SETTINGS } };
      const defaultDanceName = value.defaultDanceName === "" ? "" : normalizeName(value.defaultDanceName);
      if (defaultDanceName && !actions.some((action) => action.name === defaultDanceName)) throw new Error("choreography-store-invalid");
      if (prior || interim) {
        const settings = value.motionSettings;
        const amplitudeValues = new Set(["gentle", "standard", "vivid"]);
        const speedValues = new Set(["relaxed", "standard", "quick"]);
        const legacyProfile = prior && hasExactKeys(settings, ["intensity", "tempo"])
          ? { yawAmplitude: settings.intensity, pitchAmplitude: settings.intensity, yawSpeed: settings.tempo, pitchSpeed: settings.tempo }
          : settings;
        if (!hasExactKeys(legacyProfile, ["pitchAmplitude", "pitchSpeed", "yawAmplitude", "yawSpeed"]) || !amplitudeValues.has(legacyProfile.yawAmplitude) || !amplitudeValues.has(legacyProfile.pitchAmplitude) || !speedValues.has(legacyProfile.yawSpeed) || !speedValues.has(legacyProfile.pitchSpeed)) throw new Error("choreography-store-invalid");
        const yawAmplitude = { gentle: 12, standard: 20, vivid: 40 };
        const pitchAmplitude = { gentle: 8, standard: 15, vivid: 20 };
        const speed = { relaxed: 40, standard: 80, quick: 100 };
        return { actions, defaultDanceName, motionSettings: {
          yawAmplitudeDegrees: yawAmplitude[legacyProfile.yawAmplitude],
          pitchAmplitudeDegrees: pitchAmplitude[legacyProfile.pitchAmplitude],
          yawSpeedDegreesPerSecond: speed[legacyProfile.yawSpeed],
          pitchSpeedDegreesPerSecond: speed[legacyProfile.pitchSpeed],
        } };
      }
      const motionSettings = this.validateMotionSettings(value.motionSettings);
      return { actions, defaultDanceName, motionSettings };
    } catch { return { actions: [], defaultDanceName: "", motionSettings: { ...DEFAULT_MOTION_SETTINGS } }; }
  }

  list() { return clone(this.actions); }

  snapshot() { return { actions: this.list(), builtInDance: clone(BUILT_IN_DEFAULT_DANCE), defaultDanceName: this.defaultDanceName, motionSettings: clone(this.motionSettings) }; }

  getDefaultDance() {
    return this.defaultDanceName ? clone(this.actions.find((action) => action.name === this.defaultDanceName) || null) : null;
  }

  getMotionSettings() { return clone(this.motionSettings); }

  validateMotionSettings(value) {
    const keys = ["pitchAmplitudeDegrees", "pitchSpeedDegreesPerSecond", "yawAmplitudeDegrees", "yawSpeedDegreesPerSecond"];
    if (!hasExactKeys(value, keys)) throw new Error("motion-settings-invalid");
    for (const key of keys) {
      const limit = MOTION_SETTING_LIMITS[key];
      if (!Number.isInteger(value[key]) || value[key] < limit.min || value[key] > limit.max || (value[key] - limit.min) % limit.step !== 0) throw new Error("motion-settings-invalid");
    }
    return Object.freeze({ ...value });
  }

  writeAndReadback(state) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    const persisted = { version: STORE_VERSION, actions: state.actions, defaultDanceName: state.defaultDanceName, motionSettings: state.motionSettings };
    fs.writeFileSync(temporary, JSON.stringify(persisted, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    const value = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    if (!hasExactKeys(value, ["actions", "defaultDanceName", "motionSettings", "version"]) || value.version !== STORE_VERSION || !Array.isArray(value.actions)) throw new Error("choreography-readback-mismatch");
    const actions = value.actions.map(validateChoreography);
    const defaultDanceName = value.defaultDanceName === "" ? "" : normalizeName(value.defaultDanceName);
    const motionSettings = this.validateMotionSettings(value.motionSettings);
    if (defaultDanceName && !actions.some((action) => action.name === defaultDanceName)) throw new Error("choreography-readback-mismatch");
    return { actions, defaultDanceName, motionSettings };
  }

  commit(next = {}) {
    const state = {
      actions: next.actions ?? this.actions,
      defaultDanceName: next.defaultDanceName ?? this.defaultDanceName,
      motionSettings: next.motionSettings ?? this.motionSettings,
    };
    const readback = this.writeAndReadback(state);
    if (JSON.stringify(readback) !== JSON.stringify(state)) throw new Error("choreography-readback-mismatch");
    this.actions = readback.actions;
    this.defaultDanceName = readback.defaultDanceName;
    this.motionSettings = readback.motionSettings;
    return this.list();
  }

  save(value, previousName = "") {
    const action = validateChoreography(value);
    const prior = previousName ? normalizeName(previousName) : action.name;
    const existingIndex = this.actions.findIndex((item) => item.name === prior);
    const conflictingIndex = this.actions.findIndex((item) => item.name === action.name && item.name !== prior);
    if (conflictingIndex >= 0) throw new Error("choreography-name-exists");
    if (existingIndex < 0 && this.actions.length >= MAX_CHOREOGRAPHIES) throw new Error("choreography-limit-reached");
    const next = this.actions.slice();
    if (existingIndex >= 0) next[existingIndex] = action;
    else next.push(action);
    const defaultDanceName = this.defaultDanceName === prior && prior !== action.name ? action.name : this.defaultDanceName;
    this.commit({ actions: next, defaultDanceName });
    return { ok: true, action: clone(action), ...this.snapshot() };
  }

  copy(name) {
    const sourceName = normalizeName(name);
    const source = this.actions.find((action) => action.name === sourceName);
    if (!source) throw new Error("choreography-not-found");
    if (this.actions.length >= MAX_CHOREOGRAPHIES) throw new Error("choreography-limit-reached");
    const copy = validateChoreography({ ...clone(source), name: duplicateName(source.name, new Set(this.actions.map((action) => action.name))) });
    this.commit({ actions: [...this.actions, copy] });
    return { ok: true, action: clone(copy), ...this.snapshot() };
  }

  delete(name) {
    const target = normalizeName(name);
    if (!this.actions.some((action) => action.name === target)) return { ok: false, reason: "choreography-not-found", ...this.snapshot() };
    this.commit({ actions: this.actions.filter((action) => action.name !== target), defaultDanceName: this.defaultDanceName === target ? "" : this.defaultDanceName });
    return { ok: true, ...this.snapshot() };
  }

  setDefaultDance(name) {
    const target = name === "" ? "" : normalizeName(name);
    if (target && !this.actions.some((action) => action.name === target)) return { ok: false, reason: "choreography-not-found", ...this.snapshot() };
    this.commit({ defaultDanceName: target });
    return { ok: true, ...this.snapshot() };
  }

  setMotionSettings(value) {
    const motionSettings = this.validateMotionSettings(value);
    this.commit({ motionSettings });
    return { ok: true, ...this.snapshot() };
  }
}

class PendingChoreographyAdapter {
  status() { return Object.freeze({ ready: false, state: "not-ready", reason: "choreography-transport-not-frozen" }); }
  async execute(value) {
    validateChoreography(value);
    return Object.freeze({ ok: false, ...this.status() });
  }
}

module.exports = {
  BEAT_MS,
  BUILT_IN_DEFAULT_DANCE,
  CHOREOGRAPHY_VERSION,
  DEFAULT_MOTION_SETTINGS,
  EXPRESSION_VALUES,
  MAX_BEATS,
  MAX_CHOREOGRAPHIES,
  MIN_BEATS,
  MOTION_SETTING_LIMITS,
  PITCH_VALUES,
  PendingChoreographyAdapter,
  ChoreographyStore,
  YAW_VALUES,
  validateChoreography,
};
