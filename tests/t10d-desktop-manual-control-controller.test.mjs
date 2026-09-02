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
  constructor({ centerFailure = "" } = {}) {
    super();
    this.centerFailure = centerFailure;
    this.commands = [];
    this.armDeferred = null;
    this.state = { available: true, gate: "ready", pending: null, context: { sessionId: 7, lastActionId: 0, completedOutputCount: 0, state: "locked", selectedAxis: "none", armed: false, provisionalCenter: false }, intent: null, accepted: null, terminal: null };
  }

  snapshot() { return structuredClone(this.state); }
  clearVolatileAuthorization() { this.state.context.armed = false; this.emit("status", this.snapshot()); }
  async queryStatus() { return { ok: true, status: this.snapshot() }; }
  async command(value) {
    this.commands.push(structuredClone(value));
    if (value.operation === "arm" && this.armDeferred) await this.armDeferred.promise;
    const result = value.operation === "provisionalCenter" && this.centerFailure ? this.centerFailure : "completed";
    if (value.operation === "selectAxis") this.state.context.selectedAxis = value.axis;
    if (value.operation === "arm") this.state.context.armed = true;
    if (["provisionalCenter", "singleStep", "recenter"].includes(value.operation) && result === "completed") {
      this.state.context.completedOutputCount += 1;
      this.state.context.armed = false;
      if (value.operation === "provisionalCenter") this.state.context.provisionalCenter = true;
    }
    const requestId = this.commands.length;
    const endpoint = { type: "command", result, requestId, selectedAxis: this.state.context.selectedAxis, armed: this.state.context.armed, completedOutputCount: this.state.context.completedOutputCount };
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
