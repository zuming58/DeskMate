const MODES = Object.freeze(["dictation", "companion"]);

function initialForegroundSession() {
  return { generation: 0, active: null };
}

function requireMode(mode) {
  if (!MODES.includes(mode)) throw new Error("foreground-session-mode-invalid");
}

function requireSessionId(sessionId) {
  if (typeof sessionId !== "string" || !sessionId.trim() || sessionId.length > 128) {
    throw new Error("foreground-session-id-invalid");
  }
  return sessionId.trim();
}

function fact(type, session, reason = "") {
  return Object.freeze({
    type,
    mode: session?.mode || null,
    sessionId: session?.sessionId || null,
    generation: session?.generation ?? null,
    ...(reason ? { reason } : {}),
  });
}

function startForegroundSession(state = initialForegroundSession(), { mode, sessionId } = {}) {
  requireMode(mode);
  const normalizedId = requireSessionId(sessionId);
  const active = state.active || null;
  if (active?.sessionId === normalizedId && active.mode === mode) {
    return { state, facts: [fact("ignored_stale", active, "duplicate_start")] };
  }
  if (active?.sessionId === normalizedId) throw new Error("foreground-session-mode-conflict");
  const generation = Math.max(0, Number(state.generation) || 0) + 1;
  const next = Object.freeze({ mode, sessionId: normalizedId, generation });
  const facts = active
    ? [fact("stopping", active, "replaced"), fact("released", active, "replaced"), fact("acquired", next)]
    : [fact("acquired", next)];
  return { state: { generation, active: next }, facts };
}

function finishForegroundSession(state = initialForegroundSession(), { sessionId, generation } = {}) {
  const normalizedId = requireSessionId(sessionId);
  const active = state.active || null;
  if (!active || active.sessionId !== normalizedId || active.generation !== generation) {
    return { state, facts: [fact("ignored_stale", { sessionId: normalizedId, generation }, "finish_not_active")] };
  }
  return { state: { ...state, active: null }, facts: [fact("finished", active), fact("released", active, "finished")] };
}

function emergencyStopForegroundSession(state = initialForegroundSession()) {
  const active = state.active || null;
  if (!active) return { state, facts: [fact("ignored_stale", null, "emergency_stop_idle")] };
  return { state: { ...state, active: null }, facts: [fact("emergency_stopped", active), fact("released", active, "emergency_stop")] };
}

function acceptsForegroundSessionEvent(state = initialForegroundSession(), { sessionId, generation } = {}) {
  const active = state.active || null;
  return Boolean(active && active.sessionId === sessionId && active.generation === generation);
}

module.exports = {
  FOREGROUND_SESSION_MODES: MODES,
  acceptsForegroundSessionEvent,
  emergencyStopForegroundSession,
  finishForegroundSession,
  initialForegroundSession,
  startForegroundSession,
};
