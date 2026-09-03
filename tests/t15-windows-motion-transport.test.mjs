import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { readFile } from "node:fs/promises";
import { createDiagnosticReport } from "../src/services/diagnostics.js";

const require = createRequire(import.meta.url);
const {
  crc16CcittFalse,
  decodeMotionPresetFeatureReport,
  decodeMotionPresetInputReport,
  encodeMotionPresetFeatureReport,
} = require("../electron/motion-presets-hid.cjs");
const { MotionPresetService } = require("../electron/motion-preset-service.cjs");
const { InputBridgeManager } = require("../electron/input-bridge.cjs");
const { parseBridgeLine } = require("../electron/input-bridge-protocol.cjs");
const hostVectors = require("../contracts/deskmate-host/golden-vectors-easyinput-motion-presets-v1.json").vectors;
const linkVectors = require("../contracts/deskmate-link/golden-vectors-t15-motion-presets-v1.json").vectors;

const at = "2026-09-02T12:00:00.000Z";
const controllerBootId = 0x11223344;
const peerBootId = 0x55667788;

function fullReport(reportId, payloadHex) {
  return Buffer.concat([Buffer.from([reportId]), Buffer.from(payloadHex, "hex")]);
}

function endpoint(overrides = {}) {
  return {
    sessionId: controllerBootId,
    actionId: 0,
    completedPresetCounter: 5,
    result: "completed",
    resultCode: 2,
    state: "ready",
    stateCode: 2,
    operation: "run",
    operationCode: 1,
    preset: "attention",
    presetCode: 1,
    requestedRepeat: 1,
    completedRepeat: 1,
    source: "UI",
    sourceCode: 1,
    flags: 0x23,
    adapterAvailable: true,
    logicalCenterAccepted: true,
    emergencyStopLatched: false,
    faulted: false,
    servoOutputEnabled: false,
    operationTerminal: true,
    duplicateResponse: false,
    ...overrides,
  };
}

function terminal(request, endpointValue, overrides = {}) {
  return {
    stage: "endpoint-acknowledgement",
    stageCode: 2,
    kind: request.kind,
    kindCode: request.kindCode,
    transport: "completed",
    transportCode: 0,
    requestId: request.requestId,
    endpoint: endpointValue,
    controllerBootId,
    peerBootId,
    source: request.source,
    sourceCode: request.sourceCode,
    operation: request.operation,
    operationCode: request.operationCode,
    preset: request.preset,
    presetCode: request.presetCode,
    repeat: request.repeat,
    ...overrides,
  };
}

function requestIds(start = 100) {
  let value = start;
  return { next: () => ++value };
}

function fakeClock() {
  let value = 0;
  return {
    now: () => value,
    schedule: (callback, milliseconds) => { value += milliseconds; queueMicrotask(callback); return { value }; },
    cancel: () => {},
  };
}

function responseReport(request, endpointValue, { stage = 2, transport = 0, acceptedCount = 1, terminalCount = 1, responseControllerBootId = controllerBootId, responsePeerBootId = peerBootId } = {}) {
  const report = Buffer.alloc(64);
  report[0] = 0x19;
  report.write("DMRS", 1, "ascii");
  report[5] = 1;
  report[6] = stage;
  report[7] = request.kindCode;
  report[8] = transport;
  report.writeUInt32LE(request.requestId, 9);
  report.writeUInt32LE(stage === 1 ? 0 : 16, 13);
  report[17] = request.kind === "command" ? 0x22 : 0x23;
  report[18] = stage === 2 && transport === 0 ? 0x02 : transport === 8 ? 0x04 : 0;
  report[19] = transport === 8 ? 3 : 0;
  report[20] = stage === 2 && transport === 0 ? 20 : 0;
  if (report[20] === 20) {
    report.writeUInt32LE(endpointValue.sessionId, 21);
    report.writeUInt32LE(endpointValue.actionId, 25);
    report.writeUInt32LE(endpointValue.completedPresetCounter, 29);
    report[33] = endpointValue.resultCode;
    report[34] = endpointValue.stateCode;
    report[35] = endpointValue.operationCode;
    report[36] = endpointValue.presetCode;
    report[37] = endpointValue.requestedRepeat;
    report[38] = endpointValue.completedRepeat;
    report[39] = endpointValue.sourceCode;
    report[40] = endpointValue.flags;
  }
  report.writeUInt32LE(acceptedCount, 41);
  report.writeUInt32LE(terminalCount, 45);
  report.writeUInt32LE(responseControllerBootId, 49);
  report.writeUInt32LE(responsePeerBootId, 53);
  report[57] = request.sourceCode;
  report[58] = request.operationCode;
  report[59] = request.presetCode;
  report[60] = request.repeat;
  report.writeUInt16LE(crc16CcittFalse(report.subarray(1, 61)), 61);
  return report;
}

