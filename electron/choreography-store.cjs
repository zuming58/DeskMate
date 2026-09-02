const fs = require("fs");
const path = require("path");

const CHOREOGRAPHY_VERSION = 1;
const MAX_CHOREOGRAPHIES = 8;
const MIN_BEATS = 2;
const MAX_BEATS = 8;
const BEAT_MS = new Set([400, 600, 800, 1000]);
const YAW_VALUES = new Set(["hold", "left", "center", "right"]);
const PITCH_VALUES = new Set(["hold", "up", "center", "down"]);
const EXPRESSION_VALUES = new Set(["hold", "idle", "listening", "thinking", "working", "waiting", "completed", "error"]);
const ACTION_KEYS = ["beatMs", "beats", "name", "repeat", "version"];
const BEAT_KEYS = ["expression", "pitch", "yaw"];

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
    this.actions = this.load();
  }

  load() {
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      if (!hasExactKeys(value, ["actions", "version"]) || value.version !== 1 || !Array.isArray(value.actions) || value.actions.length > MAX_CHOREOGRAPHIES) return [];
      const actions = value.actions.map(validateChoreography);
      if (new Set(actions.map((action) => action.name)).size !== actions.length) return [];
      return actions;
    } catch { return []; }
  }

  list() { return clone(this.actions); }

  writeAndReadback(actions) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, actions }, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    const value = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    if (!hasExactKeys(value, ["actions", "version"]) || value.version !== 1 || !Array.isArray(value.actions)) throw new Error("choreography-readback-mismatch");
    return value.actions.map(validateChoreography);
  }

  commit(actions) {
    const readback = this.writeAndReadback(actions);
    if (JSON.stringify(readback) !== JSON.stringify(actions)) throw new Error("choreography-readback-mismatch");
    this.actions = readback;
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
    this.commit(next);
    return { ok: true, action: clone(action), actions: this.list() };
  }

  copy(name) {
    const sourceName = normalizeName(name);
    const source = this.actions.find((action) => action.name === sourceName);
    if (!source) throw new Error("choreography-not-found");
    if (this.actions.length >= MAX_CHOREOGRAPHIES) throw new Error("choreography-limit-reached");
    const copy = validateChoreography({ ...clone(source), name: duplicateName(source.name, new Set(this.actions.map((action) => action.name))) });
    this.commit([...this.actions, copy]);
    return { ok: true, action: clone(copy), actions: this.list() };
  }

  delete(name) {
    const target = normalizeName(name);
    if (!this.actions.some((action) => action.name === target)) return { ok: false, reason: "choreography-not-found", actions: this.list() };
    this.commit(this.actions.filter((action) => action.name !== target));
    return { ok: true, actions: this.list() };
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
  CHOREOGRAPHY_VERSION,
  EXPRESSION_VALUES,
  MAX_BEATS,
  MAX_CHOREOGRAPHIES,
  MIN_BEATS,
  PITCH_VALUES,
  PendingChoreographyAdapter,
  ChoreographyStore,
  YAW_VALUES,
  validateChoreography,
};
