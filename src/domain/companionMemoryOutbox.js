export const COMPANION_MEMORY_EVENT_KINDS = Object.freeze([
  "conversation.turn_final",
  "tool.result",
  "memory.explicit_request",
]);

export const COMPANION_MEMORY_OUTBOX_STATUSES = Object.freeze(["pending", "processing", "completed"]);
export const COMPANION_MEMORY_TEXT_LIMIT = 16_384;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function createCompanionMemoryOutboxState() {
  return { schemaVersion: 1, nextSequence: 1, entries: [] };
}

function requireExactKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`${label} contains unsupported field: ${unknown[0]}`);
}

function requireId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function requireText(value, label, { allowEmpty = false, max = COMPANION_MEMORY_TEXT_LIMIT } = {}) {
  if (typeof value !== "string") throw new Error(`${label} must be text`);
  const text = value.trim();
  if (!allowEmpty && !text) throw new Error(`${label} is required`);
  if (text.length > max) throw new Error(`${label} exceeds ${max} characters`);
  return text;
}

function requireTimestamp(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be an ISO timestamp`);
  return date.toISOString();
}

function normalizePayload(kind, payload) {
  if (kind === "conversation.turn_final") {
    requireExactKeys(payload, ["role", "text"], "turn payload");
    if (payload.role !== "user" && payload.role !== "assistant") throw new Error("turn role is invalid");
    return { role: payload.role, text: requireText(payload.text, "turn text") };
  }
  if (kind === "tool.result") {
    requireExactKeys(payload, ["toolCallId", "toolName", "status", "summary"], "tool payload");
    if (payload.status !== "succeeded" && payload.status !== "failed") throw new Error("tool status is invalid");
    return {
      toolCallId: requireId(payload.toolCallId, "tool call ID"),
      toolName: requireId(payload.toolName, "tool name"),
      status: payload.status,
      summary: requireText(payload.summary, "tool summary"),
    };
  }
  if (kind === "memory.explicit_request") {
    requireExactKeys(payload, ["text"], "memory request payload");
    return { text: requireText(payload.text, "memory request text") };
  }
  throw new Error("memory event kind is not allowed");
}

function canonicalStringify(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeSourceEvent(sourceEvent) {
  requireExactKeys(sourceEvent, ["eventId", "sessionId", "kind", "createdAt", "payload"], "memory event");
  if (!COMPANION_MEMORY_EVENT_KINDS.includes(sourceEvent.kind)) throw new Error("memory event kind is not allowed");
  return {
    eventId: requireId(sourceEvent.eventId, "event ID"),
    sessionId: requireId(sourceEvent.sessionId, "session ID"),
    kind: sourceEvent.kind,
    createdAt: requireTimestamp(sourceEvent.createdAt, "createdAt"),
    payload: normalizePayload(sourceEvent.kind, sourceEvent.payload),
  };
}

function requireWorker(workerId) {
  return requireId(workerId, "worker ID");
}

function findEntry(state, eventId) {
  return state.entries.find((entry) => entry.eventId === eventId) || null;
}

export function enqueueCompanionMemoryEvent(state, sourceEvent) {
  const normalized = normalizeSourceEvent(sourceEvent);
  const fingerprint = canonicalStringify(normalized);
  const existing = findEntry(state, normalized.eventId);
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new Error("memory event ID collision");
    return { state, entry: existing, inserted: false };
  }

  const sequence = Number.isInteger(state.nextSequence) && state.nextSequence > 0 ? state.nextSequence : 1;
  const entry = {
    ...normalized,
    sequence,
    fingerprint,
    status: "pending",
    attempts: 0,
    workerId: null,
    claimedAt: null,
    completedAt: null,
    lastError: null,
  };
  return {
    state: { ...state, nextSequence: sequence + 1, entries: [...state.entries, entry] },
    entry,
    inserted: true,
  };
}

export function claimCompanionMemoryEvents(state, { workerId, claimedAt, limit = 1 }) {
  const worker = requireWorker(workerId);
  const timestamp = requireTimestamp(claimedAt, "claimedAt");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("claim limit must be between 1 and 100");

  const selectedIds = new Set(
    state.entries
      .filter((entry) => entry.status === "pending")
      .sort((left, right) => left.sequence - right.sequence)
      .slice(0, limit)
      .map((entry) => entry.eventId),
  );
  const entries = state.entries.map((entry) => selectedIds.has(entry.eventId)
    ? { ...entry, status: "processing", workerId: worker, claimedAt: timestamp, attempts: entry.attempts + 1, lastError: null }
    : entry);
  return { state: { ...state, entries }, entries: entries.filter((entry) => selectedIds.has(entry.eventId)) };
}

export function completeCompanionMemoryEvent(state, { eventId, workerId, completedAt }) {
  const id = requireId(eventId, "event ID");
  const worker = requireWorker(workerId);
  const timestamp = requireTimestamp(completedAt, "completedAt");
  const current = findEntry(state, id);
  if (!current) throw new Error("memory event does not exist");
  if (current.status !== "processing" || current.workerId !== worker) throw new Error("memory event is not owned by this worker");

  const completed = { ...current, status: "completed", workerId: null, claimedAt: null, completedAt: timestamp };
  return { state: { ...state, entries: state.entries.map((entry) => entry.eventId === id ? completed : entry) }, entry: completed };
}

export function releaseCompanionMemoryEvent(state, { eventId, workerId, error = "processing_released" }) {
  const id = requireId(eventId, "event ID");
  const worker = requireWorker(workerId);
  const current = findEntry(state, id);
  if (!current) throw new Error("memory event does not exist");
  if (current.status !== "processing" || current.workerId !== worker) throw new Error("memory event is not owned by this worker");

  const released = {
    ...current,
    status: "pending",
    workerId: null,
    claimedAt: null,
    lastError: requireText(error, "release error", { max: 1_024 }),
  };
  return { state: { ...state, entries: state.entries.map((entry) => entry.eventId === id ? released : entry) }, entry: released };
}

export function recoverCompanionMemoryOutbox(state) {
  let recovered = 0;
  const entries = state.entries.map((entry) => {
    if (entry.status !== "processing") return entry;
    recovered += 1;
    return { ...entry, status: "pending", workerId: null, claimedAt: null, lastError: "startup_recovery" };
  });
  return { state: recovered ? { ...state, entries } : state, recovered };
}
