const { gunzipSync } = require("node:zlib");

const MAX_FRAME_BYTES = 1024 * 1024;
const MAX_IDENTIFIER_BYTES = 128;

const MESSAGE_TYPES = Object.freeze({
  FULL_CLIENT_REQUEST: 0x1,
  AUDIO_ONLY_REQUEST: 0x2,
  FULL_SERVER_RESPONSE: 0x9,
  AUDIO_ONLY_RESPONSE: 0xb,
  ERROR: 0xf,
});

const FLAGS = Object.freeze({
  NO_SEQUENCE: 0x0,
  POSITIVE_SEQUENCE: 0x1,
  LAST_WITHOUT_SEQUENCE: 0x2,
  LAST_WITH_NEGATIVE_SEQUENCE: 0x3,
  EVENT: 0x4,
});
const SERIALIZATION = Object.freeze({ RAW: 0x0, JSON: 0x1 });
const COMPRESSION = Object.freeze({ NONE: 0x0, GZIP: 0x1 });
const EVENTS = Object.freeze({
  START_CONNECTION: 1,
  FINISH_CONNECTION: 2,
  START_SESSION: 100,
  FINISH_SESSION: 102,
  AUDIO_TASK_REQUEST: 200,
  END_AUDIO: 400,
  TEXT_QUERY: 501,
});

const CONNECT_SCOPED_EVENTS = new Set([1, 2, 50, 51, 52]);
const SESSION_SCOPED_EVENTS = new Set([100, 102, 150, 152, 153, 154, 200, 201, 251, 300, 350, 351, 352, 359, 400, 450, 451, 459, 500, 501, 502, 510, 511, 512, 513, 514, 515, 550, 553, 559, 567, 568, 569, 570, 571, 599]);

function int32(value) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) throw new Error("doubao-int32-invalid");
  const result = Buffer.alloc(4);
  result.writeInt32BE(value);
  return result;
}

