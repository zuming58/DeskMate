import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { readFile } from "node:fs/promises";
import { createDiagnosticReport } from "../src/services/diagnostics.js";

const require = createRequire(import.meta.url);
const vectors = require("../contracts/deskmate-host/golden-vectors-easyinput-manual-calibration-v1.json").vectors;
const {
  decodeManualCalibrationFeatureReport,
  decodeManualCalibrationInputReport,
  encodeManualCalibrationFeatureReport,
  crc16CcittFalse,
} = require("../electron/manual-calibration-hid.cjs");
const { ManualCalibrationController } = require("../electron/manual-calibration-controller.cjs");
const { InputBridgeManager } = require("../electron/input-bridge.cjs");
const { parseBridgeLine } = require("../electron/input-bridge-protocol.cjs");

const vector = (name) => Buffer.from(vectors.find((item) => item.name === name).hex, "hex");
const at = "2026-09-02T10:00:00.000Z";

function linkErrorReport(code, { kind = "status" } = {}) {
  const report = vector(kind === "status" ? "status_terminal" : "select_terminal");
  report[8] = 8;
  report[22] = 0x04;
  report[23] = code;
  report[24] = 0;
  report.fill(0, 25, 44);
  report.writeUInt16LE(crc16CcittFalse(report.subarray(1, 60)), 60);
  return report;
}

test("T10D-B codec matches every host golden vector byte for byte", () => {
  assert.deepEqual(encodeManualCalibrationFeatureReport({ kind: "status", requestId: 0x01020304 }), vector("status_request"));
  assert.deepEqual(encodeManualCalibrationFeatureReport({ kind: "command", requestId: 0x01020305, confirmationId: 0xa1b2c3d4, command: { sessionId: 0x11223344, actionId: 1, armToken: 0, operation: "selectAxis", axis: "yaw" } }), vector("select_request"));
  assert.deepEqual(decodeManualCalibrationFeatureReport(vector("select_request")), { kind: "command", kindCode: 1, requestId: 0x01020305, confirmationId: 0xa1b2c3d4 });
  const accepted = decodeManualCalibrationInputReport(vector("select_accepted"));
  assert.equal(accepted.stage, "accepted");
  assert.equal(accepted.endpoint, null);
  assert.equal(accepted.acceptedCount, 1);
  const terminal = decodeManualCalibrationInputReport(vector("select_terminal"));
  assert.equal(terminal.stage, "terminal");
  assert.equal(terminal.endpoint.result, "completed");
  assert.equal(terminal.endpoint.state, "axis-selected");
  assert.equal(terminal.endpoint.completedOutputCount, 0);
  const status = decodeManualCalibrationInputReport(vector("status_terminal"));
  assert.equal(status.endpoint.type, "status");
  assert.equal(status.endpoint.state, "provisional-center");
  assert.equal(status.endpoint.fixedStepDegrees, 1);
});

test("codec fails closed on CRC, padding, arbitrary step and incomplete safety", () => {
  const badCrc = vector("status_terminal"); badCrc[60] ^= 1;
  assert.throws(() => decodeManualCalibrationInputReport(badCrc), /crc-invalid/);
  const badPadding = vector("select_request"); badPadding[63] = 1;
  assert.throws(() => decodeManualCalibrationFeatureReport(badPadding), /request-invalid/);
  assert.throws(() => encodeManualCalibrationFeatureReport({ kind: "command", requestId: 1, confirmationId: 2, command: { sessionId: 1, actionId: 1, armToken: 5, operation: "singleStep", axis: "yaw", direction: 2 } }), /output-invalid/);
  assert.throws(() => encodeManualCalibrationFeatureReport({ kind: "command", requestId: 1, confirmationId: 2, command: { sessionId: 1, actionId: 1, armToken: 5, operation: "arm", axis: "yaw", leaseMs: 3000, safetyFlags: 7 } }), /arm-invalid/);
});

test("codec classifies every frozen Link error and rejects unknown or inconsistent values", () => {
  const expected = ["UNKNOWN_TYPE", "BAD_PAYLOAD", "NOT_READY", "BUSY", "SEQUENCE_CONFLICT", "INTERNAL"];
  for (let code = 1; code <= expected.length; code += 1) {
    const decoded = decodeManualCalibrationInputReport(linkErrorReport(code));
    assert.equal(decoded.transport, "link-error");
    assert.equal(decoded.linkError, expected[code - 1]);
    assert.equal(decoded.linkErrorCode, code);
    assert.equal(decoded.endpoint, null);
  }
  assert.throws(() => decodeManualCalibrationInputReport(linkErrorReport(7)), /report-invalid/);
  const missingErrorFlag = linkErrorReport(3); missingErrorFlag[22] = 0; missingErrorFlag.writeUInt16LE(crc16CcittFalse(missingErrorFlag.subarray(1, 60)), 60);
  assert.throws(() => decodeManualCalibrationInputReport(missingErrorFlag), /terminal-invalid/);
  const errorOnTimeout = linkErrorReport(4); errorOnTimeout[8] = 7; errorOnTimeout.writeUInt16LE(crc16CcittFalse(errorOnTimeout.subarray(1, 60)), 60);
  assert.throws(() => decodeManualCalibrationInputReport(errorOnTimeout), /terminal-invalid/);
});

