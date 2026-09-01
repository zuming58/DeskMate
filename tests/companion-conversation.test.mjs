import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const { PrestartFallbackCompanionAudioSource, SimulatedCompanionAudioSink, SimulatedCompanionAudioSource } = require("../electron/companion-audio.cjs");
const { CompanionConversationController } = require("../electron/companion-conversation.cjs");
const { CompanionMemoryStore } = require("../electron/companion-memory.cjs");
const { claimOutboxEvents, completeOutboxEvent, createOutboxState, enqueueOutboxEvent, recoverOutbox } = require("../electron/companion-memory-outbox.cjs");
const { COMPRESSION, FLAGS, MAX_FRAME_BYTES, decodeFrame, encodeFrame, encodeJsonEvent, EVENTS, MESSAGE_TYPES, SERIALIZATION } = require("../electron/doubao-realtime-codec.cjs");
const { DOUBAO_PROTOCOL_APP_KEY, STRICT_HALF_DUPLEX_INPUT_MODE, DoubaoRealtimeSession, dialogErrorStatusClass, protocolErrorReason, providerFailureBucket, translateFrame } = require("../electron/doubao-realtime.cjs");
const { acceptsForegroundSessionEvent, emergencyStopForegroundSession, finishForegroundSession, initialForegroundSession, startForegroundSession } = require("../electron/foreground-session.cjs");

function turn(eventId, text = "你好") {
  return { eventId, sessionId: "session-1", kind: "conversation.turn_final", createdAt: "2026-08-31T10:00:00.000Z", payload: { role: "user", text } };
}

test("foreground session arbitration replaces companion with dictation and ignores stale completion", () => {
  let model = startForegroundSession(initialForegroundSession(), { mode: "companion", sessionId: "companion-1" });
  assert.equal(model.state.active.mode, "companion");
  const old = model.state.active;
  model = startForegroundSession(model.state, { mode: "dictation", sessionId: "dictation-1" });
  assert.deepEqual(model.facts.map((item) => item.type), ["stopping", "released", "acquired"]);
  assert.equal(acceptsForegroundSessionEvent(model.state, old), false);
  assert.equal(finishForegroundSession(model.state, old).facts[0].type, "ignored_stale");
  const stopped = emergencyStopForegroundSession(model.state);
  assert.equal(stopped.state.active, null);
});

test("memory outbox is FIFO, idempotent, collision-safe and recoverable", () => {
  let state = createOutboxState();
  const first = enqueueOutboxEvent(state, turn("turn-1"));
  state = first.state;
  assert.equal(enqueueOutboxEvent(state, turn("turn-1")).inserted, false);
  assert.throws(() => enqueueOutboxEvent(state, turn("turn-1", "冲突正文")), /memory-event-id-collision/);
  state = enqueueOutboxEvent(state, turn("turn-2", "第二轮")).state;
  let claimed = claimOutboxEvents(state, { workerId: "worker-1", claimedAt: "2026-08-31T10:01:00.000Z", limit: 2 });
  assert.deepEqual(claimed.entries.map((entry) => entry.eventId), ["turn-1", "turn-2"]);
  state = completeOutboxEvent(claimed.state, { eventId: "turn-1", workerId: "worker-1", completedAt: "2026-08-31T10:02:00.000Z" }).state;
  const recovered = recoverOutbox(state);
  assert.equal(recovered.recovered, 1);
  assert.equal(recovered.state.entries.find((entry) => entry.eventId === "turn-2").status, "pending");
});

test("SQLite turn commit is transactional and exactly-once by source event id", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-t11-memory-"));
  try {
    const store = new CompanionMemoryStore({ userDataPath: directory, now: () => 42 });
    const value = { eventId: "conversation-1:user:1", sessionId: "conversation-1", role: "user", content: "记住这一轮", createdAt: "2026-08-31T10:03:00.000Z" };
    assert.equal(store.commitConversationTurn(value).inserted, true);
    assert.equal(store.commitConversationTurn(value).inserted, false);
    assert.equal(store.status().turns, 1);
    assert.throws(() => store.commitConversationTurn({ ...value, content: "冲突内容" }), /memory-event-id-collision/);
    assert.equal(store.db.prepare("SELECT status FROM companion_memory_outbox WHERE event_id=?").get(value.eventId).status, "completed");
    store.close();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Doubao codec matches the official StartConnection and StartSession golden vectors", () => {
  const frame = encodeJsonEvent(EVENTS.START_CONNECTION, {});
  const officialStartConnection = Buffer.from([17, 20, 16, 0, 0, 0, 0, 1, 0, 0, 0, 2, 123, 125]);
  assert.deepEqual(frame, officialStartConnection);
  assert.deepEqual(decodeFrame(frame).payloadJson, {});
  const officialStartSession = Buffer.from([17, 20, 16, 0, 0, 0, 0, 100, 0, 0, 0, 36, 55, 53, 97, 54, 49, 50, 54, 101, 45, 52, 50, 55, 102, 45, 52, 57, 97, 49, 45, 97, 50, 99, 49, 45, 54, 50, 49, 49, 52, 51, 99, 98, 57, 100, 98, 51, 0, 0, 0, 60, 123, 34, 100, 105, 97, 108, 111, 103, 34, 58, 123, 34, 98, 111, 116, 95, 110, 97, 109, 101, 34, 58, 34, 232, 177, 134, 229, 140, 133, 34, 44, 34, 100, 105, 97, 108, 111, 103, 95, 105, 100, 34, 58, 34, 34, 44, 34, 101, 120, 116, 114, 97, 34, 58, 110, 117, 108, 108, 125, 125]);
  const decoded = decodeFrame(officialStartSession);
  assert.equal(decoded.event, EVENTS.START_SESSION);
  assert.equal(decoded.sessionId, "75a6126e-427f-49a1-a2c1-621143cb9db3");
  assert.deepEqual(decoded.payloadJson, { dialog: { bot_name: "豆包", dialog_id: "", extra: null } });
  assert.deepEqual(encodeJsonEvent(EVENTS.START_SESSION, decoded.payloadJson, decoded.sessionId), officialStartSession);
});

