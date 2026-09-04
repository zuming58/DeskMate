const net = require("net");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const CODEX_HOOK_PROTOCOL_VERSION = 2;
const CODEX_PIPE_NAME = "deskmate-codex-status-v1";
const MAX_MESSAGE_BYTES = 1024;
const CODEX_EVENTS = new Set([
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "Stop",
]);

function resolveCodexPipePath(platform = process.platform) {
  if (platform === "win32") return `\\\\.\\pipe\\${CODEX_PIPE_NAME}`;
  return path.join(os.tmpdir(), `${CODEX_PIPE_NAME}-${process.getuid?.() ?? "user"}.sock`);
}

function normalizeToolName(value) {
  const toolName = typeof value === "string" ? value : "";
  return /^[A-Za-z0-9_.:-]{1,128}$/.test(toolName) ? toolName : "";
}

function normalizeTaskKey(value) {
  const taskKey = typeof value === "string" ? value : "";
  return /^codex_[A-Za-z0-9_-]{16,40}$/.test(taskKey) ? taskKey : "";
}

function normalizeTaskLabel(value) {
  const label = typeof value === "string" ? value.normalize("NFKC").trim() : "";
  if (!label || [...label].length > 60 || /[\u0000-\u001f\u007f]/.test(label)) return "";
  return label;
}

function opaqueCodexTaskKey(value) {
  const sessionId = typeof value === "string" ? value : "";
  if (!sessionId || Buffer.byteLength(sessionId, "utf8") > 256 || /[\u0000-\u001f\u007f]/.test(sessionId)) return "";
  return `codex_${crypto.createHash("sha256").update(sessionId, "utf8").digest("base64url").slice(0, 24)}`;
}

function fallbackCodexTaskLabel(value) {
  const cwd = typeof value === "string" && Buffer.byteLength(value, "utf8") <= 2048 ? value : "";
  const label = normalizeTaskLabel(path.basename(cwd));
  return label || "Codex 任务";
}

function mapCodexHookEvent(value = {}) {
  const event = typeof value.hook_event_name === "string" ? value.hook_event_name : "";
  if (!CODEX_EVENTS.has(event)) return null;
  const toolName = normalizeToolName(value.tool_name);
  const taskKey = normalizeTaskKey(value.taskKey);
  const taskLabel = taskKey ? normalizeTaskLabel(value.taskLabel) : "";
  const metadata = taskKey && taskLabel ? { taskKey, taskLabel } : {};
  if (event === "SessionStart" || event === "SessionEnd") return { event, toolName: "", state: "idle", ...metadata };
  if (event === "UserPromptSubmit") return { event, toolName: "", state: "thinking", ...metadata };
  if (event === "PermissionRequest") return { event, toolName, state: "waiting", ...metadata };
  if (event === "PreToolUse") return { event, toolName, state: toolName === "request_user_input" ? "waiting" : "working", ...metadata };
  if (event === "PostToolUse") return { event, toolName, state: "working", ...metadata };
  if (event === "Stop") return { event, toolName: "", state: "completed", ...metadata };
  return null;
}

function encodeCodexHookMessage(value = {}) {
  const mapped = mapCodexHookEvent(value);
  if (!mapped) return null;
  const taskKey = opaqueCodexTaskKey(value.session_id);
  if (!taskKey) return `${JSON.stringify({ version: 1, provider: "codex", event: mapped.event, toolName: mapped.toolName })}\n`;
  return `${JSON.stringify({ version: CODEX_HOOK_PROTOCOL_VERSION, provider: "codex", event: mapped.event, toolName: mapped.toolName, taskKey, taskLabel: fallbackCodexTaskLabel(value.cwd) })}\n`;
}

function decodeCodexHookMessage(line) {
  if (typeof line !== "string" || Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) return null;
  let value;
  try { value = JSON.parse(line); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort().join(",");
  if (value.provider !== "codex") return null;
  if (value.version === 1 && keys === "event,provider,toolName,version") return mapCodexHookEvent({ hook_event_name: value.event, tool_name: value.toolName });
  if (value.version !== CODEX_HOOK_PROTOCOL_VERSION || keys !== "event,provider,taskKey,taskLabel,toolName,version") return null;
  return mapCodexHookEvent({ hook_event_name: value.event, tool_name: value.toolName, taskKey: value.taskKey, taskLabel: value.taskLabel });
}

function sendCodexHookEvent(value, { pipePath = resolveCodexPipePath(), timeoutMs = 150 } = {}) {
  const message = encodeCodexHookMessage(value);
  if (!message) return Promise.resolve({ ok: false, ignored: true, reason: "codex-hook-event-unsupported" });
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
    const timer = setTimeout(() => finish({ ok: false, reason: "codex-hook-receiver-timeout" }), timeoutMs);
    socket.once("connect", () => socket.end(message));
    socket.once("error", () => finish({ ok: false, reason: "codex-hook-receiver-unavailable" }));
    socket.once("close", (hadError) => finish(hadError ? { ok: false, reason: "codex-hook-send-failed" } : { ok: true }));
  });
}

class CodexHookStateServer {
  constructor({ onState, pipePath = resolveCodexPipePath() } = {}) {
    if (typeof onState !== "function") throw new Error("codex-hook-state-handler-required");
    this.onState = onState;
    this.pipePath = pipePath;
    this.server = null;
  }

  start() {
    if (this.server) return Promise.resolve({ ok: true, alreadyStarted: true });
    return new Promise((resolve) => {
      const server = net.createServer((socket) => {
        socket.setEncoding("utf8");
        let data = "";
        socket.on("data", (chunk) => {
          data += chunk;
          if (Buffer.byteLength(data, "utf8") > MAX_MESSAGE_BYTES) socket.destroy();
        });
        socket.on("end", () => {
          const firstLine = data.split(/\r?\n/, 1)[0];
          const mapped = decodeCodexHookMessage(firstLine);
          if (mapped) this.onState(mapped);
        });
        socket.on("error", () => {});
      });
      server.once("error", () => { this.server = null; resolve({ ok: false, reason: "codex-hook-pipe-unavailable" }); });
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

module.exports = {
  CODEX_HOOK_PROTOCOL_VERSION,
  CODEX_PIPE_NAME,
  MAX_MESSAGE_BYTES,
  CodexHookStateServer,
  decodeCodexHookMessage,
  encodeCodexHookMessage,
  mapCodexHookEvent,
  opaqueCodexTaskKey,
  fallbackCodexTaskLabel,
  normalizeTaskKey,
  normalizeTaskLabel,
  resolveCodexPipePath,
  sendCodexHookEvent,
};
