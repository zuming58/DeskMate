import { manualAgentName, manualAgentState, normalizeAgentControl } from "./agentControl.js";
import { normalizeAgentDelivery, normalizeLinkDiagnostics } from "./linkDiagnostics.js";

export const LINK_STATUS_LABELS = Object.freeze({
  connected: "已连接",
  waiting: "等待连接",
  faulted: "故障",
  disabled: "未启用",
  unavailable: "不可读取",
});

export function previewSoftwareExpression({ patch, notify, preset, sessionActive = false }) {
  if (sessionActive) {
    notify?.("实时陪伴会话拥有软件表情优先权，请结束会话后再预览");
    return Object.freeze({ ok: false, reason: "companion-session-active" });
  }
  if (!preset?.id) return Object.freeze({ ok: false, reason: "invalid-expression" });
  patch?.({ currentExpression: preset.id });
  notify?.(`软件预览：已切换为“${preset.name || preset.id}”；未发送到小智`);
  return Object.freeze({ ok: true, expressionId: preset.id, hardwareSent: false });
}

export function manualAgentStateFailureMessage(reason) {
  const known = ({
    "voice-workflow-active": "语音流程正在使用表情，结束后再发送",
    "easyinput-not-connected": "EasyInput 尚未连接",
    "deskmatelink-unavailable": "尚未读取到小智 Link 状态",
    "deskmatelink-waiting": "EasyInput 正在等待小智 Link",
    "deskmatelink-faulted": "小智 Link 当前故障",
    "deskmatelink-disabled": "小智 Link 尚未启用",
    "desktop-bridge-unavailable": "DeskMate 桌面桥不可用",
    "custom-agent-name-required": "请先填写自定义 Agent 名称",
  })[reason];
  if (known) return known;
  return typeof reason === "string" && /^[a-z0-9-]{1,80}$/.test(reason) ? reason : "状态发送失败";
}

export async function requestManualAgentState({ desktop, control, requestedState }) {
  const normalized = normalizeAgentControl(control);
  const selected = manualAgentState(requestedState);
  if (normalized.agentId === "custom" && !normalized.customName.trim()) {
    return Object.freeze({ ok: false, reason: "custom-agent-name-required", requestedState: selected.id, transportState: selected.transport });
  }
  if (!desktop?.setManualAgentState) {
    return Object.freeze({ ok: false, reason: "desktop-bridge-unavailable", requestedState: selected.id, transportState: selected.transport });
  }
  const result = await desktop.setManualAgentState({ agentId: normalized.agentId, state: selected.transport });
  return Object.freeze({
    ...result,
    requestedState: selected.id,
    transportState: selected.transport,
    label: selected.label,
    agentName: manualAgentName(normalized),
  });
}

export function agentStateEvidence(inputBridge = {}) {
  const link = normalizeLinkDiagnostics(inputBridge.linkDiagnostics);
  const delivery = normalizeAgentDelivery(inputBridge.agentStateDelivery);
  const easyInputLabel = delivery.status === "acknowledged"
    ? "ACK 成功"
    : delivery.status === "failed"
      ? `失败 · ${delivery.reason || "unknown"}`
      : delivery.status === "sending"
        ? "请求中"
        : "尚未发送";
  return Object.freeze({
    link,
    delivery,
    linkLabel: LINK_STATUS_LABELS[link.status],
    easyInputLabel,
    xiaozhiDisplayConfirmed: false,
  });
}