test("Doubao codec accepts every documented flag layout, identifiers, gzip and fail-closed errors", () => {
  for (const flags of [FLAGS.NO_SEQUENCE, FLAGS.LAST_WITHOUT_SEQUENCE]) {
    const decoded = decodeFrame(encodeFrame({ messageType: MESSAGE_TYPES.FULL_SERVER_RESPONSE, flags, serialization: SERIALIZATION.JSON, payload: Buffer.from("{}") }));
    assert.equal(decoded.flags, flags);
    assert.equal(decoded.terminal, flags === FLAGS.LAST_WITHOUT_SEQUENCE);
  }
  for (const [flags, sequence] of [[FLAGS.POSITIVE_SEQUENCE, 7], [FLAGS.LAST_WITH_NEGATIVE_SEQUENCE, -7]]) {
    const decoded = decodeFrame(encodeFrame({ messageType: MESSAGE_TYPES.FULL_SERVER_RESPONSE, flags, sequence, serialization: SERIALIZATION.JSON, payload: Buffer.from("{}") }));
    assert.equal(decoded.sequence, sequence);
  }
  const connected = decodeFrame(encodeFrame({ messageType: MESSAGE_TYPES.FULL_SERVER_RESPONSE, event: 50, connectId: "connect-1", serialization: SERIALIZATION.JSON, payload: Buffer.from("{}") }));
  assert.equal(connected.connectId, "connect-1");
  const response = encodeFrame({ messageType: MESSAGE_TYPES.FULL_SERVER_RESPONSE, event: 451, sessionId: "s1", serialization: SERIALIZATION.JSON, payload: Buffer.from('{"results":[{"text":"你好","is_interim":false}]}') });
  const translated = translateFrame(decodeFrame(response), { replyText: "" });
  assert.deepEqual(translated, { type: "asr.final", text: "你好" });
  const gzipFrame = encodeFrame({ messageType: MESSAGE_TYPES.FULL_SERVER_RESPONSE, event: 150, sessionId: "s1", serialization: SERIALIZATION.JSON, compression: COMPRESSION.GZIP, payload: gzipSync(Buffer.from("{}")) });
  assert.deepEqual(decodeFrame(gzipFrame).payloadJson, {});
  const errorFrame = encodeFrame({ messageType: MESSAGE_TYPES.ERROR, flags: FLAGS.NO_SEQUENCE, code: 45000001, serialization: SERIALIZATION.JSON, payload: Buffer.from('{"message":"private provider content"}') });
  assert.deepEqual(translateFrame(decodeFrame(errorFrame), { replyText: "" }), {
    type: "error",
    message: "doubao-service-error",
    diagnostic: { providerEvent: "error-frame", terminalEvent: "error-frame", failureBucket: "request-invalid" },
  });
  assert.doesNotMatch(JSON.stringify(translateFrame(decodeFrame(errorFrame), { replyText: "" })), /private provider content/);
  assert.deepEqual([
    providerFailureBucket(45000001), providerFailureBucket(45000002), providerFailureBucket(45000151),
    providerFailureBucket(52000042), providerFailureBucket(55000031), providerFailureBucket(55000999), providerFailureBucket(123), providerFailureBucket("private"),
  ], ["request-invalid", "empty-audio", "audio-format-invalid", "audio-idle-timeout", "server-busy", "server-internal", "unknown-provider-error", "unknown-provider-error"]);
  assert.deepEqual([
    dialogErrorStatusClass(undefined), dialogErrorStatusClass(""), dialogErrorStatusClass({ private: true }),
    dialogErrorStatusClass("45000002"), dialogErrorStatusClass(52000042), dialogErrorStatusClass(55000031), dialogErrorStatusClass(123),
  ], ["missing", "missing", "invalid", "empty-audio", "audio-idle-timeout", "server-busy", "unknown-provider-error"]);
  const malformed = Buffer.from(encodeJsonEvent(EVENTS.START_CONNECTION, {}));
  malformed.writeInt32BE(999, 8);
  assert.throws(() => decodeFrame(malformed), /doubao-(connect-id|payload-size)-invalid/);
  assert.throws(() => decodeFrame(Buffer.alloc(7)), /doubao-frame-size-invalid/);
  const invalidGzip = encodeFrame({ messageType: MESSAGE_TYPES.FULL_SERVER_RESPONSE, flags: FLAGS.NO_SEQUENCE, serialization: SERIALIZATION.JSON, compression: COMPRESSION.GZIP, payload: Buffer.from("not-gzip") });
  assert.throws(() => decodeFrame(invalidGzip), /doubao-gzip-invalid/);
  const gzipBomb = encodeFrame({ messageType: MESSAGE_TYPES.FULL_SERVER_RESPONSE, flags: FLAGS.NO_SEQUENCE, serialization: SERIALIZATION.RAW, compression: COMPRESSION.GZIP, payload: gzipSync(Buffer.alloc(MAX_FRAME_BYTES + 1)) });
  assert.throws(() => decodeFrame(gzipBomb), /doubao-gzip-invalid/);
  assert.equal(protocolErrorReason(new Error("doubao-gzip-invalid")), "doubao-frame-compression-invalid");
  assert.equal(protocolErrorReason(new Error("private provider sentence")), "doubao-frame-layout-invalid");
});

