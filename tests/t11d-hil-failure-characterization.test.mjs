import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createComputerCompanionAudioEngine } from "../src/domain/computerCompanionAudio.js";
import { defaultState, reduceAppState } from "../src/store/appStore.js";

test("T11D regression: burst audio remains continuous and never silently stops scheduled nodes", async () => {
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
  for (let index = 0; index < 5; index += 1) await engine.handleCommand({ ...base, type: "sink.audio", sequence: index + 2, audio: oneSecond });

  assert.equal(events.filter((event) => event.type === "sink.queue-drop").length, 0);
  assert.equal(events.filter((event) => event.type === "sink.accepted").length, 5);
  assert.equal(nodes.every((node) => !node.stopped), true);
  await engine.close();
});

test("T11D regression: atomic runtime slices cannot roll idle back to stopping", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(appSource, /runtimeRef/);
  let applicationState = structuredClone(defaultState);
  applicationState = reduceAppState(applicationState, { type: "companion-runtime", value: { type: "state", state: "idle", sessionId: "s", generation: 2, eventSequence: 11 } });
  applicationState = reduceAppState(applicationState, { type: "runtime-slice", slice: "inputBridge", value: { sequence: 2 } });
  assert.equal(applicationState.runtime.companion.state, "idle");
  assert.equal(applicationState.runtime.companion.active, false);
  applicationState = reduceAppState(applicationState, { type: "companion-runtime", value: { type: "state", state: "stopping", sessionId: "s", generation: 2, eventSequence: 10 } });
  assert.equal(applicationState.runtime.companion.state, "idle");
});
