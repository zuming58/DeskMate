import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";

const require = createRequire(import.meta.url);
const { SimulatedCompanionAudioSink, SimulatedCompanionAudioSource } = require("../electron/companion-audio.cjs");
const { CompanionConversationController } = require("../electron/companion-conversation.cjs");
const { CompanionMemoryStore } = require("../electron/companion-memory.cjs");
const { claimOutboxEvents, completeOutboxEvent, createOutboxState, enqueueOutboxEvent, recoverOutbox } = require("../electron/companion-memory-outbox.cjs");
const { decodeFrame, encodeFrame, encodeJsonEvent, EVENTS, MESSAGE_TYPES, SERIALIZATION } = require("../electron/doubao-realtime-codec.cjs");
const { DoubaoRealtimeSession, translateFrame } = require("../electron/doubao-realtime.cjs");
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

test("Doubao binary codec has a stable golden vector and rejects malformed frames", () => {
  const frame = encodeJsonEvent(EVENTS.START_CONNECTION, {});
  assert.equal(frame.toString("hex"), "1114100000000001000000027b7d");
  assert.deepEqual(decodeFrame(frame).payloadJson, {});
  const response = encodeFrame({ messageType: MESSAGE_TYPES.FULL_SERVER_RESPONSE, event: 451, sessionId: "s1", serialization: SERIALIZATION.JSON, payload: Buffer.from('{"results":[{"text":"你好","is_interim":false}]}') });
  const translated = translateFrame(decodeFrame(response), { replyText: "" });
  assert.deepEqual(translated, { type: "asr.final", text: "你好" });
  const errorFrame = encodeFrame({ messageType: MESSAGE_TYPES.ERROR, flags: 0, code: 45000001, serialization: SERIALIZATION.JSON, payload: Buffer.from('{"message":"denied"}') });
  assert.deepEqual(translateFrame(decodeFrame(errorFrame), { replyText: "" }), { type: "error", code: 45000001, message: "denied" });
  const malformed = Buffer.from(frame);
  malformed.writeInt32BE(999, 8);
  assert.throws(() => decodeFrame(malformed), /doubao-payload-size-invalid/);
  assert.throws(() => decodeFrame(Buffer.alloc(7)), /doubao-frame-size-invalid/);
});

test("Doubao adapter performs the binary handshake and bounds PCM chunks", async () => {
  class FakeSocket extends EventEmitter {
    static OPEN = 1;
    constructor(endpoint, options) { super(); this.endpoint = endpoint; this.options = options; this.readyState = 1; this.frames = []; queueMicrotask(() => this.emit("open")); }
    send(value) {
      const frame = decodeFrame(value);
      this.frames.push(frame);
      if (frame.event === EVENTS.START_SESSION) queueMicrotask(() => this.emit("message", encodeFrame({ messageType: MESSAGE_TYPES.FULL_SERVER_RESPONSE, event: 150, sessionId: frame.sessionId, serialization: SERIALIZATION.JSON, payload: Buffer.from("{}") })));
    }
    close() { this.readyState = 3; this.emit("close"); }
  }
  let socket;
  const WebSocketImpl = class extends FakeSocket { constructor(...args) { super(...args); socket = this; } static OPEN = 1; };
  const session = new DoubaoRealtimeSession({ config: { endpoint: "wss://openspeech.bytedance.com/api/v3/realtime/dialogue", appId: "app", accessKey: "access", appKey: "key", resourceId: "resource", model: "model", voice: "voice" }, WebSocketImpl });
  assert.equal((await session.connect()).ok, true);
  assert.equal(socket.options.headers["X-Api-Access-Key"], "access");
  assert.deepEqual(socket.frames.slice(0, 2).map((frame) => frame.event), [EVENTS.START_CONNECTION, EVENTS.START_SESSION]);
  assert.equal(session.sendAudio(Buffer.from([1, 2, 3])), true);
  assert.equal(socket.frames.at(-1).event, EVENTS.AUDIO_TASK_REQUEST);
  assert.equal(session.sendAudio(Buffer.alloc(64 * 1024 + 1)), false);
  session.close();
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
  assert.deepEqual(states, ["waiting", "listening", "thinking", "working", "completed", "listening"]);
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
