import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

import { createDiagnosticReport } from "../src/services/diagnostics.js";

const require = createRequire(import.meta.url);
const { SimulatedCompanionAudioSink, SimulatedCompanionAudioSource } = require("../electron/companion-audio.cjs");
const { CompanionConversationController } = require("../electron/companion-conversation.cjs");
const { FLAGS, MESSAGE_TYPES, SERIALIZATION, decodeFrame, encodeFrame } = require("../electron/doubao-realtime-codec.cjs");
const { translateFrame } = require("../electron/doubao-realtime.cjs");

class FakeProvider {
  constructor(onEvent, { closeEvent = null } = {}) {
    this.onEvent = onEvent;
    this.closeEvent = closeEvent;
    this.closed = false;
  }

  async connect() { return { ok: true }; }
  sendAudio() { return true; }
  interrupt() {}
  close() {
    this.closed = true;
    if (this.closeEvent) this.onEvent(this.closeEvent);
  }
  emit(event) { this.onEvent(event); }
}

function terminalDiagnostic(providerEvent, terminalEvent = providerEvent, failureBucket = "none") {
  return { providerEvent, terminalEvent, failureBucket };
}

function createHarness({ sink = new SimulatedCompanionAudioSink(), closeEvent = null } = {}) {
  const source = new SimulatedCompanionAudioSource();
  const providers = [];
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => {
      const provider = new FakeProvider(onEvent, { closeEvent });
      providers.push(provider);
      return provider;
    },
    audioSource: source,
    audioSink: sink,
    wait: async () => {},
  });
  return { controller, providers, sink, source };
}

async function startHarness(harness, suffix = "base") {
  assert.equal((await harness.controller.start({ sessionId: `terminal-${suffix}`, generation: 1 })).ok, true);
  return harness.providers.at(-1);
}

test("Doubao terminal frames expose only allowlisted diagnostic classifications", () => {
  const state = { replyText: "" };
  const translated = (event, messageType = MESSAGE_TYPES.FULL_SERVER_RESPONSE, code) => translateFrame(decodeFrame(encodeFrame({
    messageType,
    flags: messageType === MESSAGE_TYPES.ERROR ? FLAGS.NO_SEQUENCE : FLAGS.EVENT,
    event,
    code,
    sessionId: event && ![50, 51, 52].includes(event) ? "diagnostic-session" : "",
    connectId: [50, 51, 52].includes(event) ? "diagnostic-connection" : "",
    serialization: SERIALIZATION.JSON,
    payload: Buffer.from('{"message":"private-provider-payload","request_id":"private-request"}'),
  })), state);

  assert.deepEqual(translated(152), { type: "session.finished", diagnostic: terminalDiagnostic("session-finished") });
  assert.deepEqual(translated(153), { type: "error", message: "doubao-session-service-error", diagnostic: terminalDiagnostic("session-failed", "session-failed", "unknown-provider-error") });
  assert.deepEqual(translated(52), { type: "connection.finished", diagnostic: terminalDiagnostic("connection-finished") });
  assert.deepEqual(translated(599), { type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "unknown-provider-error") });
  assert.deepEqual(translated(undefined, MESSAGE_TYPES.ERROR, 55000031), { type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("error-frame", "error-frame", "server-busy") });
  assert.doesNotMatch(JSON.stringify([
    translated(599),
    translated(undefined, MESSAGE_TYPES.ERROR, 45000001),
  ]), /private-provider-payload|private-request|45000001|55000031/);
});

test("arrival sequence proves an error frame arrived after tts end while playback was draining", async () => {
  const sink = new SimulatedCompanionAudioSink();
  let releaseDrain;
  sink.drain = () => new Promise((resolve) => { releaseDrain = resolve; });
  const harness = createHarness({ sink });
  const provider = await startHarness(harness, "error-frame-drain");

  provider.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  await new Promise((resolve) => setImmediate(resolve));
  provider.emit({ type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("error-frame", "error-frame", "request-invalid") });

  const duringDrain = harness.controller.snapshot().providerLifecycle;
  assert.equal(duringDrain.ttsEnds, 1);
  assert.equal(duringDrain.errorFrames, 1);
  assert.equal(duringDrain.dialogErrors, 0);
  assert.equal(duringDrain.lastTtsEndSequence, 1);
  assert.equal(duringDrain.lastTerminalEventSequence, 2);
  assert.equal(duringDrain.lastTerminalEvent, "error-frame");
  assert.equal(duringDrain.lastTerminalPhase, "draining");
  assert.equal(duringDrain.lastFailureBucket, "request-invalid");
  assert.equal(duringDrain.terminalExpected, false);

  releaseDrain({ ok: true });
  await harness.controller.eventChain;
  assert.equal(harness.controller.snapshot().state, "error");
});

test("dialog error remains distinguishable from an error frame after tts end", async () => {
  const harness = createHarness();
  const provider = await startHarness(harness, "dialog-error");
  provider.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  provider.emit({ type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "unknown-provider-error") });
  await harness.controller.eventChain;
  const lifecycle = harness.controller.snapshot().providerLifecycle;
  assert.equal(lifecycle.ttsEnds, 1);
  assert.equal(lifecycle.errorFrames, 0);
  assert.equal(lifecycle.dialogErrors, 1);
  assert.equal(lifecycle.lastTerminalEvent, "dialog-error");
  assert.ok(lifecycle.lastTerminalEventSequence > lifecycle.lastTtsEndSequence);
});

