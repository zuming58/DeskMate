const net = require("net");
const os = require("os");
const path = require("path");

const CODEX_TASK_BRIEF_VERSION = "codex-task-brief-v1";
const CODEX_TASK_BRIEF_PIPE_NAME = "deskmate-codex-task-brief-v1";
const MAX_MESSAGE_BYTES = 768;
const MAX_RECENT_TASKS = 8;
const PROGRESS_THROTTLE_MS = 15_000;
const STATES = new Set(["thinking", "working", "waiting", "completed", "error"]);
const IMMEDIATE_STATES = new Set(["waiting", "completed", "error"]);
const OPAQUE_KEY = /^[A-Za-z0-9_-]{8,64}$/;

function resolveCodexTaskBriefPipePath(platform = process.platform) {
  if (platform === "win32") return `\\\\.\\pipe\\${CODEX_TASK_BRIEF_PIPE_NAME}`;
  return path.join(os.tmpdir(), `${CODEX_TASK_BRIEF_PIPE_NAME}-${process.getuid?.() ?? "user"}.sock`);
}

function boundedVisibleText(value, max, { optional = false } = {}) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) return "";
  const text = value.trim();
  if (!text) return optional ? "" : "";
  if ([...text].length > max) return "";
  if (/(?:https?:\/\/|www\.)/i.test(text) || /(?:^|\s)[A-Za-z]:[\\/]/.test(text) || /\\\\[^\\\s]+\\/.test(text)) return "";
  if (/^(?:>|\$|cmd(?:\.exe)?\b|powershell\b|pwsh\b|bash\b|sh\b|curl\b|wget\b|git\b)/i.test(text)) return "";
  if (/(?:api[_ -]?key|access[_ -]?key|secret|password|passwd|token)\s*[:=]/i.test(text) || /\bsk-[A-Za-z0-9_-]{8,}\b/.test(text)) return "";
  return text;
}

function normalizeCodexTaskBrief(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort().join(",");
  if (!["provider,sequence,state,taskKey,taskLabel,version", "milestone,provider,sequence,state,taskKey,taskLabel,version"].includes(keys)) return null;
  if (value.version !== CODEX_TASK_BRIEF_VERSION || value.provider !== "codex") return null;
  const taskKey = typeof value.taskKey === "string" && OPAQUE_KEY.test(value.taskKey) ? value.taskKey : "";
  const taskLabel = boundedVisibleText(value.taskLabel, 60);
  const milestone = value.milestone === undefined || value.milestone === "" ? "" : boundedVisibleText(value.milestone, 80, { optional: true });
  const sequence = Number(value.sequence);
  if (!taskKey || !taskLabel || !STATES.has(value.state) || !Number.isInteger(sequence) || sequence < 1 || sequence > 0xffffffff || (value.milestone !== undefined && value.milestone !== "" && !milestone)) return null;
  return Object.freeze({ version: CODEX_TASK_BRIEF_VERSION, provider: "codex", taskKey, taskLabel, state: value.state, milestone, sequence });
}

function encodeCodexTaskBrief(value) {
  const normalized = normalizeCodexTaskBrief(value);
  return normalized ? `${JSON.stringify(normalized)}\n` : null;
}

function decodeCodexTaskBrief(line) {
  if (typeof line !== "string" || Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) return null;
  let value;
  try { value = JSON.parse(line); } catch { return null; }
  return normalizeCodexTaskBrief(value);
}

function sendCodexTaskBrief(value, { pipePath = resolveCodexTaskBriefPipePath(), timeoutMs = 150 } = {}) {
  const message = encodeCodexTaskBrief(value);
  if (!message) return Promise.resolve({ ok: false, reason: "codex-task-brief-invalid" });
  return new Promise((resolve) => {
    const socket = net.createConnection(pipePath);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, reason: "codex-task-brief-receiver-timeout" }), Math.max(10, Math.min(1_000, Number(timeoutMs) || 150)));
    socket.once("connect", () => socket.end(message));
    socket.once("error", () => finish({ ok: false, reason: "codex-task-brief-receiver-unavailable" }));
    socket.once("close", (hadError) => finish(hadError ? { ok: false, reason: "codex-task-brief-send-failed" } : { ok: true }));
  });
}

function deterministicTaskAnswer(task) {
  const suffix = task.milestone ? `：${task.milestone}` : "";
  const copy = {
    thinking: `${task.taskLabel} 正在理解任务${suffix}`,
    working: `${task.taskLabel} 正在执行${suffix}`,
    waiting: `${task.taskLabel} 正在等你回复${suffix}`,
    completed: `${task.taskLabel} 已完成${suffix}`,
    error: `${task.taskLabel} 遇到问题${suffix}`,
  };
  return copy[task.state];
}

class CodexTaskBriefStore {
  constructor({ now = () => Date.now(), maxTasks = MAX_RECENT_TASKS, throttleMs = PROGRESS_THROTTLE_MS } = {}) {
    this.now = now;
    this.maxTasks = Math.max(1, Math.min(MAX_RECENT_TASKS, Number(maxTasks) || MAX_RECENT_TASKS));
    this.throttleMs = Math.max(1_000, Number(throttleMs) || PROGRESS_THROTTLE_MS);
    this.tasks = new Map();
  }

