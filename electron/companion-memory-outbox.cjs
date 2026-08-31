const { createHash } = require("crypto");

const EVENT_KINDS = Object.freeze(["conversation.turn_final", "tool.result", "memory.explicit_request"]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TEXT_LIMIT = 16384;

function createOutboxState() {
  return { schemaVersion: 1, nextSequence: 1, entries: [] };
}

function boundedId(value, label) {
  const text = String(value || "");
  if (!ID_PATTERN.test(text)) throw new Error(`${label}-invalid`);
  return text;
}

function boundedText(value, label, max = TEXT_LIMIT) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label}-invalid`);
  return text;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function normalizeEvent(value = {}) {
  const unknown = Object.keys(value).filter((key) => !["eventId", "sessionId", "kind", "createdAt", "payload"].includes(key));
  if (unknown.length || !EVENT_KINDS.includes(value.kind)) throw new Error("memory-event-invalid");
  const createdAt = new Date(value.createdAt);
  if (Number.isNaN(createdAt.getTime())) throw new Error("memory-created-at-invalid");
  let payload;
  if (value.kind === "conversation.turn_final") {
    if (!value.payload || !["user", "assistant"].includes(value.payload.role) || Object.keys(value.payload).some((key) => !["role", "text"].includes(key))) throw new Error("memory-turn-invalid");
    payload = { role: value.payload.role, text: boundedText(value.payload.text, "memory-turn-text") };
  } else if (value.kind === "memory.explicit_request") {
    if (!value.payload || Object.keys(value.payload).some((key) => key !== "text")) throw new Error("memory-request-invalid");
    payload = { text: boundedText(value.payload.text, "memory-request-text") };
  } else {
    if (!value.payload || !["succeeded", "failed"].includes(value.payload.status) || Object.keys(value.payload).some((key) => !["toolCallId", "toolName", "status", "summary"].includes(key))) throw new Error("memory-tool-result-invalid");
    payload = {
      toolCallId: boundedId(value.payload.toolCallId, "tool-call-id"),
      toolName: boundedId(value.payload.toolName, "tool-name"),
      status: value.payload.status,
      summary: boundedText(value.payload.summary, "tool-summary", 1024),
    };
  }
  return Object.freeze({ eventId: boundedId(value.eventId, "memory-event-id"), sessionId: boundedId(value.sessionId, "memory-session-id"), kind: value.kind, createdAt: createdAt.toISOString(), payload });
}

function fingerprintEvent(value) {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function enqueueOutboxEvent(state, source) {
  const event = normalizeEvent(source);
  const fingerprint = fingerprintEvent(event);
  const existing = state.entries.find((entry) => entry.eventId === event.eventId);
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new Error("memory-event-id-collision");
    return { state, entry: existing, inserted: false };
  }
  const sequence = Math.max(1, Number(state.nextSequence) || 1);
  const entry = Object.freeze({ ...event, sequence, fingerprint, status: "pending", attempts: 0, workerId: null, claimedAt: null, completedAt: null, lastError: null });
  return { state: { ...state, nextSequence: sequence + 1, entries: [...state.entries, entry] }, entry, inserted: true };
}

function claimOutboxEvents(state, { workerId, claimedAt, limit = 1 } = {}) {
  const worker = boundedId(workerId, "memory-worker-id");
  const at = new Date(claimedAt);
  if (Number.isNaN(at.getTime()) || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("memory-claim-invalid");
  const selected = new Set(state.entries.filter((entry) => entry.status === "pending").sort((a, b) => a.sequence - b.sequence).slice(0, limit).map((entry) => entry.eventId));
  const entries = state.entries.map((entry) => selected.has(entry.eventId) ? { ...entry, status: "processing", attempts: entry.attempts + 1, workerId: worker, claimedAt: at.toISOString(), lastError: null } : entry);
  return { state: { ...state, entries }, entries: entries.filter((entry) => selected.has(entry.eventId)) };
}

function completeOutboxEvent(state, { eventId, workerId, completedAt } = {}) {
  const id = boundedId(eventId, "memory-event-id");
  const worker = boundedId(workerId, "memory-worker-id");
  const at = new Date(completedAt);
  if (Number.isNaN(at.getTime())) throw new Error("memory-completed-at-invalid");
  const current = state.entries.find((entry) => entry.eventId === id);
  if (!current || current.status !== "processing" || current.workerId !== worker) throw new Error("memory-event-not-owned");
  const completed = { ...current, status: "completed", workerId: null, claimedAt: null, completedAt: at.toISOString() };
  return { state: { ...state, entries: state.entries.map((entry) => entry.eventId === id ? completed : entry) }, entry: completed };
}

function recoverOutbox(state) {
  let recovered = 0;
  const entries = state.entries.map((entry) => {
    if (entry.status !== "processing") return entry;
    recovered += 1;
    return { ...entry, status: "pending", workerId: null, claimedAt: null, lastError: "startup_recovery" };
  });
  return { state: recovered ? { ...state, entries } : state, recovered };
}

module.exports = {
  COMPANION_MEMORY_EVENT_KINDS: EVENT_KINDS,
  COMPANION_MEMORY_TEXT_LIMIT: TEXT_LIMIT,
  claimOutboxEvents,
  completeOutboxEvent,
  createOutboxState,
  enqueueOutboxEvent,
  fingerprintEvent,
  normalizeEvent,
  recoverOutbox,
};
