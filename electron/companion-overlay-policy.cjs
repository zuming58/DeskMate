const OVERLAY_CONTENT_EVENTS = new Set([
  "transcript.partial",
  "turn.user-final",
  "reply.partial",
  "turn.assistant-final",
  "trusted-speech.timeout",
]);

function shouldUpdateCompanionOverlay(event = {}) {
  if (event.type === "state") return true;
  return OVERLAY_CONTENT_EVENTS.has(String(event.type || ""));
}

module.exports = { OVERLAY_CONTENT_EVENTS, shouldUpdateCompanionOverlay };
