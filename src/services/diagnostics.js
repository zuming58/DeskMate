const SECRET_KEYS = /token|api.?key|password|wifi|path|text|transcript|recording|audio|serial|window.?title|ip|address/i;
const AUDIO_STATES = new Set(["not-configured", "binding", "waiting-heartbeat", "ready", "starting", "streaming", "ambiguous", "faulted", "unavailable", "desktop-bridge-unavailable"]);
export function createDiagnosticReport(input = {}) {
  const sanitize = (value) => { if (Array.isArray(value)) return value.map(sanitize); if (!value || typeof value !== "object") return value; return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEYS.test(key)).map(([key, item]) => [key, sanitize(item)])); };
  const source = input.lanAudio || {};
  const counters = source.counters || {};
  const lanAudio = {
    status: AUDIO_STATES.has(source.status) ? source.status : "not-configured",
    configured: Boolean(source.configured),
    networkReady: Boolean(source.networkReady),
    heartbeat: Boolean(source.heartbeat),
    micTest: Boolean(source.micTest),
    counters: Object.fromEntries(["heartbeats", "audioFrames", "droppedFrames", "sequenceGaps", "malformedPackets", "sourceRejects", "controlRetries", "controlTimeouts"].map((key) => [key, Number.isInteger(counters[key]) ? counters[key] : 0])),
  };
  return { ...sanitize(input), schemaVersion: 1, generatedAt: new Date().toISOString(), lanAudio };
}
