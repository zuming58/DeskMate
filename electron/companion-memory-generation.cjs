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
