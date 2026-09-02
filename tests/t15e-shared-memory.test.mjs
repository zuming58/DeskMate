import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { CompanionMemoryStore } = require("../electron/companion-memory.cjs");
const { CompanionMemoryPipeline } = require("../electron/companion-memory-pipeline.cjs");
const { CompanionMemoryDigestScheduler, CompanionMemoryPolicyStore } = require("../electron/companion-memory-policy.cjs");
const { KnowledgeBaseProjection, dailyDocument, memoryDocument } = require("../electron/knowledge-base-projection.cjs");
const { DatabaseSync } = require("node:sqlite");

function temporary(prefix, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    const result = run(directory);
    if (result && typeof result.finally === "function") return result.finally(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.rmSync(directory, { recursive: true, force: true });
    return result;
  } catch (error) { fs.rmSync(directory, { recursive: true, force: true }); throw error; }
}

test("memory policy defaults to 23:30 and supports two independently disabled sources", () => temporary("deskmate-t15e-policy-", (directory) => {
  const policy = new CompanionMemoryPolicyStore({ userDataPath: directory });
  assert.equal(policy.snapshot().dailyTime, "23:30");
  assert.deepEqual(policy.snapshot().enabledSources, ["companion", "dictation"]);
  const saved = policy.save({ version: 1, enabledSources: [], schedule: "daily", dailyTime: "06:45" });
  assert.deepEqual(saved.enabledSources, []);
  assert.equal(new CompanionMemoryPolicyStore({ userDataPath: directory }).snapshot().dailyTime, "06:45");
}));

test("legacy daily summaries migrate losslessly to the companion source", () => temporary("deskmate-t15e-migrate-", (directory) => {
  const file = path.join(directory, "companion-memory.sqlite3");
  const legacy = new DatabaseSync(file);
  legacy.exec("CREATE TABLE daily_summaries (day TEXT PRIMARY KEY, summary TEXT NOT NULL, source_turn_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL); INSERT INTO daily_summaries VALUES ('2026-09-01', '旧摘要', 2, 1, 2);");
  legacy.close();
  const store = new CompanionMemoryStore({ userDataPath: directory });
  try {
    assert.deepEqual(store.list({ filter: "daily" }).map(({ id, day, source, content }) => ({ id, day, source, content })), [{ id: "companion:2026-09-01", day: "2026-09-01", source: "companion", content: "旧摘要" }]);
  } finally { store.close(); }
}));

test("daily scheduler waits until the configured minute and records source results independently", async () => temporary("deskmate-t15e-schedule-", async (directory) => {
  let now = new Date(2026, 8, 3, 23, 29, 0).getTime();
  const policy = new CompanionMemoryPolicyStore({ userDataPath: directory });
  policy.save({ version: 1, enabledSources: ["companion", "dictation"], schedule: "daily", dailyTime: "23:30" });
  const calls = [];
  const scheduler = new CompanionMemoryDigestScheduler({
    policyStore: policy,
    now: () => now,
    pendingDays: async (source) => source === "companion" ? ["2026-09-03"] : [],
    process: async ({ source, day }) => { calls.push({ source, day }); return { ok: true, source, day, inputDigest: "a".repeat(64), turns: 1, candidates: 0 }; },
  });
  assert.equal((await scheduler.tick()).reason, undefined);
  assert.deepEqual(calls, []);
  now = new Date(2026, 8, 3, 23, 30, 0).getTime();
  assert.equal((await scheduler.tick()).ok, true);
  assert.deepEqual(calls, [{ source: "companion", day: "2026-09-03" }]);
  assert.equal(policy.snapshot().lastResults.companion.status, "completed");
  assert.equal(policy.snapshot().lastResults.dictation.status, "no-pending");
}));

test("startup catch-up runs before today's schedule and retries only a failed source", async () => temporary("deskmate-t15e-catchup-", async (directory) => {
  const now = new Date(2026, 8, 3, 8, 0, 0).getTime();
  const policy = new CompanionMemoryPolicyStore({ userDataPath: directory });
  policy.save({ version: 1, enabledSources: ["companion", "dictation"], schedule: "daily", dailyTime: "23:30" });
  let dictationAttempts = 0;
  const completed = new Set();
  const calls = [];
  const scheduler = new CompanionMemoryDigestScheduler({
    policyStore: policy,
    now: () => now,
    pendingDays: async (source) => completed.has(source) ? [] : ["2026-09-02"],
    process: async ({ source, day }) => {
      calls.push(source);
      if (source === "dictation" && ++dictationAttempts === 1) throw new Error("memory-provider-temporary");
      completed.add(source);
      return { ok: true, source, day, inputDigest: source === "companion" ? "b".repeat(64) : "c".repeat(64), turns: 1, candidates: 1 };
    },
  });
  assert.equal((await scheduler.tick()).ok, false);
  assert.deepEqual(calls, ["companion", "dictation"]);
  assert.equal(policy.snapshot().lastResults.companion.status, "completed");
  assert.equal(policy.snapshot().lastResults.dictation.status, "failed");
  assert.equal((await scheduler.tick()).ok, true);
  assert.deepEqual(calls, ["companion", "dictation", "dictation"]);
  assert.equal(policy.snapshot().lastResults.dictation.status, "completed");
}));

