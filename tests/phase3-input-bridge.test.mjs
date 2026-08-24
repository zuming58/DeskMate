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
