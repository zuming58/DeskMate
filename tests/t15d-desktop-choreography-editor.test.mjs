import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { CHOREOGRAPHY_EXPRESSIONS, CHOREOGRAPHY_LABELS, choreographyPreviewFrame, createChoreographyDraft, validateChoreographyDraft } from "../src/domain/choreography.js";

const require = createRequire(import.meta.url);
const { ChoreographyStore, validateChoreography } = require("../electron/choreography-store.cjs");
const { ChoreographyService } = require("../electron/choreography-service.cjs");
const { decodeChoreographyFeatureReport, decodeChoreographyInputReport, encodeChoreographyFeatureReport } = require("../electron/choreography-hid.cjs");

const action = (overrides = {}) => ({
  version: 1,
  name: "晨间舞蹈",
  beatMs: 600,
  repeat: 2,
  beats: [
    { yaw: "left", pitch: "hold", expression: "working" },
    { yaw: "center", pitch: "up", expression: "completed" },
  ],
  ...overrides,
});

test("T15D choreography contract accepts only bounded semantic objects", () => {
  assert.deepEqual(validateChoreography(action()), action());
  assert.throws(() => validateChoreography({ ...action(), angle: 20 }), /contract-invalid/);
  assert.throws(() => validateChoreography(action({ version: 2 })), /version-invalid/);
  assert.throws(() => validateChoreography(action({ name: "舞".repeat(21) })), /name-invalid/);
  for (const beatMs of [399, 500, 1200]) assert.throws(() => validateChoreography(action({ beatMs })), /beat-ms-invalid/);
  for (const repeat of [0, 4, 1.5]) assert.throws(() => validateChoreography(action({ repeat })), /repeat-invalid/);
  assert.throws(() => validateChoreography(action({ beats: [action().beats[0]] })), /beats-invalid/);
  assert.throws(() => validateChoreography(action({ beats: Array.from({ length: 9 }, () => action().beats[0]) })), /beats-invalid/);
  assert.throws(() => validateChoreography(action({ beats: [{ yaw: "angle", pitch: "hold", expression: "hold" }, action().beats[1]] })), /beat-invalid/);
  assert.throws(() => validateChoreography(action({ beats: [{ yaw: "hold", pitch: "hold", expression: "hold" }, { yaw: "hold", pitch: "hold", expression: "hold" }] })), /choreography-empty/);
});

test("renderer draft uses six columns and preview applies all three tracks simultaneously", () => {
  const draft = createChoreographyDraft();
  assert.equal(draft.beats.length, 6);
  assert.equal(validateChoreographyDraft(draft).reason, "choreography-empty");
  const frame = choreographyPreviewFrame({ yaw: "left", pitch: "center", expression: "thinking" }, { yaw: "hold", pitch: "down", expression: "completed" });
  assert.deepEqual(frame, { yaw: "left", pitch: "down", expression: "completed" });
  draft.beats[0] = { yaw: "right", pitch: "up", expression: "working" };
  assert.equal(validateChoreographyDraft(draft).ok, true);
  assert.deepEqual(CHOREOGRAPHY_EXPRESSIONS, ["hold", "completed", "thinking", "working"]);
  assert.equal(validateChoreographyDraft(action({ beats: [{ yaw: "left", pitch: "hold", expression: "listening" }, action().beats[1]] })).reason, "choreography-beat-invalid");
});

test("0x1A/0x1B choreography v2 codec matches the frozen host golden vectors", () => {
  const golden = JSON.parse(fs.readFileSync(new URL("../contracts/deskmate-host/golden-vectors-easyinput-choreography-v2.json", import.meta.url), "utf8"));
  const sample = action({
    beats: [
      { yaw: "left", pitch: "hold", expression: "working" },
      { yaw: "center", pitch: "up", expression: "completed" },
    ],
  });
  const run = encodeChoreographyFeatureReport({ kind: "command", requestId: 0x01020304, source: "UI", action: sample, yawAmplitudeDegrees: 36, pitchAmplitudeDegrees: 18, yawSpeedDegreesPerSecond: 90, pitchSpeedDegreesPerSecond: 70 });
  const status = encodeChoreographyFeatureReport({ kind: "status", requestId: 0x01020305 });
  assert.equal(run.subarray(1).toString("hex"), golden.vectors.run_two_beat_numeric_request);
  assert.equal(status.subarray(1).toString("hex"), golden.vectors.status_request);
  const completed = decodeChoreographyInputReport(Buffer.from(`1b${golden.vectors.status_completed}`, "hex"));
  assert.equal(completed.endpoint.result, "completed");
  assert.equal(completed.endpoint.logicalCenterAccepted, true);
  assert.equal(completed.endpoint.yawAmplitudeDegrees, 36);
  assert.equal(completed.endpoint.pitchAmplitudeDegrees, 18);
  assert.equal(completed.endpoint.yawSpeedDegreesPerSecond, 90);
  assert.equal(completed.endpoint.pitchSpeedDegreesPerSecond, 70);
});

