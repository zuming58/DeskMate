import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMicrophoneSource, startMicrophoneSession } from "../src/domain/microphoneSource.js";

test("computer microphone is the persistent default and starts directly", async () => {
  let boardStarts = 0;
  const result = await startMicrophoneSession({ preferredSource: undefined, startComputer: async () => ({ ok: true }), startEasyInput: async () => { boardStarts += 1; return { ok: true }; } });
  assert.equal(normalizeMicrophoneSource("bluetooth"), "computer");
  assert.deepEqual(result, { ok: true, requestedSource: "computer", activeSource: "computer", fallback: null });
  assert.equal(boardStarts, 0);
});

test("an available EasyInput source locks for the recording", async () => {
  const result = await startMicrophoneSession({ preferredSource: "easyinput", startComputer: async () => ({ ok: true }), startEasyInput: async () => ({ ok: true }) });
  assert.deepEqual(result, { ok: true, requestedSource: "easyinput", activeSource: "easyinput", fallback: null });
});

test("board failure before start is visible and falls back once to computer", async () => {
  const result = await startMicrophoneSession({ preferredSource: "easyinput", startComputer: async () => ({ ok: true }), startEasyInput: async () => ({ ok: false, reason: "easyinput-audio-heartbeat-timeout" }) });
  assert.equal(result.ok, true);
  assert.equal(result.activeSource, "computer");
  assert.deepEqual(result.fallback, { from: "easyinput", to: "computer", reason: "easyinput-audio-heartbeat-timeout" });
});

test("failure of both sources never pretends recording started", async () => {
  const result = await startMicrophoneSession({ preferredSource: "easyinput", startComputer: async () => ({ ok: false, reason: "permission-denied" }), startEasyInput: async () => ({ ok: false, reason: "board-offline" }) });
  assert.deepEqual(result, { ok: false, requestedSource: "easyinput", activeSource: null, reason: "permission-denied", boardReason: "board-offline" });
});
