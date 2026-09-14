import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { defaultState, STORAGE_KEY, PREVIOUS_STATE_KEY, loadState, persistState, recoverPreviousState, reduceAppState } from "../src/store/appStore.js";
import { migrateLegacyHistory, MIGRATION_COMPLETE_KEY } from "../src/store/historyPersistence.js";
const require = createRequire(import.meta.url);
const { LocalHistoryStore, hash, timestamp } = require("../electron/local-history-store.cjs");
const { LocalHistoryService } = require("../electron/local-history-service.cjs");
const fixture = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-t32-test-"));
  let store = new LocalHistoryStore({ userDataPath: dir });
  t.after(() => { store.close(); assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep + "deskmate-t32-test-")); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, get store() { return store; }, reopen() { store.close(); store = new LocalHistoryStore({ userDataPath: dir }); } };
};
const record = (id, extra = {}) => ({ id, text: "synthetic text", rawText: "synthetic raw", time: "12:00", date: "今天", ...extra });
const manifest = (records) => records.map((r) => ({ id: r.id, digest: hash(JSON.stringify(r)) }));
const memoryStorage = () => { const data = new Map(); return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) }; };

test("legacy migration survives interruption and validates all audio before switch", (t) => {
  const f = fixture(t), rows = [record("old", { audioId: "audio-old" })];
  f.store.stage({ records: rows.map((record) => ({ record })) });
  f.reopen();
  f.store.stage({ records: rows.map((record) => ({ record })) });
  assert.equal(f.store.status().staged, 1);
  assert.throws(() => f.store.finish({ manifest: manifest(rows), audioManifest: [] }), /audio-missing/);
  assert.equal(f.store.status().migrated, false);
  assert.equal(f.store.list().length, 0);
  const audio = f.store.putAudio({ id: "audio-old", bytes: new Uint8Array([1, 2, 3]), createdAt: Date.parse("2025-01-01T01:00:00Z") });
  f.store.append(record("new", { createdAt: "2026-09-12T00:00:00Z" }));
  f.store.finish({ manifest: manifest(rows), audioManifest: [audio] });
  assert.equal(f.store.status().migrated, true);
  assert.deepEqual(f.store.list().map((r) => r.id), ["new", "old"]);
  assert.equal(f.store.list()[1].dateSource, "recording");
  assert.equal(f.store.list()[1].createdAt, "2025-01-01T01:00:00.000Z");
});
test("manifest missing, duplicated or modified content cannot publish partial data", (t) => {
  const { store } = fixture(t), rows = [record("a"), record("b")];
  store.stage({ records: rows.map((record) => ({ record })) });
  for (const bad of [manifest(rows.slice(0, 1)), [...manifest(rows), ...manifest(rows.slice(0, 1))], [{ id: "a", digest: "wrong" }, ...manifest(rows.slice(1))]]) {
    assert.throws(() => store.finish({ manifest: bad, audioManifest: [] }), /migration-integrity/);
    assert.equal(store.list().length, 0);
  }
  assert.throws(() => store.stage({ records: [{ record: record("a", { text: "changed" }) }] }), /migration-conflict/);
});
test("unresolvable legacy relative dates remain unknown; memory dates are evidence", (t) => {
  const { store } = fixture(t);
  store.append(record("unknown"));
  store.append(record("linked"), Date.parse("2025-02-01T01:00:00Z"));
  const rows = store.list();
  assert.equal(rows.find((r) => r.id === "unknown").createdAt, null);
  assert.equal(rows.find((r) => r.id === "unknown").date, "日期未知");
  assert.equal(rows.find((r) => r.id === "linked").dateSource, "memory");
  assert.equal(timestamp("今天"), null); assert.equal(timestamp("12:00"), null);
  assert.equal(timestamp("2026-02-30T01:00:00Z"), null);
});
test("append IDs are immutable and deletion snapshots preserve concurrent appends", (t) => {
  const { store } = fixture(t), first = record("a");
  store.append(first); store.append(first);
  assert.equal(store.list().length, 1);
  assert.throws(() => store.append(record("a", { text: "replacement" })), /record-conflict/);
  store.append(record("b")); store.remove({ ids: ["a"] });
  assert.deepEqual(store.list().map((r) => r.id), ["b"]);
});
test("recording paths are content addressed and corruption is detected", (t) => {
  const { store } = fixture(t);
  const item = store.putAudio({ id: "../../outside", bytes: new Uint8Array([3, 4]) });
  assert.deepEqual([...store.readAudio("../../outside").bytes], [3, 4]);
  assert(path.dirname(store.audioFile(item.digest)) === store.root);
  assert.throws(() => store.audioFile("../outside"), /invalid-digest/);
  assert.throws(() => store.putAudio({ id: "../../outside", bytes: new Uint8Array([5]) }), /audio-conflict/);
  fs.writeFileSync(store.audioFile(item.digest), "damaged");
  assert.throws(() => store.readAudio("../../outside"), /audio-integrity/);
});
test("disk-full audio write never creates a successful metadata row", (t) => {
  const { store } = fixture(t), open = fs.openSync;
  fs.openSync = (file, ...args) => { if (String(file).endsWith(".pending")) throw Object.assign(new Error("synthetic"), { code: "ENOSPC" }); return open(file, ...args); };
  try { assert.throws(() => store.putAudio({ id: "audio", bytes: new Uint8Array([9]) }), /synthetic/); }
  finally { fs.openSync = open; }
  assert.equal(store.status().recordings, 0);
  assert.equal(store.readAudio("audio"), null);
});
test("SQLite capacity failure preserves prior records", (t) => {
  const { store } = fixture(t); store.append(record("safe"));
  const pages = store.db.prepare("PRAGMA page_count").get().page_count;
  store.db.exec(`PRAGMA max_page_count=${pages}`);
  assert.throws(() => store.append(record("too-large-for-disk", { text: "x".repeat(500000) })));
  assert.deepEqual(store.list().map((r) => r.id), ["safe"]);
});
test("malformed records and unsupported database versions fail closed", (t) => {
  const f = fixture(t);
  assert.throws(() => f.store.append({ id: "bad" }), /invalid-record/);
  f.store.db.exec("PRAGMA user_version=999");
  assert.throws(() => new LocalHistoryStore({ userDataPath: f.dir }), /newer-schema/);
  assert.equal(f.store.db.prepare("PRAGMA user_version").get().user_version, 999);
});
test("worker service uses bounded commands and emits sanitized errors", async (t) => {
  const f = fixture(t), service = new LocalHistoryService({ userDataPath: f.dir });
  t.after(() => service.close());
  assert.equal((await service.call("status")).storage, "sqlite-managed");
  await assert.rejects(service.call("arbitrary-sql", "private-secret"), /local-history-command-invalid/);
  await service.call("append", record("worker"));
  assert.equal((await service.call("list", {}))[0].id, "worker");
  service.close();
});
test("corrupt localStorage is not overwritten by defaults; prior valid copy is recoverable", () => {
  const storage = memoryStorage(), state = structuredClone(defaultState);
  assert.equal(persistState(state, storage), "saved");
  state.settings.floating = false;
  assert.equal(persistState(state, storage), "saved");
  assert(storage.getItem(PREVIOUS_STATE_KEY));
  storage.setItem(STORAGE_KEY, "{broken");
  assert.equal(persistState(loadState(storage), storage), "corrupt");
  assert.equal(storage.getItem(STORAGE_KEY), "{broken");
  assert.equal(recoverPreviousState(storage).settings.floating, true);
});
test("invalid previous snapshot and quota failure cannot replace damaged source", () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, "{broken"); storage.setItem(PREVIOUS_STATE_KEY, "{also broken");
  assert.throws(() => recoverPreviousState(storage)); assert.equal(storage.getItem(STORAGE_KEY), "{broken");
  storage.setItem(PREVIOUS_STATE_KEY, JSON.stringify(defaultState));
  storage.setItem = () => { throw new Error("quota"); };
  assert.throws(() => recoverPreviousState(storage), /quota/); assert.equal(storage.getItem(STORAGE_KEY), "{broken");
});
test("history hydration and append never replace a concurrent new record", () => {
  let state = { ...structuredClone(defaultState), history: [record("old")] };
  state = reduceAppState(state, { type: "history-append", value: record("new") });
  state = reduceAppState(state, { type: "history-hydrate", rows: [record("old")], pendingIds: [] });
  assert.deepEqual(state.history.map((r) => r.id), ["new", "old"]);
});

