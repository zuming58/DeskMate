const LABELS = Object.freeze({
  idle: "Codex 当前待命",
  thinking: "Codex 正在理解新任务",
  working: "Codex 正在执行本轮工作",
  waiting: "Codex 正在等待你的确认或补充",
  completed: "Codex 本轮工作已完成",
  error: "Codex 报告本轮遇到问题",
});

function summarizeCodexWork(value = {}) {
  const state = Object.hasOwn(LABELS, value.state) ? value.state : "idle";
  return Object.freeze({
    state,
    summary: LABELS[state],
    needsAttention: state === "waiting" || state === "error",
    progressKnown: false,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  });
}

module.exports = { summarizeCodexWork };
