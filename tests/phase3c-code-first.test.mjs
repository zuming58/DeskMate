import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EasyInputLanAudioAdapter } from "../src/adapters/easyInputLanAudioAdapter.js";
import { createAiEvent, initialAiState, reduceAiState, validateAiEvent, disconnectAiProvider } from "../src/domain/aiStatus.js";
import { choosePetIntent, mapAiStateToPetIntent } from "../src/domain/petIntent.js";
import { createMockAgentProviders } from "../src/adapters/mockAgentProviders.js";

const require = createRequire(import.meta.url);
const { summarizeNetworkInterfaces } = require("../electron/network-summary.cjs");

function frame(sequence, data = new Uint8Array([0, 1])) { return { sequence, format: "pcm_s16le", sampleRate: 16000, channels: 1, data }; }

test("LAN audio defaults to protocol-unconfirmed and exposes bounded diagnostics", async () => {
  const adapter = new EasyInputLanAudioAdapter({ maxQueueFrames: 2 });
  assert.equal((await adapter.discover()).reason, "protocol-unconfirmed");
  assert.equal((await adapter.connect({ id: "unknown" })).reason, "protocol-unconfirmed");
  assert.equal(adapter.ingestFrame(frame(1)), true);
  assert.equal(adapter.getDiagnostics().state, "unavailable");
});

test("LAN audio handles frames, duplicates, order, loss, queue and byte limits", async () => {
  const adapter = new EasyInputLanAudioAdapter({ maxQueueFrames: 2, maxFrameBytes: 4, maxSessionBytes: 10 });
  assert.equal(adapter.ingestFrame(frame(0)), true); assert.equal(adapter.ingestFrame(frame(0)), false); assert.equal(adapter.ingestFrame(frame(2)), true); assert.equal(adapter.ingestFrame(frame(1)), false); assert.equal(adapter.ingestFrame(frame(3)), true);
  const diagnostics = adapter.getDiagnostics(); assert.equal(diagnostics.duplicates, 1); assert.equal(diagnostics.lateFrames, 1); assert.equal(diagnostics.missingFrames, 1); assert.equal(diagnostics.queueDepth, 2); assert.equal(diagnostics.framesDropped >= 2, true);
  assert.equal(adapter.ingestFrame(frame(4, new Uint8Array(8))), false); assert.equal(adapter.ingestFrame({ ...frame(5), sampleRate: 4000 }), false); assert.equal(JSON.stringify(diagnostics).includes("audio"), false);
});

test("LAN audio transport supports cancellation, reconnect cap and idempotent stop", async () => {
  let transport; let disconnect;
  const factory = { connect: async () => { transport = { startStream: async () => {}, stopStream: async () => {}, subscribe: ({ onDisconnect }) => { disconnect = onDisconnect; return () => {}; } }; return transport; } };
  const adapter = new EasyInputLanAudioAdapter({ transportFactory: factory, maxReconnectAttempts: 2, reconnectBaseMs: 1 });
  assert.equal((await adapter.connect({ id: "synthetic" })).ok, true); assert.equal((await adapter.startStream()).state, "streaming"); disconnect(); await new Promise((resolve) => setTimeout(resolve, 8)); assert.equal(adapter.getDiagnostics().reconnectAttempts <= 2, true); await adapter.stop("cancelled"); await adapter.stop("cancelled"); assert.equal(adapter.getDiagnostics().state, "closed");
});

test("LAN audio AbortSignal closes stream and prevents later reconnect", async () => {
  let stopped = 0; const factory = { connect: async () => ({ startStream: async () => {}, stopStream: async () => { stopped += 1; }, subscribe: () => () => {} }) }; const adapter = new EasyInputLanAudioAdapter({ transportFactory: factory }); const controller = new AbortController(); await adapter.connect({ id: "synthetic" }); await adapter.startStream({ signal: controller.signal }); controller.abort(); await new Promise((resolve) => setTimeout(resolve, 2)); assert.equal(adapter.getDiagnostics().state, "closed"); assert.equal(stopped, 1); await adapter.stop("cancelled"); assert.equal(stopped, 1);
});

test("network summary only exposes categories and never addresses", () => {
  const summary = summarizeNetworkInterfaces({ Ethernet: [{ address: "192.168.1.2", internal: false }], WiFi: [{ address: "fe80::1", internal: false, mac: "AA:BB" }], Loopback: [{ address: "127.0.0.1", internal: true }] });
  const serialized = JSON.stringify(summary); assert.equal(summary.available, true); assert.deepEqual(summary.transports.sort(), ["ethernet", "wifi"]); assert.doesNotMatch(serialized, /192\.168|fe80|AA:BB|Loopback/); assert.equal(summary.lanAudio, "protocol-unconfirmed");
});

test("AI status engine rejects invalid, duplicate, stale and old-session events", () => {
  assert.throws(() => validateAiEvent({ version: 2 }), /格式/);
  const first = createAiEvent("codex", "working", { sessionId: "s1", sequence: 2 }); let state = reduceAiState(initialAiState, first); state = reduceAiState(state, createAiEvent("codex", "error", { sessionId: "s1", sequence: 1 })); assert.equal(state.lastEvent.state, "working"); state = reduceAiState(state, createAiEvent("codex", "completed", { sessionId: "s2", sequence: 0 })); assert.equal(state.lastEvent.sessionId, "s2"); state = disconnectAiProvider(state, "codex"); assert.equal(state.lastEvent.state, "offline");
});

test("pet intent priority and mock providers remain hardware-independent", () => {
  assert.equal(choosePetIntent([{ state: "working" }, { state: "error" }]).faceExpression, "alert"); assert.equal(mapAiStateToPetIntent({ state: "completed" }).motionIntent, "celebrate"); const providers = createMockAgentProviders(); assert.deepEqual(Object.keys(providers).sort(), ["claude-code", "codex", "hermes", "workbody"]); assert.equal(providers.codex.emit("listening").provider, "codex");
});
