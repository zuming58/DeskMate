import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { initialVoiceSession, transitionVoiceSession } from "../src/domain/voiceSession.js";

const require = createRequire(import.meta.url);
const { parseBridgeLine, InputTriggerFilter } = require("../electron/input-bridge-protocol.cjs");
const { InputBridgeManager } = require("../electron/input-bridge.cjs");

function bridgeEvent(overrides = {}) {
  return { version: 1, type: "input", source: "easyinput-hid", key: "F22", action: "down", time: "2026-08-21T10:00:00.000Z", sequence: 1, ...overrides };
}

test("bridge protocol accepts only the privacy-preserving schema", () => {
  const parsed = parseBridgeLine(JSON.stringify({ ...bridgeEvent(), devicePath: "private", serialNumber: "secret", text: "never" }));
  assert.deepEqual(Object.keys(parsed), ["version", "type", "source", "key", "action", "time", "sequence"]);
  assert.equal(parseBridgeLine(JSON.stringify({ ...bridgeEvent(), key: "A" })), null);
  assert.equal(parseBridgeLine("not-json"), null);
});

test("bridge protocol accepts sanitized Host Action and config acknowledgements", () => {
  const base = { version: 1, source: "easyinput-hid", time: "2026-08-21T10:00:00.000Z", sequence: 1 };
  assert.deepEqual(parseBridgeLine(JSON.stringify({ ...base, type: "host-action", hostActionId: "01234567-89ab-cdef-0123-456789abcdef", devicePath: "private" })), { ...base, type: "host-action", hostActionId: "01234567-89ab-cdef-0123-456789abcdef" });
  assert.equal(parseBridgeLine(JSON.stringify({ ...base, type: "host-action", hostActionId: "01234567-89AB-cdef-0123-456789abcdef" })), null);
  assert.deepEqual(parseBridgeLine(JSON.stringify({ ...base, type: "config-ack", ok: true, saved: true, bytes: 512, crc16: 0xabcd, phase: 2 })), { ...base, type: "config-ack", ok: true, saved: true, bytes: 512, crc16: 0xabcd, phase: 2 });
});

test("agent-state write acknowledgements expose metadata only", () => {
  const event = { version: 1, type: "agent-state-write", source: "easyinput-hid", requestId: "agent-12345678", ok: true, reason: "", report: "private", time: "2026-08-21T10:00:00.000Z", sequence: 5 };
  assert.deepEqual(parseBridgeLine(JSON.stringify(event)), {
    version: 1, type: "agent-state-write", source: "easyinput-hid", requestId: "agent-12345678", ok: true, reason: "", time: event.time, sequence: 5,
  });
  assert.equal(parseBridgeLine(JSON.stringify({ ...event, requestId: "short" })), null);
});

test("agent-state bridge is latest-wins and never replays after disconnect", async () => {
  const writes = [];
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = { writable: true, write: (line, callback) => { writes.push(JSON.parse(line)); callback?.(); } };
  child.kill = () => {};
  const manager = new InputBridgeManager({ executable: "bridge.exe", spawnImpl: () => child });
  manager.start();
  manager.handleLine(JSON.stringify({ version: 1, type: "status", source: "easyinput-hid", key: "Device", action: "connected", boardConnected: true, time: "2026-08-21T10:00:00.000Z", sequence: 1 }));

  const firstReport = Buffer.alloc(64); firstReport[0] = 0x12; firstReport[1] = 2; firstReport[2] = 1;
  const secondReport = Buffer.from(firstReport); secondReport[2] = 2;
  const latestReport = Buffer.from(firstReport); latestReport[2] = 3;
  const first = manager.sendAgentState(firstReport);
  const superseded = manager.sendAgentState(secondReport);
  const latest = manager.sendAgentState(latestReport);
  assert.deepEqual(await superseded, { ok: false, reason: "agent-state-superseded" });
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0]).sort(), ["report", "requestId", "type", "version"].sort());
  assert.equal(Buffer.from(writes[0].report, "base64").length, 64);

  manager.handleLine(JSON.stringify({ version: 1, type: "agent-state-write", source: "easyinput-hid", requestId: writes[0].requestId, ok: true, reason: "", time: "2026-08-21T10:00:00.100Z", sequence: 2 }));
  assert.deepEqual(await first, { ok: true });
  assert.equal(writes.length, 2);
  assert.equal(Buffer.from(writes[1].report, "base64")[2], 3);

  manager.handleLine(JSON.stringify({ version: 1, type: "status", source: "easyinput-hid", key: "Device", action: "disconnected", boardConnected: false, time: "2026-08-21T10:00:00.200Z", sequence: 3 }));
  assert.deepEqual(await latest, { ok: false, reason: "easyinput-disconnected" });
  manager.handleLine(JSON.stringify({ version: 1, type: "status", source: "easyinput-hid", key: "Device", action: "connected", boardConnected: true, time: "2026-08-21T10:00:00.300Z", sequence: 4 }));
  assert.equal(writes.length, 2, "reconnect must not replay an old state");
  manager.stop();
});