test("Electron store persists at most eight actions and supports rename, copy and delete without exposing a path", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-choreography-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new ChoreographyStore({ userDataPath: root });
  const saved = store.save(action());
  assert.equal(saved.action.name, "晨间舞蹈");
  assert.equal(Object.hasOwn(saved, "filePath"), false);
  const renamed = store.save(action({ name: "专注舞蹈" }), "晨间舞蹈");
  assert.deepEqual(renamed.actions.map((item) => item.name), ["专注舞蹈"]);
  const copied = store.copy("专注舞蹈");
  assert.equal(copied.action.name, "专注舞蹈 副本");
  assert.equal(store.delete("专注舞蹈").ok, true);
  for (let index = 1; index <= 7; index += 1) store.save(action({ name: `动作${index}` }));
  assert.equal(store.list().length, 8);
  assert.throws(() => store.save(action({ name: "第九个动作" })), /limit-reached/);
  const reloaded = new ChoreographyStore({ userDataPath: root });
  assert.equal(reloaded.list().length, 8);
});

test("store exposes the built-in dance and persists the active dance plus bounded physical settings", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deskmate-motion-settings-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new ChoreographyStore({ userDataPath: root });
  store.save(action());
  assert.equal(store.setDefaultDance("晨间舞蹈").defaultDanceName, "晨间舞蹈");
  assert.equal(store.snapshot().builtInDance.name, "内置默认舞蹈");
  const physical = { yawAmplitudeDegrees: 36, pitchAmplitudeDegrees: 18, yawSpeedDegreesPerSecond: 90, pitchSpeedDegreesPerSecond: 70 };
  assert.deepEqual(store.setMotionSettings(physical).motionSettings, physical);
  assert.throws(() => store.setMotionSettings({ ...physical, yawAmplitudeDegrees: 41 }), /motion-settings-invalid/);
  const reloaded = new ChoreographyStore({ userDataPath: root });
  assert.equal(reloaded.getDefaultDance().name, "晨间舞蹈");
  assert.deepEqual(reloaded.getMotionSettings(), physical);
  assert.equal(reloaded.delete("晨间舞蹈").defaultDanceName, "");
});

test("real choreography service sends one bounded program and waits for terminal completion", async () => {
  let nextId = 10;
  let completed = false;
  const sent = [];
  const endpoint = (requestId = 0) => ({ sessionId: 7, actionId: requestId, completedCounter: completed ? 3 : 2, result: completed ? "completed" : "accepted", state: completed ? "ready" : requestId ? "running" : "ready", beatCount: requestId ? 2 : 0, currentBeat: completed ? 0xff : 0, repeat: requestId ? 2 : 0, completedRepeats: completed ? 2 : 0, sourceCode: requestId ? 1 : 0, yawAmplitudeDegrees: 36, pitchAmplitudeDegrees: 18, yawSpeedDegreesPerSecond: 90, pitchSpeedDegreesPerSecond: 70, adapterAvailable: true, logicalCenterAccepted: completed || !requestId, emergencyStopLatched: false, faulted: false, servoOutputEnabled: !completed && Boolean(requestId), operationTerminal: completed, displayLeaseActive: !completed && Boolean(requestId), duplicateResponse: false });
  const service = new ChoreographyService({
    requestIdSequence: { next: () => ++nextId },
    settings: () => ({ yawAmplitudeDegrees: 36, pitchAmplitudeDegrees: 18, yawSpeedDegreesPerSecond: 90, pitchSpeedDegreesPerSecond: 70 }),
    defaultDance: () => null,
    prepareCenter: async () => ({ ok: true }),
    pollIntervalMs: 10,
    operationTimeoutMs: 500,
    send: async (report) => {
      const request = decodeChoreographyFeatureReport(report);
      sent.push(Buffer.from(report));
      if (request.kind === "command") queueMicrotask(() => { completed = true; });
      const value = endpoint(request.kind === "command" ? request.requestId : completed ? nextId - 1 : 0);
      return { ok: true, terminal: { stage: "endpoint-acknowledgement", transport: "completed", requestId: request.requestId, kind: request.kind, controllerBootId: 7, peerBootId: 8, sourceCode: request.kind === "command" ? 1 : 0, beatCount: request.kind === "command" ? 2 : 0, repeat: request.kind === "command" ? 2 : 0, yawAmplitudeDegrees: request.kind === "command" ? 36 : 0, pitchAmplitudeDegrees: request.kind === "command" ? 18 : 0, yawSpeedDegreesPerSecond: request.kind === "command" ? 90 : 0, pitchSpeedDegreesPerSecond: request.kind === "command" ? 70 : 0, endpoint: value } };
    },
  });
  service.handleBridgeStatus({ boardConnected: true, motionCollectionWritable: true });
  const result = await service.execute(action(), { source: "UI" });
  assert.equal(result.ok, true);
  assert.equal(result.endpointReportedComplete, true);
  const command = sent.find((report) => report[6] === 1);
  assert.equal(command[16], 36);
  assert.equal(command[17], 18);
  assert.equal(command[18], 90);
  assert.equal(command[19], 70);
  assert.equal(command.subarray(20, 26).toString("hex"), "010003020101");
});