function safeJson(buffer) {
  if (!buffer.length) return {};
  let value;
  try { value = JSON.parse(buffer.toString("utf8")); } catch { throw new Error("doubao-json-invalid"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("doubao-json-shape-invalid");
  return value;
}

function identifier(value, reason) {
  const result = Buffer.from(String(value || ""), "utf8");
  if (!result.length || result.length > MAX_IDENTIFIER_BYTES || result.some((byte) => byte < 0x21 || byte > 0x7e)) throw new Error(reason);
  return result;
}

function appendIdentifier(chunks, value, reason) {
  const encoded = identifier(value, reason);
  chunks.push(int32(encoded.length), encoded);
}

function readInt32(buffer, state, reason) {
  if (state.offset + 4 > buffer.length) throw new Error(reason);
  const value = buffer.readInt32BE(state.offset);
  state.offset += 4;
  return value;
}

function readIdentifier(buffer, state, reason) {
  const length = readInt32(buffer, state, `${reason}-length-truncated`);
  if (length < 1 || length > MAX_IDENTIFIER_BYTES || state.offset + length > buffer.length) throw new Error(reason);
  const value = buffer.subarray(state.offset, state.offset + length);
  state.offset += length;
  return identifier(value.toString("utf8"), reason).toString("utf8");
}

function encodeFrame({ messageType, flags = FLAGS.EVENT, serialization = SERIALIZATION.JSON, compression = COMPRESSION.NONE, event, sequence, code = 0, connectId = "", sessionId = "", payload = Buffer.alloc(0) } = {}) {
  if (!Object.values(MESSAGE_TYPES).includes(messageType) || !Object.values(FLAGS).includes(flags) || !Object.values(SERIALIZATION).includes(serialization) || !Object.values(COMPRESSION).includes(compression)) throw new Error("doubao-frame-header-invalid");
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || []);
  if (body.length > MAX_FRAME_BYTES) throw new Error("doubao-payload-too-large");
  const chunks = [Buffer.from([0x11, (messageType << 4) | flags, (serialization << 4) | compression, 0x00])];
  if (messageType === MESSAGE_TYPES.ERROR) chunks.push(int32(code));
  if (flags === FLAGS.POSITIVE_SEQUENCE || flags === FLAGS.LAST_WITH_NEGATIVE_SEQUENCE) chunks.push(int32(sequence));
  if (flags === FLAGS.EVENT) chunks.push(int32(event));
  if (flags === FLAGS.EVENT && connectId) appendIdentifier(chunks, connectId, "doubao-connect-id-invalid");
  if (flags === FLAGS.EVENT && SESSION_SCOPED_EVENTS.has(event)) appendIdentifier(chunks, sessionId, "doubao-session-id-invalid");
  chunks.push(int32(body.length), body);
  const frame = Buffer.concat(chunks);
  if (frame.length > MAX_FRAME_BYTES + 2 * MAX_IDENTIFIER_BYTES + 32) throw new Error("doubao-frame-too-large");
  return frame;
}

function encodeJsonEvent(event, payload = {}, sessionId = "") {
  return encodeFrame({ messageType: MESSAGE_TYPES.FULL_CLIENT_REQUEST, event, sessionId, serialization: SERIALIZATION.JSON, payload: Buffer.from(JSON.stringify(payload), "utf8") });
}

function encodeAudioEvent(event, audio, sessionId) {
  const payload = Buffer.from(audio || []);
  if (!payload.length) throw new Error("doubao-audio-empty");
  return encodeFrame({ messageType: MESSAGE_TYPES.AUDIO_ONLY_REQUEST, event, sessionId, serialization: SERIALIZATION.RAW, payload });
}

function readPayload(buffer, offset) {
  if (offset + 4 > buffer.length) return null;
  const payloadSize = buffer.readInt32BE(offset);
  if (payloadSize < 0 || payloadSize > MAX_FRAME_BYTES || offset + 4 + payloadSize !== buffer.length) return null;
  return { offset: offset + 4, payloadSize };
}

function decodeFrame(input) {
  const buffer = Buffer.from(input || []);
  if (buffer.length < 8 || buffer.length > MAX_FRAME_BYTES + 2 * MAX_IDENTIFIER_BYTES + 32) throw new Error("doubao-frame-size-invalid");
  const version = buffer[0] >> 4;
  const headerWords = buffer[0] & 0x0f;
  const messageType = buffer[1] >> 4;
  const flags = buffer[1] & 0x0f;
  const serialization = buffer[2] >> 4;
  const compression = buffer[2] & 0x0f;
  if (version !== 1 || headerWords !== 1 || buffer[3] !== 0 || !Object.values(MESSAGE_TYPES).includes(messageType) || !Object.values(FLAGS).includes(flags) || !Object.values(SERIALIZATION).includes(serialization) || !Object.values(COMPRESSION).includes(compression)) throw new Error("doubao-frame-header-invalid");
  const state = { offset: 4 };
  let code = null;
  let sequence = null;
  let event = null;
  let connectId = "";
  let sessionId = "";
  if (messageType === MESSAGE_TYPES.ERROR) code = readInt32(buffer, state, "doubao-error-frame-truncated");
  if (flags === FLAGS.POSITIVE_SEQUENCE || flags === FLAGS.LAST_WITH_NEGATIVE_SEQUENCE) sequence = readInt32(buffer, state, "doubao-sequence-truncated");
  if (flags === FLAGS.EVENT) event = readInt32(buffer, state, "doubao-event-truncated");

  if (event !== null && SESSION_SCOPED_EVENTS.has(event)) {
    sessionId = readIdentifier(buffer, state, "doubao-session-id-invalid");
  } else if (event !== null && CONNECT_SCOPED_EVENTS.has(event)) {
    const direct = readPayload(buffer, state.offset);
    if (!direct) connectId = readIdentifier(buffer, state, "doubao-connect-id-invalid");
  }

  const framedPayload = readPayload(buffer, state.offset);
  if (!framedPayload) throw new Error("doubao-payload-size-invalid");
  let payload = buffer.subarray(framedPayload.offset);
  if (compression === COMPRESSION.GZIP) {
    try { payload = gunzipSync(payload, { maxOutputLength: MAX_FRAME_BYTES }); } catch { throw new Error("doubao-gzip-invalid"); }
    if (payload.length > MAX_FRAME_BYTES) throw new Error("doubao-gzip-too-large");
  }
  return Object.freeze({
    code,
    compression,
    connectId,
    event,
    flags,
    messageType,
    payload,
    payloadJson: serialization === SERIALIZATION.JSON ? safeJson(payload) : null,
    payloadSize: payload.length,
    sequence,
    serialization,
    sessionId,
    terminal: flags === FLAGS.LAST_WITHOUT_SEQUENCE || flags === FLAGS.LAST_WITH_NEGATIVE_SEQUENCE,
  });
}

module.exports = { COMPRESSION, EVENTS, FLAGS, MAX_FRAME_BYTES, MESSAGE_TYPES, SERIALIZATION, decodeFrame, encodeAudioEvent, encodeFrame, encodeJsonEvent };
