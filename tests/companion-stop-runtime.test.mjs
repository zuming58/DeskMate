import assert from "node:assert/strict";
import test from "node:test";
import { createCompanionStopAction } from "../src/domain/companionStop.js";
import { createDiagnosticReport } from "../src/services/diagnostics.js";
import { defaultState, reduceAppState } from "../src/store/appStore.js";

test("all stop callers share one awaited operation and apply its terminal status", async () => {
  const updates = [];
  let release;
  let calls = 0;
  const action = createCompanionStopAction({
    getBridge: () => ({ stopCompanionConversation: () => { calls += 1; return new Promise((resolve) => { release = resolve; }); } }),
    updateCompanion: (value) => updates.push(value),
  });
  const page = action.stop("page");
  const capsule = action.stop("capsule");
  assert.equal(page, capsule);
  await Promise.resolve();
  release({ ok: true, status: { type: "status", active: false, state: "idle", eventSequence: 9 } });
  assert.equal((await page).ok, true);
  assert.equal(calls, 1);
  assert.equal(updates.some((value) => value.state === "idle"), true);
  assert.equal(updates.at(-1).stopLifecycle.result, "completed");
});

test("an optimistic stop result that is still active must reconcile main status", async () => {
  const updates = [];
  let statusCalls = 0;
  const action = createCompanionStopAction({
    getBridge: () => ({
      stopCompanionConversation: async () => ({ ok: true, status: { type: "status", active: true, state: "stopping", eventSequence: 5 } }),
      getCompanionConversationStatus: async () => { statusCalls += 1; return { type: "status", active: false, state: "idle", eventSequence: 6 }; },
    }),
    updateCompanion: (value) => updates.push(value),
  });
  const result = await action.stop("escape");
  assert.equal(result.reconciled, true);
  assert.equal(statusCalls, 1);
  assert.equal(updates.some((value) => value.state === "idle"), true);
});

test("stop failure reconciles and leaves a retryable redacted lifecycle error when main remains active", async () => {
  const updates = [];
  const action = createCompanionStopAction({
    getBridge: () => ({
      stopCompanionConversation: async () => { throw new Error("private provider response"); },
      getCompanionConversationStatus: async () => ({ type: "status", active: true, state: "listening", eventSequence: 8 }),
    }),
    updateCompanion: (value) => updates.push(value),
  });
  const result = await action.stop("capsule");
  assert.deepEqual({ ok: result.ok, reason: result.reason }, { ok: false, reason: "companion-stop-failed" });
  assert.deepEqual(updates.at(-1).stopLifecycle, { pending: false, result: "failed", error: "companion-stop-failed", attempts: 1 });
});

test("companion reducer ignores stale sequence and old generation without losing other runtime slices", () => {
  let state = structuredClone(defaultState);
  state = reduceAppState(state, { type: "companion-runtime", value: { type: "state", state: "listening", sessionId: "new", generation: 3, eventSequence: 20 } });
  state = reduceAppState(state, { type: "runtime-slice", slice: "easyInputAudio", value: { level: 44 } });
  state = reduceAppState(state, { type: "companion-runtime", value: { type: "state", state: "stopping", sessionId: "old", generation: 2, eventSequence: 21 } });
  assert.equal(state.runtime.companion.state, "listening");
  state = reduceAppState(state, { type: "companion-runtime", value: { type: "state", state: "stopping", sessionId: "new", generation: 3, eventSequence: 19 } });
  assert.equal(state.runtime.companion.state, "listening");
  assert.equal(state.runtime.easyInputAudio.level, 44);
  state = reduceAppState(state, { type: "companion-runtime", value: { type: "state", state: "idle", sessionId: "new", generation: 3, eventSequence: 22 } });
  state = reduceAppState(state, { type: "companion-runtime", value: { type: "status", active: false, state: "idle", sessionId: "", generation: 0, eventSequence: 22 } });
  state = reduceAppState(state, { type: "companion-runtime", value: { type: "transcript.partial", text: "late", sessionId: "new", generation: 3, eventSequence: 23 } });
  assert.equal(state.runtime.companion.transcript, "");
  state = reduceAppState(state, { type: "companion-runtime", value: { type: "state", state: "connecting", sessionId: "next", generation: 4, eventSequence: 24 } });
  assert.equal(state.runtime.companion.state, "connecting");
});

test("companion diagnostics expose build and lifecycle proof without identities or content", () => {
  const report = createDiagnosticReport({ conversation: {
    state: "stopping", connected: true, serviceConfigured: true, input: "computer",
    build: { id: "t11d1-playback-runtime-root-fix-v1", version: "0.1.0", path: "private-path" },
    mainState: { active: false, state: "idle", generation: 7, sessionId: "private-session" },
    eventSequence: 41,
    stopLifecycle: { pending: true, result: "pending", requested: 2, duplicateRequests: 1, completed: 1, providerText: "private reply" },
    providerLifecycle: { connectAttempts: 2, connections: 1, events: 19, audioEvents: 12, ttsStarts: 1, ttsEnds: 1 },
    counters: { sinkAccepted: 12, sinkPlayed: 11, sinkCancelled: 1, backpressureWaits: 3, bufferedAudioHighWaterMs: 2800 },
  } });
  assert.deepEqual(report.conversation.build, { id: "t11d1-playback-runtime-root-fix-v1", version: "0.1.0" });
  assert.deepEqual(report.conversation.mainState, { active: false, state: "idle", generation: 7 });
  assert.equal(report.conversation.stopLifecycle.duplicateRequests, 1);
  assert.equal(report.conversation.counters.sinkPlayed, 11);
  assert.doesNotMatch(JSON.stringify(report), /private-path|private-session|private reply/i);
});
