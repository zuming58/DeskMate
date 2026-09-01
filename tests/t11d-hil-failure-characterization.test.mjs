import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createComputerCompanionAudioEngine } from "../src/domain/computerCompanionAudio.js";

test("T11D characterization: a backlog over three seconds stops every scheduled speaker node", async () => {
  const events = [];
  const nodes = [];
  class FakeAudioContext {
    constructor() { this.currentTime = 1; this.destination = {}; }
    createBuffer(_channels, length, rate) { return { duration: length / rate, getChannelData: () => new Float32Array(length) }; }
    createBufferSource() {
      const node = { stopped: false, buffer: null, connect() {}, start() {}, stop() { this.stopped = true; }, onended: null };
      nodes.push(node);
      return node;
    }
    async resume() {}
    async close() {}
  }
  const engine = createComputerCompanionAudioEngine({
    bridge: { sendCompanionComputerAudioEvent: (event) => events.push(event) },
    AudioContextClass: FakeAudioContext,
  });
  const base = { version: 1, sessionId: "hil-queue-drop", generation: 1 };
  await engine.handleCommand({ ...base, type: "sink.start" });
  const oneSecond = new Int16Array(24_000).buffer;
  for (let index = 0; index < 5; index += 1) await engine.handleCommand({ ...base, type: "sink.audio", audio: oneSecond });

  assert.equal(events.filter((event) => event.type === "sink.queue-drop").length, 1);
  assert.equal(nodes.slice(0, 4).every((node) => node.stopped), true);
  assert.equal(nodes[4].stopped, false);
  await engine.close();
});

test("T11D characterization: whole-runtime stale snapshots can roll idle back to stopping", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(appSource, /const runtime = runtimeRef\.current \|\| \{\};/);
  assert.match(appSource, /patch\(\{ runtime: \{ \.\.\.runtime, companion: next \} \}\)/);
  assert.match(appSource, /patch\(\{ runtime: \{ \.\.\.runtime, inputBridge:/);

  const staleRuntime = { companion: { state: "stopping", active: true }, inputBridge: { sequence: 1 } };
  let applicationState = { runtime: staleRuntime };
  const shallowPatch = (value) => { applicationState = { ...applicationState, ...value }; };
  const idlePatchFromCompanion = { runtime: { ...staleRuntime, companion: { state: "idle", active: false } } };
  const bridgePatchFromSameRender = { runtime: { ...staleRuntime, inputBridge: { sequence: 2 } } };

  shallowPatch(idlePatchFromCompanion);
  shallowPatch(bridgePatchFromSameRender);
  assert.deepEqual(applicationState.runtime.companion, { state: "stopping", active: true });
});
