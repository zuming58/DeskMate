import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

import { createDiagnosticReport } from "../src/services/diagnostics.js";

const require = createRequire(import.meta.url);
const { SimulatedCompanionAudioSink, SimulatedCompanionAudioSource } = require("../electron/companion-audio.cjs");
const { CompanionConversationController } = require("../electron/companion-conversation.cjs");
const { FLAGS, MESSAGE_TYPES, SERIALIZATION, decodeFrame, encodeFrame } = require("../electron/doubao-realtime-codec.cjs");
const { providerFailureBucket, translateFrame } = require("../electron/doubao-realtime.cjs");

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

function terminalDiagnostic(providerEvent, terminalEvent = providerEvent, failureBucket = "none", dialogErrorStatusClass = undefined) {
  return { providerEvent, terminalEvent, failureBucket, ...(dialogErrorStatusClass ? { dialogErrorStatusClass } : {}) };
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
  assert.deepEqual(translated(599), { type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "unknown-provider-error", "missing") });
  assert.deepEqual(translated(undefined, MESSAGE_TYPES.ERROR, 55000031), { type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("error-frame", "error-frame", "server-busy") });
  assert.doesNotMatch(JSON.stringify([
    translated(599),
    translated(undefined, MESSAGE_TYPES.ERROR, 45000001),
  ]), /private-provider-payload|private-request|45000001|55000031/);
});

test("official DialogCommonError layout yields only an allowlisted status class", () => {
  const int32 = (value) => { const buffer = Buffer.alloc(4); buffer.writeInt32BE(value); return buffer; };
  const sessionId = Buffer.from("s1", "utf8");
  const payload = Buffer.from('{"status_code":45000001,"message":"private official detail"}', "utf8");
  const officialLayout = Buffer.concat([
    Buffer.from([0x11, 0x94, 0x10, 0x00]),
    int32(599), int32(sessionId.length), sessionId, int32(payload.length), payload,
  ]);
  const translated = translateFrame(decodeFrame(officialLayout), { replyText: "" });
  assert.deepEqual(translated, {
    type: "error",
    message: "doubao-service-error",
    diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "request-invalid", "request-invalid"),
  });
  assert.doesNotMatch(JSON.stringify(translated), /45000001|private official detail|s1/);
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

test("event 359 drains to listening on the same provider and accepts a second turn without greeting replay", async () => {
  const harness = createHarness();
  const provider = await startHarness(harness, "same-session-second-turn");
  provider.emit({ type: "tts.start" });
  provider.emit({ type: "audio", audio: Buffer.alloc(24_000) });
  provider.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  await harness.controller.eventChain;
  assert.equal(harness.controller.snapshot().state, "listening");
  assert.equal(harness.providers.length, 1);
  assert.equal(harness.controller.snapshot().providerLifecycle.connections, 1);
  assert.equal(harness.controller.snapshot().providerLifecycle.reconnects, 0);

  assert.equal(harness.source.push(Buffer.from([1, 2, 3])), true);
  assert.equal(provider.audio.length, 1);
  provider.emit({ type: "asr.final", text: "second turn" });
  provider.emit({ type: "tts.start" });
  provider.emit({ type: "audio", audio: Buffer.from([4, 5]) });
  provider.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  await harness.controller.eventChain;
  assert.equal(harness.controller.snapshot().state, "listening");
  assert.equal(harness.providers.length, 1);
  assert.equal(harness.controller.snapshot().providerLifecycle.connectAttempts, 1);
  await harness.controller.stop();
});

test("the strict half-duplex keep-alive request enables custom endpointing and classifies idle timeout", async () => {
  const { DoubaoRealtimeSession } = require("../electron/doubao-realtime.cjs");
  const session = new DoubaoRealtimeSession({ config: { appId: "app", accessKey: "access", resourceId: "resource", model: "model", voice: "voice" } });
  const payload = session.buildSessionPayload();
  assert.deepEqual(payload.asr, { extra: { end_smooth_window_ms: 5000, enable_custom_vad: true } });
  assert.equal(payload.dialog.extra.input_mod, "keep_alive");
  assert.equal(Object.hasOwn(payload.asr.extra, "enable_asr_twopass"), false);
  assert.equal(providerFailureBucket(52000042), "audio-idle-timeout");
  session.close();
});

test("the documented audio idle timeout remains a classified fail-closed DialogCommonError", async () => {
  const harness = createHarness();
  const provider = await startHarness(harness, "audio-idle-timeout-fail-closed");
  provider.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  await harness.controller.eventChain;
  provider.emit({ type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "audio-idle-timeout", "audio-idle-timeout") });
  await harness.controller.eventChain;
  const snapshot = harness.controller.snapshot();
  assert.equal(snapshot.state, "error");
  assert.equal(snapshot.providerLifecycle.lastFailureBucket, "audio-idle-timeout");
  assert.equal(snapshot.providerLifecycle.lastDialogErrorStatusClass, "audio-idle-timeout");
  assert.equal(snapshot.providerLifecycle.reconnects, 0);
});

