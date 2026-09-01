import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrateState, SCHEMA_VERSION, validateConfig } from "../src/store/appStore.js";
import { createDiagnosticReport } from "../src/services/diagnostics.js";
import { createKeyboardConfig, DEFAULT_ENCODER, DEFAULT_KEYMAP, firmwareAction } from "../src/domain/keymap.js";
import { COMPANION_CALL_ACTION_ID } from "../src/domain/companionPreferences.js";

const require = createRequire(import.meta.url);
const { CompanionConversationController } = require("../electron/companion-conversation.cjs");
const { SimulatedCompanionAudioSink, SimulatedCompanionAudioSource } = require("../electron/companion-audio.cjs");
const { DoubaoRealtimeSession } = require("../electron/doubao-realtime.cjs");
const { HostActionExecutor } = require("../electron/app-actions.cjs");
const { COMPANION_CALL_ACTION } = require("../electron/companion-call.cjs");
const { CompanionPreferenceStore, normalizeCompanionPreferences } = require("../electron/companion-preferences.cjs");
const { UnavailableWakeWordAdapter } = require("../electron/wake-word-adapter.cjs");
const { mergeKeyboardPatch, sanitizeKeyboardConfig } = require("../electron/config-merge.cjs");

class FakeProvider {
  constructor(onEvent) { this.onEvent = onEvent; this.interruptions = 0; }
  async connect() { return { ok: true }; }
  sendAudio() { return true; }
  interrupt() { this.interruptions += 1; }
  close() {}
  emit(value) { this.onEvent(value); }
}

function fakeClock() {
  let now = 0; let nextId = 1;
  const timers = new Map();
  return {
    setTimer(callback, delay) { const id = nextId++; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimer(id) { timers.delete(id); },
    async tick(milliseconds) {
      now += milliseconds;
      const due = [...timers.entries()].filter(([, item]) => item.due <= now).sort((a, b) => a[1].due - b[1].due);
      for (const [id, item] of due) { if (!timers.delete(id)) continue; item.callback(); }
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
    },
  };
}

test("T12A preferences migrate to 小言, persist enums, and reject malformed imports", () => {
  const migrated = migrateState({ schemaVersion: 11, settings: {} });
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual({ name: migrated.settings.companionName, wake: migrated.settings.companionWakePhrase, pause: migrated.settings.companionEndSmoothWindowMs, idle: migrated.settings.companionIdleTimeoutMs }, { name: "小言", wake: "你好，小言", pause: 5000, idle: 60000 });
  assert.throws(() => validateConfig({ settings: { companionEndSmoothWindowMs: 650 } }), /停顿阈值/);
  assert.throws(() => validateConfig({ settings: { companionIdleTimeoutMs: 999 } }), /会话空闲/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-t12a-preferences-"));
  try {
    const store = new CompanionPreferenceStore({ userDataPath: root });
    assert.equal(store.get().name, "小言");
    assert.deepEqual(store.save({ name: "阿言", wakePhrase: "你好，阿言", endSmoothWindowMs: 3000, idleTimeoutMs: 120000 }), { name: "阿言", wakePhrase: "你好，阿言", endSmoothWindowMs: 3000, idleTimeoutMs: 120000 });
    assert.deepEqual(new CompanionPreferenceStore({ userDataPath: root }).get(), store.get());
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Doubao StartSession receives the companion-only server endpointing and identity", () => {
  const session = new DoubaoRealtimeSession({ config: { appId: "app", accessKey: "access", resourceId: "resource", model: "model", voice: "voice", name: "小言", endSmoothWindowMs: 5000 } });
  const payload = session.buildSessionPayload();
  assert.deepEqual(payload.asr, { extra: { end_smooth_window_ms: 5000 } });
  assert.equal(payload.dialog.extra.input_mod, "keep_alive");
  assert.equal(payload.dialog.bot_name, "小言");
  assert.match(payload.dialog.system_role, /小言/);
  assert.deepEqual(normalizeCompanionPreferences({ endSmoothWindowMs: 650 }).endSmoothWindowMs, 5000);
});

test("listening idle timer stops normally, accepted input cancels it, and call resets it", async () => {
  const clock = fakeClock();
  const events = []; let provider;
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)),
    audioSource: new SimulatedCompanionAudioSource(), audioSink: new SimulatedCompanionAudioSink(),
    setTimer: clock.setTimer, clearTimer: clock.clearTimer, wait: async () => {}, onEvent: (event) => events.push(event),
  });
  controller.configureSession({ idleTimeoutMs: 30000 });
  assert.equal((await controller.start({ sessionId: "idle-session", generation: 1 })).ok, true);
  await clock.tick(20000);
  assert.equal((await controller.call("test-call")).action, "listening-reset");
  await clock.tick(20000);
  assert.equal(controller.snapshot().active, true);
  provider.emit({ type: "asr.final", text: "已经说话" });
  await controller.eventChain;
  assert.equal(controller.snapshot().sessionPolicy.idleTimerArmed, false);
  await controller.transition("listening", { reason: "next-turn" });
  await clock.tick(30000);
  assert.equal(controller.snapshot().active, false);
  assert.equal(controller.snapshot().sessionPolicy.lastStopReason, "listening-idle-timeout");
  assert.ok(events.some((event) => event.type === "idle.timeout"));
});

