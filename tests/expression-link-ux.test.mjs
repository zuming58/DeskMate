import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  agentStateEvidence,
  previewSoftwareExpression,
  requestManualAgentState,
} from "../src/domain/expressionLinkUx.js";

test("software expression preview updates only the local renderer state", () => {
  const patches = [];
  const messages = [];
  let hardwareCalls = 0;
  const result = previewSoftwareExpression({
    patch: (value) => patches.push(value),
    notify: (value) => messages.push(value),
    preset: { id: "happy", name: "开心" },
    desktop: { setManualAgentState: () => { hardwareCalls += 1; } },
  });
  assert.deepEqual(result, { ok: true, expressionId: "happy", hardwareSent: false });
  assert.deepEqual(patches, [{ currentExpression: "happy" }]);
  assert.match(messages[0], /软件预览/);
  assert.match(messages[0], /未发送到小智/);
  assert.equal(hardwareCalls, 0);
});

test("all seven hardware work states use the frozen transport values", async () => {
  const calls = [];
  const desktop = { setManualAgentState: async (value) => { calls.push(value); return { ok: true }; } };
  const control = { agentId: "codex", customName: "", state: "idle" };
  for (const requestedState of ["idle", "listening", "thinking", "working", "waiting_user", "completed", "error"]) {
    const result = await requestManualAgentState({ desktop, control, requestedState });
    assert.equal(result.ok, true);
  }
  assert.deepEqual(calls.map((item) => item.state), ["idle", "listening", "thinking", "working", "waiting", "completed", "error"]);
});

test("repeating the selected hardware state creates another explicit request", async () => {
  const calls = [];
  const desktop = { setManualAgentState: async (value) => { calls.push(value); return { ok: true }; } };
  const control = { agentId: "codex", state: "thinking" };
  await requestManualAgentState({ desktop, control, requestedState: "thinking" });
  await requestManualAgentState({ desktop, control, requestedState: "thinking" });
  assert.deepEqual(calls, [{ agentId: "codex", state: "thinking" }, { agentId: "codex", state: "thinking" }]);
});

test("EasyInput ACK and downstream Link evidence remain separate", () => {
  for (const state of ["waiting", "faulted"]) {
    const evidence = agentStateEvidence({
      linkDiagnostics: { state },
      agentStateDelivery: { status: "acknowledged", targetState: "thinking", at: "2026-08-31T10:00:00.000Z" },
    });
    assert.equal(evidence.easyInputLabel, "ACK 成功");
    assert.equal(evidence.link.status, state);
    assert.equal(evidence.xiaozhiDisplayConfirmed, false);
  }
  const unavailable = agentStateEvidence({ boardConnected: true });
  assert.equal(unavailable.link.status, "unavailable");
  assert.equal(unavailable.xiaozhiDisplayConfirmed, false);
});

test("companion page visually separates preview from real hardware state testing", async () => {
  const [pages, app] = await Promise.all([
    readFile(new URL("../src/pages.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  ]);
  const companion = pages.slice(pages.indexOf("function AgentStateTestPanel"), pages.indexOf("export function DashboardPage"));
  for (const label of ["Windows 软件表情预览", "只改变本页画面，不控制小智", "小智工作状态测试", "EasyInput 写入", "小智 DeskMate Link", "EasyInput ACK 只证明写入被总控接受", "查看系统诊断"]) assert.match(companion, new RegExp(label));
  assert.match(companion, /requestManualAgentState/);
  assert.match(companion, /previewSoftwareExpression/);
  assert.match(companion, /navigate\?\.\("settings\/diagnostics"\)/);
  assert.match(app, /page\.split\("\/"\)\[0\]/);
  assert.doesNotMatch(companion, /已同步到小智/);
});
