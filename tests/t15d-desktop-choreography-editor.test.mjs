import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { CHOREOGRAPHY_EXPRESSIONS, CHOREOGRAPHY_LABELS, choreographyPreviewFrame, createChoreographyDraft, validateChoreographyDraft } from "../src/domain/choreography.js";

const require = createRequire(import.meta.url);
const { ChoreographyStore, PendingChoreographyAdapter, validateChoreography } = require("../electron/choreography-store.cjs");

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

test("pending choreography adapter validates the semantic object and never guesses the T15 wire", async () => {
  const adapter = new PendingChoreographyAdapter();
  assert.deepEqual(adapter.status(), { ready: false, state: "not-ready", reason: "choreography-transport-not-frozen" });
  assert.deepEqual(await adapter.execute(action()), { ok: false, ready: false, state: "not-ready", reason: "choreography-transport-not-frozen" });
  await assert.rejects(adapter.execute({ ...action(), pwm: 1500 }), /contract-invalid/);
});

test("T15D preload and renderer expose editor persistence while real execution stays ready-gated", () => {
  const preload = fs.readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const editor = fs.readFileSync(new URL("../src/ChoreographyEditor.jsx", import.meta.url), "utf8");
  const adapter = fs.readFileSync(new URL("../src/adapters/voiceAdapters.js", import.meta.url), "utf8");
  for (const api of ["listChoreographies", "getChoreographyStatus", "saveChoreography", "copyChoreography", "deleteChoreography", "runChoreography"]) {
    assert.match(preload, new RegExp(`${api}:`));
    assert.match(adapter, new RegExp(`${api}\\(`));
  }
  assert.match(main, /new PendingChoreographyAdapter\(\)/);
  assert.match(main, /desktop:run-choreography[\s\S]*choreographyAdapter\.execute\(value\)/);
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
});

test("quick actions fail closed until the real motion chain is detected", () => {
  const pages = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");
  assert.match(pages, /motionStatus\?\.ok === true \|\| motionStatus\?\.available === true/);
  assert.match(pages, /disabled={!motionAvailable \|\| Boolean\(runningPreset\)/);
  assert.match(pages, /aria-describedby="motion-chain-status"/);
  assert.match(pages, /id="motion-chain-status"/);
  assert.match(pages, /真实动作链尚未检测成功，请先重新检测/);
});
