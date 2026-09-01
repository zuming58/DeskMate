import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import {
  companionPreferencesToDraft,
  parseCompanionPreferenceDraft,
} from "../src/domain/companionPreferences.js";
import { createDiagnosticReport } from "../src/services/diagnostics.js";
import { defaultState, reduceAppState } from "../src/store/appStore.js";

const require = createRequire(import.meta.url);
const {
  CompanionPreferenceStore,
  validateCompanionPreferences,
} = require("../electron/companion-preferences.cjs");
const { CompanionConversationController } = require("../electron/companion-conversation.cjs");
const { SimulatedCompanionAudioSink, SimulatedCompanionAudioSource } = require("../electron/companion-audio.cjs");

class FakeProvider {
  constructor(onEvent) { this.onEvent = onEvent; }
  async connect() { return { ok: true }; }
  sendAudio() { return true; }
  close() {}
  emit(value) { this.onEvent(value); }
}

function fakeClock() {
  let now = 0; let nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimer(callback, delay) { const id = nextId++; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimer(id) { timers.delete(id); },
    async tick(milliseconds) {
      now += milliseconds;
      const due = [...timers.entries()].filter(([, item]) => item.due <= now).sort((a, b) => a[1].due - b[1].due);
      for (const [id, item] of due) { if (!timers.delete(id)) continue; item.callback(); }
      for (let index = 0; index < 40; index += 1) await Promise.resolve();
    },
  };
}

test("manual companion seconds accept official boundaries and reject invalid drafts", () => {
  assert.deepEqual(parseCompanionPreferenceDraft({ name: "小言", wakePhrase: "你好，小言", endSmoothSeconds: "0.5", idleTimeoutSeconds: "0" }), {
    ok: true,
    value: { name: "小言", wakePhrase: "你好，小言", endSmoothWindowMs: 500, idleTimeoutMs: 0 },
  });
  assert.equal(parseCompanionPreferenceDraft({ name: "小言", wakePhrase: "你好，小言", endSmoothSeconds: "50", idleTimeoutSeconds: "3600" }).ok, true);
  for (const draft of [
    { endSmoothSeconds: "0.4", idleTimeoutSeconds: "60" },
    { endSmoothSeconds: "1.2", idleTimeoutSeconds: "60" },
    { endSmoothSeconds: "51", idleTimeoutSeconds: "60" },
    { endSmoothSeconds: "5", idleTimeoutSeconds: "9" },
    { endSmoothSeconds: "5", idleTimeoutSeconds: "60.5" },
  ]) assert.equal(parseCompanionPreferenceDraft({ name: "小言", wakePhrase: "你好，小言", ...draft }).ok, false);
  assert.deepEqual(companionPreferencesToDraft({ name: "阿言", wakePhrase: "你好，阿言", endSmoothWindowMs: 5500, idleTimeoutMs: 90000 }), { name: "阿言", wakePhrase: "你好，阿言", endSmoothSeconds: "5.5", idleTimeoutSeconds: "90" });
  assert.equal(validateCompanionPreferences({ name: "小言", wakePhrase: "你好，小言", endSmoothWindowMs: 5500, idleTimeoutMs: 90000 }).endSmoothWindowMs, 5500);
  assert.throws(() => validateCompanionPreferences({ name: "小言", wakePhrase: "你好，小言", endSmoothWindowMs: 1200, idleTimeoutMs: 60000 }), /end-smooth/);
});

test("preference store exposes revisioned readback while draft editing has no persistence side effect", () => {
  const writes = [];
  const store = Object.create(CompanionPreferenceStore.prototype);
  store.value = validateCompanionPreferences({ name: "小言", wakePhrase: "你好，小言", endSmoothWindowMs: 5000, idleTimeoutMs: 60000 });
  store.revision = 1;
  store.writeAndReadback = (value) => { writes.push(value); return value; };
  const untouchedDraft = companionPreferencesToDraft(store.get());
  untouchedDraft.endSmoothSeconds = "7.5";
  assert.equal(writes.length, 0);
  const saved = store.save(parseCompanionPreferenceDraft(untouchedDraft).value);
  assert.equal(writes.length, 1);
  assert.equal(saved.endSmoothWindowMs, 7500);
  assert.equal(store.snapshot().revision, 2);
});

test("a session freezes provider and idle values at start even when saved preferences change", async () => {
  const providers = []; let provider;
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent, sessionPreferences }) => {
      providers.push(sessionPreferences);
      provider = new FakeProvider(onEvent);
      return provider;
    },
    audioSource: new SimulatedCompanionAudioSource(),
    audioSink: new SimulatedCompanionAudioSink(),
    wait: async () => {},
  });
  assert.equal(controller.snapshot().sessionPolicy.sessionApplied, null);
  controller.configureSession({ preferences: { revision: 4, name: "小言", endSmoothWindowMs: 7500, idleTimeoutMs: 90000 } });
  await controller.start({ sessionId: "frozen", generation: 1 });
  assert.deepEqual(providers[0], { revision: 4, name: "小言", wakePhrase: "你好，小言", endSmoothWindowMs: 7500, idleTimeoutMs: 90000 });
  assert.deepEqual(controller.snapshot().sessionPolicy.sessionApplied, { revision: 4, name: "小言", wakePhrase: "你好，小言", endSmoothWindowMs: 7500, idleTimeoutMs: 90000 });
  controller.configureSession({ preferences: { revision: 5, name: "changed", endSmoothWindowMs: 1000, idleTimeoutMs: 10000 } });
  assert.equal(controller.snapshot().sessionPolicy.sessionApplied.endSmoothWindowMs, 7500);
  await controller.stop();
});

