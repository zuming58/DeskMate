const net = require("net");
const os = require("os");
const path = require("path");

const CODEX_HOOK_PROTOCOL_VERSION = 1;
const CODEX_PIPE_NAME = "deskmate-codex-status-v1";
const MAX_MESSAGE_BYTES = 512;
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

function mapCodexHookEvent(value = {}) {
  const event = typeof value.hook_event_name === "string" ? value.hook_event_name : "";
  if (!CODEX_EVENTS.has(event)) return null;
  const toolName = normalizeToolName(value.tool_name);
  if (event === "SessionStart" || event === "SessionEnd") return { event, toolName: "", state: "idle" };
  if (event === "UserPromptSubmit") return { event, toolName: "", state: "thinking" };
  if (event === "PermissionRequest") return { event, toolName, state: "waiting" };
  if (event === "PreToolUse") return { event, toolName, state: toolName === "request_user_input" ? "waiting" : "working" };
  if (event === "PostToolUse") return { event, toolName, state: "working" };
  if (event === "Stop") return { event, toolName: "", state: "completed" };
  return null;
}

function encodeCodexHookMessage(value = {}) {
  const mapped = mapCodexHookEvent(value);
  if (!mapped) return null;
  return `${JSON.stringify({ version: CODEX_HOOK_PROTOCOL_VERSION, provider: "codex", event: mapped.event, toolName: mapped.toolName })}\n`;
}

function decodeCodexHookMessage(line) {
  if (typeof line !== "string" || Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) return null;
  let value;
  try { value = JSON.parse(line); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "event,provider,toolName,version") return null;
  if (value.version !== CODEX_HOOK_PROTOCOL_VERSION || value.provider !== "codex") return null;
  return mapCodexHookEvent({ hook_event_name: value.event, tool_name: value.toolName });
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
  resolveCodexPipePath,
  sendCodexHookEvent,
};