test("0x18/0x19 strict codec matches both frozen golden-vector sets", () => {
  const run = encodeMotionPresetFeatureReport({ kind: "command", requestId: 0x01020304, source: "UI", operation: "run", preset: "nod", repeat: 2 });
  const status = encodeMotionPresetFeatureReport({ kind: "status", requestId: 0x01020305 });
  assert.deepEqual(run, fullReport(0x18, hostVectors.run_nod_twice_request));
  assert.deepEqual(status, fullReport(0x18, hostVectors.status_request));
  assert.equal(run.subarray(9, 13).toString("hex"), Buffer.from(linkVectors.run_nod_twice_request_payload, "hex").subarray(4, 8).toString("hex"));

  const accepted = decodeMotionPresetInputReport(fullReport(0x19, hostVectors.run_accepted));
  const acknowledgement = decodeMotionPresetInputReport(fullReport(0x19, hostVectors.run_terminal_ack));
  const completed = decodeMotionPresetInputReport(fullReport(0x19, hostVectors.status_completed));
  assert.equal(accepted.stage, "accepted");
  assert.equal(acknowledgement.endpoint.operation, "run");
  assert.equal(acknowledgement.endpoint.operationTerminal, false);
  assert.equal(completed.endpoint.operationTerminal, true);
  assert.equal(completed.endpoint.completedRepeat, 2);
  assert.deepEqual(fullReport(0x19, hostVectors.run_terminal_ack).subarray(21, 41), Buffer.from(linkVectors.run_nod_twice_ack_payload, "hex"));
  assert.deepEqual(fullReport(0x19, hostVectors.status_completed).subarray(21, 41), Buffer.from(linkVectors.run_nod_twice_completed_status_payload, "hex"));
});

test("codec rejects missing defaults, forbidden controls, invalid source matrix, CRC, padding and impossible endpoint state", () => {
  assert.throws(() => encodeMotionPresetFeatureReport({ kind: "command", requestId: 1, source: "UI", operation: "run", preset: "nod" }), /repeat-invalid/);
  for (const forbidden of ["angle", "pwm", "pulseWidth", "gpio", "velocity", "waypoint"]) {
    assert.throws(() => encodeMotionPresetFeatureReport({ kind: "command", requestId: 1, source: "UI", operation: "run", preset: "nod", repeat: 2, [forbidden]: 1 }), /request-invalid/);
  }
  assert.throws(() => encodeMotionPresetFeatureReport({ kind: "command", requestId: 1, source: "voice", operation: "clearEmergencyStopAndCenter" }), /source-invalid/);
  assert.throws(() => encodeMotionPresetFeatureReport({ kind: "command", requestId: 1, source: "idle", operation: "stopAndCenter" }), /source-invalid/);
  const badCrc = fullReport(0x19, hostVectors.status_completed); badCrc[61] ^= 1;
  assert.throws(() => decodeMotionPresetInputReport(badCrc), /crc-invalid/);
  const badPadding = fullReport(0x18, hostVectors.status_request); badPadding[63] = 1;
  assert.throws(() => decodeMotionPresetFeatureReport(badPadding), /padding-invalid|request-invalid/);
  const request = decodeMotionPresetFeatureReport(fullReport(0x18, hostVectors.status_request));
  const impossible = endpoint({ actionId: 0x01020304, completedPresetCounter: 1, preset: "nod", presetCode: 2, requestedRepeat: 2, completedRepeat: 2, flags: 0x03, operationTerminal: false });
  const impossibleReport = responseReport(request, impossible);
  assert.throws(() => decodeMotionPresetInputReport(impossibleReport), /endpoint-invalid/);
});

