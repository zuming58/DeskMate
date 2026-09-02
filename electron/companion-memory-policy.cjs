const fs = require("fs");
const path = require("path");

const MEMORY_SOURCES = Object.freeze(["companion", "dictation"]);
const MEMORY_SCHEDULES = Object.freeze(["manual", "daily"]);
const DEFAULT_RESULT = Object.freeze({ day: "", status: "never", inputDigest: "", at: "", reason: "" });
const DEFAULT_POLICY = Object.freeze({
  version: 1,
  enabledSources: Object.freeze(["companion", "dictation"]),
  schedule: "daily",
  dailyTime: "23:30",
  lastResults: Object.freeze({ companion: DEFAULT_RESULT, dictation: DEFAULT_RESULT }),
});

function localDay(timestamp = Date.now()) {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeResult(value = {}) {
  value = value && typeof value === "object" ? value : {};
  return Object.freeze({
    day: /^\d{4}-\d{2}-\d{2}$/.test(String(value.day || "")) ? String(value.day) : "",
    status: ["never", "completed", "no-pending", "warning", "failed"].includes(value.status) ? value.status : "never",
    inputDigest: /^[a-f0-9]{64}$/i.test(String(value.inputDigest || "")) ? String(value.inputDigest).toLowerCase() : "",
    at: Number.isNaN(new Date(value.at || "").getTime()) ? "" : new Date(value.at).toISOString(),
    reason: /^[a-z0-9-]{0,80}$/.test(String(value.reason || "")) ? String(value.reason || "") : "memory-generation-failed",
  });
}

function validateMemoryPolicy(value = {}, { allowRuntime = false } = {}) {
  const allowed = new Set(["version", "enabledSources", "schedule", "dailyTime", ...(allowRuntime ? ["lastResults"] : [])]);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.has(key))) throw new Error("memory-policy-invalid");
  const enabledSources = Array.isArray(value.enabledSources) ? [...new Set(value.enabledSources.map(String))] : [];
  if (value.version !== 1 || enabledSources.some((source) => !MEMORY_SOURCES.includes(source))) throw new Error("memory-policy-sources-invalid");
  const schedule = String(value.schedule || "");
  if (!MEMORY_SCHEDULES.includes(schedule)) throw new Error("memory-policy-schedule-invalid");
  const dailyTime = String(value.dailyTime || "");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dailyTime)) throw new Error("memory-policy-time-invalid");
  const lastResults = Object.freeze(Object.fromEntries(MEMORY_SOURCES.map((source) => [source, normalizeResult(allowRuntime ? value.lastResults?.[source] : null)])));
  return Object.freeze({ version: 1, enabledSources: Object.freeze(enabledSources), schedule, dailyTime, lastResults });
}

function normalizeMemoryPolicy(value = {}) {
  try { return validateMemoryPolicy({ version: 1, enabledSources: value.enabledSources, schedule: value.schedule, dailyTime: value.dailyTime, lastResults: value.lastResults }, { allowRuntime: true }); }
  catch { return DEFAULT_POLICY; }
}

class CompanionMemoryPolicyStore {
  constructor({ userDataPath } = {}) {
    this.filePath = path.join(userDataPath, "companion-memory-policy.json");
    this.value = this.load();
  }

  load() {
    try { return normalizeMemoryPolicy(JSON.parse(fs.readFileSync(this.filePath, "utf8"))); }
    catch { return DEFAULT_POLICY; }
  }

  snapshot() {
    return Object.freeze({ ...this.value, enabledSources: [...this.value.enabledSources], lastResults: Object.freeze(Object.fromEntries(MEMORY_SOURCES.map((source) => [source, { ...this.value.lastResults[source] }]))) });
  }

  writeAndReadback(value) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    return normalizeMemoryPolicy(JSON.parse(fs.readFileSync(this.filePath, "utf8")));
  }

  save(value = {}) {
    const validated = validateMemoryPolicy(value);
    const next = { ...validated, lastResults: this.value.lastResults };
    const readback = this.writeAndReadback(next);
    if (JSON.stringify(readback) !== JSON.stringify(next)) throw new Error("memory-policy-readback-mismatch");
    this.value = readback;
    return this.snapshot();
  }

  markResult(source, result = {}) {
    if (!MEMORY_SOURCES.includes(source)) throw new Error("memory-source-invalid");
    this.value = this.writeAndReadback({ ...this.value, lastResults: { ...this.value.lastResults, [source]: normalizeResult(result) } });
    return this.snapshot();
  }
}

