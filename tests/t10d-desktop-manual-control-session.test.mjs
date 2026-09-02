import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ManualControlSession } = require("../electron/manual-control-session.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fakeClock() {
  let now = 1000;
  let nextId = 1;
  const timers = new Map();
  const schedule = (fn, delay) => { const id = nextId++; timers.set(id, { at: now + delay, fn }); return id; };
  const cancel = (id) => timers.delete(id);
  const advance = async (ms) => {
    const target = now + ms;
    while (true) {
      const ready = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!ready) break;
      timers.delete(ready[0]); now = ready[1].at; ready[1].fn(); await Promise.resolve(); await Promise.resolve();
    }
    now = target; await Promise.resolve(); await Promise.resolve();
  };
  return { now: () => now, schedule, cancel, advance, pending: () => timers.size };
}

test("hold control is terminal-gated, rate-limited and never queues steps", async () => {
  const clock = fakeClock();
  const first = deferred();
  const actions = [];
  const session = new ManualControlSession({ now: clock.now, schedule: clock.schedule, cancel: clock.cancel, perform: (action) => { actions.push({ ...action, at: clock.now() }); return actions.length === 1 ? first.promise : Promise.resolve({ ok: true }); } });
  session.setAvailable(true); session.begin({ centerReady: true });
  assert.equal(session.press("left").ok, true);
  assert.equal(session.press("left").reason, "already-held");
  assert.equal(session.press("right").reason, "manual-control-direction-busy");
  assert.deepEqual(actions, [{ kind: "step", direction: "left", at: 1000 }]);
  await clock.advance(100);
  assert.equal(actions.length, 1, "no second request before the first terminal");
  first.resolve({ ok: true }); await Promise.resolve(); await Promise.resolve();
  await clock.advance(149); assert.equal(actions.length, 1);
  await clock.advance(1); assert.equal(actions.length, 2);
  assert.equal(actions[1].at - actions[0].at, 250);
  session.release("left");
  await clock.advance(1000); assert.equal(actions.length, 2, "release cancels every future repeat");
});

test("center gate blocks direction output until explicit center succeeds", async () => {
  const actions = [];
  const session = new ManualControlSession({ perform: async (action) => { actions.push(action); return { ok: true }; } });
  session.setAvailable(true); session.begin({ centerReady: false });
  assert.equal(session.press("up").reason, "manual-control-center-required");
  assert.equal((await session.establishCenter()).ok, true);
  assert.equal(session.snapshot().centerReady, true);
  session.press("up"); await Promise.resolve(); await Promise.resolve(); session.release("up");
  assert.deepEqual(actions.map((item) => item.kind), ["establish-center", "step"]);
  session.end("test-complete");
});

test("blur, hidden, page leave and disconnect lock immediately and defer cleanup until terminal", async () => {
  for (const reason of ["window-blur", "document-hidden", "page-leave", "device-disconnected"]) {
    const step = deferred(); const exits = [];
    const session = new ManualControlSession({ perform: () => step.promise, onExit: async (value) => { exits.push(value); } });
    session.setAvailable(true); session.begin({ centerReady: true }); session.press("down");
    if (reason === "device-disconnected") session.setAvailable(false); else session.end(reason);
    assert.equal(session.snapshot().active, false);
    assert.equal(session.snapshot().heldDirection, null);
    assert.equal(exits.length, 0, "cleanup waits for the one in-flight terminal");
    step.resolve({ ok: true }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(exits, [reason]);
  }
});

test("emergency stop is always accepted, suppresses repeats and runs after the current terminal", async () => {
  const step = deferred(); const actions = []; const exits = [];
  const session = new ManualControlSession({ perform: (action) => { actions.push(action); return action.kind === "step" ? step.promise : Promise.resolve({ ok: true }); }, onExit: async (reason) => { exits.push(reason); } });
  session.setAvailable(true); session.begin({ centerReady: true }); session.press("right");
  assert.equal(session.emergencyStop().ok, true);
  assert.equal(session.snapshot().active, false);
  assert.deepEqual(actions.map((item) => item.kind), ["step"]);
  step.resolve({ ok: true }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(actions.map((item) => item.kind), ["step", "emergency-stop"]);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(exits, ["emergency-stop"]);
  assert.equal(session.snapshot().lastReason, "emergency-stopped");
});

test("sixty seconds without activity exits the session without creating output", async () => {
  const clock = fakeClock(); const actions = []; const exits = [];
  const session = new ManualControlSession({ now: clock.now, schedule: clock.schedule, cancel: clock.cancel, perform: async (action) => { actions.push(action); return { ok: true }; }, onExit: async (reason) => { exits.push(reason); } });
  session.setAvailable(true); session.begin({ centerReady: true });
  await clock.advance(59999); assert.equal(session.snapshot().active, true);
  await clock.advance(1); assert.equal(session.snapshot().active, false);
  assert.deepEqual(actions, []);
  assert.deepEqual(exits, ["idle-timeout"]);
});

test("transport failures stop the session fail closed while center-required remains recoverable", async () => {
  const exits = [];
  const failed = new ManualControlSession({ perform: async () => ({ ok: false, reason: "peer-disconnected-or-restarted" }), onExit: async (reason) => { exits.push(reason); } });
  failed.setAvailable(true); failed.begin({ centerReady: true }); failed.press("left");
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(failed.snapshot().active, false);
  assert.equal(failed.snapshot().centerReady, false);
  assert.deepEqual(exits, ["peer-disconnected-or-restarted"]);

  const recoverable = new ManualControlSession({ perform: async () => ({ ok: false, reason: "center-required" }) });
  recoverable.setAvailable(true); recoverable.begin({ centerReady: true }); recoverable.press("right");
  await Promise.resolve(); await Promise.resolve();
  assert.equal(recoverable.snapshot().active, true);
  assert.equal(recoverable.snapshot().centerReady, false);
  assert.equal(recoverable.snapshot().lastReason, "center-required");
  recoverable.end("test-complete");
});
