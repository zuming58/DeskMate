const MAX_FRAME_BYTES = 1024 * 1024;
const MAX_SESSION_ID_BYTES = 128;

const MESSAGE_TYPES = Object.freeze({
  FULL_CLIENT_REQUEST: 0x1,
  AUDIO_ONLY_REQUEST: 0x2,
  FULL_SERVER_RESPONSE: 0x9,
  AUDIO_ONLY_RESPONSE: 0xb,
  ERROR: 0xf,
});

const SERIALIZATION = Object.freeze({ RAW: 0x0, JSON: 0x1 });
const EVENTS = Object.freeze({
  START_CONNECTION: 1,
  FINISH_CONNECTION: 2,
  START_SESSION: 100,
  FINISH_SESSION: 102,
  AUDIO_TASK_REQUEST: 200,
  END_AUDIO: 400,
  TEXT_QUERY: 501,
});

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

function encodeFrame({ messageType, flags = 0x4, serialization = SERIALIZATION.JSON, event, code = 0, sessionId = "", payload = Buffer.alloc(0) } = {}) {
  if (!Object.values(MESSAGE_TYPES).includes(messageType) || ![0, 0x4].includes(flags) || !Object.values(SERIALIZATION).includes(serialization)) throw new Error("doubao-frame-header-invalid");
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || []);
  if (body.length > MAX_FRAME_BYTES) throw new Error("doubao-payload-too-large");
  const chunks = [Buffer.from([0x11, (messageType << 4) | flags, serialization << 4, 0x00])];
  if (messageType === MESSAGE_TYPES.ERROR) chunks.push(int32(code));
  if (flags === 0x4) chunks.push(int32(event));
  if (sessionId) {
    const session = Buffer.from(String(sessionId), "utf8");
    if (!session.length || session.length > MAX_SESSION_ID_BYTES) throw new Error("doubao-session-id-invalid");
    chunks.push(int32(session.length), session);
  }
  chunks.push(int32(body.length), body);
  const frame = Buffer.concat(chunks);
  if (frame.length > MAX_FRAME_BYTES + 256) throw new Error("doubao-frame-too-large");
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

function decodeFrame(input) {
  const buffer = Buffer.from(input || []);
  if (buffer.length < 8 || buffer.length > MAX_FRAME_BYTES + 256) throw new Error("doubao-frame-size-invalid");
  const version = buffer[0] >> 4;
  const headerWords = buffer[0] & 0x0f;
  const messageType = buffer[1] >> 4;
  const flags = buffer[1] & 0x0f;
  const serialization = buffer[2] >> 4;
  const compression = buffer[2] & 0x0f;
  if (version !== 1 || headerWords !== 1 || buffer[3] !== 0 || !Object.values(MESSAGE_TYPES).includes(messageType) || ![0, 0x4].includes(flags) || !Object.values(SERIALIZATION).includes(serialization) || compression !== 0) throw new Error("doubao-frame-header-invalid");
  let offset = 4;
  let code = null;
  if (messageType === MESSAGE_TYPES.ERROR) {
    if (offset + 4 > buffer.length) throw new Error("doubao-error-frame-truncated");
    code = buffer.readInt32BE(offset); offset += 4;
  }
  let event = null;
  if (flags === 0x4) {
    if (offset + 4 > buffer.length) throw new Error("doubao-event-truncated");
    event = buffer.readInt32BE(offset); offset += 4;
  }
  let sessionId = "";
  if (event !== null && SESSION_SCOPED_EVENTS.has(event)) {
    if (offset + 4 > buffer.length) throw new Error("doubao-session-length-truncated");
    const length = buffer.readInt32BE(offset); offset += 4;
    if (length < 1 || length > MAX_SESSION_ID_BYTES || offset + length > buffer.length) throw new Error("doubao-session-id-invalid");
    sessionId = buffer.subarray(offset, offset + length).toString("utf8"); offset += length;
  }
  if (offset + 4 > buffer.length) throw new Error("doubao-payload-length-truncated");
  const payloadSize = buffer.readInt32BE(offset); offset += 4;
  if (payloadSize < 0 || payloadSize > MAX_FRAME_BYTES || offset + payloadSize !== buffer.length) throw new Error("doubao-payload-size-invalid");
  const payload = buffer.subarray(offset);
  return Object.freeze({ code, event, flags, messageType, payload, payloadJson: serialization === SERIALIZATION.JSON ? safeJson(payload) : null, payloadSize, serialization, sessionId });
}

module.exports = { EVENTS, MAX_FRAME_BYTES, MESSAGE_TYPES, SERIALIZATION, decodeFrame, encodeAudioEvent, encodeFrame, encodeJsonEvent };