test("controller gates commands on a correlated status terminal and separates all evidence", async () => {
  const sent = [];
  const statusEndpoint = { type: "status", sessionId: 0x11223344, lastActionId: 5, completedOutputCount: 2, state: "axis-selected", selectedAxis: "yaw", flags: 0, armed: false, provisionalCenter: false, recenterRequired: false, emergencyStopped: false, faulted: false, adapterAvailable: false, lastError: 0, fixedStepDegrees: 1 };
  const commandEndpoint = { type: "command", sessionId: 0x11223344, actionId: 6, completedOutputCount: 2, result: "completed", resultCode: 0, state: "axis-selected", selectedAxis: "pitch", flags: 0, armed: false, provisionalCenter: false, recenterRequired: false, emergencyStopped: false, faulted: false, adapterAvailable: false, lastError: 0, fixedStepDegrees: 1 };
  const controller = new ManualCalibrationController({ randomUInt32: () => 100, now: () => at, send: async (report, { onAccepted }) => {
    const request = decodeManualCalibrationFeatureReport(report); sent.push(request);
    onAccepted({ requestId: request.requestId, confirmationId: request.confirmationId, acceptedCount: 9, linkSequence: 21 });
    return { ok: true, terminal: { stage: "terminal", transport: "completed", transportCode: 0, requestId: request.requestId, confirmationId: request.confirmationId, endpoint: request.kind === "status" ? statusEndpoint : commandEndpoint } };
  } });
  controller.handleBridgeStatus({ boardConnected: true });
  assert.equal((await controller.command({ operation: "selectAxis", axis: "yaw" })).reason, "manual-calibration-status-required");
  assert.equal((await controller.queryStatus()).ok, true);
  assert.equal(controller.snapshot().controlsEnabled, true);
  const result = await controller.command({ operation: "selectAxis", axis: "pitch" });
  assert.equal(result.ok, true);
  assert.equal(result.status.intent.operation, "selectAxis");
  assert.equal(result.status.accepted.acceptedCount, 9);
  assert.equal(result.status.terminal.endpoint.completedOutputCount, 2);
  assert.equal(sent[0].confirmationId, 0);
  assert.notEqual(sent[1].confirmationId, 0);
  assert.equal(sent[0].requestId < sent[1].requestId, true);
});

test("controller requires four attestations, one-use arm token and resets on USB epoch", async () => {
  let lastRequest;
  const statusEndpoint = { type: "status", sessionId: 7, lastActionId: 1, completedOutputCount: 0, state: "axis-selected", selectedAxis: "yaw", flags: 0, armed: false, provisionalCenter: false, recenterRequired: false, emergencyStopped: false, faulted: false, adapterAvailable: true, lastError: 0, fixedStepDegrees: 1 };
  const controller = new ManualCalibrationController({ randomUInt32: () => 55, send: async (report, { onAccepted }) => {
    lastRequest = decodeManualCalibrationFeatureReport(report); onAccepted({ requestId: lastRequest.requestId, confirmationId: lastRequest.confirmationId, acceptedCount: 1, linkSequence: 2 });
    const endpoint = lastRequest.kind === "status" ? statusEndpoint : { ...statusEndpoint, type: "command", actionId: 2, result: "completed", resultCode: 0, state: lastRequest.confirmationId ? "armed" : "axis-selected", armed: true };
    return { ok: true, terminal: { stage: "terminal", transport: "completed", transportCode: 0, endpoint } };
  } });
  controller.handleBridgeStatus({ boardConnected: true }); await controller.queryStatus();
  assert.equal((await controller.command({ operation: "arm", axis: "yaw", leaseMs: 3000, safety: { userPresent: true } })).reason, "manual-calibration-safety-incomplete");
  const safety = { userPresent: true, linkageUnloaded: true, currentLimitedSupply: true, cutoffReachable: true };
  assert.equal((await controller.command({ operation: "arm", axis: "yaw", leaseMs: 3000, safety })).ok, true);
  assert.equal((await controller.command({ operation: "singleStep", axis: "yaw", direction: 1 })).ok, true);
  assert.equal((await controller.command({ operation: "singleStep", axis: "yaw", direction: 1 })).reason, "manual-calibration-arm-required");
  const epoch = controller.snapshot().mountEpoch;
  controller.handleBridgeStatus({ boardConnected: false }); controller.handleBridgeStatus({ boardConnected: true });
  assert.equal(controller.snapshot().mountEpoch, epoch + 1);
  assert.equal(controller.snapshot().gate, "query-required");
  assert.equal(controller.snapshot().context, null);
});

