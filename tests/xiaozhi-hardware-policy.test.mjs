import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { XiaozhiHardwareCoordinator, XiaozhiHardwarePolicyStore } = require("../electron/xiaozhi-hardware-policy.cjs");

function temporaryDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-xiaozhi-policy-")); }

test("T23 policy defaults enabled for upgrades and persists a strict local choice", () => {
  const directory = temporaryDirectory();
  try {
    const store = new XiaozhiHardwarePolicyStore({ userDataPath: directory });
    assert.deepEqual(store.snapshot(), { version: 1, enabled: true });
    assert.deepEqual(store.save({ version: 1, enabled: false }), { version: 1, enabled: false });
    assert.deepEqual(new XiaozhiHardwarePolicyStore({ userDataPath: directory }).snapshot(), { version: 1, enabled: false });
    assert.throws(() => store.save({ version: 1, enabled: true, command: "unsafe" }), /xiaozhi-hardware-policy-invalid/);
    fs.writeFileSync(store.filePath, JSON.stringify({ version: 2, enabled: false }));
    assert.deepEqual(new XiaozhiHardwarePolicyStore({ userDataPath: directory }).snapshot(), { version: 1, enabled: true });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("T23 disables immediately, records honest shutdown evidence, and never replays on enable", async () => {
  const directory = temporaryDirectory();
  const calls = [];
  try {
    const store = new XiaozhiHardwarePolicyStore({ userDataPath: directory });
    const coordinator = new XiaozhiHardwareCoordinator({
      store,
      shutdown: async () => { calls.push("shutdown"); assert.equal(coordinator.enabled(), false); return { attempted: true, confirmed: false, reason: "deskmatelink-waiting" }; },
      now: () => Date.parse("2026-09-11T08:00:00.000Z"),
    });
    const disabled = await coordinator.setEnabled(false, "waiting");
    assert.equal(disabled.ok, true);
    assert.equal(disabled.state, "disabled");
    assert.deepEqual(disabled.lastShutdown, { state: "unconfirmed", attempted: true, confirmed: false, reason: "deskmatelink-waiting", at: "2026-09-11T08:00:00.000Z" });
    assert.deepEqual(calls, ["shutdown"]);
    const enabled = await coordinator.setEnabled(true, "connected");
    assert.equal(enabled.state, "connected");
    assert.deepEqual(calls, ["shutdown"], "re-enable must not replay or send a hardware action");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("T23 classifies an idle shutdown as not required", async () => {
  const directory = temporaryDirectory();
  try {
    const coordinator = new XiaozhiHardwareCoordinator({ store: new XiaozhiHardwarePolicyStore({ userDataPath: directory }) });
    const result = await coordinator.setEnabled(false, "unavailable");
    assert.equal(result.lastShutdown.state, "not-required");
    assert.equal(result.lastShutdown.confirmed, true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