test("an adjacent DialogCommonError records bounded evidence and fails closed without reconnect", async () => {
  const harness = createHarness();
  const provider = await startHarness(harness, "dialog-error-fail-closed");
  provider.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  await harness.controller.eventChain;
  provider.emit({
    type: "error",
    message: "doubao-service-error",
    diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "server-internal", "server-internal"),
  });
  await harness.controller.eventChain;
  const snapshot = harness.controller.snapshot();
  assert.equal(snapshot.state, "error");
  assert.equal(snapshot.error, "doubao-service-error");
  assert.equal(harness.providers.length, 1);
  assert.equal(snapshot.providerLifecycle.connections, 1);
  assert.equal(snapshot.providerLifecycle.reconnects, 0);
  assert.equal(snapshot.providerLifecycle.dialogErrors, 1);
  assert.equal(snapshot.providerLifecycle.dialogErrorsAdjacentTtsEnd, 1);
  assert.equal(snapshot.providerLifecycle.lastDialogErrorStatusClass, "server-internal");
  assert.equal(snapshot.providerLifecycle.lastDialogErrorAdjacency, "adjacent-tts-end");
  assert.equal(snapshot.providerLifecycle.lastTerminalPhase, "active");
});

test("DialogCommonError arrival during drain records phase and does not become a recovery", async () => {
  const sink = new SimulatedCompanionAudioSink();
  let releaseDrain;
  sink.drain = () => new Promise((resolve) => { releaseDrain = resolve; });
  const harness = createHarness({ sink });
  const provider = await startHarness(harness, "dialog-error-drain");
  provider.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  await new Promise((resolve) => setImmediate(resolve));
  provider.emit({
    type: "error",
    message: "doubao-service-error",
    diagnostic: terminalDiagnostic("dialog-error", "dialog-error", "unknown-provider-error", "missing"),
  });
  const duringDrain = harness.controller.snapshot().providerLifecycle;
  assert.equal(duringDrain.lastTerminalPhase, "draining");
  assert.equal(duringDrain.lastDialogErrorAdjacency, "adjacent-tts-end");
  assert.equal(duringDrain.lastDialogErrorStatusClass, "missing");
  releaseDrain({ ok: true });
  await harness.controller.eventChain;
  assert.equal(harness.controller.snapshot().state, "error");
  assert.equal(harness.providers.length, 1);
});