function minutesOfDay(timestamp) {
  const value = new Date(timestamp);
  return value.getHours() * 60 + value.getMinutes();
}

function configuredMinutes(time) {
  const [hour, minute] = String(time).split(":").map(Number);
  return hour * 60 + minute;
}

class CompanionMemoryDigestScheduler {
  constructor({ policyStore, pendingDays, process, now = () => Date.now(), maxCatchUpDays = 14 } = {}) {
    if (!policyStore || typeof pendingDays !== "function" || typeof process !== "function") throw new Error("memory-scheduler-dependency-missing");
    this.policyStore = policyStore;
    this.pendingDays = pendingDays;
    this.process = process;
    this.now = now;
    this.maxCatchUpDays = Math.max(1, Math.min(31, Number(maxCatchUpDays) || 14));
    this.active = false;
  }

  status() { return Object.freeze({ active: this.active, lastResults: this.policyStore.snapshot().lastResults }); }

  async tick() {
    if (this.active) return { ok: false, skipped: true, reason: "memory-generation-active", sources: {} };
    const policy = this.policyStore.snapshot();
    if (policy.schedule !== "daily") return { ok: true, skipped: true, reason: "memory-schedule-manual", sources: {} };
    if (!policy.enabledSources.length) return { ok: true, skipped: true, reason: "memory-no-enabled-sources", sources: {} };
    const timestamp = this.now();
    const today = localDay(timestamp);
    const dueToday = minutesOfDay(timestamp) >= configuredMinutes(policy.dailyTime);
    this.active = true;
    const results = {};
    try {
      for (const source of policy.enabledSources) {
        const days = [...new Set((await this.pendingDays(source)).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort();
        const eligible = days.filter((day) => day < today || (day === today && dueToday)).slice(0, this.maxCatchUpDays);
        if (!eligible.length) {
          if (dueToday && policy.lastResults[source]?.day !== today) {
            const empty = { ok: true, skipped: true, reason: "memory-no-unprocessed-turns", source, day: today, turns: 0, candidates: 0 };
            this.policyStore.markResult(source, { day: today, status: "no-pending", inputDigest: "", at: new Date(this.now()).toISOString(), reason: empty.reason });
            results[source] = empty;
          } else results[source] = { ok: true, skipped: true, reason: "memory-schedule-not-due", source };
          continue;
        }
        let last = null;
        for (const day of eligible) {
          try { last = await this.process({ source, day }); }
          catch (error) { last = { ok: false, source, day, reason: /^[a-z0-9-]{1,80}$/.test(String(error?.message || "")) ? error.message : "memory-generation-failed" }; }
          if (!last?.ok) break;
        }
        const at = new Date(this.now()).toISOString();
        const normalized = last?.ok
          ? { day: last.day || eligible.at(-1), status: last.warning ? "warning" : last.skipped ? "no-pending" : "completed", inputDigest: last.inputDigest || "", at, reason: last.warning ? last.warningReason || "knowledge-base-projection-failed" : last.reason || "" }
          : { day: last?.day || eligible[0], status: "failed", inputDigest: last?.inputDigest || "", at, reason: String(last?.reason || "memory-generation-failed") };
        this.policyStore.markResult(source, normalized);
        results[source] = last || { ok: true, skipped: true, reason: "memory-no-unprocessed-turns" };
      }
      return { ok: Object.values(results).every((result) => result?.ok), skipped: Object.values(results).every((result) => result?.skipped), sources: results };
    } finally { this.active = false; }
  }
}

module.exports = { CompanionMemoryDigestScheduler, CompanionMemoryPolicyStore, DEFAULT_MEMORY_POLICY: DEFAULT_POLICY, MEMORY_SCHEDULES, MEMORY_SOURCES, localDay, normalizeMemoryPolicy, validateMemoryPolicy };
