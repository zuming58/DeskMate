import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { CompanionPersonaStore, buildPersonaInstructions } = require("../electron/companion-persona.cjs");
const { CompanionMemoryStore } = require("../electron/companion-memory.cjs");
const { CompanionMemoryPipeline } = require("../electron/companion-memory-pipeline.cjs");
const { KnowledgeBaseProjection } = require("../electron/knowledge-base-projection.cjs");
const { CompanionIntentBridge } = require("../electron/companion-intent-bridge.cjs");
const { summarizeCodexWork } = require("../electron/codex-work-summary.cjs");

async function temp(prefix, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try { return await run(directory); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

test("versioned persona persists and safety boundary remains after user persona", () => temp("deskmate-persona-", (directory) => {
  const store = new CompanionPersonaStore({ userDataPath: directory });
  const saved = store.save({ role: "我的工作搭档", traits: "直接、耐心", speakingStyle: "先结论", boundaries: "打开应用前先问我" });
  assert.equal(saved.persona.version, 1);
  const loaded = new CompanionPersonaStore({ userDataPath: directory }).snapshot().persona;
  assert.equal(loaded.role, "我的工作搭档");
  const prompt = buildPersonaInstructions({ name: "小智", persona: loaded });
  assert.match(prompt, /小智/);
  assert.match(prompt, /打开应用前先问我/);
  assert.ok(prompt.indexOf("安全边界优先于人设") > prompt.indexOf("打开应用前先问我"));
}));

test("memory pipeline only creates review candidates from unprocessed real turns", async () => temp("deskmate-memory-pipeline-", async (directory) => {
  const store = new CompanionMemoryStore({ userDataPath: directory, now: () => Date.parse("2026-09-02T08:00:00.000Z") });
  try {
    store.commitConversationTurn({ eventId: "session-12345678:turn:1:user", sessionId: "session-12345678", role: "user", content: "我偏好简洁的方案", createdAt: "2026-09-02T08:00:00.000Z" });
    const pipeline = new CompanionMemoryPipeline({ store, loadSecret: () => ({ apiKey: "secret" }), requestJson: async ({ messages }) => {
      assert.match(messages[0].content, /不得推断敏感属性/);
      return { summary: "用户说明了表达偏好。", candidates: [{ kind: "preference", summary: "用户偏好简洁方案" }] };
    } });
    const result = await pipeline.processPending();
    assert.deepEqual({ ok: result.ok, turns: result.turns, candidates: result.candidates }, { ok: true, turns: 1, candidates: 1 });
    assert.equal(store.status().unprocessedTurns, 0);
    assert.equal(store.status().pendingCandidates, 1);
    assert.equal((await pipeline.processPending()).skipped, true);
  } finally { store.close(); }
}));

test("accepted memories are chunked, locally embedded and searchable without exposing vectors", () => temp("deskmate-memory-index-", (directory) => {
  const store = new CompanionMemoryStore({ userDataPath: directory });
  try {
    const first = store.addCandidate({ day: "2026-09-02", kind: "preference", summary: "用户喜欢简洁直接的技术方案" });
    const second = store.addCandidate({ day: "2026-09-02", kind: "project", summary: "DeskMate 使用蓝色和深石墨色界面" });
    store.setCandidateState(first.id, "accepted"); store.setCandidateState(second.id, "accepted");
    const rebuilt = store.rebuildLocalIndex();
    assert.equal(rebuilt.memories, 2);
    assert.equal(store.rebuildLocalIndex().reused, rebuilt.chunks);
    const results = store.searchLongTermMemory({ query: "简洁方案" });
    assert.equal(results[0].id, first.id);
    assert.equal(Object.hasOwn(results[0], "vector"), false);
  } finally { store.close(); }
}));

test("Markdown projection uses stable double links and preserves user conflicts", () => temp("deskmate-kb-projection-", (root) => {
  const projection = new KnowledgeBaseProjection({ root, now: () => "2026-09-02T09:00:00.000Z" });
  const data = { dailySummaries: [{ day: "2026-09-02", source: "companion", summary: "完成了记忆开发", sourceTurnCount: 2 }], memories: [{ id: "12345678-1234-1234-1234-123456789abc", day: "2026-09-02", source: "companion", kind: "project", summary: "DeskMate 长期记忆" }] };
  const first = projection.sync(data);
  assert.equal(first.ok, true);
  const note = path.join(root, "DeskMate", "memories", "12345678-1234-1234-1234-123456789abc.md");
  assert.match(fs.readFileSync(note, "utf8"), /\[\[daily\/companion\/2026-09-02/);
  fs.writeFileSync(note, "user edited", "utf8");
  const second = projection.sync(data);
  assert.equal(second.conflicts, 1);
  assert.equal(fs.readFileSync(note, "utf8"), "user edited");
}));

test("intent bridge directly opens only an explicitly voice-enabled registered action", async () => {
  let opened = 0;
  let now = 1000;
  const action = { id: "12345678-1234-1234-1234-123456789abc", label: "Codex", voiceEnabled: true };
  const actions = { listRegistered: () => [action], describe: (id) => id === action.id ? action : null, executeVoice: async () => { opened += 1; return { ok: true, label: "Codex" }; } };
  const bridge = new CompanionIntentBridge({ loadSecret: () => ({ apiKey: "secret" }), appActions: actions, codexStatus: () => ({ state: "waiting" }), requestJson: async () => ({ type: "open_application", actionId: action.id }), now: () => now, createToken: () => "one-use" });
  const analyzed = await bridge.analyze("打开 Codex");
  assert.equal(opened, 1);
  assert.equal(analyzed.result.type, "open_application");
  assert.equal(analyzed.result.ok, true);
  assert.equal((await bridge.confirm("one-use")).reason, "intent-confirmation-expired");
  now += 1;
});

test("Codex helper reports attention without inventing progress", () => {
  assert.deepEqual(summarizeCodexWork({ state: "waiting", updatedAt: "now" }), { state: "waiting", summary: "Codex 正在等待你的确认或补充", needsAttention: true, progressKnown: false, updatedAt: "now" });
});