test("native bridge routes 0x18/0x19 only through the exact FF00:0009 motion collection", async () => {
  const [program, protocol] = await Promise.all([
    readFile(new URL("../native/DeskMate.InputBridge/Program.cs", import.meta.url), "utf8"),
    readFile(new URL("../native/DeskMate.InputBridge/VendorReportProtocol.cs", import.meta.url), "utf8"),
  ]);
  assert.match(program, /MotionPresets = new\(0x303A, 0x1006, 0xFF00, 0x0009, 64, 64\)/);
  assert.match(program, /ManualCalibration = new\(0x303A, 0x1006, 0xFF00, 0x0007, 64, 64\)/);
  assert.match(program, /!ManualCalibration\.Matches\(0x303A, 0x1006, 0xFF00, 0x0009, 64, 64\)/);
  assert.match(program, /!MotionPresets\.Matches\(0x303A, 0x1006, 0xFF00, 0x0007, 64, 64\)/);
  assert.match(program, /0x18 => MotionPresets/);
  assert.match(program, /WriteMotionPresetRequest[\s\S]*ForFeatureReport\(report\[0\]\)[\s\S]*HidD_SetFeature/);
  assert.match(program, /report\.Length == 64 && report\[0\] == 0x19[\s\S]*IsValidMotionPresetResponse/);
  assert.match(program, /HidUsageVendorMotionPresets = 0x09/);
  assert.match(program, /motionCollectionWritable: availability\.MotionWritable/);
  assert.match(protocol, /IsValidMotionPresetRequest/);
  assert.match(protocol, /IsValidMotionPresetResponse/);
  assert.doesNotMatch(program, /FeatureReportByteLength >= 64|InputReportByteLength >= 64/);
});

test("native manager correlates one request, deduplicates accepted notices and strips raw reports", async () => {
  const writes = [];
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  child.stdin = { writable: true, write: (line, callback) => { writes.push(JSON.parse(line)); callback?.(); } };
  const manager = new InputBridgeManager({ executable: "bridge.exe", spawnImpl: () => child });
  manager.start();
  manager.handleLine(JSON.stringify({ version: 1, type: "status", source: "easyinput-hid", key: "Device", action: "connected", boardConnected: true, configCollectionWritable: true, calibrationCollectionWritable: true, motionCollectionWritable: true, time: at, sequence: 1 }));
  const run = fullReport(0x18, hostVectors.run_nod_twice_request);
  const notices = [];
  const pending = manager.sendMotionPreset(run, { onAccepted: (value) => notices.push(value) });
  assert.equal((await manager.sendMotionPreset(run)).reason, "motion-preset-busy");
  assert.equal(writes[0].type, "motion-preset-request");
  const emit = (report, sequence) => manager.handleLine(JSON.stringify({ version: 1, type: "motion-preset-report", source: "easyinput-hid", reportBase64: report.toString("base64"), time: at, sequence }));
  emit(fullReport(0x19, hostVectors.run_accepted), 2);
  emit(fullReport(0x19, hostVectors.run_accepted), 3);
  emit(fullReport(0x19, hostVectors.run_terminal_ack), 4);
  assert.equal(notices.length, 1);
  assert.equal((await pending).terminal.endpoint.result, "accepted");
  const parsed = parseBridgeLine(JSON.stringify({ version: 1, type: "motion-preset-report", source: "easyinput-hid", reportBase64: fullReport(0x19, hostVectors.status_completed).toString("base64"), time: at, sequence: 5, devicePath: "private" }));
  assert.equal(parsed.motionPreset.endpoint.operationTerminal, true);
  assert.equal(Object.hasOwn(parsed, "reportBase64"), false);
  assert.equal(JSON.stringify(parsed).includes("private"), false);
  manager.stop();
});

