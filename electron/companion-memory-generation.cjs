const { KnowledgeBaseProjection } = require("./knowledge-base-projection.cjs");

const PROJECTION_NOT_CONFIGURED = "knowledge-base-not-configured";
const PROJECTION_NOT_REQUESTED = "knowledge-base-projection-not-requested";
const PROJECTION_FAILED = "knowledge-base-projection-failed";
const PROJECTION_CONFLICT = "knowledge-base-projection-conflict";

function boundedCount(value) {
  return Math.max(0, Math.min(1_000_000, Number.isInteger(Number(value)) ? Number(value) : 0));
}

function skippedProjection(reason = PROJECTION_NOT_REQUESTED) {
  return Object.freeze({ ok: true, skipped: true, warning: false, reason });
}

function failedProjection(reason, value = {}) {
  return Object.freeze({
    ok: false,
    skipped: false,
    warning: true,
    reason,
    files: boundedCount(value.files),
    written: boundedCount(value.written),
    removed: boundedCount(value.removed),
    conflicts: boundedCount(value.conflicts),
  });
}

class CompanionMemoryGenerationCoordinator {
  constructor({ pipeline, store, knowledgeBaseSettings, projectionFactory = (root) => new KnowledgeBaseProjection({ root }) } = {}) {
    if (!pipeline?.processPending || !store?.projectionItems || !knowledgeBaseSettings?.status || !knowledgeBaseSettings?.loadRoot || typeof projectionFactory !== "function") {
      throw new Error("memory-generation-coordinator-dependency-missing");
    }
    this.pipeline = pipeline;
    this.store = store;
    this.knowledgeBaseSettings = knowledgeBaseSettings;
    this.projectionFactory = projectionFactory;
    this.backlogActive = false;
  }

  async processBacklog({ sources = ["companion", "dictation"], maxBatches = 64 } = {}) {
    if (this.backlogActive || this.pipeline.active) return { ok: false, reason: "memory-generation-active" };
    this.backlogActive = true;
    let turns = 0;
    let candidates = 0;
    let batches = 0;
    let failed = false;
    const days = new Set();
    const results = {};
    try {
      const selected = [...new Set(sources)].filter((source) => ["companion", "dictation"].includes(source));
      const jobs = selected.flatMap((source) => this.store.unprocessedDays({ source }).map((day) => ({ source, day })));
      for (const job of jobs) {
        while (batches < Math.max(1, Math.min(64, Number(maxBatches) || 64)) && this.store.listUnprocessedTurns({ sources: [job.source], day: job.day, limit: 1 }).length) {
          batches += 1;
          let result;
          try { result = await this.pipeline.processPending({ sources: [job.source], day: job.day }); }
          catch { result = { ok: false, reason: "memory-generation-failed" }; }
          if (results[job.source]?.ok !== false) results[job.source] = result;
          if (!result?.ok) { failed = true; break; }
          if (!result.turns) break;
          turns += result.turns;
          candidates += Number(result.candidates) || 0;
          days.add(job.day);
        }
      }
      const remainingDays = new Set(selected.flatMap((source) => this.store.unprocessedDays({ source }))).size;
      const ok = !failed;
      // Existing successful days still get projected if a later request fails.
      const projection = this.projectIfConfigured();
      return { ok, skipped: !turns, turns, candidates, days: days.size, remainingDays, sources: results, projection, warning: projection.warning, warningReason: projection.warning ? projection.reason : "" };
    } finally { this.backlogActive = false; }
  }

  projectIfConfigured() {
    let status;
    try { status = this.knowledgeBaseSettings.status(); }
    catch { return failedProjection(PROJECTION_FAILED); }
    if (status?.configured !== true) return skippedProjection(PROJECTION_NOT_CONFIGURED);
    try {
      const result = this.projectionFactory(this.knowledgeBaseSettings.loadRoot()).sync(this.store.projectionItems());
      if (!result?.ok) return failedProjection(boundedCount(result?.conflicts) > 0 ? PROJECTION_CONFLICT : PROJECTION_FAILED, result);
      return Object.freeze({
        ok: true,
        skipped: false,
        warning: false,
        reason: "",
        files: boundedCount(result.files),
        written: boundedCount(result.written),
        removed: boundedCount(result.removed),
        conflicts: 0,
      });
    } catch { return failedProjection(PROJECTION_FAILED); }
  }

  async processSourceDay({ source, day } = {}) {
    const digest = await this.pipeline.processPending({ sources: [source], day });
    if (!digest?.ok || digest?.skipped) return { ...digest, projection: skippedProjection(PROJECTION_NOT_REQUESTED), warning: false, warningReason: "" };
    const projection = this.projectIfConfigured();
    return { ...digest, projection, warning: projection.warning, warningReason: projection.warning ? projection.reason : "" };
  }
}

module.exports = {
  CompanionMemoryGenerationCoordinator,
  PROJECTION_CONFLICT,
  PROJECTION_FAILED,
  PROJECTION_NOT_CONFIGURED,
  PROJECTION_NOT_REQUESTED,
  skippedProjection,
};
