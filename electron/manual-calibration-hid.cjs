"use strict";

const FEATURE_REPORT_ID = 0x16;
const INPUT_REPORT_ID = 0x17;
const REPORT_BYTES = 64;
const PAYLOAD_BYTES = 63;
const PROTOCOL_VERSION = 1;
const KIND_COMMAND = 1;
const KIND_STATUS = 2;
const STAGE_ACCEPTED = 1;
const STAGE_TERMINAL = 2;
const AXIS = Object.freeze({ yaw: 0, pitch: 1, none: 0xff });
const OPERATIONS = Object.freeze({ arm: 0, selectAxis: 1, provisionalCenter: 2, singleStep: 3, recenter: 4, emergencyStop: 5, clearEmergencyStop: 6 });
const TRANSPORT_RESULTS = Object.freeze([
  "completed", "malformed", "busy", "stale", "conflict", "link-not-ready", "link-queue-busy", "timeout", "link-error", "peer-disconnected-or-restarted", "invalid-response", "internal",
]);
const LINK_ERRORS = Object.freeze(["NONE", "UNKNOWN_TYPE", "BAD_PAYLOAD", "NOT_READY", "BUSY", "SEQUENCE_CONFLICT", "INTERNAL"]);
const ENDPOINT_RESULTS = Object.freeze([
  "completed", "duplicate", "not-ready", "bad-payload", "wrong-session", "stale-action", "arm-required", "arm-expired", "wrong-axis", "step-out-of-range", "center-required", "emergency-stopped", "faulted", "adapter-unavailable", "adapter-failure", "action-conflict", "safety-not-confirmed",
]);
const OWNER_STATES = Object.freeze(["locked", "axis-selected", "armed", "provisional-center", "emergency-stopped", "faulted"]);

function uint32(value, name, { allowZero = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > 0xffffffff) throw new Error(`manual-calibration-${name}-invalid`);
  return value >>> 0;
}