test("native motion write failures become actionable bounded reasons", () => {
  const base = { version: 1, type: "motion-preset-write", source: "easyinput-hid", requestId: "motion-12345678", ok: false, time: at, sequence: 1 };
  assert.equal(parseBridgeLine(JSON.stringify({ ...base, reason: "hid-set-feature-1" })).reason, "motion-hid-write-failed");
  assert.equal(parseBridgeLine(JSON.stringify({ ...base, reason: "compatible-vendor-hid-not-found" })).reason, "motion-preset-interface-unavailable");
  assert.equal(parseBridgeLine(JSON.stringify({ ...base, reason: "private-device-path" })).reason, "motion-preset-write-failed");
});

test("run performs status-first polling and reports completion only with the full 316eb1a evidence gate", async () => {
  let runAction = 0;
  let statusAfterRun = 0;
  const calls = [];
  const service = new MotionPresetService({
    requestIdSequence: requestIds(),
    pollIntervalMs: 10,
    operationTimeoutMs: 250,
    send: async (report, { onAccepted }) => {
      const request = decodeMotionPresetFeatureReport(report); calls.push(request);
      onAccepted?.({ acceptedCount: calls.length });
      if (request.kind === "command") {
        runAction = request.requestId;
        return { ok: true, terminal: terminal(request, endpoint({ actionId: runAction, result: "accepted", resultCode: 0, state: "running", stateCode: 3, preset: "nod", presetCode: 2, requestedRepeat: 2, completedRepeat: 0, flags: 0x11, logicalCenterAccepted: false, servoOutputEnabled: true, operationTerminal: false })) };
      }
      if (!runAction) return { ok: true, terminal: terminal(request, endpoint({ actionId: 90 })) };
      statusAfterRun += 1;
      return { ok: true, terminal: terminal(request, statusAfterRun === 1
        ? endpoint({ actionId: runAction, result: "accepted", resultCode: 0, state: "running", stateCode: 3, preset: "nod", presetCode: 2, requestedRepeat: 2, completedRepeat: 1, flags: 0x11, logicalCenterAccepted: false, servoOutputEnabled: true, operationTerminal: false })
        : endpoint({ actionId: runAction, completedPresetCounter: 6, preset: "nod", presetCode: 2, requestedRepeat: 2, completedRepeat: 2 })) };
    },
  });
  service.handleBridgeStatus({ boardConnected: true, motionCollectionWritable: true });
  const result = await service.runPreset("nod", 2, "UI");
  assert.equal(result.ok, true);
  assert.equal(result.endpointReportedComplete, true);
  assert.deepEqual(calls.map((item) => item.kind === "status" ? "status" : item.operation), ["status", "run", "status", "status"]);
  assert.equal(result.endpoint.completedPresetCounter, 6);
  assert.equal(JSON.stringify(result).includes("BootId"), false);
  assert.doesNotMatch(JSON.stringify(result), /physical|angle|pwm|pulse|gpio/i);
});

