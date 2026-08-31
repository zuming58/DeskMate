import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { createDiagnosticReport } from "../src/services/diagnostics.js";
import { normalizeAgentDelivery, normalizeLinkDiagnostics } from "../src/domain/linkDiagnostics.js";

const require = createRequire(import.meta.url);
const { AgentStatePublisher, createTransitionSequence } = require("../electron/agent-state-hid.cjs");
const { LinkRecoveryGate } = require("../electron/link-recovery.cjs");

test("Link diagnostics stay unavailable unless a complete bounded status exists", () => {
  assert.deepEqual(normalizeLinkDiagnostics(null), {
    status: "unavailable",
    available: false,
    counters: { rxFrames: 0, txFrames: 0, requestTimeouts: 0, retries: 0, peerRestarts: 0, agentAccepted: 0, agentForwarded: 0, agentDroppedDisconnected: 0, agentQueueDrops: 0 },
  });
  const normalized = normalizeLinkDiagnostics({ state: "connected", rxFrames: 4, txFrames: 5, requestTimeouts: -1, retries: 2, peerRestarts: 1, agentAccepted: 3, agentForwarded: 2, agentDroppedDisconnected: 0, agentQueueDrops: 0, devicePath: "private" });
  assert.equal(normalized.status, "connected");
  assert.equal(normalized.counters.rxFrames, 4);
  assert.equal(normalized.counters.requestTimeouts, 0);
  assert.equal(JSON.stringify(normalized).includes("private"), false);
});

test("diagnostic export separates EasyInput HID from Link and keeps Agent delivery sanitized", () => {
  const unavailable = createDiagnosticReport({ inputBridge: { boardConnected: true, error: "private-device-path" } });
  assert.equal(unavailable.deskMateLink.status, "unavailable");
  assert.equal(JSON.stringify(unavailable).includes("private-device-path"), false);
  const report = createDiagnosticReport({ inputBridge: { boardConnected: true, linkDiagnostics: { state: "waiting", rxFrames: 1, txFrames: 2, requestTimeouts: 3, retries: 4, peerRestarts: 5, agentAccepted: 6, agentForwarded: 7, agentDroppedDisconnected: 8, agentQueueDrops: 9 }, agentStateDelivery: { status: "failed", targetState: "thinking", at: "2026-08-31T10:00:00.000Z", reason: "deskmatelink-waiting", report: "private" } } });
  assert.equal(report.deskMateLink.status, "waiting");
  assert.equal(report.deskMateLink.counters.agentForwarded, 7);
  assert.deepEqual(report.agentStateDelivery, { status: "failed", targetState: "thinking", at: "2026-08-31T10:00:00.000Z", reason: "deskmatelink-waiting", ack: "failed" });
  assert.equal(JSON.stringify(report).includes("private"), false);
});

test("Link recovery fires once for startup/reconnect and connected transitions", () => {
  const gate = new LinkRecoveryGate();
  assert.deepEqual(gate.observe({ boardConnected: true }), { refresh: true, recover: false, boardConnected: true, linkState: "unavailable" });
  assert.equal(gate.observe({ boardConnected: true, linkDiagnostics: { state: "waiting" } }).recover, false);
  assert.equal(gate.observe({ boardConnected: true, linkDiagnostics: { state: "connected" } }).recover, true);
  assert.equal(gate.observe({ boardConnected: true, linkDiagnostics: { state: "connected" } }).recover, false);
  gate.observe({ boardConnected: false });
  assert.equal(gate.observe({ boardConnected: true, linkDiagnostics: { state: "connected" } }).recover, true);
});

test("publisher force-recovers only the current unexpired state and otherwise sends idle", async () => {
  let now = 1000;
  const reports = [];
  const publisher = new AgentStatePublisher({ send: async (report) => { reports.push(report); return { ok: true }; }, nextTransitionId: createTransitionSequence(10), now: () => now });
  await publisher.publishManualState({ source: "manual-agent-control", state: "thinking" });
  await publisher.recoverCurrentState();
  assert.deepEqual(reports.map((report) => report[2]), [2, 2]);
  now += 600001;
  await publisher.recoverCurrentState();
  assert.equal(reports.at(-1)[2], 0);
  assert.equal(reports.at(-1).readUInt32LE(9), 0);
  assert.deepEqual(publisher.currentStateSnapshot(), { state: "idle", valid: true, expiresAt: null });
});

test("manual selection of the same state always creates a fresh transition", async () => {
  const reports = [];
  const publisher = new AgentStatePublisher({ send: async (report) => { reports.push(report); return { ok: true }; }, nextTransitionId: createTransitionSequence(90) });
  await publisher.publishManualState({ source: "manual-agent-control", state: "waiting" });
  await publisher.publishManualState({ source: "manual-agent-control", state: "waiting" });
  assert.deepEqual(reports.map((report) => report.readUInt32LE(5)), [90, 91]);
});

test("desktop UI exposes Link counters, explicit write ACK and same-state resend", async () => {
  const [pages, main, preload] = await Promise.all([
    readFile(new URL("../src/pages.jsx", import.meta.url), "utf8"),
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
    readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),
  ]);
  for (const label of ["小智云台 / DeskMate Link", "Agent accepted", "Agent forwarded", "断线丢弃", "队列丢弃", "EasyInput 写入 ACK 成功", "重新发送当前状态"]) assert.match(pages, new RegExp(label));
  assert.match(main, /recoverCurrentState/);
  assert.match(main, /desktop:refresh-link-diagnostics/);
  assert.match(preload, /refreshLinkDiagnostics/);
  assert.doesNotMatch(pages, /小智已同步/);
});