test("daily close cannot silently bypass first-use cleanup confirmation", async () => {
  const { MemoryJournalService } = require("../electron/memory-journal-service.cjs");
  const service = new MemoryJournalService({
    store: { beginWorkdayClose: () => ({day:"2026-09-12"}), cleanupExpiredRaw: () => assert.fail("cleanup must remain gated") },
    policyStore: {snapshot:()=>({rawRetentionDays:20})}, knowledgeBaseProjection:()=>({}),
    knowledgeOsSettings:{status:()=>({})},knowledgeOsClient:{callTool:async()=>({})},loadSecret:()=>null
  });
  service.finalizeDay = async()=>({ok:true}); service.syncPending = async()=>({ok:true});
  const result = await service.closeCurrentWorkday();
  assert.equal(result.cleanup.removed,0);
  assert.equal(result.cleanup.reason,"retention-coordinated-background");
});

test("paginated history snapshot excludes concurrent additions without shifting rows", (t) => {
  const {store} = fixture(t);
  for(let i=0;i<4;i++) store.append(record(`r${i}`));
  const {maxSequence} = store.status();
  const first = store.list({limit:2,maxSequence});
  store.append(record('newer'));
  const rest = store.list({offset:2,limit:2,maxSequence});
  assert.deepEqual([...first,...rest].map(r=>r.id),['r3','r2','r1','r0']);
});
test("missing previously migrated database cannot silently switch to old source", async () => {
  const previous = globalThis.desktopBridge, storage = memoryStorage();
  storage.setItem(MIGRATION_COMPLETE_KEY,'1');
  globalThis.desktopBridge = {localHistory:async()=>({migrated:false})};
  try { await assert.rejects(migrateLegacyHistory([],storage),/主数据库缺失或不完整/); }
  finally { globalThis.desktopBridge = previous; }
});
