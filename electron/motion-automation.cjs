"use strict";

const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

const DEFAULT_POLICY = Object.freeze({ version: 1, enabled: false, idleEnabled: false });
const TRIGGERS = new Set(["companion-start", "companion-thinking", "companion-replied", "intent-confirmed", "codex-waiting", "codex-error", "codex-completed", "idle-search"]);
const PRESETS = new Set(["attention", "nod", "search"]);

function normalizePolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_POLICY;
  if (value.version !== 1 || typeof value.enabled !== "boolean" || typeof value.idleEnabled !== "boolean") return DEFAULT_POLICY;
  return Object.freeze({ version: 1, enabled: value.enabled, idleEnabled: value.enabled && value.idleEnabled });
}

function validatePolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("motion-automation-policy-invalid");
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "enabled,idleEnabled,version" || value.version !== 1 || typeof value.enabled !== "boolean" || typeof value.idleEnabled !== "boolean") throw new Error("motion-automation-policy-invalid");
  return Object.freeze({ version: 1, enabled: value.enabled, idleEnabled: value.enabled && value.idleEnabled });
}

function safeReason(value, fallback = "motion-automation-failed") {
  const reason = String(value || "");
  return /^[a-z0-9-]{1,80}$/.test(reason) ? reason : fallback;
}

class MotionAutomationPolicyStore {
  constructor({ userDataPath } = {}) {
    if (typeof userDataPath !== "string" || !userDataPath) throw new Error("motion-automation-path-required");
    this.filePath = path.join(userDataPath, "motion-automation-policy.json");
    this.value = this.load();
  }

  load() {
    try { return normalizePolicy(JSON.parse(fs.readFileSync(this.filePath, "utf8"))); }
    catch { return DEFAULT_POLICY; }
  }

  snapshot() { return Object.freeze({ ...this.value }); }

  save(value) {
    const validated = validatePolicy(value);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    const readback = normalizePolicy(JSON.parse(fs.readFileSync(this.filePath, "utf8")));
    if (JSON.stringify(readback) !== JSON.stringify(validated)) throw new Error("motion-automation-policy-readback-mismatch");
    this.value = readback;
    return this.snapshot();
  }
}

class MotionAutomationCoordinator extends EventEmitter {
  constructor({ policyStore, executePreset, getActivity = () => ({}), now = () => Date.now(), schedule = setTimeout, cancel = clearTimeout, thinkingDelayMs = 4_000, idleDelayMs = 90_000, completionDedupeMs = 5_000, contextDedupeMs = 2_000 } = {}) {
    super();
    if (!policyStore || typeof executePreset !== "function" || typeof getActivity !== "function") throw new Error("motion-automation-dependency-invalid");
    this.policyStore = policyStore;
    this.executePreset = executePreset;
    this.getActivity = getActivity;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.thinkingDelayMs = Math.max(1, Number(thinkingDelayMs) || 4_000);
    this.idleDelayMs = Math.max(1, Number(idleDelayMs) || 90_000);
    this.completionDedupeMs = Math.max(1, Number(completionDedupeMs) || 5_000);
    this.contextDedupeMs = Math.max(1, Number(contextDedupeMs) || 2_000);
    this.thinkingTimer = null;
    this.idleTimer = null;
    this.thinkingCycle = 0;
    this.companionState = "idle";
    this.confirmationPending = false;
    this.running = false;
    this.lastCodexCompletionAt = 0;
    this.lastCodexAttentionAt = 0;
    this.lastReplyMotionAt = 0;
    this.last = Object.freeze({ state: this.policyStore.snapshot().enabled ? "ready" : "disabled", trigger: "", preset: "", reason: "", ok: null, at: "" });
    this._scheduleIdle();
  }

  snapshot() {
    return Object.freeze({ policy: this.policyStore.snapshot(), running: this.running, idleDelaySeconds: Math.round(this.idleDelayMs / 1_000), thinkingDelaySeconds: Math.round(this.thinkingDelayMs / 1_000), last: Object.freeze({ ...this.last }) });
  }

  publish() { const value = this.snapshot(); this.emit("status", value); return value; }

  setPolicy(value) {
    const policy = this.policyStore.save(value);
    if (!policy.enabled) {
      this._clearThinking();
      this._clearIdle();
      this.last = Object.freeze({ state: "disabled", trigger: "", preset: "", reason: "", ok: null, at: new Date(this.now()).toISOString() });
    } else {
      this.last = Object.freeze({ ...this.last, state: "ready", reason: "", at: new Date(this.now()).toISOString() });
      this._scheduleIdle();
    }
    return Object.freeze({ ok: true, ...this.publish() });
  }

  touchActivity() { this._scheduleIdle(); }

  async onCompanionStarted() {
    this.touchActivity();
    return this.trigger("companion-start", "attention", 1, "context");
  }

  onCompanionState(state) {
    this.touchActivity();
    const previousState = this.companionState;
    this.companionState = String(state || "idle");
    const cycle = ++this.thinkingCycle;
    this._clearThinking();
    if ((this.companionState === "completed" || (previousState === "speaking" && this.companionState === "listening")) && this.confirmationPending) {
      this.confirmationPending = false;
      void this.trigger("intent-confirmed", "nod", 1, "context");
    } else if (previousState === "speaking" && this.companionState === "listening") {
      const at = this.now();
      if (at - this.lastReplyMotionAt >= this.contextDedupeMs) {
        this.lastReplyMotionAt = at;
        void this.trigger("companion-replied", "nod", 1, "context");
      }
    }
    if (this.companionState !== "thinking" || !this.policyStore.snapshot().enabled) return this.snapshot();
    this.last = Object.freeze({ ...this.last, state: "waiting-thinking", trigger: "companion-thinking", preset: "search", reason: "", ok: null, at: new Date(this.now()).toISOString() });
    this.thinkingTimer = this.schedule(() => {
      this.thinkingTimer = null;
      if (cycle === this.thinkingCycle) void this.trigger("companion-thinking", "search", 1, "context");
    }, this.thinkingDelayMs);
    return this.publish();
  }

