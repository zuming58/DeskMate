export const CHOREOGRAPHY_BEAT_MS = Object.freeze([400, 600, 800, 1000]);
export const CHOREOGRAPHY_YAW = Object.freeze(["hold", "left", "center", "right"]);
export const CHOREOGRAPHY_PITCH = Object.freeze(["hold", "up", "center", "down"]);
export const CHOREOGRAPHY_EXPRESSIONS = Object.freeze(["hold", "completed", "thinking", "working"]);

export const CHOREOGRAPHY_LABELS = Object.freeze({
  yaw: Object.freeze({ hold: "保持", left: "左", center: "中", right: "右" }),
  pitch: Object.freeze({ hold: "保持", up: "上", center: "中", down: "下" }),
  expression: Object.freeze({ hold: "保持", completed: "开心", thinking: "好奇", working: "专注" }),
});

export function createEmptyBeat() { return { yaw: "hold", pitch: "hold", expression: "hold" }; }

export function createChoreographyDraft(beatCount = 6) {
  const count = Math.max(2, Math.min(8, Number(beatCount) || 6));
  return { version: 1, name: "我的舞蹈", beatMs: 600, repeat: 1, beats: Array.from({ length: count }, createEmptyBeat) };
}

export function validateChoreographyDraft(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "beatMs,beats,name,repeat,version") return { ok: false, reason: "choreography-contract-invalid" };
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (value.version !== 1 || !name || [...name].length > 20 || /[\u0000-\u001f\u007f]/.test(name)) return { ok: false, reason: "choreography-name-invalid" };
  if (!CHOREOGRAPHY_BEAT_MS.includes(value.beatMs)) return { ok: false, reason: "choreography-beat-ms-invalid" };
  if (!Number.isInteger(value.repeat) || value.repeat < 1 || value.repeat > 3) return { ok: false, reason: "choreography-repeat-invalid" };
  if (!Array.isArray(value.beats) || value.beats.length < 2 || value.beats.length > 8) return { ok: false, reason: "choreography-beats-invalid" };
  for (const beat of value.beats) {
    if (!beat || typeof beat !== "object" || Array.isArray(beat) || Object.keys(beat).sort().join(",") !== "expression,pitch,yaw" || !CHOREOGRAPHY_YAW.includes(beat.yaw) || !CHOREOGRAPHY_PITCH.includes(beat.pitch) || !CHOREOGRAPHY_EXPRESSIONS.includes(beat.expression)) return { ok: false, reason: "choreography-beat-invalid" };
  }
  if (!value.beats.some((beat) => beat.yaw !== "hold" || beat.pitch !== "hold" || beat.expression !== "hold")) return { ok: false, reason: "choreography-empty" };
  return { ok: true, value: { version: 1, name, beatMs: value.beatMs, repeat: value.repeat, beats: value.beats.map((beat) => ({ yaw: beat.yaw, pitch: beat.pitch, expression: beat.expression })) } };
}

export function choreographyPreviewFrame(previous, beat) {
  return {
    yaw: beat.yaw === "hold" ? previous.yaw : beat.yaw,
    pitch: beat.pitch === "hold" ? previous.pitch : beat.pitch,
    expression: beat.expression === "hold" ? previous.expression : beat.expression,
  };
}

export function choreographyExpressionId(value) {
  return ({ idle: "sleep", listening: "listen", thinking: "think", working: "focus", waiting: "listen", completed: "happy", error: "alert" })[value] || null;
}