test("status-only Link errors preserve transport evidence and keep output fail closed", async () => {
  for (const [linkError, linkErrorCode, expectedGate] of [["UNKNOWN_TYPE", 1, "unsupported"], ["NOT_READY", 3, "not-ready"], ["BUSY", 4, "faulted"]]) {
    const controller = new ManualCalibrationController({ randomUInt32: () => 77, now: () => at, send: async (report, { onAccepted }) => {
      const request = decodeManualCalibrationFeatureReport(report);
      onAccepted({ requestId: request.requestId, confirmationId: 0, acceptedCount: 1, linkSequence: 9 });
      return { ok: false, reason: "link-error", terminal: { stage: "terminal", kind: "status", requestId: request.requestId, transport: "link-error", transportCode: 8, linkError, linkErrorCode, endpoint: null } };
    } });
    controller.handleBridgeStatus({ boardConnected: true, calibrationCollectionWritable: true });
    const result = await controller.queryStatus();
    assert.equal(result.ok, false);
    assert.equal(result.reason, "link-error");
    assert.equal(result.status.gate, expectedGate);
    assert.equal(result.status.controlsEnabled, false);
    assert.equal(result.status.terminal.linkError, linkError);
    assert.equal(controller.diagnostics().accepted, true);
    assert.deepEqual(controller.diagnostics().linkError, { enum: linkError, code: linkErrorCode });
  }
});

test("manual calibration diagnostics are bounded, correlated and privacy safe", () => {
  const controller = new ManualCalibrationController({ send: async () => ({ ok: false }), randomUInt32: () => 10, now: () => at });
  assert.equal(controller.diagnostics().status, "unavailable");
  const report = createDiagnosticReport({ inputBridge: { boardConnected: true, manualCalibration: { status: "available", request: { kind: "status", id: 23, devicePath: "private" }, accepted: true, transport: "link-error", linkError: { enum: "NOT_READY", code: 3 }, endpoint: null, at, peerBootId: 99, transcript: "private speech" } } });
  assert.deepEqual(report.manualCalibration, { status: "available", request: { kind: "status", id: 23 }, accepted: true, transport: "link-error", linkError: { enum: "NOT_READY", code: 3 }, endpoint: null, at });
  assert.equal(JSON.stringify(report).includes("private"), false);
  assert.equal(JSON.stringify(report).includes("peerBootId"), false);
  const invalid = createDiagnosticReport({ inputBridge: { manualCalibration: { request: { kind: "raw", id: -1 }, transport: "link-error", linkError: { enum: "UNKNOWN_7", code: 7 }, endpoint: { result: "moved", state: "ready" }, at: "not-a-time" } } });
  assert.deepEqual(invalid.manualCalibration, { status: "unavailable", request: null, accepted: false, transport: "unavailable", linkError: { enum: "NONE", code: 0 }, endpoint: null, at: null });
  const mismatched = createDiagnosticReport({ inputBridge: { manualCalibration: { request: { kind: "status", id: 1 }, transport: "link-error", linkError: { enum: "BUSY", code: 3 }, endpoint: null, at } } });
  assert.equal(mismatched.manualCalibration.transport, "unavailable");
  assert.deepEqual(mismatched.manualCalibration.linkError, { enum: "NONE", code: 0 });
});

test("native bridge manager allows one request, relays accepted separately and resolves terminal", async () => {
  const writes = [];
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  child.stdin = { writable: true, write: (line, callback) => { writes.push(JSON.parse(line)); callback?.(); } };
  const manager = new InputBridgeManager({ executable: "bridge.exe", spawnImpl: () => child }); manager.start();
  manager.handleLine(JSON.stringify({ version: 1, type: "status", source: "easyinput-hid", key: "Device", action: "connected", boardConnected: true, time: at, sequence: 1 }));
  const accepted = [];
  const pending = manager.sendManualCalibration(vector("select_request"), { onAccepted: (value) => accepted.push(value) });
  assert.equal((await manager.sendManualCalibration(vector("select_request"))).reason, "manual-calibration-busy");
  assert.deepEqual(Object.keys(writes[0]).sort(), ["report", "requestId", "type", "version"].sort());
  assert.equal(writes[0].type, "manual-calibration-request");
  const event = (report, sequence) => JSON.stringify({ version: 1, type: "manual-calibration-report", source: "easyinput-hid", reportBase64: report.toString("base64"), time: at, sequence });
  manager.handleLine(event(vector("select_accepted"), 2));
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].stage, "accepted");
  manager.handleLine(event(vector("select_terminal"), 3));
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.terminal.endpoint.completedOutputCount, 0);
  manager.stop();
});

