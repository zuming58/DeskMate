import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  AgentStatePublisher,
  CODEX_HOOK_SOURCE_HASH,
  COMPANION_CONVERSATION_SOURCE_HASH,
  MANUAL_AGENT_SOURCE_HASH,
  createTransitionSequence,
  encodeAgentStateFeatureReport,
} = require("../electron/agent-state-hid.cjs");

test("agent-state report is the frozen v2 vector inside a zero-padded Windows HID buffer", () => {
  const report = encodeAgentStateFeatureReport({
    state: "thinking",
    transitionId: 0x10203040,
    ttlMs: 600000,
    sourceHash: 0x78563412,
  });
  assert.equal(report.length, 64);
  assert.equal(report.subarray(0, 17).toString("hex"), "120202000040302010c027090012345678");
  assert.deepEqual([...report.subarray(17)], Array(47).fill(0));
});

test("agent-state encoder rejects invalid state, transition and TTL combinations", () => {
  assert.throws(() => encodeAgentStateFeatureReport({ state: "unknown", transitionId: 1, ttlMs: 1 }), /agent-state-invalid/);
  assert.throws(() => encodeAgentStateFeatureReport({ state: "idle", transitionId: 0, ttlMs: 0 }), /agent-transition-invalid/);
  assert.throws(() => encodeAgentStateFeatureReport({ state: "idle", transitionId: 1, ttlMs: 1 }), /agent-ttl-state-mismatch/);
  assert.throws(() => encodeAgentStateFeatureReport({ state: "working", transitionId: 1, ttlMs: 0 }), /agent-ttl-state-mismatch/);
  assert.throws(() => encodeAgentStateFeatureReport({ state: "working", transitionId: 1, ttlMs: 600001 }), /agent-ttl-state-mismatch/);
});

test("transition sequence never emits zero when uint32 wraps", () => {
  const next = createTransitionSequence(0xffffffff);
  assert.equal(next(), 0xffffffff);
  assert.equal(next(), 1);
  assert.equal(next(), 2);
});

test("publisher maps only real VoiceWorkflow transitions and suppresses level-only repeats", async () => {
  const reports = [];
  const ids = createTransitionSequence(7);
  const publisher = new AgentStatePublisher({ send: async (report) => { reports.push(report); return { ok: true }; }, nextTransitionId: ids, sourceHash: 1 });

  assert.equal((await publisher.publishVoiceState({ source: "voice-workflow", state: "recording" })).ok, true);
  assert.equal((await publisher.publishVoiceState({ source: "voice-workflow", state: "recording" })).suppressed, true);
  assert.equal((await publisher.publishVoiceState({ source: "voice-workflow", state: "transcribing" })).ok, true);
  assert.equal((await publisher.publishVoiceState({ source: "voice-workflow", state: "organizing" })).suppressed, true);
  assert.equal((await publisher.publishVoiceState({ source: "voice-workflow", state: "outputting" })).ok, true);
  assert.equal((await publisher.publishVoiceState({ source: "voice-workflow", state: "completed" })).ok, true);
  assert.equal((await publisher.publishVoiceState({ source: "voice-workflow", state: "cancelled" })).ok, true);

  assert.deepEqual(reports.map((report) => report[2]), [1, 2, 3, 5, 0]);
  assert.deepEqual(reports.map((report) => report.readUInt32LE(5)), [7, 8, 9, 10, 11]);
  assert.deepEqual(reports.map((report) => report.readUInt32LE(9)), [600000, 600000, 600000, 10000, 0]);
});

test("simulation and mock sources never emit a HID feature report", async () => {
  const reports = [];
  const publisher = new AgentStatePublisher({ send: async (report) => { reports.push(report); return { ok: true }; }, nextTransitionId: createTransitionSequence(1) });
  assert.equal((await publisher.publishVoiceState({ source: "simulation", state: "recording" })).ignored, true);
  assert.equal((await publisher.publishVoiceState({ source: "ai-status-mock", state: "working" })).ignored, true);
  assert.equal(reports.length, 0);

  await publisher.publishVoiceState({ source: "voice-workflow", state: "recording" });
  await publisher.publishVoiceState({ source: "simulation", state: "recording" });
  await publisher.publishVoiceState({ source: "voice-workflow", state: "recording" });
  assert.equal(reports.length, 2, "a new live stream after simulation is a fresh transition");
});

