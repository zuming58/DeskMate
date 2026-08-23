const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlayBridge", {
  onState: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("voice-state", handler);
    return () => ipcRenderer.removeListener("voice-state", handler);
  },
});

window.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("root");
  const labels = {
    transcribing: "正在转写…",
    organizing: "正在整理…",
    outputting: "正在输入…",
    completed: "语音输入完成",
    error: "语音输入失败",
    cancelled: "已取消",
  };
  const escapeHtml = (value) => String(value || "").replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[character]));
  const latestText = (value, limit = 24) => {
    const text = String(value || "").trim();
    if (text.length <= limit) return text;
    return `…${text.slice(-(limit - 1))}`;
  };
  const render = (value = {}) => {
    const state = value.state || "idle";
    const seconds = Math.max(0, Number(value.seconds) || 0);
    const level = Math.max(0, Math.min(100, Number(value.level) || 0));
    const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
    const transcript = latestText(value.transcript);
    const copy = transcript || (state === "recording"
      ? (level > 2 ? "已听到声音，正在识别…" : "请开始说话…")
      : value.message || labels[state] || "DeskMate");
    const bars = Array.from({ length: 13 }, (_, index) => {
      const variation = 0.38 + ((index * 7) % 9) / 14;
      const height = state === "recording" ? Math.max(3, Math.min(18, 3 + level * variation * 0.18)) : 3 + ((index * 5) % 7);
      return `<i style="--h:${height.toFixed(1)}px"></i>`;
    }).join("");
    root.innerHTML = `<div class="shell ${escapeHtml(state)}"><span class="state-dot"></span><div class="wave" aria-label="当前麦克风音量">${bars}</div><div class="copy ${transcript ? "" : "placeholder"}">${escapeHtml(copy)}</div><div class="meter">${state === "recording" ? time : `${Math.round(level)}%`}</div><span class="escape">Esc 取消</span></div>`;
  };
  ipcRenderer.on("voice-state", (_event, value) => render(value));
});
