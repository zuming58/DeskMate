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
    this.audio = [];
  }

  async connect() { return { ok: true }; }
  sendAudio(value) { this.audio.push(Buffer.from(value)); return true; }
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

test("a sequence-adjacent dialog error after successful playback drain recovers with a fresh provider and no audio replay", async () => {
  const harness = createHarness();
  const provider = await startHarness(harness, "post-tts-recovery");
  harness.source.push(Buffer.from([1, 2, 3]));
  provider.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  await harness.controller.eventChain;
  provider.emit({ type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "unknown-provider-error") });
  await harness.controller.eventChain;

  assert.equal(harness.providers.length, 2);
  assert.equal(provider.closed, true);
  assert.equal(harness.providers[1].closed, false);
  assert.equal(provider.audio.length, 1);
  assert.equal(harness.controller.snapshot().state, "listening");
  assert.equal(harness.controller.snapshot().error, "");
  assert.deepEqual(harness.providers[1].audio, []);
  assert.deepEqual({
    attempts: harness.controller.snapshot().providerLifecycle.postTtsDialogRecoveryAttempts,
    succeeded: harness.controller.snapshot().providerLifecycle.postTtsDialogRecoverySucceeded,
    failed: harness.controller.snapshot().providerLifecycle.postTtsDialogRecoveryFailed,
    limited: harness.controller.snapshot().providerLifecycle.postTtsDialogRecoveryLimited,
    result: harness.controller.snapshot().providerLifecycle.lastPostTtsDialogRecoveryResult,
  }, { attempts: 1, succeeded: 1, failed: 0, limited: 0, result: "succeeded" });
  await harness.controller.stop();
});

test("dialog recovery remains fail-closed without a successful adjacent active-phase drain", async () => {
  const nonAdjacent = createHarness();
  const first = await startHarness(nonAdjacent, "non-adjacent");
  first.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  await nonAdjacent.controller.eventChain;
  first.emit({ type: "session.ready", diagnostic: terminalDiagnostic("session-ready", "none") });
  first.emit({ type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "unknown-provider-error") });
  await nonAdjacent.controller.eventChain;
  assert.equal(nonAdjacent.controller.snapshot().state, "error");
  assert.equal(nonAdjacent.controller.snapshot().providerLifecycle.postTtsDialogRecoveryAttempts, 0);

  const sink = new SimulatedCompanionAudioSink();
  sink.drain = async () => ({ ok: false, reason: "synthetic-drain-failure" });
  const noDrain = createHarness({ sink });
  const second = await startHarness(noDrain, "no-drain");
  second.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  await noDrain.controller.eventChain;
  second.emit({ type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "unknown-provider-error") });
  await noDrain.controller.eventChain;
  assert.equal(noDrain.controller.snapshot().state, "error");
  assert.equal(noDrain.controller.snapshot().providerLifecycle.postTtsDialogRecoveryAttempts, 0);
});

test("error frames remain fail-closed after a successful drain", async () => {
  const harness = createHarness();
  const provider = await startHarness(harness, "error-frame-no-recovery");
  provider.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  await harness.controller.eventChain;
  provider.emit({ type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("error-frame", "error-frame", "server-internal") });
  await harness.controller.eventChain;
  assert.equal(harness.controller.snapshot().state, "error");
  assert.equal(harness.controller.snapshot().providerLifecycle.postTtsDialogRecoveryAttempts, 0);
});

test("post-tts dialog recovery is bounded without a new user turn", async () => {
  const harness = createHarness();
  await startHarness(harness, "bounded-recovery");
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const provider = harness.providers.at(-1);
    provider.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
    await harness.controller.eventChain;
    provider.emit({ type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "unknown-provider-error") });
    await harness.controller.eventChain;
  }
  const snapshot = harness.controller.snapshot();
  assert.equal(snapshot.state, "error");
  assert.equal(snapshot.providerLifecycle.postTtsDialogRecoveryAttempts, 2);
  assert.equal(snapshot.providerLifecycle.postTtsDialogRecoverySucceeded, 2);
  assert.equal(snapshot.providerLifecycle.postTtsDialogRecoveryLimited, 1);
  assert.equal(snapshot.providerLifecycle.lastPostTtsDialogRecoveryResult, "limited");
});

test("a real new user turn resets the bounded post-tts recovery streak", async () => {
  const harness = createHarness();
  await startHarness(harness, "recovery-progress");
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const provider = harness.providers.at(-1);
    provider.emit({ type: "asr.final", text: `turn-${cycle}` });
    provider.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
    await harness.controller.eventChain;
    provider.emit({ type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "unknown-provider-error") });
    await harness.controller.eventChain;
  }
  const snapshot = harness.controller.snapshot();
  assert.equal(snapshot.state, "listening");
  assert.equal(snapshot.providerLifecycle.postTtsDialogRecoveryAttempts, 3);
  assert.equal(snapshot.providerLifecycle.postTtsDialogRecoverySucceeded, 3);
  assert.equal(snapshot.providerLifecycle.postTtsDialogRecoveryLimited, 0);
  await harness.controller.stop();
});

