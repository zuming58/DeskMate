import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { ManualCalibrationController } = require("../electron/manual-calibration-controller.cjs");
const { decodeManualCalibrationFeatureReport } = require("../electron/manual-calibration-hid.cjs");
const { ManualCalibrationRequestIdStore, UINT32_MAX } = require("../electron/manual-calibration-request-ids.cjs");

function temporaryDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), "deskmate-request-ids-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function statusEndpoint() {
  return { type: "status", sessionId: 7, lastActionId: 0, completedOutputCount: 0, state: "locked", selectedAxis: "none", flags: 0, armed: false, provisionalCenter: false, recenterRequired: false, emergencyStopped: false, faulted: false, adapterAvailable: true, lastError: 0, fixedStepDegrees: 1 };
}

function terminalFor(request, { stale = false } = {}) {
  return stale
    ? { ok: false, reason: "stale", terminal: { stage: "terminal", transport: "stale", transportCode: 3, requestId: request.requestId, confirmationId: 0, endpoint: null } }
    : { ok: true, terminal: { stage: "terminal", transport: "completed", transportCode: 0, requestId: request.requestId, confirmationId: 0, endpoint: statusEndpoint() } };
}

test("a reserved high-water block keeps the first request monotonic across desktop process restarts", async (t) => {
  const directory = temporaryDirectory(t);
  const seen = [];
  const createController = () => {
    const sequence = new ManualCalibrationRequestIdStore({ userDataPath: directory, initialFloor: 1000, blockSize: 8, recoveryFloors: [2000], processId: seen.length + 1, now: () => seen.length + 10 });
    const controller = new ManualCalibrationController({ requestIdSequence: sequence, randomUInt32: () => 8, send: async (report) => {
      const request = decodeManualCalibrationFeatureReport(report); seen.push(request.requestId); return terminalFor(request);
    } });
    controller.handleBridgeStatus({ boardConnected: true, calibrationCollectionWritable: true });
    return controller;
  };

  const firstProcess = createController();
  assert.equal((await firstProcess.queryStatus()).ok, true);
  assert.equal((await firstProcess.queryStatus()).ok, true);
  const previousProcessMax = Math.max(...seen);

  const restartedProcess = createController();
  assert.equal((await restartedProcess.queryStatus()).ok, true);
  assert.equal(seen.at(-1) > previousProcessMax, true);
  assert.deepEqual(seen, [1000, 1001, 1008]);
});

test("one status query transparently advances through bounded recovery floors after stale", async (t) => {
  const directory = temporaryDirectory(t);
  const seen = [];
  const sequence = new ManualCalibrationRequestIdStore({ userDataPath: directory, initialFloor: 10, blockSize: 4, recoveryFloors: [100, 1000], processId: 10, now: () => 20 });
  const controller = new ManualCalibrationController({ requestIdSequence: sequence, randomUInt32: () => 1, send: async (report) => {
    const request = decodeManualCalibrationFeatureReport(report); seen.push(request.requestId); return terminalFor(request, { stale: request.requestId < 500 });
  } });
  controller.handleBridgeStatus({ boardConnected: true, calibrationCollectionWritable: true });
  const result = await controller.queryStatus();
  assert.equal(result.ok, true);
  assert.equal(result.status.gate, "ready");
  assert.deepEqual(seen, [10, 100, 1000]);
});

test("a valid journal copy recovers one corrupt file while two corrupt copies fail closed", (t) => {
  const directory = temporaryDirectory(t);
  const first = new ManualCalibrationRequestIdStore({ userDataPath: directory, initialFloor: 300, blockSize: 4, recoveryFloors: [1000], processId: 1, now: () => 1 });
  assert.equal(first.next(), 300);
  writeFileSync(join(directory, "manual-calibration-request-ids.json"), "{broken", "utf8");
  const recovered = new ManualCalibrationRequestIdStore({ userDataPath: directory, initialFloor: 1, blockSize: 4, recoveryFloors: [1000], processId: 2, now: () => 2 });
  assert.equal(recovered.next(), 304);

  writeFileSync(join(directory, "manual-calibration-request-ids.json"), "{}", "utf8");
  writeFileSync(join(directory, "manual-calibration-request-ids.backup.json"), "{}", "utf8");
  const corrupt = new ManualCalibrationRequestIdStore({ userDataPath: directory, initialFloor: 1, blockSize: 4, recoveryFloors: [1000], processId: 3, now: () => 3 });
  assert.throws(() => corrupt.next(), (error) => error.code === "manual-calibration-request-id-store-corrupt");
});

test("the uint32 boundary fails closed instead of wrapping to a stale request", (t) => {
  const directory = temporaryDirectory(t);
  const sequence = new ManualCalibrationRequestIdStore({ userDataPath: directory, initialFloor: UINT32_MAX - 1, blockSize: 2, recoveryFloors: [], processId: 4, now: () => 4 });
  assert.equal(sequence.next(), UINT32_MAX - 1);
  assert.equal(sequence.next(), UINT32_MAX);
  assert.throws(() => sequence.next(), (error) => error.code === "manual-calibration-request-id-exhausted");
  const stored = JSON.parse(readFileSync(join(directory, "manual-calibration-request-ids.json"), "utf8"));
  assert.equal(stored.reservedThrough, UINT32_MAX);
});

test("stale recovery is bounded and locks instead of looping at the final floor", async (t) => {
  const directory = temporaryDirectory(t);
  const seen = [];
  const sequence = new ManualCalibrationRequestIdStore({ userDataPath: directory, initialFloor: 10, blockSize: 4, recoveryFloors: [100], processId: 5, now: () => 5 });
  const controller = new ManualCalibrationController({ requestIdSequence: sequence, randomUInt32: () => 1, send: async (report) => {
    const request = decodeManualCalibrationFeatureReport(report); seen.push(request.requestId); return terminalFor(request, { stale: true });
  } });
  controller.handleBridgeStatus({ boardConnected: true, calibrationCollectionWritable: true });
  const result = await controller.queryStatus();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "manual-calibration-request-id-exhausted");
  assert.equal(result.status.gate, "faulted");
  assert.deepEqual(seen, [10, 100]);
});

test("production main injects the persistent sequence without changing HID or Link reports", () => {
  const main = readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  assert.match(main, /new ManualCalibrationRequestIdStore\(\{ userDataPath: app\.getPath\("userData"\) \}\)/);
  assert.match(main, /new ManualCalibrationController\(\{[\s\S]*requestIdSequence: manualCalibrationRequestIds/);
  assert.doesNotMatch(main, /manualCalibrationRequestIds[\s\S]{0,120}(?:HidD_SetFeature|0x16|0x17|0x20|0x21)/);
});