test("error frames remain fail-closed after a successful drain", async () => {
  const harness = createHarness();
  const provider = await startHarness(harness, "error-frame-no-recovery");
  provider.emit({ type: "tts.end", diagnostic: terminalDiagnostic("tts-end", "none") });
  await harness.controller.eventChain;
  provider.emit({ type: "error", message: "doubao-service-error", diagnostic: terminalDiagnostic("error-frame", "error-frame", "server-internal") });
  await harness.controller.eventChain;
  assert.equal(harness.controller.snapshot().state, "error");
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
        dialogErrorsAdjacentTtsEnd: 1,
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
        lastDialogErrorStatusClass: "server-internal",
        lastDialogErrorAdjacency: "adjacent-tts-end",
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
    errorFrames: 1, dialogErrors: 2, dialogErrorsAdjacentTtsEnd: 1, sessionFinished: 3, sessionFailed: 4,
    connectionFinished: 5, transportErrors: 6, transportCloses: 7,
    providerEventSequence: 19, lastTtsEndSequence: 17, lastTerminalEventSequence: 19,
    lastProviderEvent: "error-frame", lastTerminalEvent: "error-frame",
    lastTerminalPhase: "draining", lastFailureBucket: "server-internal", terminalExpected: false,
    lastDialogErrorStatusClass: "server-internal", lastDialogErrorAdjacency: "adjacent-tts-end",
  });
  assert.doesNotMatch(JSON.stringify(report), /55000123|private-provider|private-session|private-connect|private-request/);

  const rejected = createDiagnosticReport({ conversation: { providerLifecycle: {
    lastProviderEvent: "private-provider-event",
    lastTerminalEvent: "private-terminal",
    lastTerminalPhase: "private-phase",
    lastFailureBucket: "private-bucket",
    lastDialogErrorStatusClass: "private-status-class",
    lastDialogErrorAdjacency: "private-adjacency",
  } } }).conversation.providerLifecycle;
  assert.equal(rejected.lastProviderEvent, "none");
  assert.equal(rejected.lastTerminalEvent, "none");
  assert.equal(rejected.lastTerminalPhase, "none");
  assert.equal(rejected.lastFailureBucket, "none");
  assert.equal(rejected.lastDialogErrorStatusClass, "none");
  assert.equal(rejected.lastDialogErrorAdjacency, "none");
});

test("current package exposes an explicit T15D choreography editor build identity", () => {
  const main = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.match(main, /t15d-desktop-choreography-editor-v1/);
  assert.doesNotMatch(main, /const DESKMATE_BUILD_ID = "unknown"/);
});

test("turn and sink cancellation diagnostics are bounded and contain no conversation content", () => {
  const report = createDiagnosticReport({ conversation: {
    state: "listening",
    turnLifecycle: {
      ttsTurnStarted: 4,
      ttsTurnCompleted: 3,
      ttsTurnAbandoned: 1,
      ttsImplicitStarts: 1,
      ttsStartsWhileOpen: 2,
      ttsEndsWithoutStart: 0,
      chatFinals: 4,
      chatFinalTtsEndPairs: 3,
      chatFinalsWithoutTtsEnd: 1,
      asrFinalsAccepted: 2,
      asrFinalsSuppressed: 5,
      lastAsrFinalArrivalPhase: "draining",
      lastTtsTurnOutcome: "manual",
      asrFinalArrivalPhases: { listening: 2, thinking: 1, speaking: 3, draining: 1, privatePhase: 99 },
      transcript: "private user sentence",
      replyText: "private assistant sentence",
    },
    sinkCancelReasons: { manual: 7, stop: 1, renderer: 2, provider: 3, "asr-final": 0, privateReason: 88 },
    lastSinkCancelReason: "manual",
    echoGuard: { policy: "computer-speaker-echo-guard-v1", active: false, phase: "listening", uplinkAllowed: true },
  } });
  assert.equal(report.conversation.turnLifecycle.ttsTurnStarted, 4);
  assert.equal(report.conversation.turnLifecycle.ttsTurnCompleted, 3);
  assert.equal(report.conversation.turnLifecycle.ttsTurnAbandoned, 1);
  assert.equal(report.conversation.turnLifecycle.asrFinalArrivalPhases.speaking, 3);
  assert.equal(report.conversation.turnLifecycle.asrFinalArrivalPhases.draining, 1);
  assert.equal(report.conversation.turnLifecycle.lastTtsTurnOutcome, "manual");
  assert.equal(report.conversation.sinkCancellation.reasons.manual, 7);
  assert.equal(report.conversation.sinkCancellation.reasons["asr-final"], 0);
  assert.equal(report.conversation.sinkCancellation.lastReason, "manual");
  assert.deepEqual(report.conversation.echoGuard, { policy: "computer-speaker-echo-guard-v1", active: false, phase: "listening", uplinkAllowed: true, counters: { echoGuardDroppedChunks: 0, ignoredAsrDuringPlayback: 0, playbackDrainTimeouts: 0, teardownTimeouts: 0 } });
  assert.doesNotMatch(JSON.stringify(report), /private user|private assistant|privatePhase|privateReason/);
});