test("Doubao adapter performs the binary handshake and bounds PCM chunks", async () => {
  class FakeSocket extends EventEmitter {
    static OPEN = 1;
    constructor(endpoint, options) { super(); this.endpoint = endpoint; this.options = options; this.readyState = 1; this.frames = []; queueMicrotask(() => this.emit("open")); }
    send(value) {
      const frame = decodeFrame(value);
      this.frames.push(frame);
      if (frame.event === EVENTS.START_CONNECTION) queueMicrotask(() => this.emit("message", encodeFrame({ messageType: MESSAGE_TYPES.FULL_SERVER_RESPONSE, event: 50, connectId: "connect-1", serialization: SERIALIZATION.JSON, payload: Buffer.from("{}") })));
      if (frame.event === EVENTS.START_SESSION) queueMicrotask(() => this.emit("message", encodeFrame({ messageType: MESSAGE_TYPES.FULL_SERVER_RESPONSE, event: 150, sessionId: frame.sessionId, serialization: SERIALIZATION.JSON, payload: Buffer.from("{}") })));
    }
    close() { this.readyState = 3; this.emit("close"); }
  }
  let socket;
  const WebSocketImpl = class extends FakeSocket { constructor(...args) { super(...args); socket = this; } static OPEN = 1; };
  const session = new DoubaoRealtimeSession({ config: { endpoint: "wss://openspeech.bytedance.com/api/v3/realtime/dialogue", appId: "app", accessKey: "access", appKey: "wrong-user-value", resourceId: "resource", model: "model", voice: "voice" }, WebSocketImpl });
  assert.equal((await session.connect()).ok, true);
  assert.equal(socket.options.headers["X-Api-Access-Key"], "access");
  assert.equal(socket.options.headers["X-Api-App-Key"], DOUBAO_PROTOCOL_APP_KEY);
  assert.deepEqual(socket.frames.slice(0, 2).map((frame) => frame.event), [EVENTS.START_CONNECTION, EVENTS.START_SESSION]);
  assert.equal(STRICT_HALF_DUPLEX_INPUT_MODE, "keep_alive");
  assert.deepEqual(socket.frames[1].payloadJson.asr, { extra: { end_smooth_window_ms: 5000 } });
  assert.equal(socket.frames[1].payloadJson.dialog.extra.input_mod, "keep_alive");
  assert.equal(session.sendAudio(Buffer.from([1, 2, 3])), true);
  assert.equal(socket.frames.at(-1).event, EVENTS.AUDIO_TASK_REQUEST);
  assert.equal(session.sendAudio(Buffer.alloc(64 * 1024 + 1)), false);
  session.close();
});

test("Doubao adapter fails closed on an HTTP handshake rejection without reading its body", async () => {
  let resumed = 0;
  class RejectedSocket extends EventEmitter {
    static OPEN = 1;
    constructor() {
      super();
      this.readyState = 0;
      queueMicrotask(() => this.emit("unexpected-response", {}, { resume: () => { resumed += 1; } }));
    }
    terminate() { this.readyState = 3; }
  }
  const events = [];
  const session = new DoubaoRealtimeSession({ config: { appId: "app", accessKey: "access", resourceId: "resource", model: "model", voice: "voice" }, WebSocketImpl: RejectedSocket, onEvent: (event) => events.push(event) });
  await assert.rejects(() => session.connect(), /doubao-handshake-rejected/);
  assert.equal(resumed, 1);
  assert.deepEqual(events, [{
    type: "error",
    message: "doubao-handshake-rejected",
    diagnostic: { providerEvent: "transport-error", terminalEvent: "transport-error", failureBucket: "unknown-provider-error" },
  }]);
});

test("Doubao settings identify the protocol App Key as fixed and expose redacted failure copy", () => {
  const pages = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");
  assert.match(pages, /App Key（协议固定）/);
  assert.match(pages, /doubao-frame-compression-invalid/);
  assert.doesNotMatch(pages, /App Key（可选）/);
});

