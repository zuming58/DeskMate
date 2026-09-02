import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { normalizeMotionState, MOTION_REPEAT_DEFAULTS } from "../src/domain/motionPresets.js";

const require = createRequire(import.meta.url);
const { CodexTaskBriefServer, CodexTaskBriefStore, decodeCodexTaskBrief, encodeCodexTaskBrief, sendCodexTaskBrief } = require("../electron/codex-task-brief.cjs");
const { CompanionIntentBridge } = require("../electron/companion-intent-bridge.cjs");

const task = (overrides = {}) => ({ version: "codex-task-brief-v1", provider: "codex", taskKey: "opaque_01", taskLabel: "DeskMate 软件", state: "working", milestone: "正在补齐测试", sequence: 1, ...overrides });

test("codex-task-brief-v1 accepts only the exact privacy-safe schema", () => {
  const encoded = encodeCodexTaskBrief(task());
  assert.deepEqual(decodeCodexTaskBrief(encoded.trim()), task());
  assert.equal(decodeCodexTaskBrief(JSON.stringify({ ...task(), prompt: "secret" })), null);
  assert.equal(decodeCodexTaskBrief(JSON.stringify(task({ milestone: "x".repeat(81) }))), null);
  assert.equal(decodeCodexTaskBrief(JSON.stringify(task({ taskKey: "short" }))), null);
  assert.equal(decodeCodexTaskBrief(JSON.stringify(task({ taskLabel: "https://example.com" }))), null);
  assert.equal(decodeCodexTaskBrief(JSON.stringify(task({ milestone: "password=secret" }))), null);
  const withoutMilestone = task(); delete withoutMilestone.milestone;
  assert.equal(decodeCodexTaskBrief(JSON.stringify(withoutMilestone)).milestone, "");
});

test("optional local reporter reaches the bounded receiver without exposing the opaque key", async (context) => {
  const pipePath = `\\\\.\\pipe\\deskmate-t16-test-${process.pid}-${Date.now()}`;
  const received = [];
  const server = new CodexTaskBriefServer({ pipePath, onReport: (value) => received.push(value) });
  context.after(() => server.stop());
  assert.equal((await server.start()).ok, true);
  assert.equal((await sendCodexTaskBrief(task(), { pipePath })).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(received.length, 1);
  assert.equal(received[0].taskKey, "opaque_01");
});

test("task brief store keeps eight recent tasks, rejects stale sequence and throttles only ordinary progress", () => {
  let now = 1_000;
  const store = new CodexTaskBriefStore({ now: () => now });
  assert.match(store.ingest(task()).announcement.text, /正在执行/);
  now += 1_000;
  assert.equal(store.ingest(task({ sequence: 2, milestone: "继续开发" })).announcement, null);
  assert.equal(store.ingest(task({ sequence: 2 })).reason, "codex-task-brief-stale");
  now += 1;
  assert.match(store.ingest(task({ sequence: 3, state: "waiting", milestone: "需要选择" })).announcement.text, /等你回复/);
  for (let index = 2; index <= 10; index += 1) store.ingest(task({ taskKey: `task_${String(index).padStart(4, "0")}`, taskLabel: `任务 ${index}`, sequence: 1 }));
  assert.equal(store.list().length, 8);
});

test("thinking announces once while waiting, completed and error remain immediate", () => {
  let now = 10_000;
  const store = new CodexTaskBriefStore({ now: () => now });
  assert.ok(store.ingest(task({ state: "thinking" })).announcement);
  now += 16_000;
  assert.equal(store.ingest(task({ state: "thinking", sequence: 2 })).announcement, null);
  for (const [sequence, state] of [[3, "waiting"], [4, "completed"], [5, "error"]]) {
    now += 1;
    assert.ok(store.ingest(task({ sequence, state })).announcement);
  }
});

test("multiple Codex tasks require a named label and deterministic templates never invent progress", () => {
  const store = new CodexTaskBriefStore();
  store.ingest(task({ taskKey: "task_one", taskLabel: "桌面软件", state: "working", milestone: "代码门通过" }));
  store.ingest(task({ taskKey: "task_two", taskLabel: "固件审计", state: "waiting", milestone: "等待人工验证" }));
  const ambiguous = store.query("做到哪一步了");
  assert.equal(ambiguous.needsDisambiguation, true);
  assert.match(ambiguous.answer, /请说出任务名称/);
  const named = store.query("桌面软件做完了吗");
  assert.equal(named.needsDisambiguation, false);
  assert.equal(named.answer, "桌面软件 正在执行：代码门通过");
  assert.doesNotMatch(named.answer, /%/);
});

test("voice intent opens enabled apps, rejects disabled apps, answers Codex deterministically, and reserves motion without wire output", async () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  let enabled = false;
  let opened = 0;
  const appActions = { listRegistered: () => [{ id, label: "Codex", voiceEnabled: enabled }], describe: () => ({ id, label: "Codex", voiceEnabled: enabled }), executeVoice: async () => { opened += 1; return { ok: true, label: "Codex" }; } };
  let classified = { type: "open_application", actionId: id };
  const codexTasks = { query: () => ({ available: true, needsDisambiguation: false, answer: "桌面软件 已完成：测试通过" }) };
  const bridge = new CompanionIntentBridge({ loadSecret: () => ({ apiKey: "x" }), appActions, codexStatus: () => ({ state: "working" }), codexTasks, requestJson: async () => classified });
  assert.equal((await bridge.analyze("打开 Codex")).reason, "application-voice-not-enabled");
  assert.equal(opened, 0);
  enabled = true;
  assert.equal((await bridge.analyze("打开 Codex")).result.ok, true);
  assert.equal(opened, 1);
  classified = { type: "query_codex_status" };
  assert.equal((await bridge.analyze("桌面软件做完了吗")).result.answer, "桌面软件 已完成：测试通过");
  classified = { type: "run_motion_preset", preset: "nod" };
  const motion = await bridge.analyze("点两次头");
  assert.equal(motion.reason, "motion-preset-contract-not-frozen");
  assert.equal(motion.result.preset, "nod");
});

test("motion repeat count is local-only bounded state with preset defaults", () => {
  assert.deepEqual(MOTION_REPEAT_DEFAULTS, { attention: 1, search: 1, nod: 2, dance: 2 });
  assert.equal(normalizeMotionState({ preset: "nod" }).repeatCount, 2);
  assert.equal(normalizeMotionState({ preset: "attentive", repeatCount: 9 }).repeatCount, 1);
  assert.equal(normalizeMotionState({ preset: "dance", repeatCount: 3 }).repeatCount, 3);
});
