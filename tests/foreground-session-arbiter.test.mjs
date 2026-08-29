import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptsForegroundSessionEvent,
  emergencyStopForegroundSession,
  finishForegroundSession,
  initialForegroundSessionState,
  startForegroundSession,
  stopForegroundSession,
} from "../src/domain/foregroundSessionArbiter.js";

test("dictation interrupts companion and rejects late companion events", () => {
  const companion = startForegroundSession(initialForegroundSessionState, { mode: "companion", sessionId: "companion-1" });
  const dictation = startForegroundSession(companion.state, { mode: "dictation", sessionId: "dictation-1" });

  assert.deepEqual(dictation.events.map((item) => item.type), ["stopping", "released", "acquired"]);
  assert.equal(acceptsForegroundSessionEvent(dictation.state, { sessionId: "companion-1", generation: 1 }), false);
  assert.equal(acceptsForegroundSessionEvent(dictation.state, { sessionId: "dictation-1", generation: 2 }), true);
});

test("companion interrupts unfinished dictation without committing it", () => {
  const dictation = startForegroundSession(initialForegroundSessionState, { mode: "dictation", sessionId: "dictation-1" });
  const companion = startForegroundSession(dictation.state, { mode: "companion", sessionId: "companion-1" });

  assert.equal(companion.state.active.mode, "companion");
  assert.equal(acceptsForegroundSessionEvent(companion.state, { sessionId: "dictation-1", generation: 1 }), false);
});

test("late stop and finish never release a replacement session", () => {
  const first = startForegroundSession(initialForegroundSessionState, { mode: "companion", sessionId: "companion-1" });
  const replacement = startForegroundSession(first.state, { mode: "dictation", sessionId: "dictation-1" });
  const lateStop = stopForegroundSession(replacement.state, { sessionId: "companion-1", generation: 1 });
  const lateFinish = finishForegroundSession(lateStop.state, { sessionId: "companion-1", generation: 1 });

  assert.equal(lateStop.events[0].type, "ignored_stale");
  assert.equal(lateFinish.events[0].type, "ignored_stale");
  assert.deepEqual(lateFinish.state.active, { mode: "dictation", sessionId: "dictation-1", generation: 2 });
});

test("emergency stop revokes the active session and rejects every late event", () => {
  const started = startForegroundSession(initialForegroundSessionState, { mode: "companion", sessionId: "companion-1" });
  const stopped = emergencyStopForegroundSession(started.state);
  const lateFinish = finishForegroundSession(stopped.state, { sessionId: "companion-1", generation: 1 });

  assert.deepEqual(stopped.events.map((item) => item.type), ["emergency_stopped", "released"]);
  assert.equal(stopped.state.active, null);
  assert.equal(lateFinish.events[0].type, "ignored_stale");
});

test("repeated starts are deterministic and never create two owners", () => {
  const first = startForegroundSession(initialForegroundSessionState, { mode: "dictation", sessionId: "dictation-1" });
  const duplicate = startForegroundSession(first.state, { mode: "dictation", sessionId: "dictation-1" });

  assert.equal(duplicate.events[0].reason, "duplicate_start");
  assert.equal(duplicate.state, first.state);
  assert.equal(duplicate.state.active.sessionId, "dictation-1");
  assert.throws(() => startForegroundSession(first.state, { mode: "companion", sessionId: "dictation-1" }), /cannot change mode/);
});
