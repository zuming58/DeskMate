import { normalizeLinkDiagnostics } from "./linkDiagnostics.js";

const LINK_COPY = Object.freeze({
  connected: Object.freeze({
    badge: "小智 Link 已连接",
    summary: "小智 Link 已连接 · 以诊断计数为准",
    tone: "success",
  }),
  waiting: Object.freeze({
    badge: "小智 Link 等待连接",
    summary: "EasyInput 已连接 · 小智 Link 等待连接",
    tone: "warning",
  }),
  faulted: Object.freeze({
    badge: "小智 Link 故障",
    summary: "EasyInput 已连接 · 小智 Link 故障",
    tone: "warning",
  }),
  disabled: Object.freeze({
    badge: "小智 Link 未启用",
    summary: "EasyInput 已连接 · 小智 Link 未启用",
    tone: "neutral",
  }),
  unavailable: Object.freeze({
    badge: "小智状态不可读取",
    summary: "EasyInput 已连接 · Link 状态不可读取",
    tone: "neutral",
  }),
});

export function dashboardHardwareStatus(inputBridge = {}) {
  const link = normalizeLinkDiagnostics(inputBridge?.linkDiagnostics);
  if (!inputBridge?.boardConnected) {
    return Object.freeze({
      boardConnected: false,
      link,
      badge: "硬件状态未确认",
      summary: "EasyInput 未连接 · 小智状态不可确认",
      tone: "neutral",
    });
  }

  const copy = LINK_COPY[link.status] || LINK_COPY.unavailable;
  return Object.freeze({ boardConnected: true, link, ...copy });
}

export function formatDashboardDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "日期不可用";
  const weekday = "日一二三四五六"[date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日 · 周${weekday}`;
}