test("agent-state bridge bounds timeouts and ignores stale acknowledgements", async () => {
  const writes = [];
  const timers = new Map();
  let timerSequence = 0;
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = { writable: true, write: (line, callback) => { writes.push(JSON.parse(line)); callback?.(); } };
  child.kill = () => {};
  const manager = new InputBridgeManager({
    executable: "bridge.exe",
    spawnImpl: () => child,
    setTimer: (callback) => { const id = ++timerSequence; timers.set(id, callback); return id; },
    clearTimer: (id) => timers.delete(id),
  });
  manager.start();
  manager.handleLine(JSON.stringify({ version: 1, type: "status", source: "easyinput-hid", key: "Device", action: "connected", boardConnected: true, time: "2026-08-21T10:00:00.000Z", sequence: 1 }));

  const firstReport = Buffer.alloc(64); firstReport[0] = 0x12;
  const latestReport = Buffer.from(firstReport); latestReport[2] = 3;
  const first = manager.sendAgentState(firstReport);
  const latest = manager.sendAgentState(latestReport);
  const firstRequestId = writes[0].requestId;
  const firstTimeout = [...timers.values()][0];
  firstTimeout();

  assert.deepEqual(await first, { ok: false, reason: "agent-state-write-timeout" });
  assert.equal(writes.length, 2, "only the latest queued state is dispatched after timeout");
  manager.handleLine(JSON.stringify({ version: 1, type: "agent-state-write", source: "easyinput-hid", requestId: firstRequestId, ok: true, reason: "", time: "2026-08-21T10:00:00.100Z", sequence: 2 }));
  assert.equal(manager.pendingAgentState.requestId, writes[1].requestId, "a stale acknowledgement must not finish the current request");

  manager.stop();
  assert.deepEqual(await latest, { ok: false, reason: "input-bridge-stopped" });
});

test("fixed text bridge events expose metadata only", () => {
  const base = { version: 1, source: "easyinput-hid", time: "2026-08-21T10:00:00.000Z", sequence: 9 };
  const ready = parseBridgeLine(JSON.stringify({ ...base, type: "fixed-text", requestId: "fixed-12345678", bytes: 12, text: "private", devicePath: "private" }));
  assert.deepEqual(ready, { ...base, type: "fixed-text", requestId: "fixed-12345678", bytes: 12 });
  assert.equal(JSON.stringify(ready).includes("private"), false);
  const result = parseBridgeLine(JSON.stringify({ ...base, type: "fixed-text-result", requestId: "fixed-12345678", ok: true, bytes: 12, text: "private" }));
  assert.deepEqual(result, { ...base, type: "fixed-text-result", requestId: "fixed-12345678", ok: true, reason: "", bytes: 12 });
  assert.equal(parseBridgeLine(JSON.stringify({ ...base, type: "fixed-text", requestId: "fixed-12345678", bytes: 961 })), null);
});

