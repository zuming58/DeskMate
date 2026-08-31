import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { decodeAck, decodeAudio, decodeHeartbeat, encodeControl } = require("../electron/easyinput-audio-codec.cjs");

test("EICC start golden vector is byte exact", () => {
  const packet = encodeControl({
    action: "start",
    sessionId: 0x0807060504030201n,
    sequence: 0x0c0b0a09,
    token: Buffer.from("101112131415161718191a1b1c1d1e1f", "hex"),
  });
  assert.equal(packet.toString("hex"), "45494343010100000102030405060708090a0b0c101112131415161718191a1b1c1d1e1f");
});
test("EIHB and EICA decode only exact v1 layouts", () => {
  const heartbeat = Buffer.from("45494842010300000102030405060708090a0b0c", "hex");
  assert.deepEqual(decodeHeartbeat(heartbeat), { kind: "heartbeat", streaming: true, audioReady: true, sessionId: 0x0807060504030201n, sequence: 0x0c0b0a09 });
  const ack = Buffer.from("45494341010100000102030405060708090a0b0c", "hex");
  assert.deepEqual(decodeAck(ack), { kind: "ack", action: 1, status: 0, sessionId: 0x0807060504030201n, sequence: 0x0c0b0a09 });
  for (const malformed of [heartbeat.subarray(0, 19), Buffer.from(heartbeat), Buffer.concat([heartbeat, Buffer.alloc(1)])]) {
    if (malformed.length === 20) malformed[7] = 1;
    assert.equal(decodeHeartbeat(malformed), null);
  }
});

test("EIAU accepts only 16 kHz mono 20 ms PCM", () => {
  const frame = Buffer.alloc(672);
  frame.write("EIAU", 0, "ascii");
  frame[4] = 2; frame[5] = 32; frame[6] = 1; frame[7] = 1;
  frame.writeBigUInt64LE(7n, 8); frame.writeUInt32LE(12, 16); frame.writeUInt32LE(16000, 20);
  frame.writeUInt32LE(345, 24); frame.writeUInt16LE(320, 28); frame.writeUInt16LE(640, 30);
  frame.fill(0x5a, 32);
  const decoded = decodeAudio(frame);
  assert.equal(decoded.sessionId, 7n);
  assert.equal(decoded.sequence, 12);
  assert.equal(decoded.audio.length, 640);
  const wrongRate = Buffer.from(frame); wrongRate.writeUInt32LE(24000, 20);
  assert.equal(decodeAudio(wrongRate), null);
  const wrongLength = Buffer.from(frame); wrongLength.writeUInt16LE(639, 30);
  assert.equal(decodeAudio(wrongLength), null);
});