test("bridge line parsing strips raw report and rejects corrupted calibration input", () => {
  const base = { version: 1, type: "manual-calibration-report", source: "easyinput-hid", reportBase64: vector("select_terminal").toString("base64"), time: at, sequence: 3, devicePath: "private" };
  const parsed = parseBridgeLine(JSON.stringify(base));
  assert.equal(parsed.type, "manual-calibration-report");
  assert.equal(Object.hasOwn(parsed, "reportBase64"), false);
  assert.equal(JSON.stringify(parsed).includes("private"), false);
  const corrupted = vector("select_terminal"); corrupted[60] ^= 1;
  assert.equal(parseBridgeLine(JSON.stringify({ ...base, reportBase64: corrupted.toString("base64") })), null);
});

test("UI and IPC expose only the frozen safety controls and three evidence layers", async () => {
  const [pages, preload, main, native, protocol] = await Promise.all([
    readFile(new URL("../src/pages.jsx", import.meta.url), "utf8"), readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"), readFile(new URL("../native/DeskMate.InputBridge/Program.cs", import.meta.url), "utf8"), readFile(new URL("../native/DeskMate.InputBridge/VendorReportProtocol.cs", import.meta.url), "utf8"),
  ]);
  const panel = pages.slice(pages.indexOf("function ManualCalibrationPanel"), pages.indexOf("export function ConnectionsPage"));
  for (const copy of ["设备周围无阻挡，我在设备旁", "开始手动控制（会先回中）", "解除急停并重新开始（会先回中）", "重连和状态查询不会自动清锁", "按住向", "回到中心", "立即停止", "60 秒无操作自动退出", "调试详情", "EasyInput accepted", "小智 terminal", "accepted 不等于已转动或成功"]) assert.match(panel, new RegExp(copy.replace(/[+°]/g, "\\$&")));
  assert.match(panel, /recoverEmergencyStop: status\.phase === "emergency-stopped"/);
  assert.match(panel, /status\.centerReady && <div className="manual-control-pad"/);
  assert.match(panel, /queryManualCalibration\(\)\.catch\(\(\) => \{\}\)/);
  for (const copy of ["当前小智固件不支持手动校准协议", "协议存在，但校准 owner/真实适配器未就绪"]) assert.match(pages, new RegExp(copy));
  for (const removed of ["机械连杆已卸载", "舵机使用独立限流电源", "断电开关可立即触达", "一次性安全解锁", "生成一次性解锁", "解锁租期", "每次输出消耗一次", ">-1°<", ">+1°<"]) assert.doesNotMatch(panel, new RegExp(removed.replace(/[+°]/g, "\\$&")));
  assert.doesNotMatch(panel, /type="number"|name="(?:pulse|duty|gpio|angle)|sendManualCalibrationCommand|leaseMs|safetyFlags/i);
  for (const method of ["getManualControlStatus", "startManualControl", "establishManualControlCenter", "pressManualControlDirection", "releaseManualControlDirection", "recenterManualControl", "emergencyStopManualControl", "endManualControl", "onManualControlStatus"]) assert.match(preload, new RegExp(method));
  assert.match(main, /desktop:get-manual-calibration-status/); assert.match(main, /desktop:send-manual-calibration-command/);
  for (const channel of ["desktop:get-manual-control-status", "desktop:start-manual-control", "desktop:manual-control-press", "desktop:manual-control-release", "desktop:manual-control-recenter", "desktop:manual-control-emergency-stop", "desktop:end-manual-control"]) assert.match(main, new RegExp(channel));
  assert.match(main, /recoverEmergencyStop: value\.recoverEmergencyStop === true/);
  assert.match(main, /mainWindow\.on\("blur"[\s\S]*manualControlCoordinator\?\.end\("window-blur"\)/);
  assert.match(panel, /manual-control-start__actions[\s\S]*立即停止/);
  assert.match(panel, /onPointerCancel=/);
  assert.match(panel, /visibilitychange/);
  assert.match(main, /manualCalibration: manualCalibrationController\?\.diagnostics/);
  assert.match(native, /VendorReportProtocol\.IsValidManualCalibrationRequest\(report\)/); assert.match(native, /VendorReportProtocol\.IsValidManualCalibrationResponse\(report\)/);
  assert.match(protocol, /report\[0\] != 0x16/); assert.match(protocol, /report\[0\] != 0x17/);
});
