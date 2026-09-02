const AUTOMATIC_AGENT_PROVIDERS = new Set(["codex", "hermes"]);
const PROVIDER_LABELS = Object.freeze({ codex: "Codex", hermes: "Hermes" });
const STATE_LABELS = Object.freeze({
  idle: "当前待命",
  listening: "正在倾听",
  thinking: "正在理解新任务",
  working: "正在执行本轮工作",
  waiting: "正在等待你的确认或补充",
  completed: "本轮工作已完成",
  error: "报告本轮遇到问题",
});

function sourceVersionForProvider(provider) {
  if (provider === "codex") return "codex-hook-v1";
  if (provider === "hermes") return "hermes-plugin-hooks-v1";
  return "manual-only";
}

function summarizeProviderWork(provider, value = {}) {
  const state = Object.hasOwn(STATE_LABELS, value.state) ? value.state : "idle";
  const name = PROVIDER_LABELS[provider] || "当前 Agent";
  return Object.freeze({
    state,
    summary: `${name} ${STATE_LABELS[state]}`,
    needsAttention: state === "waiting" || state === "error",
    progressKnown: false,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  });
}

function sanitizedProviderStatus(provider, value = {}, selectedProvider = "disabled") {
  const normalizedProvider = typeof provider === "string" && /^[a-z0-9-]{1,32}$/.test(provider) ? provider : "disabled";
  if (!AUTOMATIC_AGENT_PROVIDERS.has(normalizedProvider)) {
    return Object.freeze({
      provider: normalizedProvider,
      sourceVersion: "manual-only",
      selected: selectedProvider === normalizedProvider,
      receiver: "manual-only",
      connected: false,
      state: "idle",
      event: "",
      toolName: "",
      outcome: "",
      updatedAt: "",
      delivery: "manual-only",
      work: summarizeProviderWork(normalizedProvider),
    });
  }
  const state = Object.hasOwn(STATE_LABELS, value.state) ? value.state : "idle";
  return Object.freeze({
    provider: normalizedProvider,
    sourceVersion: sourceVersionForProvider(normalizedProvider),
    selected: selectedProvider === normalizedProvider,
    receiver: ["starting", "listening", "unavailable"].includes(value.receiver) ? value.receiver : "unavailable",
    connected: value.connected === true,
    state,
    event: typeof value.event === "string" && /^[A-Za-z0-9_]{0,64}$/.test(value.event) ? value.event : "",
    toolName: typeof value.toolName === "string" && /^[A-Za-z0-9_.:-]{0,128}$/.test(value.toolName) ? value.toolName : "",
    outcome: ["", "completed", "failed", "interrupted"].includes(value.outcome) ? value.outcome : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    delivery: typeof value.delivery === "string" && /^[a-z0-9-]{1,80}$/.test(value.delivery) ? value.delivery : "not-received",
    work: summarizeProviderWork(normalizedProvider, { ...value, state }),
  });
}

module.exports = {
  AUTOMATIC_AGENT_PROVIDERS,
  sanitizedProviderStatus,
  sourceVersionForProvider,
  summarizeProviderWork,
};