class FakeProvider {
  constructor(onEvent, connectResult = { ok: true }) { this.onEvent = onEvent; this.connectResult = connectResult; this.audio = []; this.closed = false; this.interruptions = 0; }
  async connect() { if (this.connectResult instanceof Error) throw this.connectResult; return this.connectResult; }
  sendAudio(value) { this.audio.push(Buffer.from(value)); return true; }
  interrupt() { this.interruptions += 1; }
  close() { this.closed = true; }
  emit(value) { this.onEvent(value); }
}

test("continuous companion session persists final turns before UI completion and owns state until stopped", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  const events = [];
  const commits = [];
  const states = [];
  let provider;
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)),
    audioSource: source,
    audioSink: sink,
    commitTurn: async (value) => { commits.push(value); },
    publishState: async (value) => { states.push(value.state); return { ok: true }; },
    onEvent: (value) => events.push(value),
    wait: async () => {},
  });
  assert.equal((await controller.start({ sessionId: "conversation-1", generation: 7 })).ok, true);
  assert.equal((await controller.start({ sessionId: "duplicate", generation: 8 })).reason, "companion-session-active");
  assert.equal(source.push(Buffer.from([1, 2, 3])), true);
  assert.deepEqual([...provider.audio[0]], [1, 2, 3]);
  provider.emit({ type: "asr.partial", text: "你" });
  provider.emit({ type: "asr.final", text: "你好" });
  provider.emit({ type: "chat.partial", text: "你", fullText: "你" });
  provider.emit({ type: "chat.final", text: "你好呀" });
  provider.emit({ type: "tts.start" });
  provider.emit({ type: "audio", audio: Buffer.from([9, 8]) });
  provider.emit({ type: "tts.end" });
  await controller.eventChain;
  assert.deepEqual(commits.map((item) => [item.role, item.content]), [["user", "你好"], ["assistant", "你好呀"]]);
  assert.ok(events.findIndex((item) => item.type === "turn.user-final") > events.findIndex((item) => item.type === "transcript.partial"));
  assert.deepEqual(states, ["waiting", "listening", "thinking", "working", "listening"]);
  assert.equal(controller.snapshot().active, true);
  const staleProvider = provider;
  await controller.stop("escape");
  staleProvider.emit({ type: "asr.final", text: "迟到内容" });
  await controller.eventChain;
  assert.equal(commits.length, 2);
  assert.equal(controller.snapshot().state, "idle");
});

test("provider connection uses bounded retries and never replays audio after failure", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  const delays = [];
  let attempts = 0;
  const providers = [];
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => {
      attempts += 1;
      const provider = new FakeProvider(onEvent, attempts < 3 ? new Error("offline") : { ok: true });
      providers.push(provider);
      return provider;
    },
    audioSource: source,
    audioSink: sink,
    wait: async (value) => { delays.push(value); },
    retryDelaysMs: [0, 25, 75],
  });
  assert.equal((await controller.start({ sessionId: "conversation-retry", generation: 1 })).ok, true);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [25, 75]);
  assert.equal(providers[0].closed, true);
  assert.equal(providers[1].closed, true);
  assert.equal(providers[2].audio.length, 0);
  await controller.stop();
});

test("runtime connection loss reconnects without replaying stale audio", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  const providers = [];
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => {
      const provider = new FakeProvider(onEvent);
      providers.push(provider);
      return provider;
    },
    audioSource: source,
    audioSink: sink,
    wait: async () => {},
  });
  assert.equal((await controller.start({ sessionId: "conversation-runtime-reconnect", generation: 3 })).ok, true);
  assert.equal(source.push(Buffer.from([4, 5, 6])), true);
  assert.equal(providers[0].audio.length, 1);
  providers[0].emit({ type: "connection.closed" });
  await controller.eventChain;
  await new Promise((resolve) => setImmediate(resolve));
  if (controller.reconnecting) await controller.reconnecting;
  assert.equal(providers.length, 2);
  assert.equal(providers[0].closed, true);
  assert.equal(providers[1].audio.length, 0);
  assert.equal(controller.snapshot().state, "listening");
  await controller.stop();
});

test("a reconnect await boundary cannot publish a post-stop state", async () => {
  let releaseReconnectStop;
  let stopCalls = 0;
  const source = {
    status: () => ({ available: true }),
    start: async () => ({ ok: true }),
    stop: () => {
      stopCalls += 1;
      if (stopCalls === 1) return new Promise((resolve) => { releaseReconnectStop = resolve; });
      return Promise.resolve({ ok: true });
    },
  };
  const sink = new SimulatedCompanionAudioSink();
  const providers = [];
  const states = [];
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => { const provider = new FakeProvider(onEvent); providers.push(provider); return provider; },
    audioSource: source,
    audioSink: sink,
    onEvent: (event) => { if (event.type === "state") states.push(event.state); },
    wait: async () => {},
  });
  await controller.start({ sessionId: "reconnect-stop-race", generation: 1 });
  providers[0].emit({ type: "connection.closed" });
  await controller.eventChain;
  await new Promise((resolve) => setImmediate(resolve));
  await controller.stop("user");
  releaseReconnectStop({ ok: true });
  if (controller.reconnecting) await controller.reconnecting;
  assert.equal(controller.snapshot().state, "idle");
  assert.deepEqual(states.slice(-2), ["stopping", "idle"]);
  assert.equal(providers.length, 1);
});

