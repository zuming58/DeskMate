"use strict";

const FEATURE_REPORT_ID = 0x18;
const INPUT_REPORT_ID = 0x19;
const REPORT_BYTES = 64;
const PAYLOAD_BYTES = 63;
const PROTOCOL_VERSION = 1;
const KIND_COMMAND = 1;
const KIND_STATUS = 2;
const STAGE_ACCEPTED = 1;
const STAGE_ENDPOINT_ACK = 2;

const OPERATIONS = Object.freeze({
  run: 1,
  stopAndCenter: 2,
  emergencyStop: 3,
  clearEmergencyStopAndCenter: 4,
});
const PRESETS = Object.freeze({ attention: 1, nod: 2, search: 3, dance: 4 });
const SOURCES = Object.freeze({ UI: 1, voice: 2, context: 3, idle: 4 });
const TRANSPORT_RESULTS = Object.freeze([
  "completed", "malformed", "busy", "stale", "conflict", "link-not-ready", "link-queue-busy", "timeout", "link-error", "peer-disconnected-or-restarted", "invalid-response", "internal",
]);
const LINK_ERRORS = Object.freeze(["NONE", "UNKNOWN_TYPE", "BAD_PAYLOAD", "NOT_READY", "BUSY", "SEQUENCE_CONFLICT", "INTERNAL"]);
const ENDPOINT_RESULTS = Object.freeze([
  "accepted", "duplicate", "completed", "cancelled", "not-ready", "bad-payload", "wrong-session", "stale-action", "busy", "recenter-required", "emergency-stopped", "faulted", "adapter-unavailable", "adapter-failure", "sequence-conflict",
]);
const ENDPOINT_STATES = Object.freeze(["not-ready", "recentering", "ready", "running", "emergency-stopped", "faulted"]);

function crc16CcittFalse(data) {
  let crc = 0xffff;
  for (const value of data) {
    crc ^= value << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function uint32(value, name, { allowZero = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > 0xffffffff) throw new Error(`motion-presets-${name}-invalid`);
  return value >>> 0;
}

function enumCode(value, table, name, { allowZero = false } = {}) {
  const code = typeof value === "string" ? table[value] : value;
  if (!Number.isInteger(code) || code < (allowZero ? 0 : 1) || code > Object.keys(table).length) throw new Error(`motion-presets-${name}-invalid`);
  return code;
}

function enumName(code, table) {
  return Object.keys(table).find((name) => table[name] === code);
}

function assertAllowedKeys(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.has(key))) throw new Error("motion-presets-request-invalid");
}

function assertZero(data, start, end = data.length) {
  for (let index = start; index < end; index += 1) if (data[index] !== 0) throw new Error("motion-presets-padding-invalid");
}

function normalizeCommand(value) {
  assertAllowedKeys(value, new Set(["kind", "requestId", "source", "operation", "preset", "repeat"]));
  const operationCode = enumCode(value.operation, OPERATIONS, "operation");
  const sourceCode = enumCode(value.source, SOURCES, "source");
  if (operationCode === OPERATIONS.run) {
    const presetCode = enumCode(value.preset, PRESETS, "preset");
    if (!Number.isInteger(value.repeat) || value.repeat < 1 || value.repeat > 3) throw new Error("motion-presets-repeat-invalid");
    return { operationCode, sourceCode, presetCode, repeat: value.repeat };
  }
  if ((operationCode === OPERATIONS.stopAndCenter || operationCode === OPERATIONS.emergencyStop) && ![SOURCES.UI, SOURCES.voice].includes(sourceCode)) throw new Error("motion-presets-source-invalid");
  if (operationCode === OPERATIONS.clearEmergencyStopAndCenter && sourceCode !== SOURCES.UI) throw new Error("motion-presets-source-invalid");
  if ((value.preset !== undefined && value.preset !== 0) || (value.repeat !== undefined && value.repeat !== 0)) throw new Error("motion-presets-command-fields-invalid");
  return { operationCode, sourceCode, presetCode: 0, repeat: 0 };
}