test("late events from the replaced provider cannot reuse recovery evidence", async () => {
  const harness = createHarness();
  const oldProvider = await startHarness(harness, "stale-provider");
  oldProvider.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  await harness.controller.eventChain;
  oldProvider.emit({ type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "unknown-provider-error") });
  await harness.controller.eventChain;
  assert.equal(harness.providers.length, 2);
  const attempts = harness.controller.snapshot().providerLifecycle.postTtsDialogRecoveryAttempts;

  oldProvider.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  oldProvider.emit({ type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "unknown-provider-error") });
  await harness.controller.eventChain;
  assert.equal(harness.controller.snapshot().state, "listening");
  assert.equal(harness.controller.snapshot().providerLifecycle.postTtsDialogRecoveryAttempts, attempts);
  assert.equal(harness.providers.length, 2);
  await harness.controller.stop();
});

test("stop during post-tts recovery cancels it without publishing a late listening state", async () => {
  const source = new SimulatedCompanionAudioSource();
  let stopCalls = 0;
  let releaseRecoveryStop;
  source.stop = () => {
    stopCalls += 1;
    if (stopCalls === 1) return new Promise((resolve) => { releaseRecoveryStop = resolve; });
    return Promise.resolve({ ok: true });
  };
  const providers = [];
  const states = [];
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => { const provider = new FakeProvider(onEvent); providers.push(provider); return provider; },
    audioSource: source,
    audioSink: new SimulatedCompanionAudioSink(),
    onEvent: (event) => { if (event.type === "state") states.push(event.state); },
    wait: async () => {},
  });
  await controller.start({ sessionId: "stop-recovery", generation: 1 });
  providers[0].emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  await controller.eventChain;
  providers[0].emit({ type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "unknown-provider-error") });
  await new Promise((resolve) => setImmediate(resolve));
  const stopped = controller.stop("user");
  releaseRecoveryStop({ ok: true });
  assert.equal((await stopped).ok, true);
  await controller.eventChain;
  assert.equal(controller.snapshot().state, "idle");
  assert.equal(controller.snapshot().providerLifecycle.lastPostTtsDialogRecoveryResult, "cancelled");
  assert.equal(states.at(-1), "idle");
});

test("post-tts recovery connection failure terminates with a redacted error", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  const providers = [];
  let created = 0;
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => {
      created += 1;
      const provider = new FakeProvider(onEvent);
      if (created > 1) provider.connect = async () => { throw new Error("private-network-detail"); };
      providers.push(provider);
      return provider;
    },
    audioSource: source, audioSink: sink, wait: async () => {}, retryDelaysMs: [0, 0, 0],
  });
  await controller.start({ sessionId: "recovery-failure", generation: 1 });
  providers[0].emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  await controller.eventChain;
  providers[0].emit({ type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "unknown-provider-error") });
  await controller.eventChain;
  const snapshot = controller.snapshot();
  assert.equal(snapshot.state, "error");
  assert.equal(snapshot.providerLifecycle.postTtsDialogRecoveryFailed, 1);
  assert.equal(snapshot.providerLifecycle.lastPostTtsDialogRecoveryResult, "failed");
  assert.doesNotMatch(snapshot.error, /private-network-detail/);
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
        postTtsDialogRecoveryAttempts: 8,
        postTtsDialogRecoverySucceeded: 7,
        postTtsDialogRecoveryFailed: 1,
        postTtsDialogRecoveryLimited: 2,
        lastPostTtsDialogRecoveryResult: "succeeded",
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
    postTtsDialogRecoveryAttempts: 8, postTtsDialogRecoverySucceeded: 7,
    postTtsDialogRecoveryFailed: 1, postTtsDialogRecoveryLimited: 2,
    lastProviderEvent: "error-frame", lastTerminalEvent: "error-frame",
    lastTerminalPhase: "draining", lastFailureBucket: "server-internal", terminalExpected: false,
    lastPostTtsDialogRecoveryResult: "succeeded",
  });
  assert.doesNotMatch(JSON.stringify(report), /55000123|private-provider|private-session|private-connect|private-request/);

  const rejected = createDiagnosticReport({ conversation: { providerLifecycle: {
    lastProviderEvent: "private-provider-event",
    lastTerminalEvent: "private-terminal",
    lastTerminalPhase: "private-phase",
    lastFailureBucket: "private-bucket",
    lastPostTtsDialogRecoveryResult: "private-result",
  } } }).conversation.providerLifecycle;
  assert.equal(rejected.lastProviderEvent, "none");
  assert.equal(rejected.lastTerminalEvent, "none");
  assert.equal(rejected.lastTerminalPhase, "none");
  assert.equal(rejected.lastFailureBucket, "none");
  assert.equal(rejected.lastPostTtsDialogRecoveryResult, "never");
});

test("T11D.3 package exposes an explicit recovery build identity", () => {
  const main = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.match(main, /t11d3-post-tts-dialog-recovery-v1/);
  assert.doesNotMatch(main, /const DESKMATE_BUILD_ID = "unknown"/);
});
