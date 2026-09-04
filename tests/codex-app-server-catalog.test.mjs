import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { opaqueCodexTaskKey } = require("../electron/codex-hook-state.cjs");
const { CodexTaskCatalog, listCodexThreadCatalog, parseThreadCatalog } = require("../electron/codex-app-server-catalog.cjs");

test("Codex App Server catalog keeps only opaque task keys and bounded visible titles", () => {
  const entries = parseThreadCatalog({ data: [
    { id: "raw-thread-1", name: "DeskMate 软件闭环", cwd: "C:\\secret\\deskmate", preview: "private prompt", turns: [{ text: "private answer" }] },
    { id: "raw-thread-2", name: "", cwd: "C:\\work\\EasyInput" },
  ] });
  assert.deepEqual([...entries], [
    [opaqueCodexTaskKey("raw-thread-1"), "DeskMate 软件闭环"],
    [opaqueCodexTaskKey("raw-thread-2"), "EasyInput"],
  ]);
  assert.doesNotMatch(JSON.stringify([...entries]), /raw-thread|private prompt|private answer|C:\\\\secret/);
});

test("Codex App Server catalog requests thread metadata without turns or previews", async () => {
  const writes = [];
  let child;
  const spawnImpl = () => {
    child = new EventEmitter();
    child.stdin = { write: (value) => { writes.push(JSON.parse(value)); return true; } };
    child.stdout = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.kill = () => {};
    queueMicrotask(() => child.stdout.emit("data", `${JSON.stringify({ id: 1, result: {} })}\n`));
    queueMicrotask(() => child.stdout.emit("data", `${JSON.stringify({ id: 2, result: { data: [{ id: "thread-1", name: "任务一", preview: "ignored" }] } })}\n`));
    return child;
  };
  const result = await listCodexThreadCatalog({ spawnImpl, command: "codex", timeoutMs: 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.entries.get(opaqueCodexTaskKey("thread-1")), "任务一");
  assert.deepEqual(writes[1], { method: "initialized", params: {} });
  assert.deepEqual(writes[2], { method: "thread/list", id: 2, params: { cursor: null, limit: 100, sortKey: "updated_at", sortDirection: "desc", archived: false } });
  assert.doesNotMatch(JSON.stringify(writes), /turn|preview/i);
});

test("Codex task catalog preserves the last safe title map when refresh fails", async () => {
  let fail = false;
  let now = 10_000;
  const key = opaqueCodexTaskKey("thread-1");
  const catalog = new CodexTaskCatalog({
    now: () => now,
    refreshMs: 5_000,
    list: async () => fail ? { ok: false, reason: "codex-app-server-timeout", entries: new Map() } : { ok: true, entries: new Map([[key, "任务一"]]) },
  });
  assert.equal((await catalog.refresh({ force: true })).ok, true);
  assert.equal(catalog.labelFor(key), "任务一");
  fail = true;
  now += 6_000;
  assert.equal((await catalog.refresh()).ok, false);
  assert.equal(catalog.labelFor(key), "任务一");
  assert.equal(catalog.status().reason, "codex-app-server-timeout");
});