test("transport errors use the same finite reconnect path while provider errors fail closed", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  const providers = [];
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => { const provider = new FakeProvider(onEvent); providers.push(provider); return provider; },
    audioSource: source,
    audioSink: sink,
    wait: async () => {},
  });
  await controller.start({ sessionId: "transport-error", generation: 4 });
  providers[0].emit({ type: "error", message: "doubao-connection-error" });
  await controller.eventChain;
  await new Promise((resolve) => setImmediate(resolve));
  if (controller.reconnecting) await controller.reconnecting;
  assert.equal(providers.length, 2);
  assert.equal(controller.snapshot().state, "listening");
  assert.equal(controller.snapshot().providerLifecycle.transportErrors, 1);
  assert.equal(controller.snapshot().providerLifecycle.reconnects, 1);
  assert.equal(controller.snapshot().providerLifecycle.lastTerminalEvent, "transport-error");
  providers[1].emit({ type: "error", message: "provider leaked a private sentence" });
  await controller.eventChain;
  assert.equal(controller.snapshot().state, "error");
  assert.equal(controller.snapshot().error, "companion-session-failed");
  assert.equal(controller.snapshot().providerLifecycle.lastTerminalEvent, "provider-error");
  assert.equal(controller.snapshot().providerLifecycle.lastFailureBucket, "unknown-provider-error");
});

test("EasyInput source can fall back only before start and stays locked afterward", async () => {
  const primary = { status: () => ({ available: false, reason: "easyinput-audio-heartbeat-timeout" }), start: async () => ({ ok: false }), stop: async () => ({ ok: true }) };
  const computer = new SimulatedCompanionAudioSource();
  const selections = [];
  const source = new PrestartFallbackCompanionAudioSource({ primary, fallback: computer, onSelection: (value) => selections.push(value) });
  let runtimeError = "";
  const result = await source.start({ onError: (error) => { runtimeError = error.message; } });
  assert.equal(result.ok, true);
  assert.equal(result.fallback.reason, "easyinput-audio-heartbeat-timeout");
  assert.equal(source.status().activeSource, "computer");
  computer.fail("computer-microphone-disconnected");
  assert.equal(runtimeError, "computer-microphone-disconnected");
  assert.equal(selections.length, 1);
  await source.stop();
});

test("the conversation controller enters the pre-start fallback instead of rejecting an unavailable preferred source", async () => {
  const primary = { status: () => ({ available: false, reason: "easyinput-audio-heartbeat-timeout" }), start: async () => ({ ok: false }), stop: async () => ({ ok: true }) };
  const computer = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  const source = new PrestartFallbackCompanionAudioSource({ primary, fallback: computer });
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => new FakeProvider(onEvent),
    audioSource: source,
    audioSink: sink,
    wait: async () => {},
  });
  controller.configureAudio({ audioSource: source, audioSink: sink, selection: { requestedSource: "easyinput", activeSource: "" } });
  const result = await controller.start({ sessionId: "fallback-controller", generation: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.status.audioSelection.activeSource, "computer");
  assert.equal(result.status.audioSelection.fallback.reason, "easyinput-audio-heartbeat-timeout");
  await controller.stop();
});

test("an active EasyInput source failure ends the session instead of switching to computer audio", async () => {
  let primaryHandlers;
  let fallbackStarts = 0;
  const primary = {
    status: () => ({ available: true, kind: "easyinput-lan" }),
    start: async (handlers) => { primaryHandlers = handlers; return { ok: true }; },
    stop: async () => ({ ok: true }),
  };
  const fallback = {
    status: () => ({ available: true, kind: "computer" }),
    start: async () => { fallbackStarts += 1; return { ok: true }; },
    stop: async () => ({ ok: true }),
  };
  const sink = new SimulatedCompanionAudioSink();
  const source = new PrestartFallbackCompanionAudioSource({ primary, fallback });
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => new FakeProvider(onEvent),
    audioSource: source,
    audioSink: sink,
    wait: async () => {},
  });
  controller.configureAudio({ audioSource: source, audioSink: sink, selection: { requestedSource: "easyinput", activeSource: "easyinput" } });
  assert.equal((await controller.start({ sessionId: "easyinput-runtime-failure", generation: 1 })).ok, true);
  assert.equal(controller.snapshot().audioSelection.activeSource, "easyinput");
  primaryHandlers.onError(new Error("easyinput-audio-heartbeat-timeout"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.snapshot().state, "error");
  assert.equal(controller.snapshot().error, "easyinput-audio-heartbeat-timeout");
  assert.equal(fallbackStarts, 0);
});

