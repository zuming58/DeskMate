import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";

const require = createRequire(import.meta.url);
const {
  CodexHookStateServer,
  decodeCodexHookMessage,
  encodeCodexHookMessage,
  mapCodexHookEvent,
  sendCodexHookEvent,
} = require("../electron/codex-hook-state.cjs");

test("Codex lifecycle events map to the frozen seven-state subset without reading content", () => {
  assert.equal(mapCodexHookEvent({ hook_event_name: "SessionStart", cwd: "private", transcript_path: "private" }).state, "idle");
  assert.equal(mapCodexHookEvent({ hook_event_name: "UserPromptSubmit", prompt: "private prompt" }).state, "thinking");
  assert.equal(mapCodexHookEvent({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "private command" } }).state, "working");
  assert.equal(mapCodexHookEvent({ hook_event_name: "PreToolUse", tool_name: "request_user_input" }).state, "waiting");
  assert.equal(mapCodexHookEvent({ hook_event_name: "PermissionRequest", tool_name: "Bash" }).state, "waiting");
  assert.equal(mapCodexHookEvent({ hook_event_name: "PostToolUse", tool_name: "request_user_input", tool_response: "private" }).state, "working");
  assert.equal(mapCodexHookEvent({ hook_event_name: "Stop", last_assistant_message: "private response" }).state, "completed");
  assert.equal(mapCodexHookEvent({ hook_event_name: "SessionEnd" }).state, "idle");
  assert.equal(mapCodexHookEvent({ hook_event_name: "Unknown" }), null);
});

test("hook wire message contains only event metadata and rejects extra fields", () => {
  const message = encodeCodexHookMessage({ hook_event_name: "UserPromptSubmit", prompt: "must-not-leave-hook", session_id: "secret" });
  assert.equal(message, '{"version":1,"provider":"codex","event":"UserPromptSubmit","toolName":""}\n');
  assert.deepEqual(decodeCodexHookMessage(message.trim()), { event: "UserPromptSubmit", toolName: "", state: "thinking" });
  assert.equal(decodeCodexHookMessage('{"version":1,"provider":"codex","event":"Stop","toolName":"","prompt":"leak"}'), null);
  assert.equal(decodeCodexHookMessage("not-json"), null);
});

test("local hook sender reaches the bounded receiver and fails soft when DeskMate is absent", async () => {
  const pipePath = process.platform === "win32"
    ? `\\\\.\\pipe\\deskmate-codex-test-${process.pid}-${Date.now()}`
    : path.join(os.tmpdir(), `deskmate-codex-test-${process.pid}-${Date.now()}.sock`);
  const seen = [];
  const server = new CodexHookStateServer({ pipePath, onState: (value) => seen.push(value) });
  assert.equal((await server.start()).ok, true);
  assert.equal((await sendCodexHookEvent({ hook_event_name: "PreToolUse", tool_name: "apply_patch" }, { pipePath })).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(seen, [{ event: "PreToolUse", toolName: "apply_patch", state: "working" }]);
  await server.stop();
  assert.equal((await sendCodexHookEvent({ hook_event_name: "Stop" }, { pipePath, timeoutMs: 25 })).ok, false);
});