  ingest(value) {
    const report = normalizeCodexTaskBrief(value);
    if (!report) return { ok: false, reason: "codex-task-brief-invalid" };
    const previous = this.tasks.get(report.taskKey);
    if (previous && report.sequence <= previous.sequence) return { ok: false, reason: "codex-task-brief-stale" };
    const receivedAt = this.now();
    const firstReport = !previous;
    const thinkingAnnouncement = report.state === "thinking" && previous?.thinkingAnnounced !== true;
    const workingAnnouncement = report.state === "working" && (firstReport || receivedAt - (previous?.lastAnnouncementAt || 0) >= this.throttleMs);
    const shouldAnnounce = firstReport || thinkingAnnouncement || workingAnnouncement || IMMEDIATE_STATES.has(report.state);
    const task = Object.freeze({ ...report, receivedAt, lastAnnouncementAt: shouldAnnounce ? receivedAt : previous?.lastAnnouncementAt || 0, thinkingAnnounced: report.state === "thinking" || previous?.thinkingAnnounced === true });
    this.tasks.delete(report.taskKey);
    this.tasks.set(report.taskKey, task);
    while (this.tasks.size > this.maxTasks) this.tasks.delete(this.tasks.keys().next().value);
    return {
      ok: true,
      task: this.sanitize(task),
      announcement: shouldAnnounce ? Object.freeze({ text: deterministicTaskAnswer(task), state: task.state, taskLabel: task.taskLabel }) : null,
    };
  }

  sanitize(task) {
    return Object.freeze({ taskLabel: task.taskLabel, state: task.state, milestone: task.milestone, sequence: task.sequence, receivedAt: task.receivedAt });
  }

  list() {
    return [...this.tasks.values()].reverse().map((task) => this.sanitize(task));
  }

  query(utterance = "") {
    const tasks = [...this.tasks.values()].reverse();
    if (!tasks.length) return { ok: true, available: false, needsDisambiguation: false, answer: "Codex 还没有报告近期任务状态", task: null };
    const source = String(utterance || "").toLocaleLowerCase("zh-CN");
    const matches = tasks.filter((task) => source.includes(task.taskLabel.toLocaleLowerCase("zh-CN")));
    if (matches.length === 1) return { ok: true, available: true, needsDisambiguation: false, answer: deterministicTaskAnswer(matches[0]), task: this.sanitize(matches[0]) };
    const active = tasks.filter((task) => ["thinking", "working", "waiting"].includes(task.state));
    if (active.length === 1) return { ok: true, available: true, needsDisambiguation: false, answer: deterministicTaskAnswer(active[0]), task: this.sanitize(active[0]) };
    if (!active.length && tasks.length === 1) return { ok: true, available: true, needsDisambiguation: false, answer: deterministicTaskAnswer(tasks[0]), task: this.sanitize(tasks[0]) };
    const candidates = active.length ? active : tasks;
    const labels = candidates.slice(0, this.maxTasks).map((task) => task.taskLabel);
    return { ok: true, available: true, needsDisambiguation: true, answer: `最近有多个 Codex 任务：${labels.join("、")}。请说出任务名称。`, tasks: labels };
  }

  status() { return Object.freeze({ receiver: "listening", protocol: "codex-task-brief-v1", tasks: this.list() }); }
}

class CodexTaskBriefServer {
  constructor({ onReport, pipePath = resolveCodexTaskBriefPipePath() } = {}) {
    if (typeof onReport !== "function") throw new Error("codex-task-brief-handler-required");
    this.onReport = onReport;
    this.pipePath = pipePath;
    this.server = null;
  }

  start() {
    if (this.server) return Promise.resolve({ ok: true, alreadyStarted: true });
    return new Promise((resolve) => {
      const server = net.createServer((socket) => {
        socket.setEncoding("utf8");
        let data = "";
        socket.on("data", (chunk) => { data += chunk; if (Buffer.byteLength(data, "utf8") > MAX_MESSAGE_BYTES) socket.destroy(); });
        socket.on("end", () => { const report = decodeCodexTaskBrief(data.split(/\r?\n/, 1)[0]); if (report) this.onReport(report); });
        socket.on("error", () => {});
      });
      server.once("error", () => { this.server = null; resolve({ ok: false, reason: "codex-task-brief-pipe-unavailable" }); });
      server.listen(this.pipePath, () => { this.server = server; resolve({ ok: true }); });
    });
  }

  stop() {
    const server = this.server;
    this.server = null;
    if (!server) return Promise.resolve();
    return new Promise((resolve) => server.close(() => resolve()));
  }
}

module.exports = { CODEX_TASK_BRIEF_PIPE_NAME, CODEX_TASK_BRIEF_VERSION, MAX_MESSAGE_BYTES, MAX_RECENT_TASKS, PROGRESS_THROTTLE_MS, CodexTaskBriefServer, CodexTaskBriefStore, decodeCodexTaskBrief, deterministicTaskAnswer, encodeCodexTaskBrief, normalizeCodexTaskBrief, resolveCodexTaskBriefPipePath, sendCodexTaskBrief };
