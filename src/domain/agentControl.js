export const MANUAL_AGENT_OPTIONS = Object.freeze([
  { id: "codex", name: "Codex" },
  { id: "workbody", name: "WorkBuddy" },
  { id: "hermes", name: "Hermes" },
  { id: "claude", name: "Claude Code" },
  { id: "custom", name: "其他 Agent" },
]);

export const MANUAL_AGENT_STATES = Object.freeze([
  { id: "idle", transport: "idle", label: "待命", face: "默认", description: "没有任务，显示普通大眼睛" },
  { id: "listening", transport: "listening", label: "倾听", face: "聆听", description: "正在接收语音或用户输入" },
  { id: "thinking", transport: "thinking", label: "思考", face: "思考", description: "正在分析、规划或推理" },
  { id: "working", transport: "working", label: "工作", face: "专注", description: "正在执行工具或生成结果" },
  { id: "waiting_user", transport: "waiting", label: "等你回复", face: "注意", description: "需要你确认、选择或补充信息" },
  { id: "completed", transport: "completed", label: "已完成", face: "开心", description: "任务完成；10 秒后回到待命" },
  { id: "error", transport: "error", label: "遇到问题", face: "难过", description: "任务失败或受阻；10 秒后回到待命" },
]);

const AGENT_IDS = new Set(MANUAL_AGENT_OPTIONS.map((item) => item.id));
const STATE_IDS = new Set(MANUAL_AGENT_STATES.map((item) => item.id));

export function normalizeAgentControl(value = {}) {
  const agentId = AGENT_IDS.has(value.agentId) ? value.agentId : "codex";
  const state = STATE_IDS.has(value.state) ? value.state : "idle";
  const customName = String(value.customName || "").replace(/[\u0000-\u001f]/g, "").slice(0, 48);
  const automaticStatusEnabled = value.automaticStatusEnabled !== false;
  return { agentId, customName, state, automaticStatusEnabled };
}

export function manualAgentName(control = {}) {
  const normalized = normalizeAgentControl(control);
  if (normalized.agentId === "custom") return normalized.customName.trim() || "其他 Agent";
  return MANUAL_AGENT_OPTIONS.find((item) => item.id === normalized.agentId)?.name || "Codex";
}

export function manualAgentState(value) {
  return MANUAL_AGENT_STATES.find((item) => item.id === value) || MANUAL_AGENT_STATES[0];
}