test("fixed text injection is single-flight, bounded, and fails on bridge exit", async () => {
  const writes = [];
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = { writable: true, write: (line, callback) => { writes.push(JSON.parse(line)); callback?.(); } };
  child.kill = () => {};
  const manager = new InputBridgeManager({ executable: "bridge.exe", spawnImpl: () => child });
  manager.start();
  manager.handleLine(JSON.stringify({ version: 1, type: "status", source: "easyinput-hid", key: "Device", action: "connected", boardConnected: true, time: "2026-08-21T10:00:00.000Z", sequence: 1 }));
  const first = manager.injectFixedText("fixed-12345678", { blockedProcessId: 42, blockedWindowHandles: ["1234"] });
  assert.equal((await manager.injectFixedText("fixed-87654321")).reason, "fixed-text-busy");
  assert.deepEqual(Object.keys(writes[0]).sort(), ["blockedProcessId", "blockedWindowHandles", "expiresUnixMs", "requestId", "type", "version"].sort());
  assert.deepEqual(writes[0].blockedWindowHandles, ["1234"]);
  assert.equal(JSON.stringify(writes[0]).includes("text"), true); // only the command type contains the word, never payload text
  manager.handleLine(JSON.stringify({ version: 1, type: "fixed-text-result", source: "easyinput-hid", requestId: "fixed-12345678", ok: true, reason: "", bytes: 12, time: "2026-08-21T10:00:00.100Z", sequence: 2 }));
  assert.deepEqual(await first, { ok: true, bytes: 12 });
  const interrupted = manager.injectFixedText("fixed-abcdef12");
  child.emit("exit", 7);
  assert.deepEqual(await interrupted, { ok: false, reason: "input-bridge-exited", bytes: 0 });
  manager.stop();
});

test("active-window paste uses the resident bridge without exposing clipboard text", async () => {
  const writes = [];
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = { writable: true, write: (line, callback) => { writes.push(JSON.parse(line)); callback?.(); } };
  child.kill = () => {};
  const manager = new InputBridgeManager({ executable: "bridge.exe", spawnImpl: () => child });
  manager.start();

  const pending = manager.pasteActiveWindow("12345");
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0]).sort(), ["requestId", "targetWindow", "type", "version"].sort());
  assert.equal(writes[0].type, "paste-active-window");
  assert.equal(JSON.stringify(writes[0]).includes("private transcript"), false);
  manager.handleLine(JSON.stringify({ version: 1, type: "desktop-output-result", source: "desktop-output", requestId: writes[0].requestId, ok: true, reason: "", time: "2026-08-21T10:00:00.100Z", sequence: 2 }));
  assert.deepEqual(await pending, { ok: true });
  assert.equal((await manager.pasteActiveWindow("0")).reason, "target-window-invalid");
  manager.stop();
});

test("voice target capture returns only a transient window handle", async () => {
  const writes = [];
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = { writable: true, write: (line, callback) => { writes.push(JSON.parse(line)); callback?.(); } };
  child.kill = () => {};
  const manager = new InputBridgeManager({ executable: "bridge.exe", spawnImpl: () => child });
  manager.start();

  const pending = manager.captureActiveWindow();
  assert.deepEqual(Object.keys(writes[0]).sort(), ["requestId", "type", "version"].sort());
  assert.equal(writes[0].type, "capture-active-window");
  manager.handleLine(JSON.stringify({ version: 1, type: "desktop-window-result", source: "desktop-output", requestId: writes[0].requestId, ok: true, reason: "", targetWindow: "98765", windowTitle: "private", processPath: "private", time: "2026-08-21T10:00:00.100Z", sequence: 2 }));
  assert.deepEqual(await pending, { ok: true, targetWindow: "98765" });
  manager.stop();
});

test("config snapshots remain control events through the trigger filter", () => {
  const data = Buffer.from('{"schema":"ai_keyboard.v1"}', "utf8");
  const event = JSON.stringify({
    version: 1,
    type: "config-snapshot",
    source: "easyinput-hid",
    requestId: "read-12345678",
    bytes: data.length,
    crc16: require("../electron/easyinput-config.cjs").crc16Ccitt(data),
    sourceId: 0,
    jsonBase64: data.toString("base64"),
    time: "2026-08-21T10:00:00.000Z",
    sequence: 2,
  });
  const parsed = parseBridgeLine(event);
  assert.equal(new InputTriggerFilter().accept(parsed).kind, "config-snapshot");
});

