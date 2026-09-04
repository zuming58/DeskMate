import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const {
  CodexHookStateServer,
  decodeCodexHookMessage,
  encodeCodexHookMessage,
  mapCodexHookEvent,
  sendCodexHookEvent,
  opaqueCodexTaskKey,
} = require("../electron/codex-hook-state.cjs");
const { helperSource, refreshExistingCodexHookHelper } = require("../electron/codex-hook-integration.cjs");

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
  const message = encodeCodexHookMessage({ hook_event_name: "UserPromptSubmit", prompt: "must-not-leave-hook" });
  assert.equal(message, '{"version":1,"provider":"codex","event":"UserPromptSubmit","toolName":""}\n');
  assert.deepEqual(decodeCodexHookMessage(message.trim()), { event: "UserPromptSubmit", toolName: "", state: "thinking" });
  assert.equal(decodeCodexHookMessage('{"version":1,"provider":"codex","event":"Stop","toolName":"","prompt":"leak"}'), null);
  assert.equal(decodeCodexHookMessage("not-json"), null);
});

test("hook v2 uses an opaque per-task identity and never sends prompt, raw id or full path", () => {
  const source = { hook_event_name: "PermissionRequest", tool_name: "Bash", prompt: "private prompt", session_id: "raw-secret-session", cwd: "C:\\private\\DeskMate" };
  const message = encodeCodexHookMessage(source);
  const decoded = decodeCodexHookMessage(message.trim());
  assert.deepEqual(decoded, { event: "PermissionRequest", toolName: "Bash", state: "waiting", taskKey: opaqueCodexTaskKey(source.session_id), taskLabel: "DeskMate" });
  assert.doesNotMatch(message, /raw-secret-session|private prompt|C:\\\\private/);
});

test("existing global hook helper can be upgraded atomically but is never silently installed", () => {
  new vm.Script(helperSource());
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-codex-hook-"));
  try {
    assert.equal(refreshExistingCodexHookHelper({ codexHome: directory }).reason, "codex-hook-registration-unavailable");
    fs.writeFileSync(path.join(directory, "hooks.json"), '{"hooks":{}}');
    assert.equal(refreshExistingCodexHookHelper({ codexHome: directory }).reason, "codex-hook-not-installed");
    fs.writeFileSync(path.join(directory, "hooks.json"), '{"hooks":{"command":"deskmate-codex-status-hook.cjs"}}');
    const updated = refreshExistingCodexHookHelper({ codexHome: directory });
    assert.deepEqual(updated, { ok: true, installed: true, updated: true, version: 2 });
    assert.equal(fs.readFileSync(path.join(directory, "hooks", "deskmate-codex-status-hook.cjs"), "utf8"), helperSource());
    assert.equal(refreshExistingCodexHookHelper({ codexHome: directory }).updated, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("local hook sender reaches the bounded receiver and fails soft when DeskMate is absent", async () => {
  const pipePath = process.platform === "win32"
    ? `\\\\.\\pipe\\deskmate-codex-test-${process.pid}-${Date.now()}`
    : path.join(os.tmpdir(), `deskmate-codex-test-${process.pid}-${Date.now()}.sock`);
  const seen = [];
  const server = new CodexHookStateServer({ pipePath, onState: (value) => seen.push(value) });
  assert.equal((await server.start()).ok, true);
  assert.equal((await sendCodexHookEvent({ hook_event_name: "PreToolUse", tool_name: "apply_patch", session_id: "session-01", cwd: "C:\\work\\DeskMate" }, { pipePath })).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(seen, [{ event: "PreToolUse", toolName: "apply_patch", state: "working", taskKey: opaqueCodexTaskKey("session-01"), taskLabel: "DeskMate" }]);
  await server.stop();
  assert.equal((await sendCodexHookEvent({ hook_event_name: "Stop" }, { pipePath, timeoutMs: 25 })).ok, false);
});