test("run status preflight automatically stops, centers and waits READY before the preset", async () => {
  let active = "initial";
  let stopAction = 0;
  let runAction = 0;
  const operations = [];
  const service = new MotionPresetService({
    requestIdSequence: requestIds(200),
    pollIntervalMs: 10,
    operationTimeoutMs: 250,
    send: async (report) => {
      const request = decodeMotionPresetFeatureReport(report); operations.push(request.kind === "status" ? "status" : request.operation);
      if (request.kind === "command" && request.operation === "stopAndCenter") {
        active = "stop"; stopAction = request.requestId;
        return { ok: true, terminal: terminal(request, endpoint({ actionId: stopAction, result: "accepted", resultCode: 0, state: "recentering", stateCode: 1, operation: "stopAndCenter", operationCode: 2, preset: null, presetCode: 0, requestedRepeat: 0, completedRepeat: 0, source: "voice", sourceCode: 2, flags: 0x01, logicalCenterAccepted: false, operationTerminal: false })) };
      }
      if (request.kind === "command") {
        active = "run"; runAction = request.requestId;
        return { ok: true, terminal: terminal(request, endpoint({ actionId: runAction, result: "accepted", resultCode: 0, state: "running", stateCode: 3, operation: "run", operationCode: 1, preset: "search", presetCode: 3, requestedRepeat: 1, completedRepeat: 0, source: "voice", sourceCode: 2, flags: 0x11, logicalCenterAccepted: false, servoOutputEnabled: true, operationTerminal: false })) };
      }
      if (active === "initial") return { ok: true, terminal: terminal(request, endpoint({
        actionId: 0,
        completedPresetCounter: 0,
        result: "recenter-required",
        resultCode: 9,
        state: "not-ready",
        stateCode: 0,
        operation: null,
        operationCode: 0,
        preset: null,
        presetCode: 0,
        requestedRepeat: 0,
        completedRepeat: 0,
        source: null,
        sourceCode: 0,
        flags: 0x31,
        logicalCenterAccepted: false,
        servoOutputEnabled: true,
      })) };
      if (active === "stop") {
        active = "centered";
        return { ok: true, terminal: terminal(request, endpoint({ actionId: stopAction, operation: "stopAndCenter", operationCode: 2, preset: null, presetCode: 0, requestedRepeat: 0, completedRepeat: 0, source: "voice", sourceCode: 2 })) };
      }
      return { ok: true, terminal: terminal(request, endpoint({ actionId: runAction, completedPresetCounter: 6, preset: "search", presetCode: 3, requestedRepeat: 1, completedRepeat: 1, source: "voice", sourceCode: 2 })) };
    },
  });
  service.handleBridgeStatus({ boardConnected: true, motionCollectionWritable: true });
  const result = await service.runPreset("search", 1, "voice");
  assert.equal(result.ok, true);
  assert.deepEqual(operations, ["status", "stopAndCenter", "status", "run", "status"]);
});

test("duplicate RUN acknowledgement is polled without replaying the command", async () => {
  let runAction = 0;
  let runWrites = 0;
  const service = new MotionPresetService({
    requestIdSequence: requestIds(300),
    pollIntervalMs: 10,
    operationTimeoutMs: 250,
    send: async (report) => {
      const request = decodeMotionPresetFeatureReport(report);
      if (request.kind === "status") return { ok: true, terminal: terminal(request, runAction ? endpoint({ actionId: runAction, completedPresetCounter: 6 }) : endpoint({ actionId: 290 })) };
      runWrites += 1; runAction = request.requestId;
      return { ok: true, terminal: terminal(request, endpoint({ actionId: runAction, result: "duplicate", resultCode: 1, state: "running", stateCode: 3, flags: 0x51, logicalCenterAccepted: false, servoOutputEnabled: true, operationTerminal: false, duplicateResponse: true })) };
    },
  });
  service.handleBridgeStatus({ boardConnected: true, motionCollectionWritable: true });
  const result = await service.runPreset("attention", 1, "UI");
  assert.equal(result.ok, true);
  assert.equal(runWrites, 1);
});