function encodeMotionPresetFeatureReport(value = {}) {
  const kind = value.kind === "command" || value.kind === KIND_COMMAND ? KIND_COMMAND : value.kind === "status" || value.kind === KIND_STATUS ? KIND_STATUS : 0;
  if (!kind) throw new Error("motion-presets-kind-invalid");
  const requestId = uint32(value.requestId, "request");
  const report = Buffer.alloc(REPORT_BYTES);
  report[0] = FEATURE_REPORT_ID;
  report.write("DMRQ", 1, "ascii");
  report[5] = PROTOCOL_VERSION;
  report[6] = kind;
  if (kind === KIND_COMMAND) {
    const command = normalizeCommand(value);
    report[7] = command.sourceCode;
    report[8] = command.operationCode;
    report[13] = command.presetCode;
    report[14] = command.repeat;
  } else {
    assertAllowedKeys(value, new Set(["kind", "requestId"]));
  }
  report.writeUInt32LE(requestId, 9);
  report.writeUInt16LE(crc16CcittFalse(report.subarray(1, 17)), 17);
  return report;
}

function decodeMotionPresetFeatureReport(value) {
  const report = Buffer.isBuffer(value) ? Buffer.from(value) : value instanceof Uint8Array ? Buffer.from(value) : null;
  if (!report || report.length !== REPORT_BYTES || report[0] !== FEATURE_REPORT_ID || report.subarray(1, 5).toString("ascii") !== "DMRQ" || report[5] !== PROTOCOL_VERSION) throw new Error("motion-presets-request-invalid");
  if (![KIND_COMMAND, KIND_STATUS].includes(report[6]) || report.readUInt32LE(9) === 0 || report.readUInt16LE(17) !== crc16CcittFalse(report.subarray(1, 17))) throw new Error("motion-presets-request-invalid");
  assertZero(report, 15, 17);
  assertZero(report, 19);
  const requestId = report.readUInt32LE(9);
  const input = report[6] === KIND_STATUS
    ? { kind: "status", requestId }
    : {
        kind: "command",
        requestId,
        source: enumName(report[7], SOURCES),
        operation: enumName(report[8], OPERATIONS),
        ...(report[8] === OPERATIONS.run ? { preset: enumName(report[13], PRESETS), repeat: report[14] } : {}),
      };
  let expected;
  try { expected = encodeMotionPresetFeatureReport(input); } catch { throw new Error("motion-presets-request-invalid"); }
  if (!expected.equals(report)) throw new Error("motion-presets-request-invalid");
  return Object.freeze({
    kind: input.kind,
    kindCode: report[6],
    requestId,
    source: input.source || null,
    sourceCode: report[7],
    operation: input.operation || null,
    operationCode: report[8],
    preset: input.preset || null,
    presetCode: report[13],
    repeat: report[14],
  });
}

