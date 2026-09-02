import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { CompanionMemoryStore } = require("../electron/companion-memory.cjs");
const { CompanionMemoryControl, TOKEN_TTL_MS } = require("../electron/companion-memory-control.cjs");
const { createKnowledgeBaseSettings } = require("../electron/knowledge-base-settings.cjs");

function withMemoryStore(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-t12a-memory-"));
  let now = 1_800_000_000_000;
  const store = new CompanionMemoryStore({ userDataPath: directory, now: () => now });
  try { return run({ store, directory, now: () => now, advance: (value = 1) => { now += value; } }); }
  finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

test("reviewed export excludes raw turns, pending/rejected candidates and vectors", () => withMemoryStore(({ store, now, advance }) => {
  store.commitConversationTurn({ eventId: "conversation-1:user:1", sessionId: "conversation-1", role: "user", content: "raw private turn", createdAt: new Date(now()).toISOString() });
  advance();
  store.upsertDailySummary({ day: "2026-09-01", summary: "reviewed day", sourceTurnCount: 1 });
  advance();
  const accepted = store.addCandidate({ day: "2026-09-01", kind: "preference", summary: "old wording" });
  assert.equal(store.updateCandidate({ id: accepted.id, summary: "corrected preference" }).ok, true);
  assert.equal(store.setCandidateState(accepted.id, "accepted").ok, true);
  const pending = store.addCandidate({ day: "2026-09-01", summary: "pending private candidate" });
  const rejected = store.addCandidate({ day: "2026-09-01", summary: "rejected private candidate" });
  store.setCandidateState(rejected.id, "rejected");
  assert.equal(store.updateCandidate({ id: rejected.id, summary: "must fail" }).reason, "memory-item-not-editable");
  store.db.prepare("INSERT INTO memory_embeddings (candidate_id, model, dimensions, vector, created_at) VALUES (?, ?, ?, ?, ?)").run(accepted.id, "test", 2, Buffer.from([1, 2]), now());

  const exported = store.exportReviewed({ exportedAt: "2026-09-01T12:00:00.000Z" });
  assert.deepEqual(exported, {
    schema: "deskmate.memory.export.v1",
    exportedAt: "2026-09-01T12:00:00.000Z",
    dailySummaries: [{ day: "2026-09-01", source: "companion", summary: "reviewed day" }],
    longTermMemories: [{ day: "2026-09-01", source: "companion", kind: "preference", summary: "corrected preference" }],
  });
  const serialized = JSON.stringify(exported);
  for (const privateValue of ["raw private turn", "pending private candidate", "rejected private candidate", accepted.id, pending.id, "vector", "sourceTurnIds"]) assert.doesNotMatch(serialized, new RegExp(privateValue));
}));

test("forget confirmations are one-use, revision-bound and whole-store erasure is complete", () => withMemoryStore(({ store, now, advance }) => {
  store.commitConversationTurn({ eventId: "conversation-2:user:1", sessionId: "conversation-2", role: "user", content: "erase me", createdAt: new Date(now()).toISOString() });
  store.upsertDailySummary({ day: "2026-09-01", summary: "erase day" });
  const candidate = store.addCandidate({ day: "2026-09-01", summary: "erase candidate" });
  store.setCandidateState(candidate.id, "accepted");
  store.db.prepare("INSERT INTO memory_embeddings (candidate_id, model, dimensions, vector, created_at) VALUES (?, ?, ?, ?, ?)").run(candidate.id, "test", 1, Buffer.from([1]), now());
  let tokenSequence = 0;
  const control = new CompanionMemoryControl({ store, now, createToken: () => `token-${++tokenSequence}` });

  const stale = control.prepareForget({ scope: "item", type: "candidate", id: candidate.id });
  advance();
  store.updateCandidate({ id: candidate.id, summary: "changed after preview" });
  assert.equal(control.confirmForget({ token: stale.token }).reason, "memory-changed-concurrently");
  assert.equal(control.confirmForget({ token: stale.token }).reason, "memory-confirmation-expired");

  const item = control.prepareForget({ scope: "item", type: "candidate", id: candidate.id });
  assert.equal(control.confirmForget({ token: item.token }).ok, true);
  assert.equal(store.status().longTermMemories, 0);
  assert.equal(store.status().embeddings, 0);

  const all = control.prepareForget({ scope: "all" });
  const forgotten = control.confirmForget({ token: all.token });
  assert.equal(forgotten.ok, true);
  assert.deepEqual(store.status(), { ready: true, storage: "sqlite-wal", turns: 0, dailySummaries: 0, pendingCandidates: 0, longTermMemories: 0, embeddings: 0, unprocessedTurns: 0, indexedChunks: 0, sourceCounts: { companion: { turns: 0, unprocessed: 0 }, dictation: { turns: 0, unprocessed: 0 } } });
  assert.equal(store.db.prepare("SELECT COUNT(*) AS value FROM companion_memory_outbox").get().value, 0);
}));

test("expired forget tokens fail closed without deleting data", () => withMemoryStore(({ store, now, advance }) => {
  store.upsertDailySummary({ day: "2026-09-01", summary: "keep me" });
  const control = new CompanionMemoryControl({ store, now, createToken: () => "expiring-token" });
  const pending = control.prepareForget({ scope: "item", type: "daily", id: "2026-09-01" });
  advance(TOKEN_TTL_MS + 1);
  assert.equal(control.confirmForget({ token: pending.token }).reason, "memory-confirmation-expired");
  assert.equal(store.status().dailySummaries, 1);
}));

test("memory candidate review is a one-way decision", () => withMemoryStore(({ store }) => {
  const accepted = store.addCandidate({ day: "2026-09-01", summary: "keep this" });
  assert.equal(store.setCandidateState(accepted.id, "accepted").ok, true);
  assert.deepEqual(store.setCandidateState(accepted.id, "rejected"), { ok: false, reason: "memory-candidate-already-reviewed" });
  assert.throws(() => store.setCandidateState(accepted.id, "pending"), /候选状态无效/);
  assert.equal(store.list({ filter: "long-term" })[0].state, "accepted");
}));

test("knowledge-base location is encrypted and renderer status never exposes the full path", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-t12a-kb-"));
  const userDataPath = path.join(directory, "user-data");
  const root = path.join(directory, "MyKnowledgeBase");
  fs.mkdirSync(root, { recursive: true });
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (value) => value.toString("utf8").replace(/^encrypted:/, ""),
  };
  try {
    const settings = createKnowledgeBaseSettings({ safeStorage, userDataPath });
    assert.equal(settings.status().configured, false);
    assert.throws(() => settings.saveRoot("relative-folder"), /knowledge-base-location-invalid/);
    const status = settings.saveRoot(root);
    assert.deepEqual(status, { configured: true, storage: "windows-encrypted", label: "MyKnowledgeBase", projection: "markdown-double-link-v1", embedding: "deskmate-local-hash-embedding-v1", reason: "" });
    assert.equal(settings.loadRoot(), root);
    const stored = fs.readFileSync(path.join(userDataPath, "knowledge-base-settings.json"), "utf8");
    assert.doesNotMatch(stored, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(JSON.stringify(status), new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("memory UI exposes real controls while keeping raw storage and paths in Electron main", async () => {
  const [page, preload, main] = await Promise.all([
    readFile(new URL("../src/pages.jsx", import.meta.url), "utf8"),
    readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
  ]);
  const memoryPage = page.slice(page.indexOf("function MemoryManagementPage"), page.indexOf("export function DashboardPage"));
  for (const copy of ["导出摘要与已审核记忆", "彻底忘记全部", "保存纠正", "永久删除", "知识库位置", "[[双向链接]]", "混合检索"]) assert.match(memoryPage, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const api of ["updateMemoryCandidate", "prepareMemoryForget", "confirmMemoryForget", "exportReviewedMemories", "getKnowledgeBaseStatus", "chooseKnowledgeBaseLocation", "generatePendingMemories", "rebuildMemoryIndex", "syncKnowledgeBase"]) assert.match(preload, new RegExp(api));
  assert.match(main, /showSaveDialog/);
  assert.match(main, /showOpenDialog/);
  assert.doesNotMatch(preload, /loadRoot|databasePath|conversationTurns|outboxPayload/);
});