test("T06 capabilities are explicit and fail closed when absent", () => {
  const base = { version: 1, type: "config-capabilities", source: "easyinput-hid", requestId: "read-12345678", configReadV1: true, configWriteV1: true, hostActionV1: true, fixedTextV1: true, time: "2026-08-21T10:00:00.000Z", sequence: 4 };
  assert.deepEqual(parseBridgeLine(JSON.stringify(base)), base);
  assert.deepEqual(parseBridgeLine(JSON.stringify(({ ...base, fixedTextV1: undefined }))), { ...base, fixedTextV1: false });
});

test("T09 Link diagnostics are privacy-safe, bounded and fail closed", () => {
  const base = {
    version: 1, type: "config-capabilities", source: "easyinput-hid",
    requestId: "read-t09-link", configReadV1: true, configWriteV1: true,
    hostActionV1: true, fixedTextV1: true, deskMateLinkV1: true,
    agentStateBridgeV1: true, linkState: "waiting", linkRxFrames: 0,
    linkTxFrames: 2304, linkRequestTimeouts: 768, linkRetries: 1536,
    linkPeerRestarts: 0, agentAccepted: 6, agentMalformed: 0,
    agentDroppedDisconnected: 6, agentForwarded: 0, agentQueueDrops: 0,
    time: "2026-08-30T14:00:00.000Z", sequence: 8,
  };
  assert.deepEqual(parseBridgeLine(JSON.stringify({ ...base, devicePath: "private", payload: "private" })), base);
  assert.equal(parseBridgeLine(JSON.stringify({ ...base, linkState: "private" })), null);
  assert.equal(parseBridgeLine(JSON.stringify({ ...base, linkRxFrames: -1 })), null);
  assert.equal(parseBridgeLine(JSON.stringify({ ...base, agentQueueDrops: 0x100000000 })), null);
  const missing = { ...base };
  delete missing.agentForwarded;
  assert.equal(parseBridgeLine(JSON.stringify(missing)), null);
});

test("config progress is validated and refreshes a matching read deadline", () => {
  const base = { version: 1, type: "config-progress", source: "easyinput-hid", requestId: "read-12345678", chunk: 2, total: 4, time: "2026-08-21T10:00:00.000Z", sequence: 3 };
  const parsed = parseBridgeLine(JSON.stringify(base));
  assert.deepEqual(parsed, base);
  assert.equal(parseBridgeLine(JSON.stringify({ ...base, chunk: 0 })), null);
  let timerCount = 0;
  let timeoutCallback;
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = { writable: true, write: (_line, callback) => callback?.() };
  child.kill = () => {};
  const manager = new InputBridgeManager({
    executable: "bridge.exe",
    spawnImpl: () => child,
    setTimer: (callback) => { timeoutCallback = callback; timerCount += 1; return timerCount; },
    clearTimer: () => {},
  });
  manager.start();
  manager.handleLine(JSON.stringify({ version: 1, type: "status", source: "easyinput-hid", key: "Device", action: "connected", boardConnected: true, time: base.time, sequence: 1 }));
  const read = manager.readConfig();
  assert.equal(manager.pendingRead.requestId.startsWith("read-"), true);
  manager.handleLine(JSON.stringify({ ...base, requestId: manager.pendingRead.requestId }));
  assert.equal(timerCount, 2);
  timeoutCallback();
  return read.then((result) => { assert.deepEqual(result, { ok: false, reason: "config-read-timeout" }); manager.stop(); });
});

