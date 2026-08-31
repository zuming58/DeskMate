export const LINK_STATES = ["disabled", "waiting", "connected", "faulted"];
export const AGENT_DELIVERY_STATES = ["never", "sending", "acknowledged", "failed"];
export const AGENT_TRANSPORT_STATES = ["idle", "listening", "thinking", "working", "waiting", "completed", "error"];

const COUNTER_FIELDS = ["rxFrames", "txFrames", "requestTimeouts", "retries", "peerRestarts", "agentAccepted", "agentForwarded", "agentDroppedDisconnected", "agentQueueDrops"];

function safeCounter(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff ? value : 0;
}

export function normalizeLinkDiagnostics(value) {
  if (!value || typeof value !== "object" || !LINK_STATES.includes(value.state)) {
    return Object.freeze({ status: "unavailable", available: false, counters: Object.freeze(Object.fromEntries(COUNTER_FIELDS.map((key) => [key, 0]))) });
  }
  return Object.freeze({
    status: value.state,
    available: true,
    counters: Object.freeze(Object.fromEntries(COUNTER_FIELDS.map((key) => [key, safeCounter(value[key])]))),
  });
}

export function normalizeAgentDelivery(value) {
  const status = AGENT_DELIVERY_STATES.includes(value?.status) ? value.status : "never";
  const targetState = AGENT_TRANSPORT_STATES.includes(value?.targetState) ? value.targetState : "idle";
  const at = typeof value?.at === "string" && !Number.isNaN(Date.parse(value.at)) ? value.at : "";
  const reason = typeof value?.reason === "string" && /^[a-z0-9-]{0,80}$/.test(value.reason) ? value.reason : "";
  return Object.freeze({ status, targetState, at, reason, ack: status === "acknowledged" ? "success" : status === "failed" ? "failed" : status === "sending" ? "pending" : "unavailable" });
}