function parseEndpointStatus(bytes) {
  if (bytes.length !== 20 || bytes[12] >= ENDPOINT_RESULTS.length || bytes[13] >= ENDPOINT_STATES.length || bytes[14] > 4 || bytes[15] > 4 || bytes[16] > 3 || bytes[17] > 3 || bytes[18] > 4 || (bytes[19] & 0x80) !== 0) throw new Error("motion-presets-endpoint-invalid");
  const operationCode = bytes[14];
  const presetCode = bytes[15];
  const requestedRepeat = bytes[16];
  const completedRepeat = bytes[17];
  const sourceCode = bytes[18];
  if (completedRepeat > requestedRepeat) throw new Error("motion-presets-endpoint-invalid");
  if (operationCode === 0) {
    if (presetCode !== 0 || requestedRepeat !== 0 || completedRepeat !== 0 || sourceCode !== 0 || bytes.readUInt32LE(4) !== 0) throw new Error("motion-presets-endpoint-invalid");
  } else if (operationCode === OPERATIONS.run) {
    if (bytes.readUInt32LE(4) === 0 || presetCode < 1 || presetCode > 4 || requestedRepeat < 1 || requestedRepeat > 3 || sourceCode < 1 || sourceCode > 4) throw new Error("motion-presets-endpoint-invalid");
  } else {
    if (bytes.readUInt32LE(4) === 0 || presetCode !== 0 || requestedRepeat !== 0 || completedRepeat !== 0 || ![SOURCES.UI, SOURCES.voice].includes(sourceCode)) throw new Error("motion-presets-endpoint-invalid");
    if (operationCode === OPERATIONS.clearEmergencyStopAndCenter && sourceCode !== SOURCES.UI) throw new Error("motion-presets-endpoint-invalid");
  }
  const flags = bytes[19];
  if (((flags & 0x40) !== 0) !== (bytes[12] === 1)) throw new Error("motion-presets-endpoint-invalid");
  if (operationCode === OPERATIONS.run && bytes[12] === 2 && (bytes[13] !== 2 || completedRepeat !== requestedRepeat || (flags & 0x20) === 0)) throw new Error("motion-presets-endpoint-invalid");
  if ([OPERATIONS.stopAndCenter, OPERATIONS.clearEmergencyStopAndCenter].includes(operationCode) && bytes[12] === 2 && (bytes[13] !== 2 || (flags & 0x02) === 0 || (flags & 0x20) === 0)) throw new Error("motion-presets-endpoint-invalid");
  if (operationCode === OPERATIONS.emergencyStop && bytes[12] === 10 && (bytes[13] !== 4 || (flags & 0x04) === 0 || (flags & 0x20) === 0)) throw new Error("motion-presets-endpoint-invalid");
  return Object.freeze({
    sessionId: bytes.readUInt32LE(0),
    actionId: bytes.readUInt32LE(4),
    completedPresetCounter: bytes.readUInt32LE(8),
    result: ENDPOINT_RESULTS[bytes[12]],
    resultCode: bytes[12],
    state: ENDPOINT_STATES[bytes[13]],
    stateCode: bytes[13],
    operation: operationCode === 0 ? null : enumName(operationCode, OPERATIONS),
    operationCode,
    preset: presetCode === 0 ? null : enumName(presetCode, PRESETS),
    presetCode,
    requestedRepeat,
    completedRepeat,
    source: sourceCode === 0 ? null : enumName(sourceCode, SOURCES),
    sourceCode,
    flags,
    adapterAvailable: Boolean(flags & 0x01),
    logicalCenterAccepted: Boolean(flags & 0x02),
    emergencyStopLatched: Boolean(flags & 0x04),
    faulted: Boolean(flags & 0x08),
    servoOutputEnabled: Boolean(flags & 0x10),
    operationTerminal: Boolean(flags & 0x20),
    duplicateResponse: Boolean(flags & 0x40),
  });
}