test("T15D preload and renderer expose persistence, default dance, settings and real execution", () => {
  const preload = fs.readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const editor = fs.readFileSync(new URL("../src/ChoreographyEditor.jsx", import.meta.url), "utf8");
  const adapter = fs.readFileSync(new URL("../src/adapters/voiceAdapters.js", import.meta.url), "utf8");
  for (const api of ["listChoreographies", "getChoreographyStatus", "saveChoreography", "copyChoreography", "deleteChoreography", "runChoreography", "setDefaultDance", "getMotionSettings", "setMotionSettings"]) {
    assert.match(preload, new RegExp(`${api}:`));
    assert.match(adapter, new RegExp(`${api}\\(`));
  }
  assert.match(main, /new ChoreographyService\(/);
  assert.match(main, /desktop:run-choreography[\s\S]*choreographyService\.execute\(value\.action \|\| value/);
  assert.doesNotMatch(main.match(/desktop:run-choreography[\s\S]{0,500}/)?.[0] || "", /motionPresetService\.runPreset/);
  assert.match(editor, /disabled={!adapter\.ready/);
  assert.match(editor, /if \(adapter\.ready !== true\)/);
  assert.match(editor, /choreography-boundary-note/);
  assert.match(editor, /软件预览不等于实体执行/);
  assert.doesNotMatch(editor, /<Notice/);
  assert.match(editor, /Yaw 左右/);
  assert.match(editor, /Pitch 上下/);
  assert.match(editor, /未选择 = 保持/);
  assert.match(editor, /aria-pressed={selected}/);
  assert.match(editor, /onChange\(selected \? "hold" : item\)/);
  assert.match(editor, /expressionAssetUrl\(EXPRESSION_ASSETS\[item\]\)/);
  assert.match(editor, /choreography-preview-summary/);
  assert.doesNotMatch(editor, /<CompanionFace/);
  assert.doesNotMatch(editor, /<Select key={`\$\{key\}/);
  assert.deepEqual(CHOREOGRAPHY_EXPRESSIONS.slice(1).map((value) => CHOREOGRAPHY_LABELS.expression[value]), ["开心", "好奇", "专注"]);
  assert.match(fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8"), /title="快速动作"/);
  assert.doesNotMatch(editor, /setServoAngle|setMotionPwm|writeGpio|pulseWidth/);
  assert.doesNotMatch(editor, /ArrowLeft|ArrowRight|ArrowUp|ArrowDown/);
  assert.doesNotMatch(preload, /choreograph.*Path/i);
  assert.match(editor, /激活为跳舞动作/);
  assert.match(editor, /内置默认舞蹈/);
  assert.match(editor, /choreography-selection-bar/);
  assert.match(editor, /choreography-active-dance/);
  assert.match(editor, /当前跳舞动作/);
  assert.match(editor, /保存后可激活/);
  assert.match(editor, /恢复为内置舞蹈/);
  assert.match(editor, /两者都只运行当前画面，不会改变已激活舞蹈/);
  const activationCalls = editor.match(/setDefaultDance\(/g) || [];
  assert.equal(activationCalls.length, 1, "only the explicit activation handler may change the active dance");
  const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.choreography-selection-bar\s*\{[^}]*grid-template-columns:\s*minmax\(260px,1fr\)\s+minmax\(150px,\.42fr\)\s+auto/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.choreography-selection-bar\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(styles, /\.choreography-activate-button\s*\{[^}]*min-width:\s*154px/);
  const pages = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");
  assert.match(pages, /label: "动作设置"/);
  assert.match(pages, /title="左右动作角度"/);
  assert.match(pages, /max=\{40\}/);
  assert.match(pages, /title="上下动作角度"/);
  assert.match(pages, /max=\{20\}/);
  assert.match(pages, /suffix="°\/s"/);
});

test("quick actions fail closed until the real motion chain is detected", () => {
  const pages = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");
  assert.match(pages, /motionStatus\?\.ok === true \|\| motionStatus\?\.available === true/);
  assert.match(pages, /disabled={!motionAvailable \|\| Boolean\(runningPreset\)/);
  assert.match(pages, /aria-describedby="motion-chain-status"/);
  assert.match(pages, /id="motion-chain-status"/);
  assert.match(pages, /真实动作链尚未检测成功，请先重新检测/);
});
