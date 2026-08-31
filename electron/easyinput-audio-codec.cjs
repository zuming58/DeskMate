const MAGIC = Object.freeze({ heartbeat: "EIHB", control: "EICC", ack: "EICA", audio: "EIAU" });
const SIZES = Object.freeze({ heartbeat: 20, control: 36, ack: 20, audioHeader: 32, audioPayload: 640, audio: 672 });
const CONTROL_ACTIONS = Object.freeze({ start: 1, stop: 2, keepalive: 3 });
const ACK_STATUS = Object.freeze({ ok: 0, badRequest: 1, unauthorized: 2, busy: 3, unavailable: 4 });

function asBuffer(value) { return Buffer.isBuffer(value) ? value : Buffer.from(value || []); }
function hasMagic(buffer, magic) { return buffer.subarray(0, 4).toString("ascii") === magic; }
function readU64(buffer, offset) { return buffer.readBigUInt64LE(offset); }
function writeU64(buffer, value, offset) { buffer.writeBigUInt64LE(BigInt.asUintN(64, BigInt(value)), offset); }

function encodeControl({ action, sessionId, sequence, token }) {
  const actionValue = typeof action === "string" ? CONTROL_ACTIONS[action] : action;
  if (![1, 2, 3].includes(actionValue)) throw new Error("easyinput-audio-control-action-invalid");
  const session = BigInt(sessionId || 0);
  if (session === 0n) throw new Error("easyinput-audio-session-invalid");
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 0xffffffff) throw new Error("easyinput-audio-sequence-invalid");
  const opaqueToken = asBuffer(token);
  if (opaqueToken.length !== 16) throw new Error("easyinput-audio-token-invalid");
  const output = Buffer.alloc(SIZES.control);
  output.write(MAGIC.control, 0, 4, "ascii");
  output[4] = 1;
  output[5] = actionValue;
  writeU64(output, session, 8);
  output.writeUInt32LE(sequence >>> 0, 16);
  opaqueToken.copy(output, 20);
  return output;
}

function decodeHeartbeat(value) {
  const buffer = asBuffer(value);
  if (buffer.length !== SIZES.heartbeat || !hasMagic(buffer, MAGIC.heartbeat) || buffer[4] !== 1 || (buffer[5] & ~0x03) !== 0 || buffer[6] !== 0 || buffer[7] !== 0) return null;
  return Object.freeze({
    kind: "heartbeat",
    streaming: Boolean(buffer[5] & 0x01),
    audioReady: Boolean(buffer[5] & 0x02),
    sessionId: readU64(buffer, 8),
    sequence: buffer.readUInt32LE(16),
  });
}

function decodeAck(value) {
  const buffer = asBuffer(value);
  if (buffer.length !== SIZES.ack || !hasMagic(buffer, MAGIC.ack) || buffer[4] !== 1 || ![1, 2, 3].includes(buffer[5]) || buffer[6] > 4 || buffer[7] !== 0) return null;
  return Object.freeze({
    kind: "ack",
    action: buffer[5],
    status: buffer[6],
    sessionId: readU64(buffer, 8),
    sequence: buffer.readUInt32LE(16),
  });
}

function decodeAudio(value) {
  const buffer = asBuffer(value);
  if (buffer.length !== SIZES.audio || !hasMagic(buffer, MAGIC.audio) || buffer[4] !== 2 || buffer[5] !== SIZES.audioHeader || buffer[6] !== 1 || buffer[7] !== 1) return null;
  const sampleRate = buffer.readUInt32LE(20);
  const samples = buffer.readUInt16LE(28);
  const payloadBytes = buffer.readUInt16LE(30);
  if (sampleRate !== 16000 || samples !== 320 || payloadBytes !== SIZES.audioPayload) return null;
  return Object.freeze({
    kind: "audio",
    sessionId: readU64(buffer, 8),
    sequence: buffer.readUInt32LE(16),
    sampleRate,
    timestampMs: buffer.readUInt32LE(24),
    samples,
    audio: buffer.subarray(SIZES.audioHeader),
  });
}

function decodeDatagram(value) {
  const buffer = asBuffer(value);
  if (buffer.length < 4) return null;
  const magic = buffer.subarray(0, 4).toString("ascii");
  if (magic === MAGIC.heartbeat) return decodeHeartbeat(buffer);
  if (magic === MAGIC.ack) return decodeAck(buffer);
  if (magic === MAGIC.audio) return decodeAudio(buffer);
  return null;
}

module.exports = { ACK_STATUS, CONTROL_ACTIONS, MAGIC, SIZES, decodeAck, decodeAudio, decodeDatagram, decodeHeartbeat, encodeControl };
