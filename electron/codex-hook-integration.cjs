"use strict";

const fs = require("fs");
const path = require("path");

const HELPER_BASENAME = "deskmate-codex-status-hook.cjs";

function helperSource() {
  return `"use strict";
const crypto = require("crypto");
const net = require("net");
const path = require("path");
const PIPE_PATH = "\\\\\\\\.\\\\pipe\\\\deskmate-codex-status-v1";
const MAX_STDIN_BYTES = 1024 * 1024;
const MAX_TOOL_NAME_BYTES = 128;
const TIMEOUT_MS = 150;
const SUPPORTED_EVENTS = new Set(["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "Stop"]);
function normalizeToolName(value) {
  const toolName = typeof value === "string" ? value : "";
  if (Buffer.byteLength(toolName, "utf8") > MAX_TOOL_NAME_BYTES) return "";
  return /^[A-Za-z0-9_.:-]{1,128}$/.test(toolName) ? toolName : "";
}
function taskKey(value) {
  const sessionId = typeof value === "string" ? value : "";
  if (!sessionId || Buffer.byteLength(sessionId, "utf8") > 256 || /[\\u0000-\\u001f\\u007f]/.test(sessionId)) return "";
  return "codex_" + crypto.createHash("sha256").update(sessionId, "utf8").digest("base64url").slice(0, 24);
}
function taskLabel(value) {
  const cwd = typeof value === "string" && Buffer.byteLength(value, "utf8") <= 2048 ? value : "";
  const label = path.basename(cwd).normalize("NFKC").trim();
  return label && [...label].length <= 60 && !/[\\u0000-\\u001f\\u007f]/.test(label) ? label : "Codex 任务";
}
function createMessage(value) {
  const event = typeof value?.hook_event_name === "string" ? value.hook_event_name : "";
  if (!SUPPORTED_EVENTS.has(event)) return null;
  const opaqueKey = taskKey(value.session_id);
  if (!opaqueKey) return null;
  const toolName = ["PreToolUse", "PermissionRequest", "PostToolUse"].includes(event) ? normalizeToolName(value.tool_name) : "";
  return JSON.stringify({ version: 2, provider: "codex", event, toolName, taskKey: opaqueKey, taskLabel: taskLabel(value.cwd) }) + "\\n";
}
function send(message) {
  return new Promise((resolve) => {
    const socket = net.createConnection(PIPE_PATH);
    let settled = false;
    const finish = () => { if (settled) return; settled = true; clearTimeout(timer); socket.destroy(); resolve(); };
    const timer = setTimeout(finish, TIMEOUT_MS);
    socket.once("connect", () => socket.end(message));
    socket.once("error", finish);
    socket.once("close", finish);
  });
}
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; if (Buffer.byteLength(input, "utf8") > MAX_STDIN_BYTES) process.exit(0); });
process.stdin.on("end", async () => {
  let value;
  try { value = JSON.parse(input); } catch { process.exit(0); return; }
  const message = createMessage(value);
  if (message) await send(message).catch(() => {});
  process.exit(0);
});
process.stdin.resume();
`;
}

function resolveCodexHome(env = process.env) {
  const configured = typeof env.CODEX_HOME === "string" ? env.CODEX_HOME.trim() : "";
  return configured || path.join(typeof env.USERPROFILE === "string" && env.USERPROFILE ? env.USERPROFILE : "", ".codex");
}

function refreshExistingCodexHookHelper({ codexHome = resolveCodexHome(), fileSystem = fs } = {}) {
  const hooksPath = path.join(codexHome, "hooks.json");
  const helperPath = path.join(codexHome, "hooks", HELPER_BASENAME);
  let hooksText;
  try { hooksText = fileSystem.readFileSync(hooksPath, "utf8"); }
  catch { return { ok: false, installed: false, reason: "codex-hook-registration-unavailable" }; }
  if (!hooksText.includes(HELPER_BASENAME)) return { ok: false, installed: false, reason: "codex-hook-not-installed" };
  const source = helperSource();
  try {
    fileSystem.mkdirSync(path.dirname(helperPath), { recursive: true });
    const existing = fileSystem.existsSync(helperPath) ? fileSystem.readFileSync(helperPath, "utf8") : "";
    if (existing === source) return { ok: true, installed: true, updated: false, version: 2 };
    const temporary = `${helperPath}.tmp`;
    fileSystem.writeFileSync(temporary, source, { encoding: "utf8", mode: 0o600 });
    fileSystem.renameSync(temporary, helperPath);
    if (fileSystem.readFileSync(helperPath, "utf8") !== source) throw new Error("readback");
    return { ok: true, installed: true, updated: true, version: 2 };
  } catch {
    return { ok: false, installed: true, reason: "codex-hook-helper-update-failed" };
  }
}

module.exports = { HELPER_BASENAME, helperSource, refreshExistingCodexHookHelper, resolveCodexHome };
