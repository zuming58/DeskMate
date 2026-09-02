const net = require("net");
const os = require("os");
const path = require("path");

const HERMES_HOOK_PROTOCOL_VERSION = 1;
const HERMES_PIPE_NAME = "deskmate-hermes-status-v1";
const MAX_MESSAGE_BYTES = 512;
const HERMES_EVENTS = new Set([
  "on_session_start",
  "pre_llm_call",
  "pre_tool_call",
  "post_tool_call",
  "pre_approval_request",
  "post_approval_response",
  "on_session_end",
  "on_session_finalize",
]);
const HERMES_OUTCOMES = new Set(["", "completed", "failed", "interrupted"]);

function resolveHermesPipePath(platform = process.platform) {
  if (platform === "win32") return `\\\\.\\pipe\\${HERMES_PIPE_NAME}`;
  return path.join(os.tmpdir(), `${HERMES_PIPE_NAME}-${process.getuid?.() ?? "user"}.sock`);
}

function normalizeToolName(value) {
  const toolName = typeof value === "string" ? value : "";
  return /^[A-Za-z0-9_.:-]{1,128}$/.test(toolName) ? toolName : "";
}

function normalizeOutcome(value) {
  return typeof value === "string" && HERMES_OUTCOMES.has(value) ? value : "";
}

function mapHermesHookEvent(value = {}) {
  const event = typeof value.event === "string" ? value.event : "";
  if (!HERMES_EVENTS.has(event)) return null;
  if (value.outcome !== undefined && (typeof value.outcome !== "string" || !HERMES_OUTCOMES.has(value.outcome))) return null;
  const toolName = normalizeToolName(value.toolName);
  const outcome = normalizeOutcome(value.outcome);
  if (event === "on_session_start" || event === "on_session_finalize") return { event, toolName: "", outcome: "", state: "idle" };
  if (event === "pre_llm_call") return { event, toolName: "", outcome: "", state: "thinking" };
  if (event === "pre_approval_request") return { event, toolName: "", outcome: "", state: "waiting" };
  if (["pre_tool_call", "post_tool_call", "post_approval_response"].includes(event)) return { event, toolName, outcome: "", state: "working" };
  if (event === "on_session_end") {
    const state = outcome === "failed" ? "error" : outcome === "completed" ? "completed" : "idle";
    return { event, toolName: "", outcome, state };
  }
  return null;
}

function encodeHermesHookMessage(value = {}) {
  const mapped = mapHermesHookEvent(value);
  if (!mapped) return null;
  return `${JSON.stringify({ version: HERMES_HOOK_PROTOCOL_VERSION, provider: "hermes", event: mapped.event, toolName: mapped.toolName, outcome: mapped.outcome })}\n`;
}

function decodeHermesHookMessage(line) {
  if (typeof line !== "string" || Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) return null;
  let value;
  try { value = JSON.parse(line); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "event,outcome,provider,toolName,version") return null;
  if (value.version !== HERMES_HOOK_PROTOCOL_VERSION || value.provider !== "hermes") return null;
  return mapHermesHookEvent(value);
}

function sendHermesHookEvent(value, { pipePath = resolveHermesPipePath(), timeoutMs = 150 } = {}) {
  const message = encodeHermesHookMessage(value);
  if (!message) return Promise.resolve({ ok: false, ignored: true, reason: "hermes-hook-event-unsupported" });
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
    const timer = setTimeout(() => finish({ ok: false, reason: "hermes-hook-receiver-timeout" }), timeoutMs);
    socket.once("connect", () => socket.end(message));
    socket.once("error", () => finish({ ok: false, reason: "hermes-hook-receiver-unavailable" }));
    socket.once("close", (hadError) => finish(hadError ? { ok: false, reason: "hermes-hook-send-failed" } : { ok: true }));
  });
}

class HermesHookStateServer {
  constructor({ onState, pipePath = resolveHermesPipePath() } = {}) {
    if (typeof onState !== "function") throw new Error("hermes-hook-state-handler-required");
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
          const mapped = decodeHermesHookMessage(firstLine);
          if (mapped) this.onState(mapped);
        });
        socket.on("error", () => {});
      });
      server.once("error", () => { this.server = null; resolve({ ok: false, reason: "hermes-hook-pipe-unavailable" }); });
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
  HERMES_HOOK_PROTOCOL_VERSION,
  HERMES_PIPE_NAME,
  MAX_MESSAGE_BYTES,
  HermesHookStateServer,
  decodeHermesHookMessage,
  encodeHermesHookMessage,
  mapHermesHookEvent,
  resolveHermesPipePath,
  sendHermesHookEvent,
};