test("timeout, disconnect and peer restart cancel polling and never replay RUN", async (t) => {
  await t.test("timeout", async () => {
    const clock = fakeClock();
    let runAction = 0; let runWrites = 0; let polls = 0;
    const service = new MotionPresetService({
      requestIdSequence: requestIds(400), now: clock.now, schedule: clock.schedule, cancel: clock.cancel, pollIntervalMs: 10, operationTimeoutMs: 250,
      send: async (report) => {
        const request = decodeMotionPresetFeatureReport(report);
        if (request.kind === "command") { runAction = request.requestId; runWrites += 1; return { ok: true, terminal: terminal(request, endpoint({ actionId: runAction, result: "accepted", resultCode: 0, state: "running", stateCode: 3, flags: 0x11, logicalCenterAccepted: false, servoOutputEnabled: true, operationTerminal: false })) }; }
        polls += 1;
        return { ok: true, terminal: terminal(request, runAction ? endpoint({ actionId: runAction, result: "accepted", resultCode: 0, state: "running", stateCode: 3, completedRepeat: 0, flags: 0x11, logicalCenterAccepted: false, servoOutputEnabled: true, operationTerminal: false }) : endpoint({ actionId: 390 })) };
      },
    });
    service.handleBridgeStatus({ boardConnected: true, motionCollectionWritable: true });
    const result = await service.runPreset("attention", 1, "UI");
    assert.equal(result.reason, "motion-preset-timeout");
    assert.equal(result.endpointReportedComplete, false);
    assert.equal(runWrites, 1);
    assert.ok(polls > 2);
  });

  await t.test("disconnect", async () => {
    let runAction = 0; let runWrites = 0; let releasePoll;
    const service = new MotionPresetService({
      requestIdSequence: requestIds(500), pollIntervalMs: 10, operationTimeoutMs: 250,
      send: async (report) => {
        const request = decodeMotionPresetFeatureReport(report);
        if (request.kind === "command") { runAction = request.requestId; runWrites += 1; return { ok: true, terminal: terminal(request, endpoint({ actionId: runAction, result: "accepted", resultCode: 0, state: "running", stateCode: 3, flags: 0x11, logicalCenterAccepted: false, servoOutputEnabled: true, operationTerminal: false })) }; }
        if (!runAction) return { ok: true, terminal: terminal(request, endpoint({ actionId: 490 })) };
        return new Promise((resolve) => { releasePoll = () => resolve({ ok: true, terminal: terminal(request, endpoint({ actionId: runAction, completedPresetCounter: 6 })) }); });
      },
    });
    service.handleBridgeStatus({ boardConnected: true, motionCollectionWritable: true });
    const pending = service.runPreset("attention", 1, "UI");
    while (!releasePoll) await new Promise((resolve) => setImmediate(resolve));
    service.handleBridgeStatus({ boardConnected: false, motionCollectionWritable: false });
    releasePoll();
    const result = await pending;
    assert.equal(result.reason, "peer-disconnected-or-restarted");
    assert.equal(runWrites, 1);
  });

  await t.test("peer restart", async () => {
    let runAction = 0; let runWrites = 0;
    const service = new MotionPresetService({
      requestIdSequence: requestIds(600), pollIntervalMs: 10, operationTimeoutMs: 250,
      send: async (report) => {
        const request = decodeMotionPresetFeatureReport(report);
        if (request.kind === "command") { runAction = request.requestId; runWrites += 1; return { ok: true, terminal: terminal(request, endpoint({ actionId: runAction, result: "accepted", resultCode: 0, state: "running", stateCode: 3, flags: 0x11, logicalCenterAccepted: false, servoOutputEnabled: true, operationTerminal: false })) }; }
        if (!runAction) return { ok: true, terminal: terminal(request, endpoint({ actionId: 590 })) };
        return { ok: true, terminal: terminal(request, endpoint({ actionId: runAction, completedPresetCounter: 6 }), { peerBootId: 0x99aabbcc }) };
      },
    });
    service.handleBridgeStatus({ boardConnected: true, motionCollectionWritable: true });
    const result = await service.runPreset("attention", 1, "UI");
    assert.equal(result.reason, "peer-disconnected-or-restarted");
    assert.equal(runWrites, 1);
  });
});