function decodeMotionPresetInputReport(value) {
  const report = Buffer.isBuffer(value) ? Buffer.from(value) : value instanceof Uint8Array ? Buffer.from(value) : null;
  if (!report || report.length !== REPORT_BYTES || report[0] !== INPUT_REPORT_ID || report.subarray(1, 5).toString("ascii") !== "DMRS" || report[5] !== PROTOCOL_VERSION) throw new Error("motion-presets-response-invalid");
  const stageCode = report[6];
  const kindCode = report[7];
  const transportCode = report[8];
  const requestId = report.readUInt32LE(9);
  const messageType = report[17];
  const linkFlag = report[18];
  const linkErrorCode = report[19];
  const endpointLength = report[20];
  if (![STAGE_ACCEPTED, STAGE_ENDPOINT_ACK].includes(stageCode) || ![KIND_COMMAND, KIND_STATUS].includes(kindCode) || transportCode >= TRANSPORT_RESULTS.length || requestId === 0 || messageType !== (kindCode === KIND_COMMAND ? 0x22 : 0x23) || ![0, 0x02, 0x04].includes(linkFlag) || linkErrorCode >= LINK_ERRORS.length || ![0, 20].includes(endpointLength)) throw new Error("motion-presets-response-invalid");
  if (report.readUInt16LE(61) !== crc16CcittFalse(report.subarray(1, 61))) throw new Error("motion-presets-crc-invalid");
  if (report[63] !== 0) throw new Error("motion-presets-padding-invalid");
  assertZero(report, 21 + endpointLength, 41);

  const sourceCode = report[57];
  const operationCode = report[58];
  const presetCode = report[59];
  const repeat = report[60];
  if (kindCode === KIND_STATUS) {
    if (sourceCode !== 0 || operationCode !== 0 || presetCode !== 0 || repeat !== 0) throw new Error("motion-presets-response-echo-invalid");
  } else if (sourceCode < 1 || sourceCode > 4 || operationCode < 1 || operationCode > 4 || (operationCode === OPERATIONS.run ? (presetCode < 1 || presetCode > 4 || repeat < 1 || repeat > 3) : (presetCode !== 0 || repeat !== 0))) {
    throw new Error("motion-presets-response-echo-invalid");
  } else if ((operationCode === OPERATIONS.stopAndCenter || operationCode === OPERATIONS.emergencyStop) && ![SOURCES.UI, SOURCES.voice].includes(sourceCode)) {
    throw new Error("motion-presets-response-echo-invalid");
  } else if (operationCode === OPERATIONS.clearEmergencyStopAndCenter && sourceCode !== SOURCES.UI) {
    throw new Error("motion-presets-response-echo-invalid");
  }

  if (stageCode === STAGE_ACCEPTED && (transportCode !== 0 || linkFlag !== 0 || linkErrorCode !== 0 || endpointLength !== 0)) throw new Error("motion-presets-accepted-invalid");
  if (stageCode === STAGE_ENDPOINT_ACK && transportCode === 0 && (linkFlag !== 0x02 || linkErrorCode !== 0 || endpointLength !== 20)) throw new Error("motion-presets-terminal-invalid");
  if (stageCode === STAGE_ENDPOINT_ACK && transportCode === 8 && (linkFlag !== 0x04 || linkErrorCode === 0 || endpointLength !== 0)) throw new Error("motion-presets-terminal-invalid");
  if (stageCode === STAGE_ENDPOINT_ACK && transportCode !== 0 && transportCode !== 8 && (linkFlag !== 0 || linkErrorCode !== 0 || endpointLength !== 0)) throw new Error("motion-presets-terminal-invalid");

  const endpoint = endpointLength === 20 ? parseEndpointStatus(report.subarray(21, 41)) : null;
  return Object.freeze({
    stage: stageCode === STAGE_ACCEPTED ? "accepted" : "endpoint-acknowledgement",
    stageCode,
    kind: kindCode === KIND_COMMAND ? "command" : "status",
    kindCode,
    transport: TRANSPORT_RESULTS[transportCode],
    transportCode,
    requestId,
    linkSequence: report.readUInt32LE(13),
    messageType,
    linkFlag,
    linkError: LINK_ERRORS[linkErrorCode],
    linkErrorCode,
    endpoint,
    acceptedCount: report.readUInt32LE(41),
    terminalCount: report.readUInt32LE(45),
    controllerBootId: report.readUInt32LE(49),
    peerBootId: report.readUInt32LE(53),
    source: sourceCode === 0 ? null : enumName(sourceCode, SOURCES),
    sourceCode,
    operation: operationCode === 0 ? null : enumName(operationCode, OPERATIONS),
    operationCode,
    preset: presetCode === 0 ? null : enumName(presetCode, PRESETS),
    presetCode,
    repeat,
  });
}

module.exports = {
  ENDPOINT_RESULTS,
  ENDPOINT_STATES,
  FEATURE_REPORT_ID,
  INPUT_REPORT_ID,
  KIND_COMMAND,
  KIND_STATUS,
  LINK_ERRORS,
  OPERATIONS,
  PAYLOAD_BYTES,
  PRESETS,
  PROTOCOL_VERSION,
  REPORT_BYTES,
  SOURCES,
  STAGE_ACCEPTED,
  STAGE_ENDPOINT_ACK,
  TRANSPORT_RESULTS,
  crc16CcittFalse,
  decodeMotionPresetFeatureReport,
  decodeMotionPresetInputReport,
  encodeMotionPresetFeatureReport,
  parseEndpointStatus,
};