test("session and connection terminal events have independent counters without changing controller behavior", async () => {
  const finishedHarness = createHarness();
  const finishedProvider = await startHarness(finishedHarness, "finished");
  finishedProvider.emit({ type: "session.finished", diagnostic: terminalDiagnostic("session-finished") });
  finishedProvider.emit({ type: "connection.finished", diagnostic: terminalDiagnostic("connection-finished") });
  await finishedHarness.controller.eventChain;
  const finished = finishedHarness.controller.snapshot();
  assert.equal(finished.state, "listening");
  assert.equal(finished.providerLifecycle.sessionFinished, 1);
  assert.equal(finished.providerLifecycle.connectionFinished, 1);
  assert.equal(finished.providerLifecycle.lastTerminalEvent, "connection-finished");
  await finishedHarness.controller.stop();

  const failedHarness = createHarness();
  const failedProvider = await startHarness(failedHarness, "failed");
  failedProvider.emit({ type: "error", message: "doubao-session-service-error", diagnostic: terminalDiagnostic("session-failed", "session-failed", "unknown-provider-error") });
  await failedHarness.controller.eventChain;
  const failed = failedHarness.controller.snapshot();
  assert.equal(failed.state, "error");
  assert.equal(failed.providerLifecycle.sessionFailed, 1);
  assert.equal(failed.providerLifecycle.lastTerminalEvent, "session-failed");
});

test("transport close is counted before the existing finite reconnect path", async () => {
  const harness = createHarness();
  const provider = await startHarness(harness, "transport-close");
  provider.emit({ type: "connection.closed", diagnostic: terminalDiagnostic("transport-close") });
  await harness.controller.eventChain;
  await new Promise((resolve) => setImmediate(resolve));
  if (harness.controller.reconnecting) await harness.controller.reconnecting;
  const lifecycle = harness.controller.snapshot().providerLifecycle;
  assert.equal(lifecycle.transportCloses, 1);
  assert.equal(lifecycle.closes, 1);
  assert.equal(lifecycle.reconnects, 1);
  assert.equal(lifecycle.connectAttempts, 2);
  assert.equal(lifecycle.lastTerminalEvent, "transport-close");
  assert.equal(harness.controller.snapshot().state, "listening");
  await harness.controller.stop();
});

test("terminal events emitted by provider close are marked expected during an active stop", async () => {
  const closeEvent = { type: "session.finished", diagnostic: terminalDiagnostic("session-finished") };
  const harness = createHarness({ closeEvent });
  await startHarness(harness, "expected-stop");
  assert.equal((await harness.controller.stop("user")).ok, true);
  await harness.controller.eventChain;
  const lifecycle = harness.controller.snapshot().providerLifecycle;
  assert.equal(lifecycle.sessionFinished, 1);
  assert.equal(lifecycle.lastTerminalPhase, "stopping");
  assert.equal(lifecycle.terminalExpected, true);
  assert.equal(harness.controller.snapshot().state, "idle");
});

test("diagnostic export whitelists terminal metadata and rejects provider content and identifiers", () => {
  const report = createDiagnosticReport({
    conversation: {
      state: "error",
      connected: false,
      error: "doubao-service-error",
      providerLifecycle: {
        events: 9,
        errorFrames: 1,
        dialogErrors: 2,
        sessionFinished: 3,
        sessionFailed: 4,
        connectionFinished: 5,
        transportErrors: 6,
        transportCloses: 7,
        providerEventSequence: 19,
        lastTtsEndSequence: 17,
        lastTerminalEventSequence: 19,
        lastProviderEvent: "error-frame",
        lastTerminalEvent: "error-frame",
        lastTerminalPhase: "draining",
        lastFailureBucket: "server-internal",
        terminalExpected: false,
        code: 55000123,
        message: "private-provider-message",
        payload: "private-provider-payload",
        sessionId: "private-session-id",
        connectId: "private-connect-id",
        requestId: "private-request-id",
      },
    },
  });
  assert.deepEqual(report.conversation.providerLifecycle, {
    connectAttempts: 0, connections: 0, closes: 0, reconnects: 0, events: 9,
    audioEvents: 0, ttsStarts: 0, ttsEnds: 0, providerErrors: 0,
    errorFrames: 1, dialogErrors: 2, sessionFinished: 3, sessionFailed: 4,
    connectionFinished: 5, transportErrors: 6, transportCloses: 7,
    providerEventSequence: 19, lastTtsEndSequence: 17, lastTerminalEventSequence: 19,
    lastProviderEvent: "error-frame", lastTerminalEvent: "error-frame",
    lastTerminalPhase: "draining", lastFailureBucket: "server-internal", terminalExpected: false,
  });
  assert.doesNotMatch(JSON.stringify(report), /55000123|private-provider|private-session|private-connect|private-request/);

  const rejected = createDiagnosticReport({ conversation: { providerLifecycle: {
    lastProviderEvent: "private-provider-event",
    lastTerminalEvent: "private-terminal",
    lastTerminalPhase: "private-phase",
    lastFailureBucket: "private-bucket",
  } } }).conversation.providerLifecycle;
  assert.equal(rejected.lastProviderEvent, "none");
  assert.equal(rejected.lastTerminalEvent, "none");
  assert.equal(rejected.lastTerminalPhase, "none");
  assert.equal(rejected.lastFailureBucket, "none");
});

test("T11D.2 package exposes an explicit diagnostic build identity", () => {
  const main = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.match(main, /t11d2-doubao-terminal-diagnostics-v1/);
  assert.doesNotMatch(main, /const DESKMATE_BUILD_ID = "unknown"/);
});
