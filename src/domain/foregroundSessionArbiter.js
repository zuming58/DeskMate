export const FOREGROUND_SESSION_MODES = Object.freeze(["dictation", "companion"]);

export const initialForegroundSessionState = Object.freeze({
  generation: 0,
  active: null,
});

function requireMode(mode) {
  if (!FOREGROUND_SESSION_MODES.includes(mode)) throw new Error("Unknown foreground session mode");
}

function requireSessionId(sessionId) {
  if (typeof sessionId !== "string" || !sessionId.trim()) throw new Error("Foreground session ID is required");
}

function event(type, session, reason) {
  return {
    type,
    mode: session?.mode || null,
    sessionId: session?.sessionId || null,
    generation: session?.generation ?? null,
    ...(reason ? { reason } : {}),
  };
}

function ignored(sessionId, generation, reason) {
  return event("ignored_stale", { sessionId, generation }, reason);
}

export function startForegroundSession(state = initialForegroundSessionState, { mode, sessionId }) {
  requireMode(mode);
  requireSessionId(sessionId);

  const active = state.active || null;
  if (active?.sessionId === sessionId && active.mode === mode) {
    return { state, events: [event("ignored_stale", active, "duplicate_start")] };
  }
  if (active?.sessionId === sessionId) throw new Error("Foreground session ID cannot change mode while active");

  const generation = Number.isInteger(state.generation) && state.generation >= 0 ? state.generation + 1 : 1;
  const next = { mode, sessionId: sessionId.trim(), generation };
  const events = active
    ? [event("stopping", active, "replaced"), event("released", active, "replaced"), event("acquired", next)]
    : [event("acquired", next)];
  return { state: { generation, active: next }, events };
}

export function finishForegroundSession(state = initialForegroundSessionState, { sessionId, generation }) {
  requireSessionId(sessionId);
  const active = state.active || null;
  if (!active || active.sessionId !== sessionId || active.generation !== generation) {
    return { state, events: [ignored(sessionId, generation, "finish_not_active")] };
  }
  return {
    state: { ...state, active: null },
    events: [event("finished", active), event("released", active, "finished")],
  };
}

export function stopForegroundSession(state = initialForegroundSessionState, { sessionId, generation }) {
  requireSessionId(sessionId);
  return { state, events: [ignored(sessionId, generation, "stop_not_owner")] };
}

export function emergencyStopForegroundSession(state = initialForegroundSessionState) {
  const active = state.active || null;
  if (!active) return { state, events: [event("ignored_stale", null, "emergency_stop_idle")] };
  return {
    state: { ...state, active: null },
    events: [event("emergency_stopped", active), event("released", active, "emergency_stop")],
  };
}

export function acceptsForegroundSessionEvent(state = initialForegroundSessionState, { sessionId, generation }) {
  const active = state.active || null;
  return Boolean(active && active.sessionId === sessionId && active.generation === generation);
}
