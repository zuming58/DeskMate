import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../src/pages.jsx", import.meta.url), "utf8");
const adapters = fs.readFileSync(new URL("../src/adapters/voiceAdapters.js", import.meta.url), "utf8");

test("T15 motion page exposes only bounded real presets and endpoint controls", () => {
  assert.match(page, /runPreset\(\{ preset: nextPreset, repeat: nextRepeat, source: "UI" \}\)/);
  assert.match(page, /开始 · \$\{presetLabel\} × \$\{repeatCount\}/);
  assert.match(page, /runPreset\(preset\)/);
  assert.match(page, /重新检测动作链/);
  assert.match(page, /动作 HID 写入失败，请重新检测动作链/);
  assert.match(page, /readWithRetry/);
  assert.match(page, /只显示画面，不代表小智已经动作/);
  for (const label of ["关注", "点头", "寻找", "跳舞"]) assert.match(page, new RegExp(`value: "[a-z]+", label: "${label}"`));
  assert.match(page, /停止并回中/);
  assert.match(page, /立即急停/);
  assert.match(page, /解除急停并回中/);
  assert.doesNotMatch(page.slice(page.indexOf("export function MotionPage"), page.indexOf("export function SensorsPage")), /动作速度|运动范围|柔性起停/);
});

test("system diagnostics names the independent runtime motion collection", () => {
  assert.match(page, /动作 HID 集合 · FF00:0009/);
  assert.match(page, /inputBridge\.motionCollectionWritable/);
});

test("T15 renderer adapter uses semantic operations without motion primitives", () => {
  assert.match(adapters, /getMotionStatus\(\)/);
  assert.match(adapters, /runPreset\(value\)/);
  assert.match(adapters, /stopAndCenter/);
  assert.match(adapters, /emergencyStop/);
  assert.match(adapters, /clearEmergencyStopAndCenter/);
  assert.doesNotMatch(adapters, /setMotionPwm|setServoAngle|writeGpio|pulseWidth/);
});

test("T15 UI keeps endpoint completion separate from physical HIL", () => {
  assert.match(page, /端点报告本次动作已完成/);
  assert.match(page, /实体结果仍以现场观察为准/);
  assert.match(page, /自动联动待验收/);
  assert.match(page, /endpoint\.completedRepeat/);
  assert.match(page, /endpoint\.requestedRepeat/);
  assert.doesNotMatch(page, /endpoint\.repeatCompleted/);
  assert.doesNotMatch(page, /endpoint\.repeatTotal/);
});

test("T15 motion page keeps actions compact and replaces repeated notice cards with concise evidence", () => {
  const motionPage = page.slice(page.indexOf("export function MotionPage"), page.indexOf("export function SensorsPage"));
  assert.match(motionPage, /motion-status-strip/);
  assert.match(motionPage, /motion-action-bar/);
  assert.match(motionPage, /motion-preview-caption/);
  assert.doesNotMatch(motionPage, /button--wide motion-run-button/);
  assert.doesNotMatch(motionPage, /title="默认次数"/);
  assert.doesNotMatch(motionPage, /title="自动动作暂未开放"/);
  assert.doesNotMatch(motionPage, /title="这里只显示软件画面预览"/);
});
