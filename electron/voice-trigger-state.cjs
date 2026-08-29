const ACTIVE_VOICE_STATES = new Set(["recording", "transcribing", "organizing", "outputting"]);

function isVoiceActivityActive({ recording = false, state = "idle" } = {}) {
  return Boolean(recording) || ACTIVE_VOICE_STATES.has(String(state || "idle"));
}

module.exports = { ACTIVE_VOICE_STATES, isVoiceActivityActive };
