import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { MotionAutomationCoordinator, MotionAutomationPolicyStore } = require("../electron/motion-automation.cjs");

function temporaryDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-motion-automation-")); }

class FakeClock {
  constructor() { this.value = 100_000; this.sequence = 0; this.tasks = new Map(); }
  now = () => this.value;
  schedule = (fn, delay) => { const id = ++this.sequence; this.tasks.set(id, { id, due: this.value + delay, fn }); return id; };
  cancel = (id) => { this.tasks.delete(id); };
  async advance(milliseconds) {
    const target = this.value + milliseconds;
    while (true) {
      const next = [...this.tasks.values()].filter((task) => task.due <= target).sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!next) break;
      this.tasks.delete(next.id);
      this.value = next.due;
      next.fn();
      await Promise.resolve();
      await Promise.resolve();
    }
    this.value = target;
    await Promise.resolve();
  }
}

function enabledStore(directory, idleEnabled = false) {
  const store = new MotionAutomationPolicyStore({ userDataPath: directory });
  store.save({ version: 1, enabled: true, idleEnabled });
  return store;
}

test("T15C policy defaults off, persists exact booleans, and fails closed on malformed data", () => {
  const directory = temporaryDirectory();
  try {
    const store = new MotionAutomationPolicyStore({ userDataPath: directory });
    assert.deepEqual(store.snapshot(), { version: 1, enabled: false, idleEnabled: false });
    assert.deepEqual(store.save({ version: 1, enabled: true, idleEnabled: true }), { version: 1, enabled: true, idleEnabled: true });
    assert.deepEqual(new MotionAutomationPolicyStore({ userDataPath: directory }).snapshot(), { version: 1, enabled: true, idleEnabled: true });
    assert.throws(() => store.save({ version: 1, enabled: true, idleEnabled: true, command: "unsafe" }), /motion-automation-policy-invalid/);
    fs.writeFileSync(store.filePath, JSON.stringify({ version: 2, enabled: true, idleEnabled: true }));
    assert.deepEqual(new MotionAutomationPolicyStore({ userDataPath: directory }).snapshot(), { version: 1, enabled: false, idleEnabled: false });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("T15C maps companion start, sustained thinking, spoken replies, and Codex milestones to bounded presets", async () => {
  const directory = temporaryDirectory();
  const clock = new FakeClock();
  const calls = [];
  try {
    const coordinator = new MotionAutomationCoordinator({
      policyStore: enabledStore(directory),
      executePreset: async (...args) => { calls.push(args); return { ok: true, endpointReportedComplete: true }; },
      getActivity: () => ({}),
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
      thinkingDelayMs: 4_000,
    });
    await coordinator.onCompanionStarted();
    coordinator.onCompanionState("thinking");
    await clock.advance(3_999);
    assert.deepEqual(calls, [["attention", 1, "context"]]);
    await clock.advance(1);
    assert.deepEqual(calls.at(-1), ["search", 1, "context"]);
    coordinator.onCompanionState("listening");
    coordinator.onCompanionState("thinking");
    coordinator.onCompanionState("speaking");
    await clock.advance(4_001);
    assert.equal(calls.filter(([preset]) => preset === "search").length, 1);
    coordinator.onCompanionState("speaking");
    await coordinator.onIntentResult({ ok: true, type: "open_application" });
    assert.equal(calls.filter(([preset]) => preset === "nod").length, 0);
    coordinator.onCompanionState("completed");
    await Promise.resolve();
    await Promise.resolve();
    await coordinator.onIntentResult({ ok: true, type: "query_codex_status" });
    await coordinator.onIntentResult({ ok: true, type: "run_motion_preset" });
    assert.equal(calls.filter(([preset]) => preset === "nod").length, 2);
    coordinator.onCompanionState("speaking");
    await clock.advance(2_001);
    coordinator.onCompanionState("listening");
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(calls.filter(([preset]) => preset === "nod").length, 3);
    await coordinator.onCodexState("waiting");
    await coordinator.onCodexState("error");
    assert.equal(calls.filter(([preset]) => preset === "search").length, 2);
    assert.equal(coordinator.snapshot().last.reason, "duplicate-attention");
    await coordinator.onCodexCompleted();
    await coordinator.onCodexCompleted();
    assert.equal(calls.filter(([preset]) => preset === "nod").length, 4);
    assert.equal(coordinator.snapshot().last.reason, "duplicate-completion");
    coordinator.close();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("T15C skips lower-priority work without queuing or replaying it", async () => {
  const directory = temporaryDirectory();
  const calls = [];
  let activity = { manualActive: true };
  try {
    const coordinator = new MotionAutomationCoordinator({ policyStore: enabledStore(directory, true), executePreset: async (...args) => { calls.push(args); return { ok: true }; }, getActivity: () => activity });
    assert.equal((await coordinator.trigger("companion-start", "attention", 1, "context")).reason, "manual-control-active");
    activity = { agentActive: true };
    assert.equal((await coordinator.trigger("idle-search", "search", 1, "idle")).reason, "agent-task-active");
    activity = {};
    assert.equal(calls.length, 0);
    await coordinator.trigger("companion-start", "attention", 1, "context");
    assert.deepEqual(calls, [["attention", 1, "context"]]);
    coordinator.close();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("T15C idle search waits 90 seconds, skips active conversation, and never enables itself", async () => {
  const directory = temporaryDirectory();
  const clock = new FakeClock();
  const calls = [];
  let companionActive = true;
  try {
    const coordinator = new MotionAutomationCoordinator({
      policyStore: enabledStore(directory, true),
      executePreset: async (...args) => { calls.push(args); return { ok: true }; },
      getActivity: () => ({ companionActive }),
      now: clock.now,
      schedule: clock.schedule,
      cancel: clock.cancel,
      idleDelayMs: 90_000,
    });
    await clock.advance(90_000);
    assert.equal(calls.length, 0);
    companionActive = false;
    await clock.advance(90_000);
    assert.deepEqual(calls, [["search", 1, "idle"]]);
    const disabledDirectory = temporaryDirectory();
    const disabledCalls = [];
    const disabled = new MotionAutomationCoordinator({ policyStore: new MotionAutomationPolicyStore({ userDataPath: disabledDirectory }), executePreset: async (...args) => { disabledCalls.push(args); return { ok: true }; }, now: clock.now, schedule: clock.schedule, cancel: clock.cancel, idleDelayMs: 90_000 });
    await clock.advance(90_000);
    assert.equal(disabledCalls.length, 0);
    disabled.close();
    fs.rmSync(disabledDirectory, { recursive: true, force: true });
    coordinator.close();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("T15C renderer exposes one total switch, optional idle switch, and narrow IPC", () => {
  const page = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");
  const preload = fs.readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.match(page, /自动情境动作总开关/);
  assert.match(page, /空闲环视/);
  assert.match(page, /“跳舞”始终只由按钮、明确语音或已激活的自定义舞蹈触发/);
  assert.match(preload, /desktop:get-motion-automation-policy/);
  assert.match(preload, /desktop:set-motion-automation-policy/);
  assert.match(main, /handleTrusted\("desktop:set-motion-automation-policy"/);
  assert.doesNotMatch(preload, /motionAutomation.*(?:PWM|GPIO|pulseWidth|servoAngle)/i);
});
