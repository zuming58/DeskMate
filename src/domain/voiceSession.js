export const VOICE_SESSION_STATES = ["idle", "recording", "transcribing", "organizing", "outputting", "completed", "error"];

const ALLOWED_TRANSITIONS = {
  idle: new Set(["recording", "error"]),
  recording: new Set(["idle", "transcribing", "error"]),
  transcribing: new Set(["idle", "organizing", "outputting", "completed", "error"]),
  organizing: new Set(["idle", "outputting", "completed", "error"]),
  outputting: new Set(["idle", "completed", "error"]),
  completed: new Set(["idle", "recording", "error"]),
  error: new Set(["idle", "recording", "transcribing", "organizing"]),
};

export const initialVoiceSession = Object.freeze({ state: "idle", message: "准备就绪", error: "", source: "", updatedAt: null });

export function transitionVoiceSession(session, next, detail = {}) {
  const current = VOICE_SESSION_STATES.includes(session?.state) ? session.state : "idle";
  if (!VOICE_SESSION_STATES.includes(next)) throw new Error("未知语音会话状态");
  if (current !== next && !ALLOWED_TRANSITIONS[current].has(next)) throw new Error(`语音状态不能从 ${current} 进入 ${next}`);
  return {
    ...session,
    ...detail,
    state: next,
    error: next === "error" ? String(detail.error || detail.message || "语音输入失败") : "",
    updatedAt: detail.updatedAt || new Date().toISOString(),
  };
}

export function voiceSessionReducer(session, action) {
  if (action.type === "reset") return { ...initialVoiceSession, updatedAt: new Date().toISOString() };
  if (action.type === "transition") return transitionVoiceSession(session, action.state, action.detail);
  return session;
}