test("manual response interruption clears playback and ignores late response frames until tts end", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  let provider;
  const states = [];
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)),
    audioSource: source,
    audioSink: sink,
    publishState: async ({ state }) => { states.push(state); return { ok: true }; },
    wait: async () => {},
  });
  assert.equal(controller.configureAudio({ audioSource: source, audioSink: sink, selection: { requestedSource: "computer", activeSource: "computer" } }).ok, true);
  await controller.start({ sessionId: "interrupt-session", generation: 2 });
  provider.emit({ type: "tts.start" });
  provider.emit({ type: "audio", audio: Buffer.from([1, 2]) });
  await controller.eventChain;
  assert.equal(sink.chunks.length, 1);
  assert.equal(source.push(Buffer.from([7, 8])), true);
  assert.equal(provider.audio.length, 0);
  assert.equal(controller.snapshot().echoGuard.active, true);
  assert.equal(controller.snapshot().echoGuard.counters.echoGuardDroppedChunks, 1);
  assert.equal((await controller.interrupt("user")).ok, true);
  assert.equal(provider.interruptions, 1);
  assert.equal(source.push(Buffer.from([9, 10])), true);
  assert.deepEqual([...provider.audio[0]], [9, 10]);
  provider.emit({ type: "audio", audio: Buffer.from([3, 4]) });
  provider.emit({ type: "chat.final", text: "迟到回复" });
  provider.emit({ type: "tts.end" });
  await controller.eventChain;
  assert.equal(sink.chunks.length, 0);
  assert.equal(controller.snapshot().state, "listening");
  assert.equal(states.at(-1), "listening");
  await controller.stop();
});

test("manual interrupt while speaker write is backpressured is a normal cancellation", async () => {
  const source = new SimulatedCompanionAudioSource();
  let rejectWrite;
  const sink = {
    status: () => ({ available: true, active: true }), start: async () => ({ ok: true }),
    write: () => new Promise((_resolve, reject) => { rejectWrite = reject; }),
    drain: async () => ({ ok: true }),
    interrupt: async () => { rejectWrite?.(new Error("computer-audio-playback-interrupted")); return { ok: true }; },
    stop: async () => ({ ok: true }),
  };
  let provider;
  const controller = new CompanionConversationController({ providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)), audioSource: source, audioSink: sink, wait: async () => {} });
  controller.configureAudio({ audioSource: source, audioSink: sink, selection: { requestedSource: "computer", activeSource: "computer" } });
  await controller.start({ sessionId: "backpressure-interrupt", generation: 1 });
  provider.emit({ type: "audio", audio: Buffer.from([1, 2]) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await controller.interrupt("user")).ok, true);
  await controller.eventChain;
  assert.equal(controller.snapshot().state, "listening");
  assert.equal(controller.snapshot().error, "");
  await controller.stop();
});

test("stop while speaker write is backpressured reaches idle without converting cancellation to error", async () => {
  const source = new SimulatedCompanionAudioSource();
  let rejectWrite;
  const sink = {
    status: () => ({ available: true, active: true }), start: async () => ({ ok: true }),
    write: () => new Promise((_resolve, reject) => { rejectWrite = reject; }),
    drain: async () => ({ ok: true }),
    interrupt: async () => { rejectWrite?.(new Error("computer-audio-playback-interrupted")); return { ok: true }; },
    stop: async () => ({ ok: true }),
  };
  let provider;
  const controller = new CompanionConversationController({ providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)), audioSource: source, audioSink: sink, wait: async () => {} });
  controller.configureAudio({ audioSource: source, audioSink: sink, selection: { requestedSource: "computer", activeSource: "computer" } });
  await controller.start({ sessionId: "backpressure-stop", generation: 1 });
  provider.emit({ type: "audio", audio: Buffer.from([1, 2]) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await controller.stop("user")).ok, true);
  await controller.eventChain;
  assert.equal(controller.snapshot().state, "idle");
  assert.equal(controller.snapshot().error, "");
});

test("computer-speaker playback ignores reflected ASR and resumes uplink after tts end", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  const commits = [];
  const transcripts = [];
  let provider;
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)),
    audioSource: source,
    audioSink: sink,
    commitTurn: async (turn) => { commits.push(turn); },
    onEvent: (event) => { if (event.type === "transcript.partial") transcripts.push(event.text); },
    wait: async () => {},
  });
  assert.equal(controller.configureAudio({ audioSource: source, audioSink: sink, selection: { requestedSource: "computer", activeSource: "computer" } }).ok, true);
  await controller.start({ sessionId: "spoken-interrupt", generation: 1 });
  assert.equal(source.push(Buffer.from([5, 6])), true);
  assert.equal(provider.audio.length, 1);
  provider.emit({ type: "tts.start" });
  provider.emit({ type: "audio", audio: Buffer.from([1, 2]) });
  await controller.eventChain;
  assert.equal(source.push(Buffer.from([7, 8])), true);
  provider.emit({ type: "asr.partial", text: "扬声器回灌片段" });
  provider.emit({ type: "asr.final", text: "扬声器回灌终句" });
  await controller.eventChain;
  assert.equal(controller.snapshot().state, "speaking");
  assert.equal(provider.audio.length, 1);
  assert.equal(provider.interruptions, 0);
  assert.deepEqual(commits, []);
  assert.deepEqual(transcripts, []);
  assert.deepEqual(controller.snapshot().echoGuard.counters, { echoGuardDroppedChunks: 1, ignoredAsrDuringPlayback: 2, playbackDrainTimeouts: 0, teardownTimeouts: 0 });
  provider.emit({ type: "tts.end" });
  await controller.eventChain;
  assert.equal(controller.snapshot().state, "listening");
  assert.equal(controller.snapshot().echoGuard.active, false);
  assert.equal(source.push(Buffer.from([9, 10])), true);
  assert.equal(provider.audio.length, 2);
  await controller.stop();
});