  async onIntentResult(result = {}) {
    this.touchActivity();
    if (result.ok !== true || !["open_application", "query_codex_status"].includes(result.type)) return this.snapshot();
    this.confirmationPending = true;
    if (this.companionState === "completed") {
      this.confirmationPending = false;
      return this.trigger("intent-confirmed", "nod", 1, "context");
    }
    this.last = Object.freeze({ state: "waiting-confirmation", trigger: "intent-confirmed", preset: "nod", reason: "", ok: null, at: new Date(this.now()).toISOString() });
    return this.publish();
  }

  async onCodexCompleted() {
    return this.onCodexState("completed");
  }

  async onCodexState(state) {
    this.touchActivity();
    const normalized = String(state || "");
    const at = this.now();
    if (normalized === "completed") {
      if (at - this.lastCodexCompletionAt < this.completionDedupeMs) return this._skip("codex-completed", "nod", "duplicate-completion");
      this.lastCodexCompletionAt = at;
      return this.trigger("codex-completed", "nod", 1, "context");
    }
    if (["waiting", "error"].includes(normalized)) {
      const trigger = normalized === "error" ? "codex-error" : "codex-waiting";
      if (at - this.lastCodexAttentionAt < this.completionDedupeMs) return this._skip(trigger, "search", "duplicate-attention");
      this.lastCodexAttentionAt = at;
      return this.trigger(trigger, "search", 1, "context");
    }
    return this._skip("", "", "codex-state-no-motion");
  }

  async trigger(trigger, preset, repeat = 1, source = "context") {
    if (!TRIGGERS.has(trigger) || !PRESETS.has(preset) || !Number.isInteger(repeat) || repeat < 1 || repeat > 3 || !["context", "idle"].includes(source)) return this._skip("", "", "motion-automation-request-invalid");
    const policy = this.policyStore.snapshot();
    if (!policy.enabled || (source === "idle" && !policy.idleEnabled)) return this._skip(trigger, preset, "motion-automation-disabled");
    if (this.running) return this._skip(trigger, preset, "motion-automation-busy");
    let activity;
    try { activity = this.getActivity() || {}; }
    catch { return this._skip(trigger, preset, "motion-automation-activity-unavailable"); }
    const blocker = activity.emergencyStopped ? "emergency-stopped"
      : activity.faulted ? "faulted"
        : activity.manualActive ? "manual-control-active"
            : activity.motionBusy ? "motion-operation-active"
              : activity.voiceActive ? "voice-workflow-active"
              : source === "idle" && activity.companionActive ? "companion-conversation-active"
                : source === "idle" && activity.agentActive ? "agent-task-active"
                : "";
    if (blocker) return this._skip(trigger, preset, blocker);
    this.running = true;
    this.last = Object.freeze({ state: "running", trigger, preset, reason: "", ok: null, at: new Date(this.now()).toISOString() });
    this.publish();
    try {
      const result = await this.executePreset(preset, repeat, source);
      const ok = result?.ok === true;
      this.last = Object.freeze({ state: ok ? "completed" : "failed", trigger, preset, reason: ok ? "" : safeReason(result?.reason), ok, at: new Date(this.now()).toISOString() });
      return Object.freeze({ ...result, automation: this.publish() });
    } catch (error) {
      this.last = Object.freeze({ state: "failed", trigger, preset, reason: safeReason(error?.message), ok: false, at: new Date(this.now()).toISOString() });
      return Object.freeze({ ok: false, reason: this.last.reason, automation: this.publish() });
    } finally {
      this.running = false;
      this.publish();
      this._scheduleIdle();
    }
  }

  close() {
    this._clearThinking();
    this._clearIdle();
    this.running = false;
    this.confirmationPending = false;
  }

  _skip(trigger, preset, reason) {
    this.last = Object.freeze({ state: this.policyStore.snapshot().enabled ? "skipped" : "disabled", trigger: TRIGGERS.has(trigger) ? trigger : "", preset: PRESETS.has(preset) ? preset : "", reason: safeReason(reason), ok: false, at: new Date(this.now()).toISOString() });
    const result = Object.freeze({ ok: false, skipped: true, reason: this.last.reason, automation: this.publish() });
    if (trigger === "idle-search") this._scheduleIdle();
    return result;
  }

  _scheduleIdle() {
    this._clearIdle();
    const policy = this.policyStore.snapshot();
    if (!policy.enabled || !policy.idleEnabled) return;
    this.idleTimer = this.schedule(() => {
      this.idleTimer = null;
      void this.trigger("idle-search", "search", 1, "idle");
    }, this.idleDelayMs);
  }

  _clearThinking() { if (this.thinkingTimer !== null) this.cancel(this.thinkingTimer); this.thinkingTimer = null; }
  _clearIdle() { if (this.idleTimer !== null) this.cancel(this.idleTimer); this.idleTimer = null; }
}

module.exports = { DEFAULT_MOTION_AUTOMATION_POLICY: DEFAULT_POLICY, MotionAutomationCoordinator, MotionAutomationPolicyStore, normalizePolicy, validatePolicy };