test("partial to final timing is content free and idle timeout publishes completed stop evidence", async () => {
  const clock = fakeClock(); let provider;
  const events = [];
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)),
    audioSource: new SimulatedCompanionAudioSource(), audioSink: new SimulatedCompanionAudioSink(),
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, wait: async () => {}, onEvent: (event) => events.push(event),
  });
  controller.configureSession({ preferences: { revision: 1, name: "private", endSmoothWindowMs: 5000, idleTimeoutMs: 10000 } });
  await controller.start({ sessionId: "timing", generation: 1 });
  provider.emit({ type: "asr.partial", text: "private partial" });
  await controller.eventChain;
  await clock.tick(1800);
  provider.emit({ type: "asr.final", text: "private final" });
  await controller.eventChain;
  assert.deepEqual(controller.snapshot().asrTiming, { metric: "provider-partial-to-final-v1", status: "available", lastMs: 1800, samples: 1 });
  await controller.transition("listening", { reason: "next-turn" });
  await clock.tick(10000);
  const snapshot = controller.snapshot();
  assert.equal(snapshot.sessionPolicy.lastStopReason, "listening-idle-timeout");
  assert.equal(snapshot.stopLifecycle.completed, 1);
  assert.equal(snapshot.stopLifecycle.lastResult, "completed");
  assert.ok(events.some((event) => event.type === "stop.lifecycle" && event.stopLifecycle.completed === 1));
});

test("diagnostics separate saved and session-applied values and never export private identity", () => {
  const report = createDiagnosticReport({ conversation: {
    state: "listening", connected: true,
    savedPreferences: { revision: 8, endSmoothWindowMs: 12000, idleTimeoutMs: 180000, name: "private-name", wakePhrase: "private-wake" },
    sessionPolicy: { sessionApplied: { revision: 7, endSmoothWindowMs: 5000, idleTimeoutMs: 60000 } },
    asrTiming: { metric: "provider-partial-to-final-v1", status: "available", lastMs: 1700, samples: 3 },
    stopLifecycle: { requested: 1, completed: 1, lastResult: "completed" },
  } });
  assert.deepEqual(report.conversation.endpointing.saved, { revision: 8, endSmoothWindowMs: 12000, idleTimeoutMs: 180000 });
  assert.deepEqual(report.conversation.endpointing.sessionApplied, { revision: 7, endSmoothWindowMs: 5000, idleTimeoutMs: 60000 });
  assert.deepEqual(report.conversation.asrTiming, { metric: "provider-partial-to-final-v1", status: "available", lastMs: 1700, samples: 3 });
  assert.doesNotMatch(JSON.stringify(report), /private-name|private-wake/);
});

test("renderer runtime keeps content-free timing and final stop evidence from non-state events", () => {
  const initial = structuredClone(defaultState);
  const timing = reduceAppState(initial, { type: "companion-runtime", value: {
    type: "turn.user-final", sessionId: "one", generation: 1, eventSequence: 4, text: "private",
    asrTiming: { metric: "provider-partial-to-final-v1", status: "available", lastMs: 900, samples: 1 },
    sessionPolicy: { sessionApplied: { revision: 2, name: "private", wakePhrase: "private", endSmoothWindowMs: 5000, idleTimeoutMs: 60000 } },
  } });
  assert.deepEqual(timing.runtime.companion.asrTiming, { metric: "provider-partial-to-final-v1", status: "available", lastMs: 900, samples: 1 });
  const stopped = reduceAppState(timing, { type: "companion-runtime", value: {
    type: "stop.lifecycle", sessionId: "one", generation: 1, eventSequence: 5,
    stopLifecycle: { requested: 1, completed: 1, lastResult: "completed" },
    sessionPolicy: { lastStopReason: "listening-idle-timeout", sessionApplied: timing.runtime.companion.sessionPolicy.sessionApplied },
  } });
  assert.equal(stopped.runtime.companion.stopLifecycle.completed, 1);
  assert.equal(stopped.runtime.companion.sessionPolicy.lastStopReason, "listening-idle-timeout");
});

test("Companion DOM and CSS keep independent columns, explicit save, and bounded face geometry", () => {
  const pages = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const companion = pages.slice(pages.indexOf("export function CompanionPage"), pages.indexOf("function MemoryManagementPage"));
  assert.match(companion, /className="companion-primary-column"[\s\S]*className="companion-stage"[\s\S]*<AgentStateTestPanel/);
  assert.match(companion, /className="companion-side-stack"[\s\S]*陪伴与记忆[\s\S]*陪伴对话设置[\s\S]*设备与服务[\s\S]*语音互斥边界/);
  assert.match(companion, /保存陪伴设置/);
  assert.match(companion, /下一次新建陪伴会话生效/);
  assert.match(companion, /sessionActive \? conversation\.sessionPolicy\?\.sessionApplied\?\.name/);
  assert.doesNotMatch(app, /setCompanionPreferences\(\{[\s\S]*companionName: state\.settings\.companionName/);
  assert.doesNotMatch(styles.match(/\.companion-overview \{[^}]*\}/)?.[0] || "", /align-items:\s*stretch/);
  assert.doesNotMatch(styles.match(/\.companion-stage \{[^}]*\}/)?.[0] || "", /height:\s*100%|min-height:\s*720px/);
  assert.match(styles.match(/\.companion-stage__face \{[^}]*\}/)?.[0] || "", /aspect-ratio:/);
  assert.match(styles.match(/\.companion-stage__face \{[^}]*\}/)?.[0] || "", /max-height:/);
  assert.doesNotMatch(styles.match(/\.companion-stage__face \{[^}]*\}/)?.[0] || "", /flex:\s*1/);
});
