import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";

const require = createRequire(import.meta.url);
const { ManualControlCoordinator } = require("../electron/manual-control-controller.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function flush(count = 16) { for (let index = 0; index < count; index += 1) await Promise.resolve(); }

class FakeCalibration extends EventEmitter {
  constructor({ centerFailure = "", emergencyStopped = false, clearFailure = "", clearLeavesLatched = false } = {}) {
    super();
    this.centerFailure = centerFailure;
    this.clearFailure = clearFailure;
    this.clearLeavesLatched = clearLeavesLatched;
    this.queryCount = 0;
    this.commands = [];
    this.armDeferred = null;
    this.state = { available: true, gate: "ready", pending: null, context: { sessionId: 7, lastActionId: 0, completedOutputCount: 0, state: emergencyStopped ? "emergency-stopped" : "locked", selectedAxis: "none", armed: false, provisionalCenter: false, emergencyStopped }, intent: null, accepted: null, terminal: null };
  }

  snapshot() { return structuredClone(this.state); }
  clearVolatileAuthorization() { this.state.context.armed = false; this.emit("status", this.snapshot()); }
  async queryStatus() { this.queryCount += 1; return { ok: true, status: this.snapshot() }; }
  async command(value) {
    this.commands.push(structuredClone(value));
    if (value.operation === "arm" && this.armDeferred) await this.armDeferred.promise;
    const result = value.operation === "provisionalCenter" && this.centerFailure ? this.centerFailure : value.operation === "clearEmergencyStop" && this.clearFailure ? this.clearFailure : "completed";
    if (value.operation === "selectAxis") this.state.context.selectedAxis = value.axis;
    if (value.operation === "arm") this.state.context.armed = true;
    if (value.operation === "emergencyStop" && result === "completed") Object.assign(this.state.context, { state: "emergency-stopped", selectedAxis: "none", armed: false, provisionalCenter: false, emergencyStopped: true });
    if (value.operation === "clearEmergencyStop" && result === "completed" && !this.clearLeavesLatched) Object.assign(this.state.context, { state: "locked", selectedAxis: "none", armed: false, provisionalCenter: false, emergencyStopped: false });
    if (["provisionalCenter", "singleStep", "recenter"].includes(value.operation) && result === "completed") {
      this.state.context.completedOutputCount += 1;
      this.state.context.armed = false;
      if (value.operation === "provisionalCenter") this.state.context.provisionalCenter = true;
    }
    const requestId = this.commands.length;
    const endpoint = { type: "command", result, requestId, state: this.state.context.state, selectedAxis: this.state.context.selectedAxis, armed: this.state.context.armed, emergencyStopped: this.state.context.emergencyStopped, completedOutputCount: this.state.context.completedOutputCount };
    this.state.intent = { kind: "command", operation: value.operation, requestId };
    this.state.accepted = { requestId, acceptedCount: requestId, linkSequence: requestId };
    this.state.terminal = { requestId, transport: "completed", endpoint };
    this.emit("status", this.snapshot());
    return { ok: true, status: this.snapshot() };
  }
}

test("one environment confirmation establishes both centers through hidden frozen safety commands", async (t) => {
  const calibration = new FakeCalibration();
  const controller = new ManualControlCoordinator({ calibration });
  t.after(() => controller.end("test-complete"));
  controller.handleBridgeStatus({ boardConnected: true, calibrationCollectionWritable: true, linkDiagnostics: { state: "connected" } });
  assert.equal((await controller.begin({ environmentConfirmed: false })).reason, "manual-control-environment-confirmation-required");
  const result = await controller.begin({ environmentConfirmed: true });
  assert.equal(result.ok, true);
  assert.equal(result.status.phase, "ready");
  assert.equal(result.status.centerReady, true);
  assert.deepEqual(calibration.commands.map((item) => `${item.operation}:${item.axis}`), ["selectAxis:yaw", "arm:yaw", "provisionalCenter:yaw", "selectAxis:pitch", "arm:pitch", "provisionalCenter:pitch"]);
  const arms = calibration.commands.filter((item) => item.operation === "arm");
  assert.equal(arms.length, 2);
  for (const arm of arms) {
    assert.equal(arm.leaseMs, 5000);
    assert.deepEqual(arm.safety, { userPresent: true, linkageUnloaded: true, currentLimitedSupply: true, cutoffReachable: true });
  }
  controller.end("test-complete");
});

test("all four semantic directions select the expected axis and observed physical sign", async (t) => {
  const cases = [
    { direction: "left", axis: "yaw", sign: -1 },
    { direction: "right", axis: "yaw", sign: 1 },
    { direction: "up", axis: "pitch", sign: -1 },
    { direction: "down", axis: "pitch", sign: 1 },
  ];
  for (const expected of cases) {
    await t.test(expected.direction, async (child) => {
      const calibration = new FakeCalibration();
      const controller = new ManualControlCoordinator({ calibration });
      child.after(() => controller.end("test-complete"));
      controller.handleBridgeStatus({ boardConnected: true, calibrationCollectionWritable: true, linkDiagnostics: { state: "connected" } });
      await controller.begin({ environmentConfirmed: true });
      calibration.commands.length = 0;
      controller.press(expected.direction);
      await flush();
      controller.release(expected.direction);
      const output = calibration.commands.find((item) => item.operation === "singleStep");
      assert.deepEqual(output && { axis: output.axis, direction: output.direction }, { axis: expected.axis, direction: expected.sign });
      assert.equal(calibration.commands.filter((item) => item.operation === "arm").length, 1);
      assert.equal(controller.snapshot().completedSteps, 1);
    });
  }
});

test("release during internal ARM prevents the single-step wire request", async (t) => {
  const calibration = new FakeCalibration();
  const controller = new ManualControlCoordinator({ calibration });
  t.after(() => controller.end("test-complete"));
  controller.handleBridgeStatus({ boardConnected: true, calibrationCollectionWritable: true, linkDiagnostics: { state: "connected" } });
  await controller.begin({ environmentConfirmed: true });
  calibration.commands.length = 0;
  calibration.armDeferred = deferred();
  controller.press("right");
  await Promise.resolve(); await Promise.resolve();
  controller.release("right");
  calibration.armDeferred.resolve();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(calibration.commands.map((item) => item.operation), ["selectAxis", "arm"]);
  controller.end("test-complete");
});

test("center failure stays explicit and a correlated terminal repairs stale unavailable Link display", async (t) => {
  const calibration = new FakeCalibration({ centerFailure: "center-required" });
  const controller = new ManualControlCoordinator({ calibration });
  t.after(() => controller.end("test-complete"));
  controller.handleBridgeStatus({ boardConnected: true, calibrationCollectionWritable: true, linkDiagnostics: null });
  const result = await controller.begin({ environmentConfirmed: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "center-required");
  assert.equal(result.status.phase, "center-required");
  assert.equal(result.status.linkState, "connected");
  assert.equal(result.status.controlsEnabled, false);
  controller.end("test-complete");
});

test("recenter serializes both axes and disconnect locks without replay", async (t) => {
  const calibration = new FakeCalibration();
  const controller = new ManualControlCoordinator({ calibration });
  t.after(() => controller.end("test-complete"));
  controller.handleBridgeStatus({ boardConnected: true, calibrationCollectionWritable: true, linkDiagnostics: { state: "connected" } });
  await controller.begin({ environmentConfirmed: true });
  calibration.commands.length = 0;
  const result = await controller.recenter();
  assert.equal(result.ok, true);
  assert.deepEqual(calibration.commands.map((item) => `${item.operation}:${item.axis}`), ["selectAxis:yaw", "arm:yaw", "recenter:yaw", "selectAxis:pitch", "arm:pitch", "recenter:pitch"]);
  controller.handleBridgeStatus({ boardConnected: false, calibrationCollectionWritable: false, linkDiagnostics: null });
  assert.equal(controller.snapshot().phase, "unavailable");
  const before = calibration.commands.length;
  assert.equal(controller.press("up").ok, false);
  assert.equal(calibration.commands.length, before);
});

test("an explicit post-emergency restart clears once and then establishes both centers", async (t) => {
  const calibration = new FakeCalibration({ emergencyStopped: true });
  const controller = new ManualControlCoordinator({ calibration });
  t.after(() => controller.end("test-complete"));
  controller.handleBridgeStatus({ boardConnected: true, calibrationCollectionWritable: true, linkDiagnostics: { state: "connected" } });
  assert.equal(controller.snapshot().phase, "emergency-stopped");
  const ordinary = await controller.begin({ environmentConfirmed: true });
  assert.equal(ordinary.ok, false);
  assert.equal(ordinary.reason, "emergency-stopped");
  assert.deepEqual(calibration.commands, [], "a normal begin must never clear a latched emergency stop");
  const recovered = await controller.begin({ environmentConfirmed: true, recoverEmergencyStop: true });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.status.phase, "ready");
  assert.equal(calibration.queryCount, 2, "each explicit attempt starts with a fresh status query");
  assert.deepEqual(calibration.commands.map((item) => `${item.operation}:${item.axis || "none"}`), ["clearEmergencyStop:none", "selectAxis:yaw", "arm:yaw", "provisionalCenter:yaw", "selectAxis:pitch", "arm:pitch", "provisionalCenter:pitch"]);
});

test("clear failure or a still-latched terminal keeps direction output hidden", async (t) => {
  for (const candidate of [
    { name: "endpoint failure", options: { emergencyStopped: true, clearFailure: "emergency-stopped" }, reason: "emergency-stopped" },
    { name: "latched terminal", options: { emergencyStopped: true, clearLeavesLatched: true }, reason: "emergency-stop-clear-not-confirmed" },
    { name: "center failure", options: { emergencyStopped: true, centerFailure: "center-required" }, reason: "center-required" },
  ]) {
    await t.test(candidate.name, async (child) => {
      const calibration = new FakeCalibration(candidate.options);
      const controller = new ManualControlCoordinator({ calibration });
      child.after(() => controller.end("test-complete"));
      controller.handleBridgeStatus({ boardConnected: true, calibrationCollectionWritable: true, linkDiagnostics: { state: "connected" } });
      const result = await controller.begin({ environmentConfirmed: true, recoverEmergencyStop: true });
      assert.equal(result.ok, false);
      assert.equal(result.reason, candidate.reason);
      assert.equal(result.status.controlsEnabled, false);
      assert.equal(calibration.commands.some((item) => item.operation === "singleStep"), false);
      if (candidate.name !== "center failure") assert.deepEqual(calibration.commands.map((item) => item.operation), ["clearEmergencyStop"]);
    });
  }
});
