import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { EasyInputVoiceRecorder } = require("../electron/easyinput-voice-recorder.cjs");

class FakeSource {
  constructor(status = { available: true, heartbeat: true, reason: "" }) { this.value = status; this.handlers = null; this.stops = []; }
  status() { return { ...this.value }; }
  async start(handlers) { this.handlers = handlers; return { ok: true }; }
  async stop(reason) { this.stops.push(reason); this.handlers = null; return { ok: true }; }
}

test("board recorder fails before session when heartbeat is unavailable", async () => {
  const recorder = new EasyInputVoiceRecorder({ source: new FakeSource({ available: false, heartbeat: false, reason: "no-heartbeat" }) });
  assert.deepEqual(await recorder.start(), { ok: false, reason: "no-heartbeat" });
  assert.equal(recorder.status().recording, false);
});

test("board recorder returns one bounded PCM16 WAV to the existing workflow", async () => {
  let now = 1000;
  const source = new FakeSource();
  const events = [];
  const recorder = new EasyInputVoiceRecorder({ source, now: () => now, emit: (event) => events.push(event), setTimer: () => 1, clearTimer: () => {} });
  assert.equal((await recorder.start()).ok, true);
  source.handlers.onAudio(Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]));
  now = 3100;
  const result = await recorder.stop();
  assert.equal(result.ok, true);
  assert.equal(result.mimeType, "audio/wav");
  assert.equal(result.duration, 2);
  const wave = Buffer.from(result.audio);
  assert.equal(wave.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(wave.subarray(8, 12).toString("ascii"), "WAVE");
  assert.equal(wave.readUInt32LE(40), 8);
  assert.deepEqual(source.stops, ["user"]);
  assert.ok(events.some((event) => event.type === "started"));
  assert.ok(events.some((event) => event.type === "stopped"));
});

test("board recorder aborts rather than switching sources after a mid-session overflow", async () => {
  const source = new FakeSource();
  const events = [];
  const recorder = new EasyInputVoiceRecorder({ source, maxBytes: 4, emit: (event) => events.push(event), setTimer: () => 1, clearTimer: () => {} });
  await recorder.start();
  source.handlers.onAudio(Buffer.from([1, 0, 2, 0, 3, 0]));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(recorder.status().recording, false);
  assert.ok(events.some((event) => event.type === "error" && event.reason === "easyinput-recording-size-limit"));
  assert.equal(source.stops.at(-1), "easyinput-recording-size-limit");
});

test("board recorder fails closed when the source errors during startup", async () => {
  const source = new FakeSource();
  source.start = async (handlers) => {
    source.handlers = handlers;
    handlers.onError(new Error("startup-link-failed"));
    return { ok: true };
  };
  const recorder = new EasyInputVoiceRecorder({ source, setTimer: () => 1, clearTimer: () => {} });
  const result = await recorder.start();
  assert.deepEqual(result, { ok: false, reason: "startup-link-failed" });
  assert.equal(recorder.status().recording, false);
  assert.equal(source.stops.at(-1), "startup-link-failed");
});