test("F22 triggers only on release and filters repeat, debounce, stuck release, and disconnect", () => {
  let now = 1000;
  const filter = new InputTriggerFilter({ now: () => now });
  assert.equal(filter.accept(bridgeEvent()).kind, "diagnostic");
  assert.equal(filter.accept(bridgeEvent({ sequence: 2 })).reason, "repeat-down");
  assert.equal(filter.accept(bridgeEvent({ action: "up", sequence: 3 })).kind, "trigger");
  assert.equal(filter.accept(bridgeEvent({ action: "up", sequence: 4 })).reason, "release-without-down");
  now += 100;
  filter.accept(bridgeEvent({ sequence: 5 }));
  assert.equal(filter.accept(bridgeEvent({ action: "up", sequence: 6 })).reason, "debounced");
  now += 400;
  filter.accept(bridgeEvent({ sequence: 7 }));
  filter.accept(bridgeEvent({ version: 1, type: "status", source: "easyinput-hid", key: "Device", action: "disconnected", boardConnected: false, time: "2026-08-21T10:00:01.000Z", sequence: 8 }));
  assert.equal(filter.accept(bridgeEvent({ action: "up", sequence: 9 })).reason, "release-without-down");
});

test("a stale key-down is recovered by the next physical press without synthesizing a release", () => {
  let now = 1000;
  const filter = new InputTriggerFilter({ now: () => now, stuckMs: 1500 });
  assert.equal(filter.accept(bridgeEvent()).kind, "diagnostic");
  now += 2000;
  assert.equal(filter.accept(bridgeEvent({ sequence: 2 })).kind, "diagnostic");
  assert.equal(filter.accept(bridgeEvent({ action: "up", sequence: 3 })).kind, "trigger");
});

test("Right Alt is opt-in and Escape produces cancellation", () => {
  const filter = new InputTriggerFilter({ now: () => 1000 });
  const altDown = bridgeEvent({ source: "keyboard", key: "RightAlt" });
  assert.equal(filter.accept(altDown).kind, "diagnostic");
  assert.equal(filter.accept({ ...altDown, action: "up", sequence: 2 }).kind, "diagnostic");
  filter.configure({ rightAlt: true });
  assert.equal(filter.accept({ ...altDown, sequence: 3 }).kind, "diagnostic");
  assert.equal(filter.accept({ ...altDown, action: "up", sequence: 4 }).kind, "trigger");
  assert.equal(filter.accept(bridgeEvent({ source: "keyboard", key: "Escape" })).kind, "cancel");
});

test("voice edit triggers on Ctrl+Shift+E release without requiring the global shortcut", () => {
  const filter = new InputTriggerFilter({ now: () => 1000 });
  const down = bridgeEvent({ source: "keyboard", key: "VoiceEdit" });
  assert.equal(filter.accept(down).kind, "diagnostic");
  assert.equal(filter.accept({ ...down, action: "up", sequence: 2 }).kind, "trigger");
});

test("injected F22 fallback uses the same release-only trigger policy", () => {
  const filter = new InputTriggerFilter({ now: () => 1000 });
  assert.equal(filter.accept(bridgeEvent({ source: "f22-fallback" })).kind, "diagnostic");
  assert.equal(filter.accept(bridgeEvent({ source: "f22-fallback", action: "up", sequence: 2 })).kind, "trigger");
});

test("input bridge manager schedules an automatic restart after a crash", () => {
  let scheduled;
  let spawnCount = 0;
  const spawnImpl = () => {
    spawnCount += 1;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    return child;
  };
  const manager = new InputBridgeManager({ executable: "bridge.exe", spawnImpl, setTimer: (callback) => { scheduled = callback; return 1; }, clearTimer: () => {} });
  manager.start();
  manager.child.emit("exit", 7);
  assert.equal(manager.snapshot().process, "restarting");
  assert.equal(typeof scheduled, "function");
  scheduled();
  assert.equal(spawnCount, 2);
  manager.stop();
});

test("voice session enforces the complete phase-3 state sequence", () => {
  let state = transitionVoiceSession(initialVoiceSession, "recording");
  state = transitionVoiceSession(state, "transcribing");
  state = transitionVoiceSession(state, "outputting");
  state = transitionVoiceSession(state, "completed");
  assert.equal(state.state, "completed");
  assert.throws(() => transitionVoiceSession(initialVoiceSession, "outputting"), /不能/);
});
