import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createComputerCompanionAudioEngine } from "../src/domain/computerCompanionAudio.js";

const require = createRequire(import.meta.url);
const { ComputerCompanionAudioSession } = require("../electron/companion-computer-audio.cjs");

test("main-process computer audio bridge locks one session and rejects stale or oversized PCM", async () => {
  const commands = [];
  const chunks = [];
  let session;
  session = new ComputerCompanionAudioSession({
    sendCommand: (command) => {
      commands.push(command);
      if (command.type === "source.start") queueMicrotask(() => session.handleRendererEvent({ version: 1, type: "source.started", sessionId: command.sessionId, generation: command.generation }));
      if (command.type === "sink.start") queueMicrotask(() => session.handleRendererEvent({ version: 1, type: "sink.started", sessionId: command.sessionId, generation: command.generation }));
    },
  });
  session.setRendererReady(true);
  assert.deepEqual(session.prepare({ sessionId: "session-1", generation: 7, deviceId: "private-device-token" }), { ok: true });
  assert.equal((await session.sink.start()).ok, true);
  assert.equal((await session.source.start({ onAudio: (value) => chunks.push(Buffer.from(value)) })).ok, true);
  assert.equal(session.handleRendererEvent({ version: 1, type: "source.audio", sessionId: "stale", generation: 7, audio: Buffer.from([1, 2]) }).reason, "computer-audio-event-stale");
  assert.equal(session.handleRendererEvent({ version: 1, type: "source.audio", sessionId: "session-1", generation: 7, audio: Buffer.alloc(64 * 1024 + 1) }).reason, "computer-audio-chunk-invalid");
  assert.equal(session.handleRendererEvent({ version: 1, type: "source.audio", sessionId: "session-1", generation: 7, audio: Buffer.from([1, 2]) }).ok, true);
  assert.deepEqual([...chunks[0]], [1, 2]);
  assert.equal(await session.sink.write(Buffer.from([3, 4])), true);
  await session.sink.interrupt();
  await session.source.stop();
  await session.sink.stop();
  assert.ok(commands.some((item) => item.type === "sink.audio"));
  assert.ok(commands.some((item) => item.type === "sink.interrupt"));
  assert.deepEqual(session.diagnostics().counters, { sourceChunks: 1, sinkChunks: 1, rejectedEvents: 2, interruptions: 1, queueDrops: 0 });
});

test("renderer audio engine captures selected Windows input and plays bounded PCM without conversation state", async () => {
  const events = [];
  let processor;
  let stopped = false;
  let playbackStarts = 0;
  class FakeAudioContext {
    constructor() { this.sampleRate = 48000; this.currentTime = 1; this.destination = {}; }
    createMediaStreamSource() { return { connect() {} }; }
    createScriptProcessor() { processor = { connect() {}, disconnect() {}, onaudioprocess: null }; return processor; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    createBuffer(_channels, length, rate) { const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data }; }
    createBufferSource() { return { connect() {}, start() { playbackStarts += 1; }, stop() {}, onended: null, buffer: null }; }
    async resume() {}
    async close() {}
  }
  const bridge = { sendCompanionComputerAudioEvent: (value) => events.push(value) };
  const engine = createComputerCompanionAudioEngine({
    bridge,
    AudioContextClass: FakeAudioContext,
    mediaDevices: { getUserMedia: async (constraints) => {
      assert.deepEqual(constraints, { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, deviceId: { exact: "chosen-device" } } });
      return { getAudioTracks: () => [{ addEventListener() {}, stop() { stopped = true; } }], getTracks: () => [{ stop() { stopped = true; } }] };
    } },
  });
  const base = { version: 1, sessionId: "session-2", generation: 3 };
  await engine.handleCommand({ ...base, type: "sink.start" });
  await engine.handleCommand({ ...base, type: "source.start", deviceId: "chosen-device" });
  processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.25) } });
  await engine.handleCommand({ ...base, type: "sink.audio", audio: new Int16Array([1, -1, 2, -2]).buffer });
  await engine.handleCommand({ ...base, type: "sink.interrupt" });
  await engine.handleCommand({ ...base, type: "source.stop" });
  assert.ok(events.some((item) => item.type === "source.started"));
  assert.ok(events.some((item) => item.type === "source.audio" && item.audio.byteLength > 0));
  assert.ok(events.some((item) => item.type === "sink.started"));
  assert.equal(playbackStarts, 1);
  assert.equal(stopped, true);
  await engine.close();
});

test("renderer computer microphone keeps processing constraints when the system-default device is selected", async () => {
  let received;
  class FakeAudioContext {
    constructor() { this.sampleRate = 48000; this.destination = {}; }
    createMediaStreamSource() { return { connect() {} }; }
    createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: null }; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    async close() {}
  }
  const engine = createComputerCompanionAudioEngine({
    bridge: { sendCompanionComputerAudioEvent() {} },
    AudioContextClass: FakeAudioContext,
    mediaDevices: { getUserMedia: async (constraints) => {
      received = constraints;
      return { getAudioTracks: () => [{ addEventListener() {}, stop() {} }], getTracks: () => [{ stop() {} }] };
    } },
  });
  await engine.handleCommand({ version: 1, type: "source.start", sessionId: "default-device", generation: 1 });
  assert.deepEqual(received, { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  assert.equal(Object.hasOwn(received.audio, "deviceId"), false);
  await engine.close();
});

test("renderer loss resolves pending starts and active sessions fail without waiting for timeout", async () => {
  const errors = [];
  const session = new ComputerCompanionAudioSession({ sendCommand: () => {}, onError: (reason) => errors.push(reason), startTimeoutMs: 60_000 });
  session.setRendererReady(true);
  session.prepare({ sessionId: "renderer-loss", generation: 1 });
  const pendingSource = session.source.start({ onError: (error) => errors.push(error.message) });
  session.setRendererReady(false);
  assert.deepEqual(await pendingSource, { ok: false, reason: "computer-audio-renderer-unavailable" });
  assert.deepEqual(errors, []);
});
