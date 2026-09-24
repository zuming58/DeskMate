import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createRequire } from "node:module";
import { cleanupLegacyRetention, LEGACY_SOURCE_KEY } from "../src/store/historyPersistence.js";
import { createDiagnosticReport } from "../src/services/diagnostics.js";

const require = createRequire(import.meta.url);
const { LocalHistoryStore } = require("../electron/local-history-store.cjs");
const { LocalRetention, DAY } = require("../electron/local-retention.cjs");
const { CompanionMemoryPolicyStore } = require("../electron/companion-memory-policy.cjs");
const { CompanionMemoryStore } = require("../electron/companion-memory.cjs");

function temporary(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-t33-"));
  try { return run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function successful(id, audioId, createdAt) {
  return { id, audioId, createdAt: new Date(createdAt).toISOString(), time: "12:00", date: "旧日期", text: "已转写", rawText: "已转写", transcription: { status: "success" }, organizer: { status: "success", mode: "raw" } };
}
function markMigrated(history) { history.db.prepare("INSERT OR REPLACE INTO metadata VALUES('legacy-complete','1')").run(); }
function completeJournal(memory, day, at) {
  memory.db.prepare("INSERT INTO memory_daily_journals(day,period_start,period_end,status,work_markdown,personal_markdown,combined_markdown,input_digest,source_turn_count,source_counts_json,created_at,updated_at,completed_at) VALUES(?,?,?,'completed','','','','',1,'{}',?,?,?)").run(day, at, at, at, at, at);
  memory.db.prepare('UPDATE conversation_turns SET summary_day=? WHERE workday_day=?').run(day, day);
}

test("T33 policy migrates to editable 7-day audio and 20-day text defaults", () => temporary((root) => {
  fs.writeFileSync(path.join(root, "companion-memory-policy.json"), JSON.stringify({ version: 2, enabledSources: ["companion"], schedule: "daily", dailyTime: "23:30", hourlyEnabled: true, rawRetentionDays: 30 }));
  const store = new CompanionMemoryPolicyStore({ userDataPath: root });
  assert.deepEqual({ version: store.snapshot().version, audio: store.snapshot().audioRetentionDays, text: store.snapshot().rawRetentionDays }, { version: 3, audio: 7, text: 30 });
  store.save({ version: 3, enabledSources: ["companion"], schedule: "daily", dailyTime: "23:30", hourlyEnabled: true, audioRetentionDays: 9, rawRetentionDays: 21 });
  assert.deepEqual({ audio: store.snapshot().audioRetentionDays, text: store.snapshot().rawRetentionDays }, { audio: 9, text: 21 });
}));

test("T33 preview is non-mutating and confirmation quarantines only eligible raw material", () => temporary((root) => {
  const now = Date.parse("2026-09-13T12:00:00+08:00"), old = now - 30 * DAY;
  new CompanionMemoryPolicyStore({ userDataPath: root }).save({ version: 3, enabledSources: ["companion", "dictation"], schedule: "daily", dailyTime: "23:30", hourlyEnabled: true, audioRetentionDays: 7, rawRetentionDays: 20 });
  const history = new LocalHistoryStore({ userDataPath: root }); markMigrated(history);
  const audioOk = history.putAudio({ id: "audio-ok", bytes: new Uint8Array([1, 2, 3]), createdAt: old });
  history.append(successful("history-ok", "audio-ok", old));
  history.putAudio({ id: "audio-failed", bytes: new Uint8Array([4, 5, 6]), createdAt: old });
  history.append({ ...successful("history-failed", "audio-failed", old), transcription: { status: "error" } });
  history.append({ id: "history-unknown", time: "12:01", date: "日期未知", text: "未知", rawText: "未知", transcription: { status: "success" } });
  history.close();
  const memory = new CompanionMemoryStore({ userDataPath: root, now: () => now });
  memory.db.prepare("INSERT INTO conversation_turns(id,session_id,role,content,created_at,source,workday_day) VALUES('turn-old','s','user','raw',?,'companion','2026-08-14')").run(old);
  completeJournal(memory, "2026-08-14", old); memory.close();

  const retention = new LocalRetention({ userDataPath: root, now: () => now });
  assert.equal(retention.status().enabled, false);
  const preview = retention.preview();
  assert.deepEqual(preview.eligible, { recordings: 1, historyText: 1, memoryTurns: 1 });
  assert.ok(preview.held["transcription-not-successful"] >= 1);
  assert.ok(preview.held["date-unknown"] >= 1);
  const beforeHistory = new LocalHistoryStore({ userDataPath: root });
  assert.equal(beforeHistory.status().records, 3); beforeHistory.close();

  const confirmed = retention.confirm({ token: preview.token });
  assert.equal(confirmed.enabled, true);
  assert.equal(confirmed.cleanup.phase, "browser-pending");
  const afterHistory = new LocalHistoryStore({ userDataPath: root });
  assert.equal(afterHistory.db.prepare("SELECT count(*) n FROM history").get().n, 2);
  assert.equal(afterHistory.db.prepare("SELECT count(*) n FROM audio").get().n, 1);
  afterHistory.close();
  const afterMemory = new CompanionMemoryStore({ userDataPath: root, now: () => now });
  assert.equal(afterMemory.db.prepare("SELECT count(*) n FROM conversation_turns").get().n, 0);
  assert.equal(afterMemory.db.prepare("SELECT count(*) n FROM memory_daily_journals").get().n, 1);
  afterMemory.close();
  assert.equal(fs.existsSync(path.join(root, "voice-recordings", `${audioOk.digest}.audio`)), false);
  const acknowledged = retention.acknowledge({ jobId: confirmed.cleanup.jobId });
  assert.equal(acknowledged.status.enabled, true);
  assert.deepEqual(acknowledged.result, { recordings: 1, historyText: 1, memoryTurns: 1, held: preview.held });
}));

test("T33 KnowledgeOS sync gate requires accepted work and personal receipts", () => temporary((root) => {
  const now = Date.parse("2026-09-13T12:00:00+08:00"), old = now - 30 * DAY;
  new CompanionMemoryPolicyStore({ userDataPath: root }).save({ version: 3, enabledSources: ["companion"], schedule: "daily", dailyTime: "23:30", hourlyEnabled: true, audioRetentionDays: 7, rawRetentionDays: 20 });
  fs.writeFileSync(path.join(root, "knowledgeos-settings.json"), JSON.stringify({ version: 1, syncEnabled: true }));
  const history = new LocalHistoryStore({ userDataPath: root }); markMigrated(history); history.close();
  const memory = new CompanionMemoryStore({ userDataPath: root, now: () => now });
  memory.db.prepare("INSERT INTO conversation_turns(id,session_id,role,content,created_at,source,workday_day) VALUES('turn-old','s','user','raw',?,'companion','2026-08-14')").run(old);
  completeJournal(memory, "2026-08-14", old);
  let insert = memory.db.prepare("INSERT INTO memory_journal_outbox(id,day,memory_class,project_id,payload_json,idempotency_key,status,created_at,updated_at,accepted_at) VALUES(?, '2026-08-14', ?, NULL, '{}', ?, 'accepted', ?, ?, ?)");
  insert.run("work-id", "work", "work-key", old, old, old);
  memory.setSyncMeta('sealed:work-id', now);
  memory.close();
  const retention = new LocalRetention({ userDataPath: root, now: () => now });
  assert.equal(retention.preview().eligible.memoryTurns, 0);
  const reopened = new CompanionMemoryStore({ userDataPath: root, now: () => now });
  insert = reopened.db.prepare("INSERT INTO memory_journal_outbox(id,day,memory_class,project_id,payload_json,idempotency_key,status,created_at,updated_at,accepted_at) VALUES(?, '2026-08-14', ?, NULL, '{}', ?, 'accepted', ?, ?, ?)");
  insert.run("personal-id", "personal", "personal-key", old, old, old);
  reopened.setSyncMeta('sealed:personal-id', now); reopened.close();
  assert.equal(retention.preview().eligible.memoryTurns, 1);
}));

test("T33 changed eligible data invalidates an expiring preview", () => temporary((root) => {
  const now = Date.parse("2026-09-13T12:00:00+08:00"), old = now - 30 * DAY;
  new CompanionMemoryPolicyStore({ userDataPath: root }).save({ version: 3, enabledSources: [], schedule: "manual", dailyTime: "23:30", hourlyEnabled: false, audioRetentionDays: 7, rawRetentionDays: 20 });
  let history = new LocalHistoryStore({ userDataPath: root }); markMigrated(history); history.append(successful("one", null, old)); history.close();
  const retention = new LocalRetention({ userDataPath: root, now: () => now });
  const preview = retention.preview();
  history = new LocalHistoryStore({ userDataPath: root }); history.append(successful("two", null, old)); history.close();
  assert.throws(() => retention.confirm({ token: preview.token }), /retention-preview-changed/);
}));

test("T33 a concurrent recent record is never added to the confirmed deletion set", () => temporary((root) => {
  const now = Date.parse("2026-09-13T12:00:00+08:00"), old = now - 30 * DAY;
  new CompanionMemoryPolicyStore({ userDataPath: root }).save({ version: 3, enabledSources: [], schedule: "manual", dailyTime: "23:30", hourlyEnabled: false, audioRetentionDays: 7, rawRetentionDays: 20 });
  let history = new LocalHistoryStore({ userDataPath: root }); markMigrated(history); history.append(successful("old", null, old)); history.close();
  const retention = new LocalRetention({ userDataPath: root, now: () => now });
  const preview = retention.preview();
  history = new LocalHistoryStore({ userDataPath: root }); history.append(successful("recent", null, now)); history.close();
  const confirmed = retention.confirm({ token: preview.token });
  history = new LocalHistoryStore({ userDataPath: root });
  assert.deepEqual(history.db.prepare("SELECT id FROM history ORDER BY id").all().map((row) => row.id), ["recent"]); history.close();
  retention.acknowledge({ jobId: confirmed.cleanup.jobId });
}));

test("T33 an interrupted prepared job resumes after a real worker-process exit", () => temporary((root) => {
  const now = Date.parse("2026-09-13T12:00:00+08:00"), cutoff = now - 20 * DAY;
  new CompanionMemoryPolicyStore({ userDataPath: root }).save({ version: 3, enabledSources: [], schedule: "manual", dailyTime: "23:30", hourlyEnabled: false, audioRetentionDays: 7, rawRetentionDays: 20 });
  let history = new LocalHistoryStore({ userDataPath: root }); markMigrated(history); history.append(successful("boundary", null, cutoff)); history.close();
  const modulePath = path.resolve("electron/local-retention.cjs");
  execFileSync(process.execPath, ["-e", `const {LocalRetention}=require(${JSON.stringify(modulePath)});const value=new LocalRetention({userDataPath:process.env.DESKMATE_TEST_PROFILE,now:()=>${now}});value.prepareJob(value.collect());process.exit(0);`], { env: { ...process.env, DESKMATE_TEST_PROFILE: root } });
  history = new LocalHistoryStore({ userDataPath: root }); assert.equal(history.status().records, 1); history.close();
  const retention = new LocalRetention({ userDataPath: root, now: () => now });
  const resumed = retention.resumePending();
  assert.equal(resumed.phase, "browser-pending");
  history = new LocalHistoryStore({ userDataPath: root }); assert.equal(history.status().records, 0); history.close();
  retention.acknowledge({ jobId: resumed.id });
}));

test("T33 damaged recording fails before any database row is deleted", () => temporary((root) => {
  const now = Date.parse("2026-09-13T12:00:00+08:00"), old = now - 30 * DAY;
  new CompanionMemoryPolicyStore({ userDataPath: root }).save({ version: 3, enabledSources: [], schedule: "manual", dailyTime: "23:30", hourlyEnabled: false, audioRetentionDays: 7, rawRetentionDays: 20 });
  let history = new LocalHistoryStore({ userDataPath: root }); markMigrated(history);
  const audio = history.putAudio({ id: "damaged", bytes: new Uint8Array([1, 2, 3]), createdAt: old }); history.append(successful("history", "damaged", old)); history.close();
  fs.writeFileSync(path.join(root, "voice-recordings", `${audio.digest}.audio`), new Uint8Array([9, 9, 9]));
  const retention = new LocalRetention({ userDataPath: root, now: () => now }); const preview = retention.preview();
  assert.throws(() => retention.confirm({ token: preview.token }), /retention-audio-integrity/);
  history = new LocalHistoryStore({ userDataPath: root }); assert.equal(history.status().records, 1); assert.equal(history.status().recordings, 1); history.close();
}));

test("T33 browser cleanup removes exact legacy IDs and preserves unrelated state", async () => {
  const previousIndexedDb = globalThis.indexedDB;
  const deletedAudio = [];
  const values = new Map([
    [LEGACY_SOURCE_KEY, JSON.stringify([{ id: "remove", text: "a" }, { id: "keep", text: "b", audioId: "audio-remove" }])],
    ["deskmate.app-state", JSON.stringify({ theme: "system", history: [{ id: "remove" }, { id: "keep", audioId: "audio-remove" }] })],
    ["deskmate.history-pending.v1", "[]"],
  ]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  try {
    globalThis.indexedDB = { open() {
      const request = {};
      queueMicrotask(() => {
        request.result = { close() {}, transaction() {
          const tx = { objectStore() { return { delete(id) { deletedAudio.push(id); return {}; } }; } };
          queueMicrotask(() => tx.oncomplete()); return tx;
        } };
        request.onsuccess();
      });
      return request;
    } };
    await cleanupLegacyRetention({ historyIds: ["remove"], audioIds: ["audio-remove"] }, storage);
    assert.deepEqual(JSON.parse(values.get(LEGACY_SOURCE_KEY)).map((item) => item.id), ["keep"]);
    assert.deepEqual(JSON.parse(values.get("deskmate.app-state")).history.map((item) => item.id), ["keep"]);
    assert.equal(JSON.parse(values.get(LEGACY_SOURCE_KEY))[0].audioId, undefined);
    assert.equal(JSON.parse(values.get(LEGACY_SOURCE_KEY))[0].recordingUnavailable, true);
    assert.equal(JSON.parse(values.get("deskmate.app-state")).theme, "system");
    assert.deepEqual(deletedAudio, ["audio-remove"]);
  } finally { globalThis.indexedDB = previousIndexedDb; }
});

test("T33 UI and preload expose preview-confirm-status flow without direct paths", () => {
  const preload = fs.readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const page = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");
  const contract = fs.readFileSync(new URL("../docs/contracts/t33-consent-retention-v1.md", import.meta.url), "utf8");
  for (const fragment of ["getLocalRetentionStatus", "previewLocalRetention", "confirmLocalRetention", "acknowledgeLocalRetention", "onLocalRetentionCleanup"]) assert.ok(preload.includes(fragment), fragment);
  for (const fragment of ["原始录音保留天数", "等待首次确认", "预览清理范围", "确认本次并启用", "立即检查"]) assert.ok(page.includes(fragment), fragment);
  assert.match(contract, /CONSENT_RETENTION_V1_FROZEN/);
});

test("T33 diagnostics expose only retention counts and allowlisted hold reasons", () => {
  const report = createDiagnosticReport({ retention: { enabled: true, pending: 2, policy: { audioRetentionDays: 7, rawRetentionDays: 20 }, lastRunAt: 1234, lastResult: { recordings: 3, historyText: 4, memoryTurns: 5, held: { "date-unknown": 6, arbitrary: 99 }, privatePath: "secret", rawText: "secret" } } });
  assert.deepEqual(report.retention, { enabled: true, pending: 2, recordingDays: 7, rawTextDays: 20, lastRunAt: 1234, removed: { recordings: 3, historyText: 4, memoryTurns: 5 }, held: { "date-unknown": 6, "transcription-not-successful": 0, "daily-summary-incomplete": 0, "knowledgeos-sync-pending": 0, "memory-link-missing": 0, "recording-retention-pending": 0, "orphan-recovery-required": 0, "history-integrity-failed": 0 } });
  assert.doesNotMatch(JSON.stringify(report), /secret|privatePath|arbitrary/);
});