test("manual Agent control publishes only frozen states with an opaque source", async () => {
  const reports = [];
  const publisher = new AgentStatePublisher({ send: async (report) => { reports.push(report); return { ok: true }; }, nextTransitionId: createTransitionSequence(21) });

  assert.equal((await publisher.publishManualState({ source: "manual-agent-control", state: "waiting" })).ok, true);
  assert.equal((await publisher.publishManualState({ source: "manual-agent-control", state: "completed" })).ok, true);
  assert.equal((await publisher.publishManualState({ source: "manual-agent-control", state: "unknown" })).ignored, true);
  assert.equal((await publisher.publishManualState({ source: "simulation", state: "working" })).ignored, true);

  assert.equal(reports.length, 2);
  assert.deepEqual(reports.map((report) => report[2]), [4, 5]);
  assert.deepEqual(reports.map((report) => report.readUInt32LE(9)), [600000, 10000]);
  assert.deepEqual(reports.map((report) => report.readUInt32LE(13)), [MANUAL_AGENT_SOURCE_HASH, MANUAL_AGENT_SOURCE_HASH]);
});

test("manual publication interrupts voice duplicate suppression without replaying an old state", async () => {
  const reports = [];
  const publisher = new AgentStatePublisher({ send: async (report) => { reports.push(report); return { ok: true }; }, nextTransitionId: createTransitionSequence(1) });
  await publisher.publishVoiceState({ source: "voice-workflow", state: "recording" });
  await publisher.publishManualState({ source: "manual-agent-control", state: "waiting" });
  await publisher.publishVoiceState({ source: "voice-workflow", state: "recording" });
  assert.deepEqual(reports.map((report) => report[2]), [1, 4, 1]);
});

test("real Codex hook publication uses a distinct source and respects stream interruption", async () => {
  const reports = [];
  const publisher = new AgentStatePublisher({ send: async (report) => { reports.push(report); return { ok: true }; }, nextTransitionId: createTransitionSequence(31) });
  assert.equal((await publisher.publishProviderState({ source: "codex-hook-v1", state: "thinking" })).ok, true);
  assert.equal((await publisher.publishProviderState({ source: "codex-hook-v1", state: "thinking" })).suppressed, true);
  await publisher.publishManualState({ source: "manual-agent-control", state: "idle" });
  assert.equal((await publisher.publishProviderState({ source: "codex-hook-v1", state: "thinking" })).ok, true);
  assert.equal((await publisher.publishProviderState({ source: "simulation", state: "working" })).ignored, true);
  assert.deepEqual(reports.map((report) => report[2]), [2, 0, 2]);
  assert.deepEqual(reports.map((report) => report.readUInt32LE(13)), [CODEX_HOOK_SOURCE_HASH, MANUAL_AGENT_SOURCE_HASH, CODEX_HOOK_SOURCE_HASH]);
});

test("companion conversation owns the seven-state stream until VoiceWorkflow preempts it", async () => {
  const reports = [];
  const publisher = new AgentStatePublisher({ send: async (report) => { reports.push(report); return { ok: true }; }, nextTransitionId: createTransitionSequence(41) });
  assert.equal((await publisher.publishCompanionState({ source: "companion-conversation-v1", state: "waiting" })).ok, true);
  assert.equal((await publisher.publishCompanionState({ source: "companion-conversation-v1", state: "waiting" })).suppressed, true);
  await publisher.publishCompanionState({ source: "companion-conversation-v1", state: "listening" });
  await publisher.publishVoiceState({ source: "voice-workflow", state: "recording" });
  await publisher.publishCompanionState({ source: "companion-conversation-v1", state: "listening" });
  assert.equal((await publisher.publishCompanionState({ source: "simulation", state: "working" })).ignored, true);
  assert.deepEqual(reports.map((report) => report[2]), [4, 1, 1, 1]);
  assert.deepEqual(reports.map((report) => report.readUInt32LE(13)), [COMPANION_CONVERSATION_SOURCE_HASH, COMPANION_CONVERSATION_SOURCE_HASH, 0x7c89f35a, COMPANION_CONVERSATION_SOURCE_HASH]);
});

test("publisher fails closed without logging or throwing transport failures", async () => {
  const publisher = new AgentStatePublisher({ send: async () => { throw new Error("private-device-path"); }, nextTransitionId: createTransitionSequence(1) });
  assert.deepEqual(await publisher.publishVoiceState({ source: "voice-workflow", state: "error" }), { ok: false, reason: "agent-state-send-failed" });
  assert.equal((await publisher.publishVoiceState({ source: "voice-workflow", state: "error" })).suppressed, true);
});

test("renderer labels mock and simulator flows while main owns HID publication", () => {
  const pages = readFileSync(path.join(root, "src", "pages.jsx"), "utf8");
  const main = readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
  assert.match(pages, /hardwareVoiceSourceRef\.current = requestedSource === "simulation" \|\| state\.settings\.sttMode === "mock" \? "simulation" : "voice-workflow"/);
  assert.match(pages, /event\.source === "simulator" \? "simulation" : "voice-workflow"/);
  assert.match(main, /new AgentStatePublisher/);
  assert.match(main, /publishVoiceState\(\{ state, source: value\.source \}\)/);
  assert.match(main, /desktop:set-manual-agent-state/);
  assert.match(main, /voice-workflow-active/);
  assert.doesNotMatch(pages, /encodeAgentStateFeatureReport/);
});