test("tts end keeps working and suppresses uplink until the computer speaker has drained", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  let releaseDrain;
  sink.drain = () => new Promise((resolve) => { releaseDrain = resolve; });
  const commits = [];
  let provider;
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)),
    audioSource: source,
    audioSink: sink,
    commitTurn: async (turn) => commits.push(turn),
    wait: async () => {},
  });
  controller.configureAudio({ audioSource: source, audioSink: sink, selection: { requestedSource: "computer", activeSource: "computer" } });
  await controller.start({ sessionId: "drain-gate", generation: 1 });
  provider.emit({ type: "tts.start" });
  provider.emit({ type: "audio", audio: Buffer.from([1, 2]) });
  provider.emit({ type: "tts.end" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.snapshot().state, "speaking");
  assert.equal(source.push(Buffer.from([3, 4])), true);
  assert.equal(provider.audio.length, 0);
  provider.emit({ type: "asr.final", text: "synthetic-echo" });
  releaseDrain({ ok: true });
  await controller.eventChain;
  assert.equal(controller.snapshot().state, "listening");
  assert.deepEqual(commits, []);
  assert.equal(controller.snapshot().echoGuard.counters.ignoredAsrDuringPlayback, 1);
  assert.equal(source.push(Buffer.from([5, 6])), true);
  assert.equal(provider.audio.length, 1);
  await controller.stop();
});

test("speaker drain timeout clears playback and fails soft back to listening", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  sink.drain = () => new Promise(() => {});
  let provider;
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)),
    audioSource: source,
    audioSink: sink,
    wait: async () => {},
    drainTimeoutMs: 5,
    teardownStepTimeoutMs: 5,
  });
  controller.configureAudio({ audioSource: source, audioSink: sink, selection: { requestedSource: "computer", activeSource: "computer" } });
  await controller.start({ sessionId: "drain-timeout", generation: 1 });
  provider.emit({ type: "tts.start" });
  provider.emit({ type: "tts.end" });
  await controller.eventChain;
  assert.equal(controller.snapshot().state, "listening");
  assert.equal(sink.interruptions, 1);
  assert.equal(controller.snapshot().echoGuard.counters.playbackDrainTimeouts, 1);
  await controller.stop();
});

test("manual interruption during playback drain releases the current turn exactly once", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  let releaseDrain;
  sink.drain = () => new Promise((resolve) => { releaseDrain = resolve; });
  let provider;
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)),
    audioSource: source,
    audioSink: sink,
    wait: async () => {},
  });
  controller.configureAudio({ audioSource: source, audioSink: sink, selection: { requestedSource: "computer", activeSource: "computer" } });
  await controller.start({ sessionId: "interrupt-during-drain", generation: 1 });
  provider.emit({ type: "tts.start" });
  provider.emit({ type: "tts.end" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await controller.interrupt("user")).ok, true);
  releaseDrain({ ok: true });
  await controller.eventChain;
  assert.equal(controller.snapshot().state, "listening");
  assert.equal(source.push(Buffer.from([1, 2])), true);
  assert.equal(provider.audio.length, 1);
  await controller.stop();
});

test("stop is idempotent and reaches idle when every teardown dependency hangs", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  const events = [];
  let provider;
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => {
      provider = new FakeProvider(onEvent);
      provider.close = () => new Promise(() => {});
      return provider;
    },
    audioSource: source,
    audioSink: sink,
    onEvent: (event) => events.push(event),
    wait: async () => {},
    teardownStepTimeoutMs: 5,
  });
  await controller.start({ sessionId: "bounded-stop", generation: 4 });
  source.stop = () => new Promise(() => {});
  sink.interrupt = () => new Promise(() => {});
  sink.stop = () => new Promise(() => {});
  const first = controller.stop("user");
  const repeated = controller.stop("user");
  assert.equal(first, repeated);
  assert.equal(controller.snapshot().state, "stopping");
  const result = await first;
  assert.equal(result.ok, true);
  assert.equal(controller.snapshot().state, "idle");
  assert.ok(controller.snapshot().echoGuard.counters.teardownTimeouts >= 3);
  provider.emit({ type: "asr.final", text: "late-event" });
  await controller.eventChain;
  assert.equal(controller.snapshot().state, "idle");
  assert.equal((await controller.stop("user")).alreadyStopped, true);
  assert.deepEqual(events.filter((event) => event.type === "state").slice(-2).map((event) => event.state), ["stopping", "idle"]);
});

