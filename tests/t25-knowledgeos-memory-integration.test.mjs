import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { CompanionMemoryStore } = require("../electron/companion-memory.cjs");
const { CompanionMemoryPolicyStore } = require("../electron/companion-memory-policy.cjs");
const { KnowledgeBaseProjection } = require("../electron/knowledge-base-projection.cjs");
const { KnowledgeOsMemoryGateway, MemoryJournalService } = require("../electron/memory-journal-service.cjs");
const { createKnowledgeOsSettings } = require("../electron/knowledgeos-settings.cjs");

function temporary(prefix, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    const result = run(directory);
    if (result && typeof result.finally === "function") return result.finally(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.rmSync(directory, { recursive: true, force: true });
    return result;
  } catch (error) { fs.rmSync(directory, { recursive: true, force: true }); throw error; }
}

function fakeKnowledgeOs({ syncEnabled = false, projectId = "01900000-0000-7000-8000-000000000001" } = {}) {
  return { status: () => ({ configured: true, readEnabled: true, syncEnabled, projectId, sensitivity: "private" }) };
}

function journalHarness(directory, { syncEnabled = false } = {}) {
  let now = new Date(2026, 8, 11, 21, 0, 0).getTime();
  const store = new CompanionMemoryStore({ userDataPath: directory, now: () => now });
  const policyStore = new CompanionMemoryPolicyStore({ userDataPath: directory });
  const root = path.join(directory, "knowledge-base");
  const projection = new KnowledgeBaseProjection({ root, now: () => new Date(now).toISOString() });
  const calls = [];
  const knowledgeOsSettings = fakeKnowledgeOs({ syncEnabled });
  const knowledgeOsClient = { callTool: async (name, args) => { calls.push({ name, args }); return { ok: true, data: { submission_id: `01900000-0000-7000-8000-${String(calls.length).padStart(12, "0")}` } }; } };
  const modelInputs = [];
  const requestJson = async ({ messages }) => {
    const input = JSON.parse(messages.at(-1).content);
    modelInputs.push(input);
    if (input.workday) return { summary: "本小时完成 DeskMate 记忆开发。" };
    if (input.records) return { workItems: ["DeskMate 项目完成日终记忆链路"], personalItems: ["用户明确偏好简洁的工作总结"], candidates: [{ kind: "preference", summary: "用户偏好简洁的工作总结" }] };
    return { workMarkdown: "### 项目与实际进展\n- DeskMate：完成日终记忆链路。", personalMarkdown: "### 明确偏好\n- 用户偏好简洁的工作总结。", candidates: [] };
  };
  const service = new MemoryJournalService({ store, policyStore, knowledgeBaseProjection: () => projection.sync(store.projectionItems()), knowledgeOsSettings, knowledgeOsClient, loadSecret: () => ({ apiKey: "test" }), requestJson, now: () => now });
  return { store, policyStore, root, service, calls, modelInputs, setNow: (value) => { now = value; } };
}

test("T25 policy migrates to hourly summaries, configurable close time and 20-day raw retention", () => temporary("deskmate-t25-policy-", (directory) => {
  fs.writeFileSync(path.join(directory, "companion-memory-policy.json"), JSON.stringify({ version: 1, enabledSources: ["companion"], schedule: "daily", dailyTime: "22:45", lastResults: {} }));
  const policy = new CompanionMemoryPolicyStore({ userDataPath: directory });
  assert.deepEqual({ version: policy.snapshot().version, hourlyEnabled: policy.snapshot().hourlyEnabled, rawRetentionDays: policy.snapshot().rawRetentionDays, dailyTime: policy.snapshot().dailyTime }, { version: 2, hourlyEnabled: true, rawRetentionDays: 20, dailyTime: "22:45" });
  policy.save({ version: 2, enabledSources: ["companion", "dictation"], schedule: "daily", dailyTime: "23:30", hourlyEnabled: false, rawRetentionDays: 30 });
  assert.equal(new CompanionMemoryPolicyStore({ userDataPath: directory }).snapshot().rawRetentionDays, 30);
}));