function crc16CcittFalse(data) {
  let crc = 0xffff;
  for (const value of data) {
    crc ^= value << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function assertZero(data, start, end = data.length) {
  for (let index = start; index < end; index += 1) if (data[index] !== 0) throw new Error("manual-calibration-padding-invalid");
}

function normalizeAxis(value, { allowNone = false } = {}) {
  const axis = typeof value === "string" ? AXIS[value] : value;
  if (axis === AXIS.yaw || axis === AXIS.pitch || (allowNone && axis === AXIS.none)) return axis;
  throw new Error("manual-calibration-axis-invalid");
}

function encodeCommandPayload(value = {}) {
  const operation = typeof value.operation === "string" ? OPERATIONS[value.operation] : value.operation;
  if (!Number.isInteger(operation) || operation < 0 || operation > 6) throw new Error("manual-calibration-operation-invalid");
  const sessionId = uint32(value.sessionId, "session");
  const actionId = uint32(value.actionId, "action");
  let armToken = uint32(value.armToken ?? 0, "arm-token", { allowZero: true });
  let axis = normalizeAxis(value.axis, { allowNone: operation === OPERATIONS.emergencyStop || operation === OPERATIONS.clearEmergencyStop });
  let direction = Number(value.direction || 0);
  let leaseMs = Number(value.leaseMs || 0);
  let safetyFlags = Number(value.safetyFlags || 0);
  if (operation === OPERATIONS.arm) {
    if (armToken === 0 || direction !== 0 || !Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 5000 || safetyFlags !== 0x0f) throw new Error("manual-calibration-arm-invalid");
  } else if (operation === OPERATIONS.selectAxis) {
    if (armToken !== 0 || direction !== 0 || leaseMs !== 0 || safetyFlags !== 0) throw new Error("manual-calibration-select-invalid");
  } else if ([OPERATIONS.provisionalCenter, OPERATIONS.singleStep, OPERATIONS.recenter].includes(operation)) {
    if (armToken === 0 || leaseMs !== 0 || safetyFlags !== 0 || (operation === OPERATIONS.singleStep ? ![-1, 1].includes(direction) : direction !== 0)) throw new Error("manual-calibration-output-invalid");
  } else {
    if (axis !== AXIS.none || armToken !== 0 || direction !== 0 || leaseMs !== 0 || safetyFlags !== 0) throw new Error("manual-calibration-stop-invalid");
  }
  const payload = Buffer.alloc(19);
  payload.writeUInt32LE(sessionId, 0);
  payload.writeUInt32LE(actionId, 4);
  payload.writeUInt32LE(armToken, 8);
  payload[12] = operation;
  payload[13] = axis;
  payload.writeInt8(direction, 14);
  payload.writeUInt16LE(leaseMs, 16);
  payload[18] = safetyFlags;
  return payload;
}

function encodeManualCalibrationFeatureReport(value = {}) {
  const kind = value.kind === "status" || value.kind === KIND_STATUS ? KIND_STATUS : value.kind === "command" || value.kind === KIND_COMMAND ? KIND_COMMAND : 0;
  if (!kind) throw new Error("manual-calibration-kind-invalid");
  const requestId = uint32(value.requestId, "request");
  const confirmationId = uint32(value.confirmationId ?? 0, "confirmation", { allowZero: true });
  if ((kind === KIND_STATUS && confirmationId !== 0) || (kind === KIND_COMMAND && confirmationId === 0)) throw new Error("manual-calibration-confirmation-invalid");
  const report = Buffer.alloc(REPORT_BYTES);
  report[0] = FEATURE_REPORT_ID;
  report.write("DMCR", 1, "ascii");
  report[5] = PROTOCOL_VERSION;
  report[6] = kind;
  report[7] = kind === KIND_COMMAND ? 0x01 : 0;
  report.writeUInt32LE(requestId, 9);
  report.writeUInt32LE(confirmationId, 13);
  if (kind === KIND_COMMAND) encodeCommandPayload(value.command).copy(report, 17);
  const crc = crc16CcittFalse(report.subarray(1, 36));
  report.writeUInt16LE(crc, 36);
  return report;
}

function decodeManualCalibrationFeatureReport(value) {
  const report = Buffer.isBuffer(value) ? Buffer.from(value) : value instanceof Uint8Array ? Buffer.from(value) : null;
  if (!report || report.length !== REPORT_BYTES || report[0] !== FEATURE_REPORT_ID || report.subarray(1, 5).toString("ascii") !== "DMCR" || report[5] !== PROTOCOL_VERSION) throw new Error("manual-calibration-request-invalid");
  const kindCode = report[6]; const requestId = report.readUInt32LE(9); const confirmationId = report.readUInt32LE(13);
  if (![KIND_COMMAND, KIND_STATUS].includes(kindCode) || requestId === 0) throw new Error("manual-calibration-request-invalid");
  let expected;
  if (kindCode === KIND_STATUS) expected = encodeManualCalibrationFeatureReport({ kind: "status", requestId, confirmationId });
  else {
    const payload = report.subarray(17, 36); const operationCode = payload[12]; const operation = Object.keys(OPERATIONS).find((key) => OPERATIONS[key] === operationCode);
    const axis = payload[13] === 0 ? "yaw" : payload[13] === 1 ? "pitch" : payload[13] === 0xff ? "none" : "invalid";
    expected = encodeManualCalibrationFeatureReport({ kind: "command", requestId, confirmationId, command: { sessionId: payload.readUInt32LE(0), actionId: payload.readUInt32LE(4), armToken: payload.readUInt32LE(8), operation, axis, direction: payload.readInt8(14), leaseMs: payload.readUInt16LE(16), safetyFlags: payload[18] } });
  }
  if (!expected.equals(report)) throw new Error("manual-calibration-request-invalid");
  return Object.freeze({ kind: kindCode === KIND_COMMAND ? "command" : "status", kindCode, requestId, confirmationId });
}

function parseEndpoint(bytes, messageType) {
  if (messageType === 0x21) {
    if (bytes.length !== 18 || bytes[17] !== 0 || bytes[16] !== 10) throw new Error("manual-calibration-status-payload-invalid");
    const state = bytes[12]; const axis = bytes[13]; const flags = bytes[14];
    if (state > 5 || ![0, 1, 0xff].includes(axis) || (flags & 0xc0) !== 0) throw new Error("manual-calibration-status-payload-invalid");
    return Object.freeze({
      type: "status", sessionId: bytes.readUInt32LE(0), lastActionId: bytes.readUInt32LE(4), completedOutputCount: bytes.readUInt32LE(8),
      state: OWNER_STATES[state], stateCode: state, selectedAxis: axis === 0xff ? "none" : axis === 0 ? "yaw" : "pitch", flags,
      armed: Boolean(flags & 0x01), provisionalCenter: Boolean(flags & 0x02), recenterRequired: Boolean(flags & 0x04), emergencyStopped: Boolean(flags & 0x08), faulted: Boolean(flags & 0x10), adapterAvailable: Boolean(flags & 0x20), lastError: bytes[15], fixedStepDegrees: 1,
    });
  }
  if (messageType === 0x20) {
    if (bytes.length !== 19 || bytes[18] !== 0 || bytes[17] !== 10 || bytes[12] > 16 || bytes[13] > 5 || ![0, 1, 0xff].includes(bytes[14]) || (bytes[15] & 0xc0) !== 0) throw new Error("manual-calibration-command-payload-invalid");
    const flags = bytes[15];
    return Object.freeze({
      type: "command", sessionId: bytes.readUInt32LE(0), actionId: bytes.readUInt32LE(4), completedOutputCount: bytes.readUInt32LE(8),
      result: ENDPOINT_RESULTS[bytes[12]], resultCode: bytes[12], state: OWNER_STATES[bytes[13]], stateCode: bytes[13], selectedAxis: bytes[14] === 0xff ? "none" : bytes[14] === 0 ? "yaw" : "pitch", flags,
      armed: Boolean(flags & 0x01), provisionalCenter: Boolean(flags & 0x02), recenterRequired: Boolean(flags & 0x04), emergencyStopped: Boolean(flags & 0x08), faulted: Boolean(flags & 0x10), adapterAvailable: Boolean(flags & 0x20), lastError: bytes[16], fixedStepDegrees: 1,
    });
  }
  throw new Error("manual-calibration-message-type-invalid");
}

function decodeManualCalibrationInputReport(value) {
  const report = Buffer.isBuffer(value) ? Buffer.from(value) : value instanceof Uint8Array ? Buffer.from(value) : null;
  if (!report || report.length !== REPORT_BYTES || report[0] !== INPUT_REPORT_ID || report.subarray(1, 5).toString("ascii") !== "DMCS" || report[5] !== PROTOCOL_VERSION) throw new Error("manual-calibration-report-invalid");
  const stageCode = report[6]; const kindCode = report[7]; const transportCode = report[8];
  const linkFlag = report[22]; const linkErrorCode = report[23];
  if (![STAGE_ACCEPTED, STAGE_TERMINAL].includes(stageCode) || ![KIND_COMMAND, KIND_STATUS].includes(kindCode) || transportCode > 11 || ![0, 0x02, 0x04].includes(linkFlag) || linkErrorCode >= LINK_ERRORS.length || report[24] > 19) throw new Error("manual-calibration-report-invalid");
  if (report.readUInt16LE(60) !== crc16CcittFalse(report.subarray(1, 60))) throw new Error("manual-calibration-crc-invalid");
  assertZero(report, 62);
  const endpointLength = report[24];
  assertZero(report, 25 + endpointLength, 44);
  const messageType = report[21];
  if (messageType !== (kindCode === KIND_COMMAND ? 0x20 : 0x21)) throw new Error("manual-calibration-message-type-invalid");
  if (stageCode === STAGE_ACCEPTED && (transportCode !== 0 || linkFlag !== 0 || linkErrorCode !== 0 || endpointLength !== 0)) throw new Error("manual-calibration-accepted-invalid");
  if (stageCode === STAGE_TERMINAL && transportCode === 0 && (linkFlag !== 0x02 || linkErrorCode !== 0 || endpointLength !== (kindCode === KIND_COMMAND ? 19 : 18))) throw new Error("manual-calibration-terminal-invalid");
  if (stageCode === STAGE_TERMINAL && transportCode === 8 && (linkFlag !== 0x04 || linkErrorCode === 0 || endpointLength !== 0)) throw new Error("manual-calibration-terminal-invalid");
  if (stageCode === STAGE_TERMINAL && transportCode !== 0 && transportCode !== 8 && (linkFlag !== 0 || linkErrorCode !== 0 || endpointLength !== 0)) throw new Error("manual-calibration-terminal-invalid");
  const endpoint = endpointLength ? parseEndpoint(report.subarray(25, 25 + endpointLength), messageType) : null;
  return Object.freeze({
    stage: stageCode === STAGE_ACCEPTED ? "accepted" : "terminal", stageCode, kind: kindCode === KIND_COMMAND ? "command" : "status", kindCode,
    transport: TRANSPORT_RESULTS[transportCode], transportCode, requestId: report.readUInt32LE(9), confirmationId: report.readUInt32LE(13), linkSequence: report.readUInt32LE(17),
    messageType, linkFlag, linkError: LINK_ERRORS[linkErrorCode], linkErrorCode, endpoint,
    acceptedCount: report.readUInt32LE(44), terminalCount: report.readUInt32LE(48), controllerBootId: report.readUInt32LE(52), peerBootId: report.readUInt32LE(56),
  });
}

module.exports = {
  AXIS, ENDPOINT_RESULTS, FEATURE_REPORT_ID, INPUT_REPORT_ID, KIND_COMMAND, KIND_STATUS, LINK_ERRORS, OPERATIONS, OWNER_STATES, PROTOCOL_VERSION, REPORT_BYTES, TRANSPORT_RESULTS,
  crc16CcittFalse, decodeManualCalibrationFeatureReport, decodeManualCalibrationInputReport, encodeCommandPayload, encodeManualCalibrationFeatureReport,
};