test("the first real TTS audio frame enters working even if the provider omits tts start", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  const states = [];
  let provider;
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)),
    audioSource: source,
    audioSink: sink,
    publishState: async ({ state }) => { states.push(state); return { ok: true }; },
    wait: async () => {},
  });
  assert.equal(controller.configureAudio({ audioSource: source, audioSink: sink, selection: { requestedSource: "computer", activeSource: "computer" } }).ok, true);
  await controller.start({ sessionId: "audio-first", generation: 1 });
  provider.emit({ type: "audio", audio: Buffer.from([1, 2]) });
  await controller.eventChain;
  assert.equal(controller.snapshot().state, "speaking");
  assert.equal(controller.snapshot().echoGuard.active, true);
  assert.equal(states.at(-1), "working");
  await controller.stop();
});

test("synchronous arrival phase closes the event-chain race before tts start is handled", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  const commits = [];
  let provider;
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)),
    audioSource: source,
    audioSink: sink,
    commitTurn: async (turn) => commits.push(turn),
    wait: async () => {},
  });
  controller.configureAudio({ audioSource: source, audioSink: sink, selection: { requestedSource: "computer", activeSource: "computer" } });
  await controller.start({ sessionId: "arrival-race", generation: 1 });

  provider.emit({ type: "tts.start" });
  assert.equal(source.push(Buffer.from([1, 2])), true);
  provider.emit({ type: "asr.final", text: "reflected-provider-audio" });
  await controller.eventChain;

  assert.equal(controller.snapshot().state, "speaking");
  assert.equal(provider.audio.length, 0);
  assert.equal(provider.interruptions, 0);
  assert.equal(sink.interruptions, 0);
  assert.deepEqual(commits, []);
  assert.equal(controller.snapshot().turnLifecycle.asrFinalsSuppressed, 1);
  assert.equal(controller.snapshot().turnLifecycle.asrFinalArrivalPhases.speaking, 1);

  provider.emit({ type: "tts.end" });
  await controller.eventChain;
  await controller.stop();
});

test("thinking blocks uplink and late ASR without cancelling the provider or speaker", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  const commits = [];
  let provider;
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)),
    audioSource: source,
    audioSink: sink,
    commitTurn: async (turn) => commits.push(turn),
    wait: async () => {},
  });
  controller.configureAudio({ audioSource: source, audioSink: sink, selection: { requestedSource: "computer", activeSource: "computer" } });
  await controller.start({ sessionId: "thinking-gate", generation: 1 });

  provider.emit({ type: "asr.final", text: "real-user-turn" });
  assert.equal(source.push(Buffer.from([3, 4])), true);
  provider.emit({ type: "asr.final", text: "late-asr-copy" });
  provider.emit({ type: "chat.final", text: "one sentence is a complete provider answer" });
  provider.emit({ type: "tts.start" });
  provider.emit({ type: "audio", audio: Buffer.from([5, 6]) });
  provider.emit({ type: "tts.end" });
  await controller.eventChain;

  assert.deepEqual(commits.map((turn) => turn.content), ["real-user-turn", "one sentence is a complete provider answer"]);
  assert.equal(provider.audio.length, 0);
  assert.equal(provider.interruptions, 0);
  assert.equal(sink.interruptions, 0);
  const lifecycle = controller.snapshot().turnLifecycle;
  assert.equal(lifecycle.asrFinalsAccepted, 1);
  assert.equal(lifecycle.asrFinalsSuppressed, 1);
  assert.equal(lifecycle.asrFinalArrivalPhases.listening, 1);
  assert.equal(lifecycle.asrFinalArrivalPhases.thinking, 1);
  assert.equal(lifecycle.ttsTurnStarted, 1);
  assert.equal(lifecycle.ttsTurnCompleted, 1);
  assert.equal(lifecycle.ttsTurnAbandoned, 0);
  assert.equal(lifecycle.chatFinalTtsEndPairs, 1);
  assert.equal(lifecycle.lastTtsTurnOutcome, "completed");
  await controller.stop();
});

test("only explicit interruption abandons an open TTS turn", async () => {
  const source = new SimulatedCompanionAudioSource();
  const sink = new SimulatedCompanionAudioSink();
  let provider;
  const controller = new CompanionConversationController({
    providerFactory: ({ onEvent }) => (provider = new FakeProvider(onEvent)),
    audioSource: source,
    audioSink: sink,
    wait: async () => {},
  });
  controller.configureAudio({ audioSource: source, audioSink: sink, selection: { requestedSource: "computer", activeSource: "computer" } });
  await controller.start({ sessionId: "explicit-interrupt-only", generation: 1 });
  provider.emit({ type: "chat.final", text: "provider answer" });
  provider.emit({ type: "tts.start" });
  provider.emit({ type: "audio", audio: Buffer.from([7, 8]) });
  await controller.eventChain;

  assert.equal((await controller.interrupt("user")).ok, true);
  provider.emit({ type: "tts.end" });
  await controller.eventChain;
  const lifecycle = controller.snapshot().turnLifecycle;
  assert.equal(provider.interruptions, 1);
  assert.equal(lifecycle.ttsTurnStarted, 1);
  assert.equal(lifecycle.ttsTurnCompleted, 0);
  assert.equal(lifecycle.ttsTurnAbandoned, 1);
  assert.equal(lifecycle.lastTtsTurnOutcome, "manual");
  assert.equal(lifecycle.chatFinalTtsEndPairs, 1);
  await controller.stop();
});
