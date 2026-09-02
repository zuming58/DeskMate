import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const {
  HermesHookStateServer,
  decodeHermesHookMessage,
  encodeHermesHookMessage,
  mapHermesHookEvent,
  sendHermesHookEvent,
} = require("../electron/hermes-hook-state.cjs");

test("Hermes official lifecycle hooks map to the frozen seven-state subset", () => {
  assert.equal(mapHermesHookEvent({ event: "on_session_start", session_id: "private" }).state, "idle");
  assert.equal(mapHermesHookEvent({ event: "pre_llm_call", messages: ["private"] }).state, "thinking");
  assert.equal(mapHermesHookEvent({ event: "pre_tool_call", toolName: "terminal", args: { command: "private" } }).state, "working");
  assert.equal(mapHermesHookEvent({ event: "pre_approval_request", command: "private" }).state, "waiting");
  assert.equal(mapHermesHookEvent({ event: "post_approval_response", toolName: "terminal", choice: "once" }).state, "working");
  assert.equal(mapHermesHookEvent({ event: "on_session_end", outcome: "completed" }).state, "completed");
  assert.equal(mapHermesHookEvent({ event: "on_session_end", outcome: "failed", error: "private" }).state, "error");
  assert.equal(mapHermesHookEvent({ event: "on_session_end", outcome: "interrupted" }).state, "idle");
  assert.equal(mapHermesHookEvent({ event: "on_session_finalize" }).state, "idle");
  assert.equal(mapHermesHookEvent({ event: "on_stream_end" }), null);
});

test("Hermes hook wire contains only bounded lifecycle metadata and rejects extra fields", () => {
  const message = encodeHermesHookMessage({ event: "pre_tool_call", toolName: "terminal", command: "must-not-leave-hook", session_id: "secret" });
  assert.equal(message, '{"version":1,"provider":"hermes","event":"pre_tool_call","toolName":"terminal","outcome":""}\n');
  assert.deepEqual(decodeHermesHookMessage(message.trim()), { event: "pre_tool_call", toolName: "terminal", outcome: "", state: "working" });
  assert.equal(decodeHermesHookMessage('{"version":1,"provider":"hermes","event":"on_session_end","toolName":"","outcome":"completed","text":"leak"}'), null);
  assert.equal(decodeHermesHookMessage('{"version":1,"provider":"hermes","event":"on_session_end","toolName":"","outcome":"unknown"}'), null);
  assert.equal(decodeHermesHookMessage("not-json"), null);
});

test("Hermes local sender reaches the bounded receiver and fails soft when DeskMate is absent", async () => {
  const pipePath = process.platform === "win32"
    ? `\\\\.\\pipe\\deskmate-hermes-test-${process.pid}-${Date.now()}`
    : path.join(os.tmpdir(), `deskmate-hermes-test-${process.pid}-${Date.now()}.sock`);
  const seen = [];
  const server = new HermesHookStateServer({ pipePath, onState: (value) => seen.push(value) });
  assert.equal((await server.start()).ok, true);
  assert.equal((await sendHermesHookEvent({ event: "on_session_end", outcome: "completed" }, { pipePath })).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(seen, [{ event: "on_session_end", toolName: "", outcome: "completed", state: "completed" }]);
  await server.stop();
  assert.equal((await sendHermesHookEvent({ event: "pre_llm_call" }, { pipePath, timeoutMs: 25 })).ok, false);
});

test("optional Hermes plugin is bounded, content-free and requires separate user activation", async () => {
  const [plugin, manifest, readme, packageJson] = await Promise.all([
    readFile(new URL("../integrations/hermes/deskmate-status/__init__.py", import.meta.url), "utf8"),
    readFile(new URL("../integrations/hermes/deskmate-status/plugin.yaml", import.meta.url), "utf8"),
    readFile(new URL("../integrations/hermes/deskmate-status/README.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  for (const hook of ["on_session_start", "pre_llm_call", "pre_tool_call", "pre_approval_request", "on_session_end", "on_session_finalize"]) {
    assert.match(plugin, new RegExp(`register_hook\\(\"${hook}\"`));
  }
  assert.match(plugin, /Queue\(maxsize=64\)/);
  assert.match(plugin, /"version": 1[\s\S]*"provider": "hermes"[\s\S]*"event": event[\s\S]*"toolName"[\s\S]*"outcome"/);
  assert.doesNotMatch(plugin, /_kwargs\s*\[/);
  assert.doesNotMatch(plugin, /_kwargs\.get/);
  assert.match(manifest, /name: deskmate-status/);
  assert.match(readme, /not installed or enabled automatically/);
  assert.match(readme, /explicit enablement/);
  assert.match(packageJson, /integrations\/hermes\/deskmate-status/);
});