test("shared ingestion is source-aware, idempotent, and never summarizes an empty source", async () => temporary("deskmate-t15e-store-", async (directory) => {
  const fixed = new Date(2026, 8, 3, 12, 0, 0).getTime();
  const store = new CompanionMemoryStore({ userDataPath: directory, now: () => fixed });
  try {
    const createdAt = new Date(fixed).toISOString();
    const first = store.commitConversationTurn({ eventId: "companion:1", sessionId: "companion:1", role: "user", content: "我偏好简洁回答", source: "companion", createdAt });
    assert.equal(first.inserted, true);
    assert.equal(store.commitConversationTurn({ eventId: "companion:1", sessionId: "companion:1", role: "user", content: "我偏好简洁回答", source: "companion", createdAt }).inserted, false);
    assert.throws(() => store.commitConversationTurn({ eventId: "companion:1", sessionId: "companion:1", role: "user", content: "我偏好简洁回答", source: "dictation", createdAt }), /memory-event-id-collision/);
    store.commitConversationTurn({ eventId: "dictation:1", sessionId: "dictation:1", role: "user", content: "记录今天的工作", source: "dictation", createdAt });
    let modelCalls = 0;
    const pipeline = new CompanionMemoryPipeline({ store, loadSecret: () => ({ apiKey: "test" }), requestJson: async () => { modelCalls += 1; return { summary: "本日摘要", candidates: [{ kind: "preference", summary: "偏好简洁回答" }] }; } });
    const companion = await pipeline.processPending({ sources: ["companion"], day: "2026-09-03" });
    const dictation = await pipeline.processPending({ sources: ["dictation"], day: "2026-09-03" });
    assert.equal(companion.source, "companion");
    assert.equal(dictation.source, "dictation");
    assert.match(companion.inputDigest, /^[a-f0-9]{64}$/);
    assert.notEqual(companion.inputDigest, dictation.inputDigest);
    assert.equal(modelCalls, 2);
    assert.equal((await pipeline.processPending({ sources: ["companion"], day: "2026-09-03" })).reason, "memory-no-unprocessed-turns");
    assert.equal(modelCalls, 2);
    assert.deepEqual(store.status().sourceCounts, { companion: { turns: 1, unprocessed: 0 }, dictation: { turns: 1, unprocessed: 0 } });
    assert.equal(store.list({ source: "dictation" }).every((item) => item.source === "dictation" || item.source === "mixed"), true);
    assert.deepEqual(store.list({ filter: "daily" }).map((item) => item.source).sort(), ["companion", "dictation"]);
    assert.equal(store.db.prepare("SELECT COUNT(*) AS value FROM memory_digest_runs").get().value, 2);
  } finally { store.close(); }
}));

test("knowledge projection preserves bounded source provenance", () => {
  assert.match(dailyDocument({ day: "2026-09-03", summary: "摘要", source: "dictation", sourceTurnCount: 1 }, []), /source: "dictation"/);
  assert.match(memoryDocument({ id: "1234567890abcdef", day: "2026-09-03", kind: "fact", summary: "内容", source: "dictation" }), /source: "dictation"/);
  assert.match(memoryDocument({ id: "1234567890abcdef", day: "2026-09-03", kind: "fact", summary: "内容", source: "dictation" }), /\[\[daily\/dictation\/2026-09-03/);
});

test("knowledge projection writes separate same-day source notes", () => temporary("deskmate-t15e-projection-", (root) => {
  const projection = new KnowledgeBaseProjection({ root });
  const result = projection.sync({
    dailySummaries: [
      { day: "2026-09-03", source: "companion", summary: "陪伴摘要", sourceTurnCount: 1 },
      { day: "2026-09-03", source: "dictation", summary: "语音摘要", sourceTurnCount: 1 },
    ],
    memories: [],
  });
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(root, "DeskMate", "daily", "companion", "2026-09-03.md")), true);
  assert.equal(fs.existsSync(path.join(root, "DeskMate", "daily", "dictation", "2026-09-03.md")), true);
}));

test("renderer contract only ingests successful real dictation and exposes source controls", async () => {
  const [page, preload, main] = await Promise.all([
    readFile(new URL("../src/pages.jsx", import.meta.url), "utf8"),
    readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
  ]);
  for (const copy of ["来源与自动整理", "陪伴对话", "语音输入", "每天 23:30", "下次整理", "上次结果", "可立即重试", "保存记忆策略"]) assert.match(page, new RegExp(copy));
  assert.match(page, /workflow === "input" && result\.status === "success" && state\.settings\.sttMode !== "mock"/);
  assert.match(page, /commitDictationMemory/);
  for (const api of ["getMemoryPolicy", "setMemoryPolicy", "commitDictationMemory"]) assert.match(preload, new RegExp(api));
  assert.match(main, /source: "dictation"/);
  assert.doesNotMatch(preload, /inputDigest|memory_digest_runs|source_turn_ids/);
});