test("T25 hourly processing summarizes only new final records and advances a durable coverage watermark", async () => temporary("deskmate-t25-hourly-", async (directory) => {
  const harness = journalHarness(directory);
  try {
    const firstAt = new Date(2026, 8, 11, 19, 0, 0).getTime();
    harness.store.commitConversationTurn({ eventId: "hour:1", sessionId: "hour", role: "user", content: "记录 DeskMate 开发进展", source: "companion", createdAt: new Date(firstAt).toISOString() });
    const first = await harness.service.processHourly();
    assert.equal(first.turns, 1);
    assert.equal(harness.store.hourlySummariesForDay("2026-09-11").length, 1);
    assert.equal((await harness.service.processHourly({ force: true })).reason, "memory-no-unprocessed-turns");
  } finally { harness.store.close(); }
}));

test("T25 manual close rereads every raw record, writes merged/work/personal Markdown, then moves new turns to the next workday", async () => temporary("deskmate-t25-close-", async (directory) => {
  const harness = journalHarness(directory);
  try {
    const at = new Date(2026, 8, 11, 20, 0, 0).getTime();
    harness.store.commitConversationTurn({ eventId: "close:1", sessionId: "close", role: "user", content: "今天完成 DeskMate 记忆开发", source: "companion", createdAt: new Date(at).toISOString() });
    harness.store.commitConversationTurn({ eventId: "close:2", sessionId: "dictation", role: "user", content: "我喜欢简洁总结", source: "dictation", createdAt: new Date(at + 1).toISOString() });
    harness.store.db.prepare("UPDATE conversation_turns SET summary_day='2026-09-11'").run();
    const result = await harness.service.closeCurrentWorkday({ manual: true });
    assert.equal(result.ok, true);
    assert.equal(result.turns, 2);
    assert.deepEqual(result.journal.sourceCounts, { companion: 1, dictation: 1 });
    assert.deepEqual(harness.modelInputs.find((input) => input.records).records.map((row) => row.id).sort(), harness.store.db.prepare("SELECT id FROM conversation_turns ORDER BY id").all().map((row) => row.id).sort());
    for (const relative of ["journal/2026-09-11.md", "journal/work/2026-09-11.md", "journal/personal/2026-09-11.md"]) assert.equal(fs.existsSync(path.join(harness.root, "DeskMate", ...relative.split("/"))), true);
    const queued = harness.store.db.prepare("SELECT memory_class AS memoryClass, project_id AS projectId, payload_json AS payloadJson FROM memory_journal_outbox ORDER BY memory_class").all();
    assert.deepEqual(queued.map((row) => [row.memoryClass, row.projectId]), [["personal", null], ["work", "01900000-0000-7000-8000-000000000001"]]);
    assert.equal(JSON.parse(queued[0].payloadJson).project_id, null);
    assert.match(JSON.parse(queued[0].payloadJson).markdown, /source_counts: \{"companion":1,"dictation":1\}/);
    assert.equal((await harness.service.closeCurrentWorkday({ manual: true })).reason, "memory-workday-already-closed-today");
    harness.store.commitConversationTurn({ eventId: "close:3", sessionId: "close", role: "user", content: "收尾后的新内容", source: "companion", createdAt: new Date(at + 2).toISOString() });
    assert.equal(harness.store.db.prepare("SELECT workday_day AS day FROM conversation_turns WHERE source_event_id='close:3'").get().day, "2026-09-12");
  } finally { harness.store.close(); }
}));

test("T25 remote synchronization submits exactly one sealed work journal and one projectless personal journal", async () => temporary("deskmate-t25-sync-", async (directory) => {
  const harness = journalHarness(directory, { syncEnabled: true });
  try {
    harness.store.commitConversationTurn({ eventId: "sync:1", sessionId: "sync", role: "user", content: "今天完成集成", source: "companion", createdAt: new Date(2026, 8, 11, 20, 0, 0).toISOString() });
    const result = await harness.service.closeCurrentWorkday({ manual: true });
    assert.equal(result.sync.accepted, 2);
    assert.deepEqual(harness.calls.map((call) => call.args.memory_class).sort(), ["personal", "work"]);
    assert.equal(harness.calls.find((call) => call.args.memory_class === "personal").args.project_id, null);
    assert.equal(harness.calls.every((call) => call.args.is_open === false && /^deskmate:/.test(call.args.idempotency_key)), true);
    assert.equal(harness.calls.every((call) => /deskmate_schema: knowledgeos-journal-v1/.test(call.args.markdown)), true);
    assert.equal((await harness.service.syncPending()).skipped, true);
  } finally { harness.store.close(); }
}));

