import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createDiagnosticReport } from "../src/services/diagnostics.js";

const require = createRequire(import.meta.url);
const { parseBridgeLine } = require("../electron/input-bridge-protocol.cjs");
const { InputBridgeManager } = require("../electron/input-bridge.cjs");
const { LinkRecoveryGate } = require("../electron/link-recovery.cjs");
const vectors = require("../contracts/deskmate-host/golden-vectors-easyinput-manual-calibration-v1.json").vectors;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = "2026-09-02T10:00:00.000Z";

function status(overrides = {}) {
  return {
    version: 1,
    type: "status",
    source: "easyinput-hid",
    key: "Device",
    action: "connected",
    boardConnected: true,
    configCollectionWritable: true,
    calibrationCollectionWritable: true,
    time: at,
    sequence: 1,
    ...overrides,
  };
}

test("native bridge freezes exact collection contracts and routes 0x14/0x16 separately", () => {
  const source = readFileSync(path.join(root, "native", "DeskMate.InputBridge", "Program.cs"), "utf8");
  assert.match(source, /Config = new\(0x303A, 0x1006, 0xFF00, 0x0002, 64, 64\)/);
  assert.match(source, /ManualCalibration = new\(0x303A, 0x1006, 0xFF00, 0x0007, 64, 64\)/);
  assert.match(source, />= 0x10 and <= 0x15 => Config/);
  assert.match(source, /0x16 => ManualCalibration/);
  assert.match(source, /ForFeatureReport\(0x14\) == Config/);
  assert.match(source, /ForFeatureReport\(0x16\) == ManualCalibration/);
  assert.match(source, /usagePage == UsagePage && usage == Usage/);
  assert.doesNotMatch(source, /FeatureReportByteLength >= 64|InputReportByteLength >= 64/);
});

test("Raw Input subscribes to both vendor top-level collections", () => {
  const source = readFileSync(path.join(root, "native", "DeskMate.InputBridge", "Program.cs"), "utf8");
  assert.match(source, /HidUsageVendorCommands = 0x02/);
  assert.match(source, /HidUsageVendorManualCalibration = 0x07/);
  assert.match(source, /Usage = HidUsageVendorCommands[\s\S]*?Usage = HidUsageVendorManualCalibration/);
  assert.match(source, /report\.Length == 64 && report\[0\] == 0x17[\s\S]*?IsValidManualCalibrationResponse/);
});

test("status parser preserves bounded collection evidence and rejects bad types", () => {
  const parsed = parseBridgeLine(JSON.stringify({ ...status(), devicePath: "private", serialNumber: "private" }));
  assert.deepEqual(parsed, status());
  assert.equal(JSON.stringify(parsed).includes("private"), false);
  assert.equal(parseBridgeLine(JSON.stringify(status({ configCollectionWritable: "yes" }))), null);
  assert.equal(parseBridgeLine(JSON.stringify(status({ calibrationCollectionWritable: 1 }))), null);
});

test("manager keeps config and calibration collection routing independent", async () => {
  const writes = [];
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  child.stdin = { writable: true, write: (line, callback) => { writes.push(JSON.parse(line)); callback?.(); } };
  const manager = new InputBridgeManager({ executable: "bridge.exe", spawnImpl: () => child });
  manager.start();
  manager.handleLine(JSON.stringify(status({ calibrationCollectionWritable: false })));

  const agentReport = Buffer.alloc(64); agentReport[0] = 0x12;
  const agent = manager.sendAgentState(agentReport);
  assert.equal(writes.at(-1).type, "set-agent-state");
  manager.handleLine(JSON.stringify({ version: 1, type: "agent-state-write", source: "easyinput-hid", requestId: writes.at(-1).requestId, ok: true, reason: "", time: at, sequence: 2 }));
  assert.deepEqual(await agent, { ok: true });

  const calibration = Buffer.from(vectors.find((item) => item.name === "status_request").hex, "hex");
  assert.equal((await manager.sendManualCalibration(calibration)).reason, "manual-calibration-interface-unavailable");

  manager.handleLine(JSON.stringify(status({ configCollectionWritable: false, calibrationCollectionWritable: true, sequence: 3 })));
  assert.equal((await manager.sendAgentState(agentReport)).reason, "config-interface-unavailable");
  const pendingCalibration = manager.sendManualCalibration(calibration);
  assert.equal(writes.at(-1).type, "manual-calibration-request");
  manager.stop();
  assert.equal((await pendingCalibration).reason, "input-bridge-stopped");
});

test("USB collection re-enumeration refreshes Link only when config collection returns", () => {
  const gate = new LinkRecoveryGate();
  assert.equal(gate.observe(status({ configCollectionWritable: false, calibrationCollectionWritable: true })).refresh, false);
  assert.equal(gate.observe(status({ configCollectionWritable: true, calibrationCollectionWritable: false, sequence: 2 })).refresh, true);
  assert.equal(gate.observe(status({ configCollectionWritable: true, calibrationCollectionWritable: true, sequence: 3 })).refresh, false);
  assert.equal(gate.observe(status({ configCollectionWritable: false, calibrationCollectionWritable: true, sequence: 4 })).refresh, false);
  assert.equal(gate.observe(status({ configCollectionWritable: true, calibrationCollectionWritable: true, sequence: 5 })).refresh, true);
});

test("diagnostics distinguish enumeration and both writable collections without identifiers", () => {
  const report = createDiagnosticReport({ inputBridge: { boardConnected: true, configCollectionWritable: true, calibrationCollectionWritable: false, devicePath: "private", serialNumber: "private" } });
  assert.deepEqual(report.easyInputHid, { enumerated: true, configCollection: "writable", calibrationCollection: "unavailable" });
  assert.equal(JSON.stringify(report).includes("private"), false);
  assert.deepEqual(createDiagnosticReport({ inputBridge: { boardConnected: false } }).easyInputHid, { enumerated: false, configCollection: "not-enumerated", calibrationCollection: "not-enumerated" });
});