test("counter jumps, missing terminal bit and incomplete repeats never become endpointReportedComplete", async () => {
  for (const [name, finalPatch] of [
    ["counter-jump", { completedPresetCounter: 7 }],
    ["missing-terminal", { flags: 0x03, operationTerminal: false }],
    ["repeat-incomplete", { completedRepeat: 1 }],
  ]) {
    const clock = fakeClock();
    let runAction = 0;
    const service = new MotionPresetService({
      requestIdSequence: requestIds(700), now: clock.now, schedule: clock.schedule, cancel: clock.cancel, pollIntervalMs: 10, operationTimeoutMs: 250,
      send: async (report) => {
        const request = decodeMotionPresetFeatureReport(report);
        if (request.kind === "command") { runAction = request.requestId; return { ok: true, terminal: terminal(request, endpoint({ actionId: runAction, result: "accepted", resultCode: 0, state: "running", stateCode: 3, preset: "nod", presetCode: 2, requestedRepeat: 2, completedRepeat: 0, flags: 0x11, logicalCenterAccepted: false, servoOutputEnabled: true, operationTerminal: false })) }; }
        if (!runAction) return { ok: true, terminal: terminal(request, endpoint({ actionId: 690 })) };
        return { ok: true, terminal: terminal(request, endpoint({ actionId: runAction, completedPresetCounter: 6, preset: "nod", presetCode: 2, requestedRepeat: 2, completedRepeat: 2, ...finalPatch })) };
      },
    });
    service.handleBridgeStatus({ boardConnected: true, motionCollectionWritable: true });
    const result = await service.runPreset("nod", 2, "UI");
    assert.equal(result.endpointReportedComplete, false, name);
    assert.equal(result.reason, "motion-preset-timeout", name);
  }
});

test("stop, emergency stop and UI-only clear expose bounded terminal endpoint evidence", async (t) => {
  const makeService = (expectedOperation, terminalEndpoint) => {
    let commandAction = 0;
    const service = new MotionPresetService({
      requestIdSequence: requestIds(800), pollIntervalMs: 10, operationTimeoutMs: 250,
      send: async (report) => {
        const request = decodeMotionPresetFeatureReport(report);
        if (request.kind === "command") {
          commandAction = request.requestId;
          assert.equal(request.operation, expectedOperation);
          const acknowledgement = expectedOperation === "emergencyStop"
            ? terminalEndpoint(commandAction)
            : endpoint({ actionId: commandAction, result: "accepted", resultCode: 0, state: "recentering", stateCode: 1, operation: expectedOperation, operationCode: expectedOperation === "stopAndCenter" ? 2 : 4, preset: null, presetCode: 0, requestedRepeat: 0, completedRepeat: 0, source: "UI", sourceCode: 1, flags: 0x01, logicalCenterAccepted: false, operationTerminal: false });
          return { ok: true, terminal: terminal(request, acknowledgement) };
        }
        return { ok: true, terminal: terminal(request, terminalEndpoint(commandAction)) };
      },
    });
    service.handleBridgeStatus({ boardConnected: true, motionCollectionWritable: true });
    return service;
  };

  await t.test("stop and center", async () => {
    const service = makeService("stopAndCenter", (actionId) => endpoint({ actionId, operation: "stopAndCenter", operationCode: 2, preset: null, presetCode: 0, requestedRepeat: 0, completedRepeat: 0, source: "UI", sourceCode: 1 }));
    const result = await service.stopAndCenter();
    assert.equal(result.ok, true);
    assert.equal(result.endpointReportedComplete, true);
  });
  await t.test("emergency stop", async () => {
    const service = makeService("emergencyStop", (actionId) => endpoint({ actionId, result: "emergency-stopped", resultCode: 10, state: "emergency-stopped", stateCode: 4, operation: "emergencyStop", operationCode: 3, preset: null, presetCode: 0, requestedRepeat: 0, completedRepeat: 0, source: "UI", sourceCode: 1, flags: 0x25, logicalCenterAccepted: false, emergencyStopLatched: true, operationTerminal: true }));
    const result = await service.emergencyStop();
    assert.equal(result.ok, true);
    assert.equal(result.endpointReportedEmergencyStopped, true);
    assert.equal(result.endpointReportedComplete, false);
  });
  await t.test("clear and center", async () => {
    const service = makeService("clearEmergencyStopAndCenter", (actionId) => endpoint({ actionId, operation: "clearEmergencyStopAndCenter", operationCode: 4, preset: null, presetCode: 0, requestedRepeat: 0, completedRepeat: 0, source: "UI", sourceCode: 1 }));
    const result = await service.clearEmergencyStopAndCenter();
    assert.equal(result.ok, true);
    assert.equal(result.endpointReportedComplete, true);
  });
});

