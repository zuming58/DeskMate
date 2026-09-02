import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sanitizedProviderStatus, summarizeProviderWork } = require("../electron/agent-provider-status.cjs");

test("automatic provider status stays content-free and labels Hermes independently from Codex", () => {
  const status = sanitizedProviderStatus("hermes", {
    receiver: "listening",
    connected: true,
    state: "waiting",
    event: "pre_approval_request",
    toolName: "terminal",
    outcome: "",
    updatedAt: "2026-09-02T00:00:00.000Z",
    delivery: "sent",
    prompt: "private",
    command: "private",
  }, "hermes");
  assert.equal(status.provider, "hermes");
  assert.equal(status.sourceVersion, "hermes-plugin-hooks-v1");
  assert.equal(status.selected, true);
  assert.equal(status.work.summary, "Hermes 正在等待你的确认或补充");
  assert.equal(status.work.needsAttention, true);
  assert.equal(Object.hasOwn(status, "prompt"), false);
  assert.equal(Object.hasOwn(status, "command"), false);
});

test("unsupported providers remain explicit manual-only instead of pretending to be connected", () => {
  const status = sanitizedProviderStatus("workbody", { receiver: "listening", connected: true }, "workbody");
  assert.equal(status.receiver, "manual-only");
  assert.equal(status.connected, false);
  assert.equal(status.delivery, "manual-only");
  assert.equal(status.selected, true);
  assert.equal(summarizeProviderWork("hermes", { state: "completed" }).summary, "Hermes 本轮工作已完成");
});