test("companion call interrupts an active response and never toggles the full conversation off", async () => {
  let provider;
  const controller = new CompanionConversationController({ providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)), audioSource: new SimulatedCompanionAudioSource(), audioSink: new SimulatedCompanionAudioSink(), wait: async () => {} });
  controller.configureSession({ idleTimeoutMs: 0 });
  await controller.start({ sessionId: "call-session", generation: 1 });
  provider.emit({ type: "tts.start" });
  await controller.eventChain;
  const result = await controller.call("easyinput-host-action");
  assert.equal(result.action, "interrupt-listen");
  assert.equal(result.status.active, true);
  assert.equal(result.status.state, "listening");
  assert.equal(provider.interruptions, 1);
  await controller.stop();
});

test("reserved companion Host Action round-trips without entering AppActionStore and unknown UUID fails closed", async () => {
  assert.equal(COMPANION_CALL_ACTION.id, COMPANION_CALL_ACTION_ID);
  assert.equal(firmwareAction({ action: "companion-call" }), `host_action:${COMPANION_CALL_ACTION.id}`);
  const raw = createKeyboardConfig({ keymap: DEFAULT_KEYMAP, encoder: DEFAULT_ENCODER });
  const merged = mergeKeyboardPatch(raw, { keymap: { KEY8: { action: "companion-call" } } });
  assert.equal(merged.profiles[0].keys.KEY8.press, `host_action:${COMPANION_CALL_ACTION.id}`);
  assert.deepEqual(sanitizeKeyboardConfig(merged).keymap[7], { action: "companion-call" });
  let calls = 0;
  const executor = new HostActionExecutor({ store: { execute: async () => ({ ok: false, reason: "host-action-not-mapped" }) }, reservedActions: new Map([[COMPANION_CALL_ACTION.id, async () => { calls += 1; return { ok: true, action: "start-listening" }; }]]) });
  assert.equal((await executor.execute(COMPANION_CALL_ACTION.id)).action, "start-listening");
  assert.equal(calls, 1);
  assert.equal((await executor.execute("11111111-2222-3333-4444-555555555555")).reason, "host-action-not-mapped");
});

test("wake boundary is unavailable without opening a microphone and diagnostics separate saved from applied endpointing", async () => {
  const wake = new UnavailableWakeWordAdapter();
  assert.deepEqual(wake.status(), { version: "wake-word-adapter-v1", available: false, enabled: false, reason: "wake-word-engine-not-integrated", localOnly: true, optInRequired: true, visibleMicrophoneRequired: true, foregroundAudioOwnerRequired: true });
  assert.equal((await wake.start()).ok, false);
  const report = createDiagnosticReport({ conversation: {
    savedPreferences: { revision: 4, endSmoothWindowMs: 3000, idleTimeoutMs: 120000, name: "private-name", wakePhrase: "private-phrase" },
    sessionPolicy: { sessionApplied: { revision: 3, endSmoothWindowMs: 5000, idleTimeoutMs: 60000 } },
    companionName: "private-name",
    wakePhrase: "private-phrase",
  } });
  assert.deepEqual(report.conversation.endpointing, {
    saved: { revision: 4, endSmoothWindowMs: 3000, idleTimeoutMs: 120000 },
    sessionApplied: { revision: 3, endSmoothWindowMs: 5000, idleTimeoutMs: 60000 },
  });
  assert.doesNotMatch(JSON.stringify(report), /private-name|private-phrase/);
});

test("T12A UI exposes the key test and marks wake word as unavailable", () => {
  const pages = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");
  assert.match(pages, /测试此动作/);
  assert.match(pages, /语音唤醒待接入 \/ 未启用/);
  assert.match(pages, /单句话内停顿/);
  assert.match(pages, /无人说话自动结束/);
});