test("source policy gates automatic runs and limits recovery while defaults remain outside the codec", async () => {
  const disabled = new MotionPresetService({ send: async () => ({ ok: false }) });
  disabled.handleBridgeStatus({ boardConnected: true, motionCollectionWritable: true });
  assert.equal((await disabled.runPreset("nod", 2, "context")).reason, "automatic-motion-disabled");
  assert.equal((await disabled.runPreset("dance", undefined, "UI")).reason, "motion-preset-report-invalid");
  assert.equal((await disabled.stopAndCenter("idle")).reason, "motion-preset-report-invalid");
  assert.equal((await disabled.clearEmergencyStopAndCenter("voice")).reason, "motion-preset-report-invalid");
});

test("preload/IPC surface and diagnostics expose only semantic motion fields", async () => {
  const [preload, main] = await Promise.all([
    readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
  ]);
  for (const api of ["getMotionStatus", "runPreset", "stopAndCenter", "emergencyStop", "clearEmergencyStopAndCenter", "onMotionPresetStatus"]) assert.match(preload, new RegExp(api));
  for (const channel of ["desktop:get-motion-status", "desktop:run-motion-preset", "desktop:stop-motion-and-center", "desktop:emergency-stop-motion", "desktop:clear-motion-emergency-stop-and-center"]) assert.match(main, new RegExp(channel));
  assert.match(main, /desktop:start-manual-control[\s\S]{0,180}motionPresetService\?\.close\("motion-operation-cancelled"\)[\s\S]{0,180}manualControlCoordinator\.begin/);
  const report = createDiagnosticReport({ inputBridge: { boardConnected: true, motionCollectionWritable: true, motionPresets: { status: "available", phase: "ready", busy: false, operation: "run", preset: "nod", repeat: 2, source: "UI", endpointReportedComplete: true, transport: "completed", reason: "", endpoint: { ...endpoint({ actionId: 55, completedPresetCounter: 6, preset: "nod", presetCode: 2, requestedRepeat: 2, completedRepeat: 2 }), controllerBootId: 1, peerBootId: 2, devicePath: "private" }, transcript: "private" } } });
  assert.equal(report.easyInputHid.motionCollection, "writable");
  assert.equal(report.motionPresets.endpointReportedComplete, true);
  assert.equal(report.motionPresets.endpoint.operation, "run");
  assert.equal(report.motionPresets.transport, "completed");
  assert.equal(JSON.stringify(report).includes("private"), false);
  assert.equal(JSON.stringify(report).includes("BootId"), false);
  assert.doesNotMatch(JSON.stringify(report.motionPresets), /physical|angle|pwm|pulse|gpio/i);
  const failed = createDiagnosticReport({ inputBridge: { boardConnected: true, motionCollectionWritable: true, motionPresets: { status: "available", phase: "failed", transport: "motion-hid-write-failed", reason: "motion-hid-write-failed" } } });
  assert.equal(failed.motionPresets.transport, "motion-hid-write-failed");
  assert.equal(failed.motionPresets.reason, "motion-hid-write-failed");
  const rejected = createDiagnosticReport({ inputBridge: { motionPresets: { transport: "hid-set-feature-1", reason: "hid-set-feature-1" } } });
  assert.equal(rejected.motionPresets.transport, "unavailable");
  assert.equal(rejected.motionPresets.reason, "internal");
});
