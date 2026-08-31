import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { EasyInputLanAudioSource, pcmLevel } = require("../electron/easyinput-audio-source.cjs");

class FakeSocket extends EventEmitter {
  constructor() { super(); this.sent = []; this.closed = false; }
  bind(port, address, callback) { this.bound = { port, address }; callback(); }
  send(packet, port, address) { this.sent.push({ packet: Buffer.from(packet), port, address }); }
  close() { this.closed = true; this.emit("close"); }
}

function heartbeat(flags = 2) {
  const value = Buffer.alloc(20); value.write("EIHB"); value[4] = 1; value[5] = flags; return value;
}
function ackFrom(control) {
  const value = Buffer.alloc(20); value.write("EICA"); value[4] = 1; value[5] = control[5]; value[6] = 0;
  control.copy(value, 8, 8, 20); return value;
}
function audio(session, sequence, sample = 1200) {
  const value = Buffer.alloc(672); value.write("EIAU"); value[4] = 2; value[5] = 32; value[6] = 1; value[7] = 1;
  value.writeBigUInt64LE(session, 8); value.writeUInt32LE(sequence, 16); value.writeUInt32LE(16000, 20); value.writeUInt16LE(320, 28); value.writeUInt16LE(640, 30);
  for (let i = 32; i < value.length; i += 2) value.writeInt16LE(sample, i);
  return value;
}

test("source locks only after ACK and drops duplicate, stale and wrong-source audio", async () => {
  const socket = new FakeSocket();
  const source = new EasyInputLanAudioSource({ socketFactory: () => socket, randomSession: () => 9n, randomToken: () => Buffer.alloc(16, 1) });
  assert.equal((await source.configure({ bindAddress: "192.168.1.2", port: 17333 })).ok, true);
  socket.emit("message", heartbeat(), { address: "192.168.1.20", port: 17333 });
  const chunks = [];
  const starting = source.start({ onAudio: (chunk) => chunks.push(Buffer.from(chunk)) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(socket.sent.length, 1);
  socket.emit("message", ackFrom(socket.sent[0].packet), { address: "192.168.1.20", port: 17333 });
  assert.equal((await starting).ok, true);
  socket.emit("message", audio(9n, 1), { address: "192.168.1.99", port: 17333 });
  socket.emit("message", audio(9n, 1), { address: "192.168.1.20", port: 17333 });
  socket.emit("message", audio(9n, 1), { address: "192.168.1.20", port: 17333 });
  socket.emit("message", audio(8n, 2), { address: "192.168.1.20", port: 17333 });
  for (let sequence = 2; sequence <= 52; sequence += 1) socket.emit("message", audio(9n, sequence), { address: "192.168.1.20", port: 17333 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(chunks.length, 50);
  assert.equal(source.status().counters.droppedFrames, 3);
  assert.equal(source.status().counters.sourceRejects, 2);
  await source.close();
});

test("multiple fresh heartbeat sources fail closed", async () => {
  const socket = new FakeSocket();
  const source = new EasyInputLanAudioSource({ socketFactory: () => socket });
  await source.configure({ bindAddress: "192.168.1.2", port: 17333 });
  socket.emit("message", heartbeat(), { address: "192.168.1.20", port: 17333 });
  socket.emit("message", heartbeat(), { address: "192.168.1.21", port: 17333 });
  assert.equal(source.status().state, "ambiguous");
  assert.equal((await source.start()).reason, "multiple-easyinput-audio-sources");
  await source.close();
});

test("control acknowledgement timeout is finite and never starts a stale session", async () => {
  const socket = new FakeSocket();
  const source = new EasyInputLanAudioSource({ socketFactory: () => socket, randomSession: () => 11n, setTimer: (handler) => setImmediate(handler), clearTimer: (timer) => clearImmediate(timer) });
  await source.configure({ bindAddress: "192.168.1.2", port: 17333 });
  socket.emit("message", heartbeat(), { address: "192.168.1.20", port: 17333 });
  const result = await source.start();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "easyinput-audio-control-timeout");
  assert.equal(socket.sent.length, 3);
  assert.equal(source.status().streaming, false);
  await source.close();
});

test("PCM level is bounded and does not retain audio", () => {
  assert.equal(pcmLevel(Buffer.alloc(640)), 0);
  assert.ok(pcmLevel(audio(1n, 1, 8000).subarray(32)) > 0);
  assert.equal(pcmLevel(Buffer.alloc(3)), 0);
});