test("T25 raw cleanup waits for a completed local journal and, when enabled, both remote receipts", () => temporary("deskmate-t25-retention-", (directory) => {
  const now = new Date(2026, 8, 30, 12, 0, 0).getTime();
  const old = new Date(2026, 8, 1, 12, 0, 0).getTime();
  const store = new CompanionMemoryStore({ userDataPath: directory, now: () => now });
  try {
    store.commitConversationTurn({ eventId: "old:1", sessionId: "old", role: "user", content: "old raw", source: "companion", createdAt: new Date(old).toISOString() });
    store.db.prepare("UPDATE conversation_turns SET workday_day='2026-09-01'").run();
    assert.equal(store.cleanupExpiredRaw({ retentionDays: 20, at: now }).removed, 0);
    store.beginHistoricalClose("2026-09-01");
    store.saveDailyJournal({ day: "2026-09-01", periodStart: old, periodEnd: old + 1, inputDigest: "a".repeat(64), workMarkdown: "work", personalMarkdown: "personal", combinedMarkdown: "combined", turnIds: store.db.prepare("SELECT id FROM conversation_turns").all().map((row) => row.id) });
    assert.equal(store.cleanupExpiredRaw({ retentionDays: 20, at: now, requireRemoteAccepted: true }).removed, 0);
    for (const memoryClass of ["work", "personal"]) {
      const key = `deskmate:test:${memoryClass}`;
      const queued = store.queueJournalDelivery({ day: "2026-09-01", memoryClass, projectId: memoryClass === "work" ? "01900000-0000-7000-8000-000000000001" : null, idempotencyKey: key, payload: { memory_class: memoryClass } });
      store.markJournalDelivery(queued.id, { ok: true, submissionId: `submission-${memoryClass}` });
    }
    assert.equal(store.cleanupExpiredRaw({ retentionDays: 20, at: now, requireRemoteAccepted: true }).removed, 1);
    assert.equal(store.db.prepare("SELECT COUNT(*) AS value FROM companion_memory_outbox").get().value, 0);
  } finally { store.close(); }
}));

test("T25 KnowledgeOS settings encrypt the adapter path and the gateway returns only bounded evidence", async () => temporary("deskmate-t25-settings-", async (directory) => {
  const adapter = path.join(directory, "knowledgeos-mcp.exe");
  fs.writeFileSync(adapter, "placeholder");
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(`secret:${value}`), decryptString: (value) => value.toString().replace(/^secret:/, "") };
  const settings = createKnowledgeOsSettings({ safeStorage, userDataPath: directory });
  settings.saveCommand(adapter);
  const credentialId = "01900000-0000-7000-8000-000000000001";
  const status = settings.save({ credentialId, projectId: "", readEnabled: true, syncEnabled: false, sensitivity: "private" });
  assert.equal(status.configured, true);
  assert.doesNotMatch(fs.readFileSync(path.join(directory, "knowledgeos-settings.json"), "utf8"), new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const ignoredProject = settings.save({ credentialId, projectId: "project-name-is-not-a-uuid", readEnabled: true, syncEnabled: true, sensitivity: "private" });
  assert.equal(ignoredProject.configured, true);
  assert.equal(ignoredProject.projectIdIgnored, true);
  assert.equal(ignoredProject.projectId, null);
  assert.equal(settings.loadConnection().projectId, null);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "knowledgeos-settings.json"), "utf8")).projectId, null);
  assert.throws(() => settings.save({ credentialId: "not-a-credential", projectId: "", readEnabled: true }), /knowledgeos-credential-id-invalid/);
  const gateway = new KnowledgeOsMemoryGateway({ settings, client: { callTool: async () => ({ ok: true, data: { results: [{ title: "项目说明", snippet: "有来源的知识片段", citation: "knowledge:1" }] } }) } });
  assert.deepEqual(await gateway.searchEvidence("DeskMate"), [{ title: "项目说明", snippet: "有来源的知识片段", citation: "knowledge:1", updatedAt: "" }]);
}));
