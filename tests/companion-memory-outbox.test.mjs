import test from "node:test";
import assert from "node:assert/strict";
import {
  claimCompanionMemoryEvents,
  completeCompanionMemoryEvent,
  createCompanionMemoryOutboxState,
  enqueueCompanionMemoryEvent,
  recoverCompanionMemoryOutbox,
  releaseCompanionMemoryEvent,
} from "../src/domain/companionMemoryOutbox.js";

const now = "2026-08-29T12:00:00.000Z";

function finalTurn(eventId, text = "Remember the stable project decision") {
  return {
    eventId,
    sessionId: "companion-session-1",
    kind: "conversation.turn_final",
    createdAt: now,
    payload: { role: "user", text },
  };
}

test("accepts finalized turns and rejects partial, unknown, and audio-bearing events", () => {
  const added = enqueueCompanionMemoryEvent(createCompanionMemoryOutboxState(), finalTurn("event-1"));
  assert.equal(added.inserted, true);
  assert.equal(added.entry.status, "pending");

  assert.throws(() => enqueueCompanionMemoryEvent(added.state, { ...finalTurn("event-2"), kind: "conversation.turn_partial" }), /not allowed/);
  assert.throws(() => enqueueCompanionMemoryEvent(added.state, { ...finalTurn("event-3"), audio: "base64" }), /unsupported field/);
});

test("exact duplicate events are idempotent and conflicting IDs fail closed", () => {
  const first = enqueueCompanionMemoryEvent(createCompanionMemoryOutboxState(), finalTurn("event-1"));
  const duplicate = enqueueCompanionMemoryEvent(first.state, { ...finalTurn("event-1"), payload: { text: "Remember the stable project decision", role: "user" } });

  assert.equal(duplicate.inserted, false);
  assert.equal(duplicate.state, first.state);
  assert.equal(duplicate.state.entries.length, 1);
  assert.throws(() => enqueueCompanionMemoryEvent(first.state, finalTurn("event-1", "Different content")), /collision/);
});

test("claims pending events in bounded FIFO order", () => {
  const first = enqueueCompanionMemoryEvent(createCompanionMemoryOutboxState(), finalTurn("event-1"));
  const second = enqueueCompanionMemoryEvent(first.state, finalTurn("event-2"));
  const third = enqueueCompanionMemoryEvent(second.state, finalTurn("event-3"));
  const claimed = claimCompanionMemoryEvents(third.state, { workerId: "summarizer-1", claimedAt: now, limit: 2 });

  assert.deepEqual(claimed.entries.map((entry) => entry.eventId), ["event-1", "event-2"]);
  assert.equal(claimed.entries[0].attempts, 1);
  assert.equal(claimed.state.entries[2].status, "pending");
});

test("only the claiming worker may complete or release an event", () => {
  const added = enqueueCompanionMemoryEvent(createCompanionMemoryOutboxState(), finalTurn("event-1"));
  const claimed = claimCompanionMemoryEvents(added.state, { workerId: "summarizer-1", claimedAt: now });

  assert.throws(() => completeCompanionMemoryEvent(claimed.state, { eventId: "event-1", workerId: "summarizer-2", completedAt: now }), /not owned/);
  const released = releaseCompanionMemoryEvent(claimed.state, { eventId: "event-1", workerId: "summarizer-1", error: "provider unavailable" });
  assert.equal(released.entry.status, "pending");
  assert.equal(released.entry.sequence, 1);
  assert.equal(released.entry.attempts, 1);
});

test("startup recovery requeues processing entries and preserves completed entries", () => {
  const first = enqueueCompanionMemoryEvent(createCompanionMemoryOutboxState(), finalTurn("event-1"));
  const second = enqueueCompanionMemoryEvent(first.state, finalTurn("event-2"));
  const claimedFirst = claimCompanionMemoryEvents(second.state, { workerId: "summarizer-1", claimedAt: now, limit: 1 });
  const completedFirst = completeCompanionMemoryEvent(claimedFirst.state, { eventId: "event-1", workerId: "summarizer-1", completedAt: now });
  const claimedSecond = claimCompanionMemoryEvents(completedFirst.state, { workerId: "summarizer-1", claimedAt: now, limit: 1 });
  const recovered = recoverCompanionMemoryOutbox(claimedSecond.state);

  assert.equal(recovered.recovered, 1);
  assert.equal(recovered.state.entries[0].status, "completed");
  assert.equal(recovered.state.entries[1].status, "pending");
  assert.equal(recovered.state.entries[1].lastError, "startup_recovery");
});

test("completed tool results and explicit remember requests use bounded typed payloads", () => {
  const tool = enqueueCompanionMemoryEvent(createCompanionMemoryOutboxState(), {
    eventId: "tool-event-1",
    sessionId: "companion-session-1",
    kind: "tool.result",
    createdAt: now,
    payload: { toolCallId: "tool-call-1", toolName: "launch_approved_app", status: "succeeded", summary: "Opened the approved application" },
  });
  const memory = enqueueCompanionMemoryEvent(tool.state, {
    eventId: "memory-event-1",
    sessionId: "companion-session-1",
    kind: "memory.explicit_request",
    createdAt: now,
    payload: { text: "Remember that this project prefers local-first storage" },
  });

  assert.equal(memory.state.entries.length, 2);
  assert.throws(() => enqueueCompanionMemoryEvent(memory.state, {
    eventId: "tool-event-2",
    sessionId: "companion-session-1",
    kind: "tool.result",
    createdAt: now,
    payload: { toolCallId: "tool-call-2", toolName: "launch_approved_app", status: "running", summary: "Not final" },
  }), /status is invalid/);
});
