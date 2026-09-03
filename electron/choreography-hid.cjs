"use strict";

const FEATURE_REPORT_ID = 0x1a;
const INPUT_REPORT_ID = 0x1b;
const REPORT_BYTES = 64;
const PAYLOAD_BYTES = 63;
const BEAT_CODES = Object.freeze({ 400: 1, 600: 2, 800: 3, 1000: 4 });
const SOURCES = Object.freeze({ UI: 1, voice: 2, context: 3, idle: 4 });
const YAW = Object.freeze({ hold: 0, left: 1, center: 2, right: 3 });
const PITCH = Object.freeze({ hold: 0, up: 1, center: 2, down: 3 });
const EXPRESSIONS = Object.freeze({ hold: 0, completed: 1, thinking: 2, working: 3 });
const INTENSITIES = Object.freeze({ gentle: 1, standard: 2, vivid: 3 });
const TEMPOS = Object.freeze({ relaxed: 1, standard: 2, quick: 3 });
const ENDPOINT_RESULTS = Object.freeze(["accepted", "duplicate", "completed", "cancelled", "not-ready", "bad-payload", "wrong-session", "stale-action", "busy", "recenter-required", "emergency-stopped", "faulted", "adapter-unavailable", "adapter-failure", "sequence-conflict"]);
const ENDPOINT_STATES = Object.freeze(["not-ready", "recentering", "ready", "running", "emergency-stopped", "faulted"]);
const TRANSPORT_RESULTS = Object.freeze(["completed", "malformed", "busy", "stale", "conflict", "link-not-ready", "link-queue-busy", "timeout", "link-error", "peer-disconnected-or-restarted", "invalid-response", "internal"]);

