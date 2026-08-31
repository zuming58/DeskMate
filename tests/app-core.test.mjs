import test from "node:test";
import assert from "node:assert/strict";
import { defaultState, loadState, migrateState, reduceAppState, SCHEMA_VERSION, validateConfig } from "../src/store/appStore.js";
import { AI_EVENT_TYPES, AgentStatusAdapter } from "../src/adapters/index.js";

test("migrates legacy storage to current schema without dropping defaults", () => {
  const result = migrateState({ schemaVersion: 0, hotwords: ["旧词"], rules: [] });
  assert.equal(result.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(result.vocabulary.hotwords, ["旧词"]);
  assert.equal(result.settings.theme, defaultState.settings.theme);
  assert.equal(result.settings.formatting, "raw");
  assert.equal(result.keymap.length, 8);
  assert.equal(result.keymap[0].action, "voice-input");
  assert.equal(result.settings.activeWindowOutputEnabled, true);
});

test("migrates history schema v4 to raw and organized text fields", () => {
  const result = migrateState({ schemaVersion: 4, history: [{ id: 9, time: "10:00", text: "legacy text" }] });
  assert.equal(result.schemaVersion, SCHEMA_VERSION);
  assert.equal(result.history[0].rawText, "legacy text");
  assert.equal(result.history[0].text, "legacy text");
  assert.equal(result.history[0].organizer.mode, "raw");
});

test("migrates and validates the local manual Agent selection", () => {
  const migrated = migrateState({ schemaVersion: 6, agentControl: { agentId: "hermes", state: "waiting_user" } });
  assert.deepEqual(migrated.agentControl, { agentId: "hermes", customName: "", state: "waiting_user" });
  assert.throws(() => validateConfig({ agentControl: { agentId: "unknown", state: "idle" } }), /AI 手动控制/);
  assert.throws(() => validateConfig({ agentControl: { agentId: "codex", state: "made-up" } }), /AI 手动控制/);
});

test("rejects malformed imported configurations", () => {
  assert.throws(() => validateConfig({ keymap: ["only-one"] }), /8 项/);
  assert.throws(() => validateConfig({ schemaVersion: "1" }), /数字/);
  assert.throws(() => validateConfig(null), /JSON 对象/);
  assert.throws(() => validateConfig({ currentExpression: "missing" }), /表情不存在/);
  assert.throws(() => validateConfig({ history: "not-an-array" }), /历史记录/);
  assert.throws(() => validateConfig({ expressionMapping: { working: "missing" } }), /状态表情映射/);
  assert.throws(() => validateConfig({ schemaVersion: 99 }), /更高版本/);
  assert.throws(() => validateConfig({ settings: { sttMode: "pretend-connected" } }), /STT 模式/);
  assert.throws(() => validateConfig({ settings: { rightAltEnabled: "yes" } }), /右 Alt/);
});

test("falls back to defaults when persisted storage has an invalid shape", () => {
  const storage = { getItem: () => JSON.stringify({ history: "bad", currentExpression: "missing" }) };
  const result = loadState(storage);
  assert.equal(result.currentExpression, defaultState.currentExpression);
  assert.ok(Array.isArray(result.history));
});

test("maps AI events through status and agent-specific expression rules", () => {
  const state = structuredClone(defaultState);
  state.agentExpressionMapping.codex = "happy";
  const working = reduceAppState(state, { type: "event", value: { type: "working", agent: "Codex", progress: 25, detail: "编码" } });
  assert.equal(working.currentExpression, "happy");
  const waiting = reduceAppState(working, { type: "event", value: { type: "waiting_user", agent: "Codex", progress: 25, detail: "等待" } });
  assert.equal(waiting.currentExpression, state.expressionMapping.waiting_user);
});

test("agent adapter emits only supported events and maps status payload", () => {
  const adapter = new AgentStatusAdapter();
  const received = [];
  adapter.subscribe((event) => received.push(event));
  adapter.setStatus({ type: "waiting_user", agent: "Codex", progress: 68, detail: "等待用户确认" });
  assert.deepEqual(received.at(-1), { type: "waiting_user", agent: "Codex", progress: 68, detail: "等待用户确认" });
  assert.deepEqual(AI_EVENT_TYPES, ["idle", "listening", "thinking", "working", "waiting_user", "completed", "error"]);
  assert.throws(() => adapter.setStatus({ type: "unknown" }), /未知 AI 状态/);
});

test("agent subscriptions can preserve restored application state on mount", () => {
  const adapter = new AgentStatusAdapter();
  const received = [];
  adapter.subscribe((event) => received.push(event), { emitCurrent: false });
  assert.equal(received.length, 0);
  adapter.setStatus({ type: "completed", agent: "Codex", progress: 140, detail: "完成" });
  assert.equal(received[0].progress, 100);
});
