import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MANUAL_AGENT_OPTIONS,
  MANUAL_AGENT_STATES,
  manualAgentName,
  manualAgentState,
  normalizeAgentControl,
} from "../src/domain/agentControl.js";

test("manual Agent model keeps identity local and maps waiting_user to the frozen transport state", () => {
  assert.deepEqual(MANUAL_AGENT_OPTIONS.map((item) => item.id), ["codex", "workbody", "hermes", "claude", "custom"]);
  assert.equal(MANUAL_AGENT_OPTIONS.find((item) => item.id === "workbody").name, "WorkBuddy");
  assert.deepEqual(MANUAL_AGENT_STATES.map((item) => item.id), ["idle", "listening", "thinking", "working", "waiting_user", "completed", "error"]);
  assert.equal(manualAgentState("waiting_user").transport, "waiting");
  assert.equal(manualAgentName({ agentId: "custom", customName: "  Cursor  ", state: "idle" }), "Cursor");
  assert.deepEqual(normalizeAgentControl({ agentId: "invalid", state: "invalid", customName: "x\u0000y" }), { agentId: "codex", customName: "xy", state: "idle" });
});

test("desktop Agent UI keeps manual fallback and exposes the trusted Codex lifecycle adapter", async () => {
  const [pages, preload, main] = await Promise.all([
    readFile(new URL("../src/pages.jsx", import.meta.url), "utf8"),
    readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
  ]);
  assert.match(pages, /Codex 真实状态已接入/);
  assert.match(pages, /重新发送当前状态/);
  assert.doesNotMatch(pages, /simulateNextStatus/);
  assert.match(preload, /setManualAgentState/);
  assert.match(preload, /setActiveAgentProvider/);
  assert.match(preload, /onCodexAgentState/);
  assert.match(main, /desktop:set-manual-agent-state/);
  assert.match(main, /desktop:set-active-agent-provider/);
  assert.match(main, /new CodexHookStateServer/);
  assert.match(main, /voice-workflow-active/);
});