function crc16(data) {
  let crc = 0xffff;
  for (const value of data) {
    crc ^= value << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function code(table, value, name) {
  const result = table[value];
  if (!Number.isInteger(result)) throw new Error(`choreography-${name}-invalid`);
  return result;
}

function encodeChoreographyFeatureReport(value = {}) {
  const requestId = Number(value.requestId);
  if (!Number.isSafeInteger(requestId) || requestId < 1 || requestId > 0xffffffff) throw new Error("choreography-request-invalid");
  const report = Buffer.alloc(REPORT_BYTES);
  report[0] = FEATURE_REPORT_ID;
  report.write("DMCQ", 1, "ascii");
  report[5] = 1;
  report[6] = value.kind === "status" ? 2 : 1;
  report.writeUInt32LE(requestId >>> 0, 9);
  if (report[6] === 1) {
    const action = value.action;
    if (!action || !Array.isArray(action.beats) || action.beats.length < 2 || action.beats.length > 8 || !BEAT_CODES[action.beatMs] || !Number.isInteger(action.repeat) || action.repeat < 1 || action.repeat > 3) throw new Error("choreography-request-invalid");
    report[7] = code(SOURCES, value.source || "UI", "source");
    report[13] = action.beats.length;
    report[14] = BEAT_CODES[action.beatMs];
    report[15] = action.repeat;
    report[16] = code(INTENSITIES, value.intensity || "standard", "intensity");
    report[17] = code(TEMPOS, value.tempo || "standard", "tempo");
    let changed = false;
    action.beats.forEach((beat, index) => {
      const offset = 18 + index * 3;
      report[offset] = code(YAW, beat.yaw, "yaw");
      report[offset + 1] = code(PITCH, beat.pitch, "pitch");
      report[offset + 2] = code(EXPRESSIONS, beat.expression, "expression");
      changed ||= report[offset] !== 0 || report[offset + 1] !== 0 || report[offset + 2] !== 0;
    });
    if (!changed) throw new Error("choreography-empty");
  } else if (Object.keys(value).some((key) => !["kind", "requestId"].includes(key))) {
    throw new Error("choreography-request-invalid");
  }
  report.writeUInt16LE(crc16(report.subarray(1, 42)), 42);
  return report;
}

function decodeChoreographyFeatureReport(value) {
  const report = Buffer.from(value || []);
  if (report.length !== 64 || report[0] !== FEATURE_REPORT_ID || report.subarray(1, 5).toString("ascii") !== "DMCQ" || report[5] !== 1 || ![1, 2].includes(report[6]) || report.readUInt32LE(9) === 0 || report.readUInt16LE(42) !== crc16(report.subarray(1, 42)) || report.subarray(44).some(Boolean)) throw new Error("choreography-request-invalid");
  return Object.freeze({ kind: report[6] === 1 ? "command" : "status", requestId: report.readUInt32LE(9), sourceCode: report[7] });
}

function parseEndpoint(bytes) {
  if (bytes.length !== 24 || bytes[12] >= ENDPOINT_RESULTS.length || bytes[13] >= ENDPOINT_STATES.length || bytes[14] > 8 || (bytes[15] !== 0xff && bytes[15] > 7) || bytes[16] > 3 || bytes[17] > bytes[16] || bytes[18] > 4 || bytes[20] > 3 || bytes[21] > 3 || bytes[22] || bytes[23]) throw new Error("choreography-endpoint-invalid");
  const flags = bytes[19];
  return Object.freeze({
    sessionId: bytes.readUInt32LE(0), actionId: bytes.readUInt32LE(4), completedCounter: bytes.readUInt32LE(8),
    result: ENDPOINT_RESULTS[bytes[12]], state: ENDPOINT_STATES[bytes[13]], beatCount: bytes[14], currentBeat: bytes[15], repeat: bytes[16], completedRepeats: bytes[17], sourceCode: bytes[18], intensityCode: bytes[20], tempoCode: bytes[21], flags,
    adapterAvailable: Boolean(flags & 1), logicalCenterAccepted: Boolean(flags & 2), emergencyStopLatched: Boolean(flags & 4), faulted: Boolean(flags & 8), servoOutputEnabled: Boolean(flags & 16), operationTerminal: Boolean(flags & 32), displayLeaseActive: Boolean(flags & 64), duplicateResponse: Boolean(flags & 128),
  });
}

function decodeChoreographyInputReport(value) {
  const report = Buffer.from(value || []);
  if (report.length !== 64 || report[0] !== INPUT_REPORT_ID || report.subarray(1, 5).toString("ascii") !== "DMCS" || report[5] !== 1 || ![1, 2].includes(report[6]) || ![1, 2].includes(report[7]) || report[8] >= TRANSPORT_RESULTS.length || report.readUInt32LE(9) === 0 || report[17] !== (report[7] === 1 ? 0x24 : 0x25) || ![0, 2, 4].includes(report[18]) || report[20] > 24 || report.readUInt16LE(59) !== crc16(report.subarray(1, 59)) || report.subarray(61).some(Boolean)) throw new Error("choreography-response-invalid");
  const endpoint = report[20] === 24 ? parseEndpoint(report.subarray(21, 45)) : null;
  return Object.freeze({ stage: report[6] === 1 ? "accepted" : "endpoint-acknowledgement", kind: report[7] === 1 ? "command" : "status", transport: TRANSPORT_RESULTS[report[8]], transportCode: report[8], requestId: report.readUInt32LE(9), linkSequence: report.readUInt32LE(13), messageType: report[17], linkFlag: report[18], linkErrorCode: report[19], endpoint, controllerBootId: report.readUInt32LE(45), peerBootId: report.readUInt32LE(49), sourceCode: report[53], beatCount: report[54], beatCode: report[55], repeat: report[56], intensityCode: report[57], tempoCode: report[58] });
}

module.exports = { FEATURE_REPORT_ID, INPUT_REPORT_ID, REPORT_BYTES, PAYLOAD_BYTES, INTENSITIES, TEMPOS, decodeChoreographyFeatureReport, decodeChoreographyInputReport, encodeChoreographyFeatureReport, parseEndpoint };
